//! HMI tag table model.
//!
//! An HMI tag binds a Delta DVP PLC address to a UI element (button, lamp,
//! alarm, numeric display, setpoint). Tags reserve a contiguous slice of the
//! internal-relay (M) range so the frontend can render a tag table without
//! colliding with the logic program.

use serde::{Deserialize, Serialize};

/// HMI element kinds — buttons, indicator lamps, alarms, numeric displays, setpoints.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HmiElementType {
    Button,
    Lamp,
    Alarm,
    NumericDisplay,
    Setpoint,
}

/// Source of an HMI tag: inferred by the LLM ("auto") or edited by the user ("manual").
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HmiTagSource {
    Auto,
    Manual,
}

/// A single HMI tag binding. The `address` is the M relay reserved for the HMI
/// element; `plc_ref` is the X/Y/M address the element reads or writes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HmiTag {
    /// Reserved M address (e.g. "M5"), or `None` when awaiting reservation.
    pub address: Option<String>,
    #[serde(rename = "type")]
    pub element_type: HmiElementType,
    pub label: String,
    /// PLC X/Y/M address this HMI element references.
    pub plc_ref: String,
    pub source: HmiTagSource,
}

/// A complete HMI tag table for a project, including the reserved M range and
/// the DVP model the reservation was computed against.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct HmiTable {
    pub tags: Vec<HmiTag>,
    /// Index range reserved for HMI use, `[start, end_inclusive]`. `None` when empty.
    pub reserved_m_range: Option<(u16, u16)>,
    /// DVP model label this reservation was computed against, or `None` if none.
    pub model: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hmi_tag_roundtrips_via_json() {
        let tag = HmiTag {
            address: Some("M5".into()),
            element_type: HmiElementType::Button,
            label: "Start".into(),
            plc_ref: "M10".into(),
            source: HmiTagSource::Auto,
        };
        let json = serde_json::to_string(&tag).expect("serialize");
        assert!(
            json.contains("\"type\""),
            "expected type key (renamed from element_type)"
        );
        assert!(json.contains("\"plcRef\""), "expected plcRef key");
        assert!(
            !json.contains("element_type"),
            "raw snake_case must not leak"
        );
        assert!(
            !json.contains("elementType"),
            "no elementType key — element_type is renamed to type"
        );
        assert!(!json.contains("plc_ref"), "raw snake_case must not leak");
        let back: HmiTag = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(tag, back);
    }

    #[test]
    fn hmi_tag_with_null_address_roundtrips() {
        let tag = HmiTag {
            address: None,
            element_type: HmiElementType::Lamp,
            label: "Running".into(),
            plc_ref: "M0".into(),
            source: HmiTagSource::Manual,
        };
        let json = serde_json::to_string(&tag).expect("serialize");
        assert!(
            json.contains("\"address\":null"),
            "address should serialize as null"
        );
        let back: HmiTag = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(tag, back);
        assert!(back.address.is_none());
    }

    #[test]
    fn hmi_table_roundtrips_via_json() {
        let table = HmiTable {
            tags: vec![
                HmiTag {
                    address: Some("M100".into()),
                    element_type: HmiElementType::Button,
                    label: "Start".into(),
                    plc_ref: "M10".into(),
                    source: HmiTagSource::Auto,
                },
                HmiTag {
                    address: Some("M101".into()),
                    element_type: HmiElementType::NumericDisplay,
                    label: "Counter".into(),
                    plc_ref: "D0".into(),
                    source: HmiTagSource::Manual,
                },
            ],
            reserved_m_range: Some((100, 119)),
            model: Some("DVP-SS2".into()),
        };
        let json = serde_json::to_string(&table).expect("serialize");
        assert!(
            json.contains("\"reservedMRange\""),
            "expected reservedMRange key"
        );
        assert!(json.contains("\"model\""), "expected model key");
        let back: HmiTable = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(table, back);
        assert_eq!(back.tags.len(), 2);
        assert_eq!(back.reserved_m_range, Some((100, 119)));
    }

    #[test]
    fn hmi_table_default_is_empty() {
        let t = HmiTable::default();
        assert!(t.tags.is_empty());
        assert!(t.reserved_m_range.is_none());
        assert!(t.model.is_none());
    }

    #[test]
    fn hmi_element_type_serializes_to_camelcase() {
        assert_eq!(
            serde_json::to_value(HmiElementType::Button).expect("serialize"),
            "button"
        );
        assert_eq!(
            serde_json::to_value(HmiElementType::Lamp).expect("serialize"),
            "lamp"
        );
        assert_eq!(
            serde_json::to_value(HmiElementType::Alarm).expect("serialize"),
            "alarm"
        );
        assert_eq!(
            serde_json::to_value(HmiElementType::NumericDisplay).expect("serialize"),
            "numericDisplay"
        );
        assert_eq!(
            serde_json::to_value(HmiElementType::Setpoint).expect("serialize"),
            "setpoint"
        );
    }

    #[test]
    fn hmi_tag_source_serializes_to_camelcase() {
        assert_eq!(
            serde_json::to_value(HmiTagSource::Auto).expect("serialize"),
            "auto"
        );
        assert_eq!(
            serde_json::to_value(HmiTagSource::Manual).expect("serialize"),
            "manual"
        );
    }
}
