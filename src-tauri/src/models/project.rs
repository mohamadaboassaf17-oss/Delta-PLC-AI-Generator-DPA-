//! Project, project-metadata, and recent-files models.

use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::hmi::HmiTable;

/// Current `.dpa` schema version. Bumped from 2 to 3 in M11.1 to add
/// explicit `chat_history` support and to lay the groundwork for the
/// Custom Provider (custom_base_url) fields added in M11.3.
pub const SCHEMA_VERSION: u32 = 3;

/// A Delta PLC project. Fields beyond `meta` are reserved for future
/// milestones and round-trip as opaque JSON until the typed models exist.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub version: u32,
    pub meta: ProjectMeta,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub io_table: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generated: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hmi_table: Option<HmiTable>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chat_history: Option<Vec<crate::models::chat::ChatMessage>>,
}

impl Project {
    pub fn new(name: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            created_at: now,
            updated_at: now,
            version: SCHEMA_VERSION,
            meta: ProjectMeta::default(),
            io_table: None,
            generated: None,
            hmi_table: None,
            chat_history: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ProjectMeta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecentEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub last_opened: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecentList {
    pub entries: Vec<RecentEntry>,
    pub max_entries: usize,
}

impl RecentList {
    pub const DEFAULT_MAX_ENTRIES: usize = 10;
    pub fn effective_cap(&self) -> usize {
        if self.max_entries == 0 {
            Self::DEFAULT_MAX_ENTRIES
        } else {
            self.max_entries
        }
    }
}

impl Default for RecentList {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            max_entries: Self::DEFAULT_MAX_ENTRIES,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ActiveProjectState {
    pub path: PathBuf,
    pub project: Project,
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

pub fn migrate_v2_to_v3(json: &str) -> Result<String, AppError> {
    let mut value: serde_json::Value = serde_json::from_str(json)?;
    let version = value
        .get("version")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| {
            AppError::ProjectNotFound("missing or non-numeric `version` field".into())
        })?;
    match version {
        3 => Ok(json.to_string()),
        2 => {
            value["version"] = serde_json::Value::Number(serde_json::Number::from(3u32));
            Ok(serde_json::to_string(&value)?)
        }
        other => Err(AppError::ProjectNotFound(format!(
            "unsupported project version {other}, expected 3"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_project_has_version_three() {
        let p = Project::new("Test".into());
        assert_eq!(p.version, SCHEMA_VERSION);
        assert_eq!(p.version, 3);
    }

    #[test]
    fn new_project_has_uuid_id() {
        let p = Project::new("Test".into());
        assert_eq!(p.id.len(), 36);
        assert_eq!(p.id.matches('-').count(), 4);
        Uuid::parse_str(&p.id).expect("valid uuid");
    }

    #[test]
    fn project_roundtrips_via_json() {
        let p = Project::new("Pump controller".into());
        let json = serde_json::to_string(&p).expect("serialize");
        let back: Project = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(p, back);
    }

    #[test]
    fn version_field_present_in_json() {
        let p = Project::new("Test".into());
        let value = serde_json::to_value(&p).expect("to_value");
        assert_eq!(value["version"], 3);
    }

    #[test]
    fn optional_fields_omitted_when_none() {
        let p = Project::new("Test".into());
        let json = serde_json::to_string(&p).expect("serialize");
        for field in ["io_table", "generated", "hmi_table", "chat_history"] {
            assert!(!json.contains(field), "field {field} should be omitted");
        }
    }

    #[test]
    fn optional_fields_roundtrip_when_present() {
        let mut p = Project::new("Test".into());
        p.io_table = Some(serde_json::json!({"rows": []}));
        let json = serde_json::to_string(&p).expect("serialize");
        assert!(json.contains("io_table"));
        let back: Project = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(p, back);
    }

    #[test]
    fn project_meta_default_is_empty() {
        let m = ProjectMeta::default();
        assert!(m.author.is_none());
        assert!(m.description.is_none());
        assert!(m.tags.is_empty());
    }

    #[test]
    fn project_meta_omits_empty_fields() {
        let m = ProjectMeta::default();
        let json = serde_json::to_string(&m).expect("serialize");
        assert_eq!(json, "{}");
    }

    #[test]
    fn recent_list_default_has_ten_cap() {
        let r = RecentList::default();
        assert!(r.entries.is_empty());
        assert_eq!(r.max_entries, 10);
    }

    #[test]
    fn recent_list_effective_cap_falls_back_to_default() {
        let r = RecentList {
            entries: vec![],
            max_entries: 0,
        };
        assert_eq!(r.effective_cap(), 10);
    }

    #[test]
    fn recent_entry_roundtrips() {
        let entry = RecentEntry {
            id: Uuid::new_v4().to_string(),
            name: "Foo".into(),
            path: r"C:\projects\foo.dpa".into(),
            last_opened: Utc::now(),
        };
        let json = serde_json::to_string(&entry).expect("serialize");
        let back: RecentEntry = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(entry, back);
    }

    // --- M11.1 schema migration -------------------------------------------

    #[test]
    fn migrate_v2_to_v3_preserves_fields() {
        let v2_json = r#"{
  "id":"11111111-2222-3333-4444-555555555555",
  "name":"Legacy v2 project",
  "created_at":"2025-01-01T00:00:00Z",
  "updated_at":"2025-06-01T00:00:00Z",
  "version":2,
  "meta":{
    "author":"qa",
    "description":"Pre-M11.1 project",
    "tags":["legacy","migration"],
    "model":"DVP-SS2"
  },
  "io_table":{"rows":[]},
  "generated":{"st":"Y0 := X0;","il":"LD X0\nOUT Y0"},
  "hmi_table":null,
  "chat_history":null
}"#;
        let migrated = migrate_v2_to_v3(v2_json).expect("migration ok");
        let v: serde_json::Value = serde_json::from_str(&migrated).expect("parse migrated");
        assert_eq!(v["version"], 3, "version must be bumped to 3");
        assert_eq!(v["id"], "11111111-2222-3333-4444-555555555555");
        assert_eq!(v["name"], "Legacy v2 project");
        assert_eq!(v["created_at"], "2025-01-01T00:00:00Z");
        assert_eq!(v["updated_at"], "2025-06-01T00:00:00Z");
        assert_eq!(v["meta"]["author"], "qa");
        assert_eq!(v["meta"]["description"], "Pre-M11.1 project");
        assert_eq!(v["meta"]["model"], "DVP-SS2");
        assert_eq!(v["io_table"], serde_json::json!({"rows": []}));
        assert_eq!(v["generated"]["st"], "Y0 := X0;");
        assert_eq!(v["generated"]["il"], "LD X0\nOUT Y0");
    }

    #[test]
    fn migrate_v2_to_v3_passes_through_v3_unchanged() {
        let v3_json = r#"{"id":"a","name":"b","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z","version":3,"meta":{}}"#;
        let out = migrate_v2_to_v3(v3_json).expect("v3 ok");
        assert_eq!(out, v3_json);
    }

    #[test]
    fn migrate_v2_to_v3_loaded_project_roundtrips() {
        let v2_json = r#"{"id":"p","name":"x","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z","version":2,"meta":{}}"#;
        let migrated = migrate_v2_to_v3(v2_json).expect("migrate");
        let p: Project = serde_json::from_str(&migrated).expect("load as Project");
        assert_eq!(p.version, 3);
        assert!(p.chat_history.is_none());
    }

    #[test]
    fn migrate_v2_to_v3_rejects_unknown_version() {
        let bad = r#"{"id":"a","name":"b","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z","version":99,"meta":{}}"#;
        let err = migrate_v2_to_v3(bad).expect_err("unknown version must error");
        assert!(matches!(err, AppError::ProjectNotFound(_)));
    }

    #[test]
    fn migrate_v2_to_v3_rejects_malformed_json() {
        let err = migrate_v2_to_v3("{ not json").expect_err("malformed must error");
        assert!(matches!(err, AppError::Json(_)));
    }
}
