//! Chat history models for the LLM conversation panel (added in M6).
//!
//! A `ChatMessage` is a single turn in the project's dialogue with the LLM.
//! The model is intentionally minimal: a timestamp, role, text content, and
//! an optional proposal the assistant wants the user to apply or reject.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Who authored a single chat turn in the project history.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    User,
    Assistant,
    System,
}

/// A proposal attached to an assistant chat turn.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatProposal {
    /// Proposed Structured Text code.
    pub st: String,
    /// Human-readable summary of what this proposal changes.
    pub summary: String,
}

/// A single turn in the project's chat history with the LLM.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    /// When this turn was authored (UTC).
    pub timestamp: DateTime<Utc>,
    /// Who authored this turn.
    pub role: ChatRole,
    /// The raw text content of the turn.
    pub content: String,
    /// Optional assistant proposal. User/system turns never carry a proposal.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proposal: Option<ChatProposal>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assistant_message_with_proposal_roundtrips_via_json() {
        let msg = ChatMessage {
            timestamp: DateTime::parse_from_rfc3339("2026-06-04T12:00:00Z")
                .expect("valid rfc3339")
                .with_timezone(&Utc),
            role: ChatRole::Assistant,
            content: "Here is the modified ST code.".into(),
            proposal: Some(ChatProposal {
                st: "X0 := TRUE;\nEND;".into(),
                summary: "Renamed internal relay M10 to M20".into(),
            }),
        };
        let json = serde_json::to_string(&msg).expect("serialize");
        assert!(
            json.contains("\"role\":\"assistant\""),
            "role must serialize as lowercase: {json}"
        );
        assert!(
            json.contains("\"proposal\""),
            "proposal key must be present when Some: {json}"
        );
        assert!(json.contains("\"st\""), "proposal.st key present");
        assert!(json.contains("\"summary\""), "proposal.summary key present");
        let back: ChatMessage = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(msg, back);
    }

    #[test]
    fn user_message_omits_proposal_in_json() {
        let msg = ChatMessage {
            timestamp: DateTime::parse_from_rfc3339("2026-06-04T12:00:00Z")
                .expect("valid rfc3339")
                .with_timezone(&Utc),
            role: ChatRole::User,
            content: "Please rename M10 to M20.".into(),
            proposal: None,
        };
        let json = serde_json::to_string(&msg).expect("serialize");
        assert!(
            !json.contains("proposal"),
            "proposal key must be omitted when None: {json}"
        );
        assert!(
            json.contains("\"role\":\"user\""),
            "user role must serialize as lowercase: {json}"
        );
        let back: ChatMessage = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(msg, back);
    }
}
