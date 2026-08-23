//! Ladder Diagram (LD) data model.
//!
//! The Ladder Diagram is represented as a graph of nodes + edges. The
//! frontend (React Flow) handles layout and computes `(x, y)` positions
//! from the `rung`, `branch`, and `order` fields, so this module is
//! purely a transport / serialization contract.
//!
//! The mapping from ST to a [`LadderGraph`] is deterministic and lives in
//! `crate::commands::ladder::parse_st_to_ladder`. This file only defines
//! the wire format.

use serde::{Deserialize, Serialize};

/// A Ladder Diagram graph: nodes + edges. The frontend (React Flow) handles
/// layout and computes `(x, y)` positions from the `rung`, `branch`, and
/// `order` fields.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LadderGraph {
    pub nodes: Vec<LdNode>,
    pub edges: Vec<LdEdge>,
}

/// A single visual element in a Ladder Diagram.
///
/// Node IDs are unique within the graph and follow the stable format
/// `r{rung}_b{branch}_n{order}` (e.g., `r0_b0_n0`), so the frontend can
/// sort, regroup, and address nodes deterministically.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LdNode {
    /// Unique within the graph. Use a stable string like `"r0_b0_n0"`.
    pub id: String,
    /// What this node represents visually.
    pub kind: LdNodeKind,
    /// Human-readable label rendered inside the node (e.g. `"X0"`,
    /// `"TMR T0 K100"`).
    pub label: String,
    /// Rung number, 0-indexed.
    pub rung: u32,
    /// Branch index within the rung. `0` = main (top) branch,
    /// `1+` = parallel (OR) branches.
    pub branch: u32,
    /// Order within the branch, 0-indexed.
    pub order: u32,
}

/// The visual kind of an [`LdNode`].
///
/// Serde tag `"type"` with `snake_case` naming so the JSON field for, e.g.,
/// `ContactNo { address }` is `{"type": "contact_no", "address": "X0"}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LdNodeKind {
    /// Normally-open contact: `---| |---` (DVP: `LD`/`AND` prefix).
    ContactNo { address: String },
    /// Normally-closed contact: `---|/|---` (DVP: `LDI`/`ANI` prefix).
    ContactNc { address: String },
    /// Regular output coil: `---( )---` (DVP: `OUT`).
    CoilOut { address: String },
    /// Latch coil: `---(S)---` (DVP: `SET`).
    CoilSet { address: String },
    /// Unlatch coil: `---(R)---` (DVP: `RST`).
    CoilRst { address: String },
    /// Timer instruction block: `---[TMR T0 K100]---`
    /// (DVP: `TMR`/`TMRH`/`TMRA`).
    TimerBlock { timer: String, preset: String },
    /// Counter instruction block: `---[CNT C0 K5]---`
    /// (DVP: `CNT`/`DCNT`).
    CounterBlock { counter: String, preset: String },
    /// Function call like `TON(T0, K100)` — rendered as a labeled block.
    FunctionCall { name: String, args: Vec<String> },
    /// Comment text — rendered as a small label, no connections.
    Comment { text: String },
}

/// A serial edge between two [`LdNode`]s (within the same rung and branch).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LdEdge {
    /// Unique within the graph. Format: `e{source_id}_to_{target_id}`.
    pub id: String,
    /// Source node id.
    pub source: String,
    /// Target node id.
    pub target: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_kind_serializes_to_snake_case() {
        let cases: Vec<(LdNodeKind, &str)> = vec![
            (
                LdNodeKind::ContactNo {
                    address: "X0".into(),
                },
                "contact_no",
            ),
            (
                LdNodeKind::ContactNc {
                    address: "X0".into(),
                },
                "contact_nc",
            ),
            (
                LdNodeKind::CoilOut {
                    address: "Y0".into(),
                },
                "coil_out",
            ),
            (
                LdNodeKind::CoilSet {
                    address: "Y0".into(),
                },
                "coil_set",
            ),
            (
                LdNodeKind::CoilRst {
                    address: "Y0".into(),
                },
                "coil_rst",
            ),
            (
                LdNodeKind::TimerBlock {
                    timer: "T0".into(),
                    preset: "K100".into(),
                },
                "timer_block",
            ),
            (
                LdNodeKind::CounterBlock {
                    counter: "C0".into(),
                    preset: "K5".into(),
                },
                "counter_block",
            ),
            (
                LdNodeKind::FunctionCall {
                    name: "TON".into(),
                    args: vec!["T0".into(), "K100".into()],
                },
                "function_call",
            ),
            (
                LdNodeKind::Comment {
                    text: "start".into(),
                },
                "comment",
            ),
        ];

        for (kind, expected_tag) in cases {
            let value = serde_json::to_value(&kind).expect("serialize kind");
            assert_eq!(
                value["type"], expected_tag,
                "snake_case tag mismatch for variant: {kind:?}"
            );
            // Round-trip back into the enum to confirm Deserialze matches.
            let back: LdNodeKind = serde_json::from_value(value).expect("deserialize kind");
            assert_eq!(back, kind);
        }
    }

    #[test]
    fn ladder_graph_serializes_empty() {
        let graph = LadderGraph {
            nodes: vec![],
            edges: vec![],
        };
        let json = serde_json::to_string(&graph).expect("serialize empty graph");
        assert_eq!(json, r#"{"nodes":[],"edges":[]}"#);
        let back: LadderGraph = serde_json::from_str(&json).expect("deserialize empty graph");
        assert_eq!(back, graph);
    }

    #[test]
    fn ladder_graph_preserves_field_order() {
        // React Flow consumption order requires: id, kind, label, rung, branch, order
        // so the parser can produce nodes in the same order they will be
        // visually rendered (left to right within a rung).
        let node = LdNode {
            id: "r0_b0_n0".into(),
            kind: LdNodeKind::ContactNo {
                address: "X0".into(),
            },
            label: "X0".into(),
            rung: 0,
            branch: 0,
            order: 0,
        };
        let json = serde_json::to_string(&node).expect("serialize node");
        let id_pos = json.find("\"id\"").expect("id present");
        let kind_pos = json.find("\"kind\"").expect("kind present");
        let label_pos = json.find("\"label\"").expect("label present");
        let rung_pos = json.find("\"rung\"").expect("rung present");
        let branch_pos = json.find("\"branch\"").expect("branch present");
        let order_pos = json.find("\"order\"").expect("order present");

        assert!(id_pos < kind_pos, "id must precede kind");
        assert!(kind_pos < label_pos, "kind must precede label");
        assert!(label_pos < rung_pos, "label must precede rung");
        assert!(rung_pos < branch_pos, "rung must precede branch");
        assert!(branch_pos < order_pos, "branch must precede order");
    }
}
