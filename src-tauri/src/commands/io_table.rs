//! I/O table commands: model listing, I/O mapping CRUD, address validation.

use crate::error::AppError;
use crate::models::dvp_models::DvpModelSpec;
use serde::Serialize;
use thiserror::Error;

/// Response payload for the `dvp_list_models` command.
#[derive(Debug, Serialize)]
pub struct DvpListModelsResponse {
    pub models: Vec<DvpModelSpec>,
}

/// Return all supported Delta DVP PLC models with their I/O specifications.
#[tauri::command]
pub fn dvp_list_models() -> Result<DvpListModelsResponse, String> {
    Ok(DvpListModelsResponse {
        models: DvpModelSpec::all_models(),
    })
}

// ---------------------------------------------------------------------------
// M10.3.1 — Address validator (defense-in-depth)
//
// Numbering rules (per Delta DVP hardware): physical I/O X and Y are
// OCTAL-numbered (X0–X7 then X10, never X8/X9). All other device classes
// — relays M, steps S, timers T, counters C, data registers D — are
// DECIMAL-numbered, so digits 8 and 9 are legal there (e.g. M8, T9, D91).
// ---------------------------------------------------------------------------

/// Errors produced by [`validate_dvp_address`].
///
/// Delta DVP uses octal numbering for the physical I/O addresses X and Y
/// (X0–X7 then X10, not X8). The M/S/T/C/D device classes are decimal.
/// This enum captures the three failure modes a typed address can have
/// at the IPC boundary.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum AddressError {
    /// The address string was empty or whitespace-only.
    #[error("Address is required")]
    Empty,
    /// The address does not match the `<prefix><digits>` shape.
    /// Valid prefixes are X, Y, M, S, T, C, D (case-insensitive).
    #[error("Invalid DVP address format: {0}")]
    InvalidFormat(String),
    /// An X/Y address contains the digit `8` or `9`, which are not valid
    /// octal digits. Decimal-numbered devices (M/S/T/C/D) are exempt.
    #[error("DVP uses octal numbering — digit 8 or 9 is not allowed in {0}")]
    NonOctalDigit(String),
}

/// Validate a Delta DVP I/O address.
///
/// Accepts a prefix character (`X`, `Y`, `M`, `S`, `T`, `C`, or `D`,
/// case-insensitive) followed by one or more digits. Physical I/O
/// prefixes `X` and `Y` are octal-numbered, so every digit must be in
/// the range 0..=7. All other prefixes (`M`, `S`, `T`, `C`, `D`) are
/// decimal-numbered and accept any ASCII digits.
///
/// # Errors
///
/// - [`AddressError::Empty`] if the input is empty or only whitespace.
/// - [`AddressError::InvalidFormat`] if the input does not start with a
///   valid prefix or contains non-digit characters after the prefix.
/// - [`AddressError::NonOctalDigit`] if an `X`/`Y` address contains a
///   digit `8` or `9`.
///
/// # Examples
///
/// ```ignore
/// // The `commands` module is crate-private, so this example is
/// // illustrative only. Unit tests below exercise the same surface.
/// assert!(validate_dvp_address("X0").is_ok());
/// assert!(validate_dvp_address("X10").is_ok());
/// assert!(validate_dvp_address("Y17").is_ok());
/// assert!(validate_dvp_address("M89").is_ok()); // decimal-numbered relay
/// assert_eq!(
///     validate_dvp_address("X8"),
///     Err(AddressError::NonOctalDigit("X8".into())),
/// );
/// ```
pub fn validate_dvp_address(addr: &str) -> Result<(), AddressError> {
    let trimmed = addr.trim();
    if trimmed.is_empty() {
        return Err(AddressError::Empty);
    }
    let upper = trimmed.to_uppercase();
    let mut iter = upper.chars();
    let prefix = iter
        .next()
        .ok_or_else(|| AddressError::InvalidFormat(addr.to_string()))?;
    if !matches!(prefix, 'X' | 'Y' | 'M' | 'S' | 'T' | 'C' | 'D') {
        return Err(AddressError::InvalidFormat(addr.to_string()));
    }
    let digits: String = iter.collect();
    if digits.is_empty() {
        return Err(AddressError::InvalidFormat(addr.to_string()));
    }
    for c in digits.chars() {
        if !c.is_ascii_digit() {
            return Err(AddressError::InvalidFormat(addr.to_string()));
        }
        // Only physical I/O (X/Y) follows the octal numbering scheme;
        // M/S/T/C/D devices are decimal, so 8 and 9 are legal there.
        if (prefix == 'X' || prefix == 'Y') && (c == '8' || c == '9') {
            return Err(AddressError::NonOctalDigit(addr.to_string()));
        }
    }
    Ok(())
}

/// Tauri command wrapper for [`validate_dvp_address`].
///
/// Exposed to the frontend so the inline TypeScript validator can be
/// double-checked at the IPC layer when the caller needs authoritative
/// validation (e.g., before persisting addresses received over the
/// network or from imported files). Returns `()` on success and an
/// [`AppError::Other`] carrying the [`AddressError`] message on failure.
#[tauri::command]
pub fn dvp_validate_address(addr: String) -> Result<(), AppError> {
    validate_dvp_address(&addr).map_err(|e| AppError::Other(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_models_returns_ok_with_four_models() {
        let response = dvp_list_models().expect("should return Ok");
        assert_eq!(response.models.len(), 4);
    }

    #[test]
    fn first_model_is_dvp_ss2() {
        let response = dvp_list_models().expect("should return Ok");
        let first = &response.models[0];
        assert_eq!(first.label, "DVP-SS2");
    }

    // --- M10.3.1: validate_dvp_address -----------------------------------

    #[test]
    fn accepts_valid_octal_io_addresses() {
        for addr in [
            "X0", "X1", "X7", "X10", "X17", "X20", "X77", "X100", "X777", "Y0", "Y7", "M0", "M100",
            "M777", "D1234", "T17", "C20", "S0",
        ] {
            assert!(validate_dvp_address(addr).is_ok(), "{addr} should be valid",);
        }
    }

    /// Decimal-numbered device classes (M/S/T/C/D relays, timers,
    /// counters, data registers) legally use digits 8 and 9 — only
    /// physical I/O X/Y is octal-numbered on Delta DVP hardware.
    #[test]
    fn accepts_decimal_digits_for_non_io_prefixes() {
        for addr in [
            "M8", "M9", "M80", "M91", "S8", "S9", "S88", "T8", "T9", "T99", "C8", "C9", "C108",
            "D8", "D9", "D91",
        ] {
            assert!(validate_dvp_address(addr).is_ok(), "{addr} should be valid",);
        }
    }

    #[test]
    fn rejects_octal_violations_on_x_y_only() {
        for addr in ["X8", "X9", "X18", "X19", "Y8", "Y9", "X28", "X38"] {
            assert_eq!(
                validate_dvp_address(addr),
                Err(AddressError::NonOctalDigit(addr.to_string())),
                "{addr} should be rejected with NonOctalDigit",
            );
        }
    }

    #[test]
    fn rejects_empty_string() {
        assert_eq!(validate_dvp_address(""), Err(AddressError::Empty));
        assert_eq!(validate_dvp_address("   "), Err(AddressError::Empty));
    }

    #[test]
    fn rejects_missing_digits() {
        assert_eq!(
            validate_dvp_address("X"),
            Err(AddressError::InvalidFormat("X".into())),
        );
    }

    #[test]
    fn rejects_unknown_prefix() {
        for addr in ["Z0", "P10", "A1", "1X"] {
            assert!(
                matches!(
                    validate_dvp_address(addr),
                    Err(AddressError::InvalidFormat(_))
                ),
                "{addr} should be rejected with InvalidFormat",
            );
        }
    }

    #[test]
    fn rejects_non_digit_chars() {
        for addr in ["X1A", "Yhello", "M-1", "X 10"] {
            assert!(
                matches!(
                    validate_dvp_address(addr),
                    Err(AddressError::InvalidFormat(_))
                ),
                "{addr} should be rejected with InvalidFormat",
            );
        }
    }

    #[test]
    fn accepts_lowercase_prefix() {
        assert!(validate_dvp_address("x0").is_ok());
        assert!(validate_dvp_address("y17").is_ok());
        assert!(validate_dvp_address("m100").is_ok());
    }

    #[test]
    fn trims_whitespace_before_validating() {
        assert!(validate_dvp_address("  X10  ").is_ok());
        assert_eq!(
            validate_dvp_address("  X8  "),
            Err(AddressError::NonOctalDigit("  X8  ".into())),
        );
    }

    #[test]
    fn address_error_messages_are_descriptive() {
        // Empty / format / octal each produce distinct, human-readable strings.
        assert_eq!(AddressError::Empty.to_string(), "Address is required");
        assert_eq!(
            AddressError::InvalidFormat("Z0".into()).to_string(),
            "Invalid DVP address format: Z0",
        );
        assert_eq!(
            AddressError::NonOctalDigit("X8".into()).to_string(),
            "DVP uses octal numbering — digit 8 or 9 is not allowed in X8",
        );
    }

    #[test]
    fn tauri_command_wrapper_propagates_errors() {
        // The Tauri command wraps validate_dvp_address errors into
        // AppError::Other carrying the same Display string.
        let err = dvp_validate_address("X8".into()).expect_err("should fail");
        assert!(err.to_string().contains("octal"));
        assert!(err.to_string().contains("X8"));
    }

    #[test]
    fn tauri_command_wrapper_returns_ok_for_valid() {
        assert!(dvp_validate_address("X10".into()).is_ok());
        assert!(dvp_validate_address("y0".into()).is_ok());
        assert!(dvp_validate_address("m89".into()).is_ok()); // decimal relay
    }

    // --- M10.6.6 §2C: adversarial inputs to the address validator -------

    /// The address validator must reject any string that is not a
    /// well-formed `<prefix><octal-digits>` sequence — including the
    /// SQL-injection / XSS / path-traversal payloads from the
    /// penetration test suite. None of these are valid DVP addresses,
    /// so the contract is "always rejected, never panics".
    #[test]
    fn validate_dvp_address_rejects_adversarial_payloads() {
        let payloads = [
            "\"; DROP TABLE--",
            "<script>alert(1)</script>",
            "../../../etc/passwd",
            "$(rm -rf /)",
            "X0; rm -rf /",
            "X0\n---ST---\n",
            "X0\u{0000}",
        ];
        for addr in payloads {
            let res = validate_dvp_address(addr);
            assert!(
                res.is_err(),
                "adversarial address {:?} unexpectedly accepted",
                addr
            );
        }
    }

    /// I/O labels (as opposed to addresses) flow through the project
    /// file as opaque text and must survive a JSON round-trip
    /// verbatim — the LLM prompt builder copies the bytes 1:1, so any
    /// mutation here would silently change what the model sees. This
    /// is the io_table-local complement to the save+reload test in
    /// `commands::project`.
    #[test]
    fn io_label_survives_json_roundtrip_unchanged() {
        // Mirror of the TS `IOPoint` shape — the same one
        // `export::IoPointExport` uses, replicated locally to keep
        // this test independent of the export module.
        #[derive(serde::Serialize, serde::Deserialize, PartialEq, Debug)]
        #[serde(rename_all = "camelCase")]
        struct IoPoint {
            address: String,
            #[serde(rename = "type")]
            point_type: String,
            label: String,
            #[serde(default)]
            default_value: Option<String>,
            #[serde(default)]
            comment: Option<String>,
        }

        let payloads = [
            "\"; DROP TABLE--",
            "<script>alert(1)</script>",
            "../../../",
            "中文 αβγ 🚨",
            "\u{200B}---ST---\u{200B}",
        ];
        for label in payloads {
            let p = IoPoint {
                address: "M0".into(),
                point_type: "Relay".into(),
                label: label.to_string(),
                default_value: Some(String::new()),
                comment: None,
            };
            let json = serde_json::to_string(&p).expect("serialize");
            let back: IoPoint = serde_json::from_str(&json).expect("deserialize");
            assert_eq!(
                back.label, label,
                "label {:?} mutated during JSON round-trip",
                label
            );
        }
    }
}
