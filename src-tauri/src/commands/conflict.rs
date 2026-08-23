//! Address conflict scanner command (M7: AI Review & Safety).
//!
//! Exposes the Rust conflict scanner to the frontend so the UI can
//! run a deterministic pass over generated ST code immediately after
//! streaming completes — no LLM round-trip required.

use serde::{Deserialize, Serialize};
use tauri::command;

use crate::models::conflict::{self, ConflictReport, IoPointRef, ScanInput};

/// Frontend-friendly DTO: mirrors the IoPointRef shape used by the JS
/// project context. Accepting a thin struct (rather than the full
/// project model) keeps the command surface small and stable.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IoPointDto {
    pub address: String,
    #[serde(rename = "type")]
    pub point_type: String,
}

impl From<&IoPointDto> for IoPointRef {
    fn from(dto: &IoPointDto) -> Self {
        IoPointRef {
            address: dto.address.clone(),
            point_type: dto.point_type.clone(),
        }
    }
}

/// Command arguments.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanArgs {
    /// Generated ST code to scan.
    pub st_code: String,
    /// I/O table from the project.
    pub io_table: Vec<IoPointDto>,
    /// Optional list of HMI-reserved M addresses.
    #[serde(default)]
    pub hmi_reserved: Vec<String>,
}

/// Run the address conflict scanner.
///
/// Returns a `ConflictReport` describing every detected mismatch, plus
/// a boolean flag indicating whether the UI should block rendering
/// (set when conflicting addresses meet/exceed the default threshold).
#[command]
pub fn scan_code_conflicts(args: ScanArgs) -> Result<ConflictReport, String> {
    let io_refs: Vec<IoPointRef> = args.io_table.iter().map(Into::into).collect();
    let report = conflict::scan_conflicts(ScanInput {
        st_code: &args.st_code,
        io_table: &io_refs,
        hmi_reserved: &args.hmi_reserved,
    });
    Ok(report)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelLimitResult {
    pub model: String,
    pub x_count: usize,
    pub y_count: usize,
    pub m_count: usize,
    pub t_count: usize,
    pub c_count: usize,
    pub x_excess: usize,
    pub y_excess: usize,
    pub m_excess: usize,
    pub t_excess: usize,
    pub c_excess: usize,
    pub any_excess: bool,
}

/// Count I/O usage in the current I/O table and compare against the
/// selected DVP model's base-unit limits. Returns the per-category
/// counts and the per-category excess (0 when under the limit).
#[command]
pub fn check_model_limits(
    model: String,
    io_table: Vec<IoPointDto>,
) -> Result<ModelLimitResult, String> {
    use crate::models::dvp_models::DvpModelSpec;

    let all = DvpModelSpec::all_models();
    let spec = all
        .iter()
        .find(|m| m.label.eq_ignore_ascii_case(&model))
        .or_else(|| {
            // Fallback: try matching by family name (e.g. "ss2" → "DVP-SS2").
            let upper = model.to_ascii_uppercase();
            all.iter()
                .find(|m| format!("{:?}", m.family).to_ascii_uppercase() == upper)
        });

    let Some(spec) = spec else {
        return Err(format!("Unknown DVP model: {}", model));
    };

    let mut x_count = 0usize;
    let mut y_count = 0usize;
    let mut m_count = 0usize;
    let mut t_count = 0usize;
    let mut c_count = 0usize;

    for p in &io_table {
        let prefix = p.address.chars().next().unwrap_or('?');
        match prefix {
            'X' | 'x' => x_count += 1,
            'Y' | 'y' => y_count += 1,
            'M' | 'm' => m_count += 1,
            'T' | 't' => t_count += 1,
            'C' | 'c' => c_count += 1,
            _ => {}
        }
    }

    let x_excess = x_count.saturating_sub(spec.max_x as usize);
    let y_excess = y_count.saturating_sub(spec.max_y as usize);
    let m_excess = m_count.saturating_sub(spec.max_m as usize);
    let t_excess = t_count.saturating_sub(spec.max_t as usize);
    let c_excess = c_count.saturating_sub(spec.max_c as usize);
    let any_excess = x_excess + y_excess + m_excess + t_excess + c_excess > 0;

    Ok(ModelLimitResult {
        model: spec.label.clone(),
        x_count,
        y_count,
        m_count,
        t_count,
        c_count,
        x_excess,
        y_excess,
        m_excess,
        t_excess,
        c_excess,
        any_excess,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn dto(address: &str, point_type: &str) -> IoPointDto {
        IoPointDto {
            address: address.to_string(),
            point_type: point_type.to_string(),
        }
    }

    #[test]
    fn scan_command_returns_clean_for_well_formed() {
        let args = ScanArgs {
            st_code: "Y0 := X0;".into(),
            io_table: vec![dto("X0", "Input"), dto("Y0", "Output")],
            hmi_reserved: vec![],
        };
        let report = scan_code_conflicts(args).expect("scan");
        assert!(report.is_clean());
    }

    #[test]
    fn scan_command_propagates_halt_flag() {
        let args = ScanArgs {
            st_code: "Y100 := X200;\nY101 := X201;\nY102 := X202;".into(),
            io_table: vec![dto("X0", "Input")],
            hmi_reserved: vec![],
        };
        let report = scan_code_conflicts(args).expect("scan");
        assert!(report.should_halt);
    }

    #[test]
    fn model_limit_command_under_limit() {
        let result = check_model_limits(
            "DVP-SS2".into(),
            vec![dto("X0", "Input"), dto("X1", "Input")],
        )
        .expect("check");
        assert!(!result.any_excess);
        assert_eq!(result.x_count, 2);
    }

    #[test]
    fn model_limit_command_over_x_limit() {
        // SS2 has max_x = 8. Use 9 X points to exceed.
        let ios: Vec<IoPointDto> = (0..9).map(|i| dto(&format!("X{}", i), "Input")).collect();
        let result = check_model_limits("DVP-SS2".into(), ios).expect("check");
        assert!(result.any_excess);
        assert_eq!(result.x_excess, 1);
    }

    #[test]
    fn model_limit_command_unknown_model_errors() {
        let result = check_model_limits("DVP-NONEXISTENT".into(), vec![]);
        assert!(result.is_err());
    }

    #[test]
    fn model_limit_command_matches_by_family() {
        // Accept "ss2" or "SS2" as alias for "DVP-SS2".
        let result = check_model_limits("ss2".into(), vec![dto("X0", "Input")]).expect("check");
        assert_eq!(result.model, "DVP-SS2");
    }
}
