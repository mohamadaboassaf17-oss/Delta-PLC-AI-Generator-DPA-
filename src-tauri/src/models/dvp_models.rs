//! DVP PLC model registry.
//!
//! Provides a catalogue of supported Delta DVP Series PLC models with their
//! base-unit I/O limits. Numbers are sourced from Delta DVP public manuals
//! (OCT 2023 datasheets).

use serde::{Deserialize, Serialize};

/// DVP PLC model families. Each family has a distinct I/O ceiling and
/// feature set.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum DvpModelFamily {
    Ss2,
    Se,
    Sx2,
    Sv2,
}

/// Hardware specification for a single DVP PLC model (base unit, no
/// expansion modules). Units are in *points* (discrete I/O) and *steps*
/// (program memory).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DvpModelSpec {
    pub family: DvpModelFamily,
    pub label: String,
    pub max_x: u16,
    pub max_y: u16,
    pub max_m: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_s: Option<u16>,
    pub max_t: u16,
    pub max_c: u16,
}

impl DvpModelSpec {
    /// Returns all supported DVP models with their base-unit (no expansion) I/O limits.
    /// Numbers sourced from Delta DVP public manuals (OCT 2023 datasheets).
    pub fn all_models() -> Vec<DvpModelSpec> {
        vec![
            DvpModelSpec {
                family: DvpModelFamily::Ss2,
                label: "DVP-SS2".into(),
                max_x: 8,
                max_y: 8,
                max_m: 512,
                max_s: None,
                max_t: 128,
                max_c: 128,
            },
            DvpModelSpec {
                family: DvpModelFamily::Se,
                label: "DVP-SE".into(),
                max_x: 8,
                max_y: 8,
                max_m: 512,
                max_s: None,
                max_t: 128,
                max_c: 128,
            },
            DvpModelSpec {
                family: DvpModelFamily::Sx2,
                label: "DVP-SX2".into(),
                max_x: 8,
                max_y: 8,
                max_m: 1024,
                max_s: Some(1024),
                max_t: 256,
                max_c: 256,
            },
            DvpModelSpec {
                family: DvpModelFamily::Sv2,
                label: "DVP-SV2".into(),
                max_x: 16,
                max_y: 16,
                max_m: 4096,
                max_s: Some(2048),
                max_t: 256,
                max_c: 256,
            },
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_models_returns_exactly_four() {
        let models = DvpModelSpec::all_models();
        assert_eq!(models.len(), 4);
    }

    #[test]
    fn every_model_has_non_empty_label() {
        for model in DvpModelSpec::all_models() {
            assert!(!model.label.is_empty(), "model label must not be empty");
        }
    }

    #[test]
    fn ss2_has_no_s_registers() {
        let models = DvpModelSpec::all_models();
        let ss2 = models
            .iter()
            .find(|m| m.family == DvpModelFamily::Ss2)
            .expect("SS2 should exist");
        assert_eq!(ss2.max_s, None);
    }

    #[test]
    fn sv2_has_s_registers() {
        let models = DvpModelSpec::all_models();
        let sv2 = models
            .iter()
            .find(|m| m.family == DvpModelFamily::Sv2)
            .expect("SV2 should exist");
        assert_eq!(sv2.max_s, Some(2048));
    }

    #[test]
    fn ss2_serializes_to_kebab_case() {
        let val = serde_json::to_value(DvpModelFamily::Ss2).expect("serialize");
        assert_eq!(val, "ss2");
    }

    #[test]
    fn model_spec_roundtrips_via_json() {
        let models = DvpModelSpec::all_models();
        let json = serde_json::to_string(&models).expect("serialize");
        let back: Vec<DvpModelSpec> = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(models.len(), back.len());
        for (i, m) in models.iter().enumerate() {
            assert_eq!(m.label, back[i].label);
            assert_eq!(m.max_x, back[i].max_x);
            assert_eq!(m.max_m, back[i].max_m);
        }
    }

    #[test]
    fn max_s_omitted_when_none_in_json() {
        let ss2 = DvpModelSpec::all_models()
            .into_iter()
            .find(|m| m.family == DvpModelFamily::Ss2)
            .expect("SS2 should exist");
        let json = serde_json::to_string(&ss2).expect("serialize");
        assert!(
            !json.contains("max_s"),
            "max_s should be absent for SS2 JSON"
        );
    }
}
