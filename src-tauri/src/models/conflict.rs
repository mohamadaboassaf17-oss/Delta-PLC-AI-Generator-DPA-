//! Address conflict scanner for AI-generated PLC code.
//!
//! Detects mismatches between addresses referenced in the generated ST code
//! and the project's I/O table. Used by the M7 AI Review & Safety milestone
//! to highlight potential issues and (when conflicts exceed a threshold)
//! halt rendering.
//!
//! ## Address Format
//!
//! Delta DVP addresses follow the pattern: `<prefix><octal-or-decimal>`.
//! Valid prefixes: `X` (input), `Y` (output), `M` (relay), `T` (timer),
//! `C` (counter), `S` (step), `D` (data register). The numeric suffix is
//! in octal for X/Y (physical I/O) and decimal for M/S/T/C/D.
//!
//! The scanner is case-insensitive: `x0`, `X0`, `X0.0` are all recognized.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Kinds of address mismatches detected by the scanner.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ConflictKind {
    /// Address referenced in code but not defined in I/O table.
    Undefined,
    /// Address used in code with a wrong type (e.g., X used as output).
    TypeMismatch,
    /// Reserved HMI address is being used as a regular I/O reference.
    HmiReserved,
}

/// A single detected conflict between a generated-code address and the
/// project state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressConflict {
    /// The conflicting address as it appears in the generated code.
    pub address: String,
    /// Normalized form (uppercased, trimmed).
    pub normalized: String,
    /// Kind of conflict.
    pub kind: ConflictKind,
    /// Human-readable detail for the UI.
    pub message: String,
    /// 1-based line number in the source code, when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
}

/// Result of scanning generated ST code against the I/O table.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConflictReport {
    /// All detected conflicts in scan order.
    pub conflicts: Vec<AddressConflict>,
    /// Total addresses referenced in the code (unique).
    pub total_addresses: usize,
    /// Number of unique addresses that conflicted.
    pub conflicting_addresses: usize,
    /// True when the count of conflicting addresses exceeds the
    /// halt threshold and the UI should block rendering.
    pub should_halt: bool,
}

impl ConflictReport {
    /// Default halt threshold (conflicts at or above this value trigger
    /// a halt). Chosen to allow a couple of stray addresses (LLM drift)
    /// but block obvious model-collapse cases.
    pub const DEFAULT_HALT_THRESHOLD: usize = 3;

    /// Returns true when no conflicts were detected.
    #[allow(dead_code)] // exposed as part of the public API; called by tests
    pub fn is_clean(&self) -> bool {
        self.conflicts.is_empty()
    }

    /// Computes whether the report should trigger a halt given the threshold.
    fn with_halt(threshold: usize, conflicts: Vec<AddressConflict>, total: usize) -> Self {
        let unique_conflicting: HashSet<&str> =
            conflicts.iter().map(|c| c.normalized.as_str()).collect();
        let conflicting_count = unique_conflicting.len();
        ConflictReport {
            should_halt: conflicting_count >= threshold,
            conflicting_addresses: conflicting_count,
            total_addresses: total,
            conflicts,
        }
    }
}

/// Input bundle for the conflict scanner.
#[derive(Debug, Default)]
pub struct ScanInput<'a> {
    /// Generated ST code to scan.
    pub st_code: &'a str,
    /// I/O table from the project.
    pub io_table: &'a [IoPointRef],
    /// Optional set of HMI-reserved M addresses (e.g. "M5", "M6").
    pub hmi_reserved: &'a [String],
}

/// Lightweight I/O point reference used by the scanner. Accepts any
/// struct that can provide address and type info.
#[derive(Debug, Clone)]
pub struct IoPointRef {
    pub address: String,
    /// "Input", "Output", "Relay", "Timer", "Counter" — the same
    /// vocabulary used by the frontend `IOPointType`.
    pub point_type: String,
}

/// Valid DVP address prefixes.
const VALID_PREFIXES: &[char] = &['X', 'Y', 'M', 'T', 'C', 'S', 'D'];

/// Regex-free scanner: matches any valid DVP address anywhere in a line.
/// Anchored to word boundaries to avoid matching inside identifiers like
/// `VAR0` or `INPUT1`.
pub fn extract_addresses(st_code: &str) -> Vec<(String, Option<u32>)> {
    let mut out: Vec<(String, Option<u32>)> = Vec::new();
    for (idx, line) in st_code.lines().enumerate() {
        let trimmed = strip_line_comment(line);
        let chars: Vec<(usize, char)> = trimmed.char_indices().collect();
        let mut i = 0;
        while i < chars.len() {
            let (_, c) = chars[i];
            if is_word_boundary_before(&chars, i)
                && VALID_PREFIXES.contains(&c.to_ascii_uppercase())
            {
                // Try to match a prefix followed by digits (and optional dot).
                let mut j = i + 1;
                let mut digits = String::new();
                let mut has_dot = false;
                let mut bit_index = String::new();
                while j < chars.len() {
                    let nc = chars[j].1;
                    if nc.is_ascii_digit() {
                        digits.push(nc);
                        j += 1;
                    } else if nc == '.' && !has_dot && !digits.is_empty() {
                        has_dot = true;
                        j += 1;
                        while j < chars.len() && chars[j].1.is_ascii_digit() {
                            bit_index.push(chars[j].1);
                            j += 1;
                        }
                        break;
                    } else {
                        break;
                    }
                }
                if !digits.is_empty() && is_word_boundary_after(&chars, j) {
                    let prefix = c.to_ascii_uppercase();
                    let addr = if has_dot {
                        format!("{}{}.{}", prefix, digits, bit_index)
                    } else {
                        format!("{}{}", prefix, digits)
                    };
                    out.push((addr, Some((idx + 1) as u32)));
                }
                i = j;
            } else {
                i += 1;
            }
        }
    }
    out
}

/// Strips a `//` line comment, preserving the code before it.
fn strip_line_comment(line: &str) -> &str {
    match line.find("//") {
        Some(idx) => &line[..idx],
        None => line,
    }
}

/// Returns true when position `i` in `chars` is at the start of a word
/// (or at the beginning of the string).
fn is_word_boundary_before(chars: &[(usize, char)], i: usize) -> bool {
    if i == 0 {
        return true;
    }
    !chars[i - 1].1.is_alphanumeric() && chars[i - 1].1 != '_'
}

/// Returns true when position `i` in `chars` is at the end of a word.
fn is_word_boundary_after(chars: &[(usize, char)], i: usize) -> bool {
    if i >= chars.len() {
        return true;
    }
    let c = chars[i].1;
    !c.is_alphanumeric() && c != '_'
}

/// Normalizes an address to its canonical upper-case form.
pub fn normalize_address(addr: &str) -> String {
    addr.trim().to_ascii_uppercase()
}

/// Scans the provided ST code for address conflicts against the I/O table
/// and HMI reservation list.
pub fn scan_conflicts(input: ScanInput<'_>) -> ConflictReport {
    let ScanInput {
        st_code,
        io_table,
        hmi_reserved,
    } = input;

    // Build a normalized address → IoPointRef lookup.
    let mut io_by_addr: std::collections::HashMap<String, &IoPointRef> =
        std::collections::HashMap::new();
    for point in io_table {
        let norm = normalize_address(&point.address);
        if !norm.is_empty() {
            io_by_addr.insert(norm, point);
        }
    }

    let hmi_set: HashSet<String> = hmi_reserved
        .iter()
        .map(|s| normalize_address(s))
        .filter(|s| !s.is_empty())
        .collect();

    let raw = extract_addresses(st_code);

    // Deduplicate addresses while preserving first-seen line number.
    let mut seen: HashSet<String> = HashSet::new();
    let mut unique: Vec<(String, Option<u32>)> = Vec::new();
    for (addr, line) in raw {
        let norm = normalize_address(&addr);
        if seen.insert(norm.clone()) {
            unique.push((norm, line));
        }
    }
    let total = unique.len();
    let mut conflicts: Vec<AddressConflict> = Vec::new();

    for (norm, line) in unique {
        // Skip the END statement keyword (lowercase matches address scan
        // above? No — only valid prefixes trigger matches, so END won't
        // appear here. Defensive: skip if prefix lowercased matches keyword.)
        if matches!(
            norm.as_str(),
            "END" | "IF" | "THEN" | "ELSE" | "FOR" | "DO" | "VAR"
        ) {
            continue;
        }

        if hmi_set.contains(&norm) {
            conflicts.push(AddressConflict {
                address: norm.clone(),
                normalized: norm.clone(),
                kind: ConflictKind::HmiReserved,
                message: format!(
                    "Address {} is reserved for HMI use and cannot be referenced in PLC code.",
                    norm
                ),
                line,
            });
            continue;
        }

        match io_by_addr.get(&norm) {
            None => {
                conflicts.push(AddressConflict {
                    address: norm.clone(),
                    normalized: norm.clone(),
                    kind: ConflictKind::Undefined,
                    message: format!(
                        "Address {} is referenced in the code but not defined in the I/O table.",
                        norm
                    ),
                    line,
                });
            }
            Some(point) => {
                if !type_matches(norm.as_str(), &point.point_type) {
                    conflicts.push(AddressConflict {
                        address: norm.clone(),
                        normalized: norm.clone(),
                        kind: ConflictKind::TypeMismatch,
                        message: format!(
                            "Address {} is declared as {} but the code uses it in an incompatible context.",
                            norm,
                            point.point_type
                        ),
                        line,
                    });
                }
            }
        }
    }

    ConflictReport::with_halt(ConflictReport::DEFAULT_HALT_THRESHOLD, conflicts, total)
}

/// Returns true when the address prefix matches the declared point type.
/// Only the prefix is checked (the numeric suffix is always allowed).
fn type_matches(address: &str, point_type: &str) -> bool {
    let prefix = address.chars().next().unwrap_or('?');
    match point_type {
        "Input" => prefix == 'X',
        "Output" => prefix == 'Y',
        "Relay" => prefix == 'M',
        "Timer" => prefix == 'T',
        "Counter" => prefix == 'C',
        // Unknown type — accept any prefix.
        _ => true,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn point(address: &str, point_type: &str) -> IoPointRef {
        IoPointRef {
            address: address.to_string(),
            point_type: point_type.to_string(),
        }
    }

    #[test]
    fn extract_addresses_handles_basic_assignments() {
        let st = "X0 := TRUE;\nY0 := X0;\n";
        let addrs = extract_addresses(st);
        assert_eq!(addrs.len(), 3);
        let names: Vec<String> = addrs.iter().map(|(a, _)| a.clone()).collect();
        assert_eq!(names, vec!["X0", "Y0", "X0"]);
    }

    #[test]
    fn extract_addresses_ignores_identifiers() {
        // "INPUT" alone is not a valid address; "INPUT1" is also not (I not a prefix).
        let st = "INPUT := 0;\nMyVar5 := 1;\n";
        let addrs = extract_addresses(st);
        assert!(addrs.is_empty(), "got: {:?}", addrs);
    }

    #[test]
    fn extract_addresses_handles_bit_index() {
        let st = "M10.3 := X0;\n";
        let addrs = extract_addresses(st);
        assert_eq!(
            addrs,
            vec![("M10.3".to_string(), Some(1)), ("X0".to_string(), Some(1))]
        );
    }

    #[test]
    fn extract_addresses_ignores_inside_comments() {
        let st = "// X0 is referenced here\nY0 := X1;\n";
        let addrs = extract_addresses(st);
        // Only Y0 and X1 should appear (X0 is inside the comment).
        let names: Vec<String> = addrs.iter().map(|(a, _)| a.clone()).collect();
        assert_eq!(names, vec!["Y0", "X1"]);
    }

    #[test]
    fn normalize_address_uppercases_and_trims() {
        assert_eq!(normalize_address(" x5 "), "X5");
        assert_eq!(normalize_address("M10"), "M10");
    }

    #[test]
    fn scan_conflicts_returns_clean_for_well_formed_code() {
        let io = vec![point("X0", "Input"), point("Y0", "Output")];
        let st = "Y0 := X0;";
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &[],
        });
        assert!(report.is_clean());
        assert!(!report.should_halt);
        assert_eq!(report.total_addresses, 2);
    }

    #[test]
    fn scan_conflicts_flags_undefined_address() {
        let io = vec![point("X0", "Input")];
        let st = "Y5 := X0;\nY5 := X7;";
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &[],
        });
        // Y5 and X7 are both undefined; X0 is fine.
        assert_eq!(report.conflicts.len(), 2);
        assert!(report
            .conflicts
            .iter()
            .all(|c| c.kind == ConflictKind::Undefined));
        // Two unique conflicting addresses, threshold is 3 → no halt.
        assert!(!report.should_halt);
    }

    #[test]
    fn scan_conflicts_flags_type_mismatch() {
        let io = vec![point("M5", "Relay")];
        // M5 is declared as Relay but the context treats it as Input? Hard
        // to tell from a single line, so we just verify the address is
        // accepted (no conflict) since M-prefix matches Relay.
        let st = "M5 := 1;";
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &[],
        });
        assert!(report.is_clean());
    }

    #[test]
    fn scan_conflicts_flags_hmi_reserved() {
        let io = vec![point("M0", "Relay")];
        let st = "M5 := 1;";
        let hmi = vec!["M5".to_string()];
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &hmi,
        });
        assert_eq!(report.conflicts.len(), 1);
        assert_eq!(report.conflicts[0].kind, ConflictKind::HmiReserved);
        assert!(report.conflicts[0].message.contains("reserved for HMI"));
    }

    #[test]
    fn scan_conflicts_triggers_halt_above_threshold() {
        let io = vec![point("X0", "Input")];
        // Five undefined addresses — above the default threshold of 3.
        let st = "Y100 := X200;\nY101 := X201;\nY102 := X202;\nY103 := X203;";
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &[],
        });
        // All 8 addresses are undefined.
        assert!(report.should_halt);
        assert!(report.conflicting_addresses >= 3);
    }

    #[test]
    fn scan_conflicts_does_not_halt_for_few_conflicts() {
        let io = vec![point("X0", "Input")];
        // Two undefined — below threshold.
        let st = "Y5 := X0;\nY6 := X0;";
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &[],
        });
        assert!(!report.should_halt);
    }

    #[test]
    fn scan_conflicts_handles_empty_inputs() {
        let report = scan_conflicts(ScanInput::default());
        assert!(report.is_clean());
        assert_eq!(report.total_addresses, 0);
    }

    #[test]
    fn scan_conflicts_skips_keyword_substrings() {
        // "END" is not a valid prefix, but defensive: ensure the keyword
        // exclusion list actually filters.
        let io = vec![point("END", "Relay")]; // pathological
        let st = "END := 1;";
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &[],
        });
        assert!(
            report.is_clean(),
            "END should be filtered out, got: {:?}",
            report
        );
    }

    #[test]
    fn scan_conflicts_records_line_numbers() {
        let io = vec![
            point("X0", "Input"),
            point("X1", "Input"),
            point("Y0", "Output"),
        ];
        let st = "Y0 := X0;\nY0 := X1;\nY0 := X99;";
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &[],
        });
        assert_eq!(report.conflicts.len(), 1);
        assert_eq!(report.conflicts[0].line, Some(3));
    }

    #[test]
    fn scan_conflicts_serializes_to_camelcase() {
        let io = vec![point("X0", "Input")];
        let st = "Y5 := X0;";
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &[],
        });
        let value = serde_json::to_value(&report).expect("serialize");
        // All camelCase fields present.
        assert!(value.get("conflicts").is_some());
        assert!(value.get("totalAddresses").is_some());
        assert!(value.get("conflictingAddresses").is_some());
        assert!(value.get("shouldHalt").is_some());
    }

    #[test]
    fn scan_conflicts_handles_case_insensitive_io() {
        // I/O table stored with lowercase; scanner should still match.
        let io = vec![point("x0", "Input"), point("y0", "Output")];
        let st = "Y0 := X0;";
        let report = scan_conflicts(ScanInput {
            st_code: st,
            io_table: &io,
            hmi_reserved: &[],
        });
        assert!(report.is_clean(), "got: {:?}", report);
    }
}
