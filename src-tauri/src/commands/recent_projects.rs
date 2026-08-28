//! Recent-projects persistence (FIX-02).
//!
//! AGENTS.md v2.1 + PRD §6.1 require a human-readable MRU list at
//! `<app_data_dir>/recent_projects.json`. Historically the file was
//! `recent.json` (`project.rs:RECENT_FILE`); this module canonicalises on
//! `recent_projects.json` but retains a fallback read of the legacy name so
//! existing installs migrate silently.

use std::path::{Path, PathBuf};

use chrono::Utc;
use tauri::AppHandle;

use crate::error::AppError;
use crate::models::project::{Project, RecentEntry, RecentList};
use crate::paths;

/// Canonical filename. Matches `AGENTS.md:79` / `DPA_PRD.md:44`.
pub const RECENT_FILE: &str = "recent_projects.json";
/// Legacy filename retained for migration fallback.
pub const LEGACY_RECENT_FILE: &str = "recent.json";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/// Resolve `<app_data_dir>/recent_projects.json`.
pub fn recent_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = paths::app_data_dir(app)?;
    Ok(dir.join(RECENT_FILE))
}

fn legacy_recent_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = paths::app_data_dir(app)?;
    Ok(dir.join(LEGACY_RECENT_FILE))
}

// ---------------------------------------------------------------------------
// Internal I/O (mirrors the atomic-write pattern in `project.rs`)
// ---------------------------------------------------------------------------

/// Read the persisted MRU list, or return a default if absent/corrupt.
///
/// Tries the canonical path first, then the legacy path for migration.
pub async fn read_recent(app: &AppHandle) -> Result<RecentList, AppError> {
    let canonical = recent_path(app)?;
    if canonical.exists() {
        return read_recent_file(&canonical).await;
    }
    // Fallback: legacy file from installs prior to the M8 rename.
    let legacy = legacy_recent_path(app)?;
    if legacy.exists() {
        let list = read_recent_file(&legacy).await?;
        // Best-effort migrate: copy to canonical location so the legacy file
        // is no longer the source of truth. Failure is non-fatal.
        let _ = write_recent(app, &list).await;
        return Ok(list);
    }
    Ok(RecentList::default())
}

async fn read_recent_file(path: &Path) -> Result<RecentList, AppError> {
    if !path.exists() {
        return Ok(RecentList::default());
    }
    let json = tokio::fs::read_to_string(path).await.map_err(AppError::Io)?;
    if json.trim().is_empty() {
        return Ok(RecentList::default());
    }
    // Corrupt JSON falls back to default (keeps app launchable) — mirrors
    // `project.rs:read_recent` behaviour.
    let list = serde_json::from_str(&json).unwrap_or_else(|_| RecentList::default());
    Ok(list)
}

/// Persist the MRU list atomically (temp sibling + rename).
pub async fn write_recent(app: &AppHandle, list: &RecentList) -> Result<(), AppError> {
    let path = recent_path(app)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(AppError::Io)?;
        }
    }
    let json = serde_json::to_string_pretty(list)?;
    let tmp = path.with_extension("json.tmp");
    tokio::fs::write(&tmp, json).await.map_err(AppError::Io)?;
    tokio::fs::rename(&tmp, &path).await.map_err(AppError::Io)?;
    // Best-effort legacy cleanup: remove the old file once migration succeeded
    // so the user does not see two files. Ignore errors.
    let legacy = legacy_recent_path(app)?;
    if legacy.exists() && legacy != path {
        let _ = tokio::fs::remove_file(&legacy).await;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Pure MRU logic (testable without an AppHandle)
// ---------------------------------------------------------------------------

/// Insert or move the given project to the front of the MRU list, then
/// truncate to the effective cap. Deduplicates by **path** (spec
/// `AGENTS.md:80`), with a secondary `id` check so Save-As with same id
/// but new path still replaces correctly.
pub fn upsert_recent_entry(mut list: RecentList, project: &Project, path: &Path) -> RecentList {
    let new_path = path.to_string_lossy().to_string();
    list.entries.retain(|e| e.path != new_path && e.id != project.id);
    list.entries.insert(
        0,
        RecentEntry {
            id: project.id.clone(),
            name: project.name.clone(),
            path: new_path,
            last_opened: Utc::now(),
        },
    );
    let cap = list.effective_cap();
    list.entries.truncate(cap);
    list
}

/// Insert or move the given project to the front; internal helper for
/// `recent_projects_push` command where path/name are supplied directly
/// without a full `Project`.
pub fn push_recent_entry_by_path(
    mut list: RecentList,
    path: &str,
    name: &str,
    id: &str,
) -> RecentList {
    list.entries.retain(|e| e.path != path);
    list.entries.insert(
        0,
        RecentEntry {
            id: id.to_string(),
            name: name.to_string(),
            path: path.to_string(),
            last_opened: Utc::now(),
        },
    );
    let cap = list.effective_cap();
    list.entries.truncate(cap);
    list
}

pub async fn upsert_recent(app: &AppHandle, project: &Project, path: &Path) -> Result<(), AppError> {
    let list = read_recent(app).await?;
    let updated = upsert_recent_entry(list, project, path);
    write_recent(app, &updated).await
}

// ---------------------------------------------------------------------------
// Tauri commands — canonical `recent_projects_*` names (AGENTS.md:78)
// ---------------------------------------------------------------------------

/// Return the MRU list, most-recent first.
#[tauri::command]
pub async fn recent_projects_list(app: AppHandle) -> Result<Vec<RecentEntry>, AppError> {
    let list = read_recent(&app).await?;
    Ok(list.entries)
}

/// Push (or bump) a recent entry by path. Used by frontend after a manual
/// action when it only has the filesystem path (e.g., the file picker
/// result). `name` falls back to the file stem if empty.
#[tauri::command]
pub async fn recent_projects_push(
    app: AppHandle,
    path: String,
    name: Option<String>,
) -> Result<(), AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidPath("recent push path is empty".into()));
    }
    let p = PathBuf::from(trimmed);
    let derived_name = name
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string()
        });
    // Use the path itself as a stable id for push-by-path; dedupe is by
    // path so the exact id value only matters for new entries.
    let id = p.to_string_lossy().to_string();
    let list = read_recent(&app).await?;
    let updated = push_recent_entry_by_path(list, trimmed, &derived_name, &id);
    write_recent(&app, &updated).await
}

/// Remove a single entry by path. Idempotent — removing a non-existent
/// path succeeds with no change.
#[tauri::command]
pub async fn recent_projects_remove(app: AppHandle, path: String) -> Result<(), AppError> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::InvalidPath("recent remove path is empty".into()));
    }
    let list = read_recent(&app).await?;
    let mut updated = list;
    let before = updated.entries.len();
    updated.entries.retain(|e| e.path != trimmed);
    if updated.entries.len() != before {
        write_recent(&app, &updated).await?;
    }
    Ok(())
}

// Legacy compat is provided by `commands::project::project_list_recent`
// (delegates to `recent_projects::read_recent`). No duplicate alias here.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::project::Project;
    use std::path::Path;

    #[test]
    fn upsert_inserts_in_mru_order() {
        let p1 = Project::new("A".into());
        let p2 = Project::new("B".into());
        let p3 = Project::new("C".into());
        let list = RecentList::default();
        let list = upsert_recent_entry(list, &p1, Path::new("/a.dpa"));
        let list = upsert_recent_entry(list, &p2, Path::new("/b.dpa"));
        let list = upsert_recent_entry(list, &p3, Path::new("/c.dpa"));
        assert_eq!(list.entries.len(), 3);
        assert_eq!(list.entries[0].name, "C");
        assert_eq!(list.entries[1].name, "B");
        assert_eq!(list.entries[2].name, "A");
    }

    #[test]
    fn upsert_deduplicates_by_path_not_just_id() {
        // Same path, different project ids (e.g., copied .dpa file) — second
        // insert must replace the first, not create a duplicate path entry.
        let p1 = Project::new("Original".into());
        let p2 = Project::new("Copy".into());
        assert_ne!(p1.id, p2.id);
        let list = RecentList::default();
        let list = upsert_recent_entry(list, &p1, Path::new("/shared.dpa"));
        assert_eq!(list.entries.len(), 1);
        assert_eq!(list.entries[0].id, p1.id);
        let list = upsert_recent_entry(list, &p2, Path::new("/shared.dpa"));
        assert_eq!(list.entries.len(), 1, "path dedupe must prevent duplicates");
        assert_eq!(list.entries[0].id, p2.id);
        assert_eq!(list.entries[0].name, "Copy");
    }

    #[test]
    fn upsert_deduplicates_by_id_for_save_as_path_change() {
        // Same id, different path (Save As) — old path should be removed.
        let p1 = Project::new("Moved".into());
        let list = RecentList::default();
        let list = upsert_recent_entry(list, &p1, Path::new("/old.dpa"));
        let list = upsert_recent_entry(list, &p1, Path::new("/new.dpa"));
        assert_eq!(list.entries.len(), 1);
        assert_eq!(list.entries[0].path, "/new.dpa");
    }

    #[test]
    fn upsert_moves_existing_path_to_front() {
        let p1 = Project::new("A".into());
        let p2 = Project::new("B".into());
        let list = RecentList::default();
        let list = upsert_recent_entry(list, &p1, Path::new("/a.dpa"));
        let list = upsert_recent_entry(list, &p2, Path::new("/b.dpa"));
        // Re-open /a.dpa with a fresh project id but same path — should move to front via path dedupe
        let p3 = Project::new("A-reopened".into());
        let list = upsert_recent_entry(list, &p3, Path::new("/a.dpa"));
        assert_eq!(list.entries.len(), 2);
        assert_eq!(list.entries[0].path, "/a.dpa");
        assert_eq!(list.entries[1].path, "/b.dpa");
    }

    #[test]
    fn upsert_caps_at_max_entries() {
        let mut list = RecentList {
            max_entries: 2,
            ..RecentList::default()
        };
        for i in 0..5 {
            let p = Project::new(format!("P{i}"));
            list = upsert_recent_entry(list, &p, Path::new(&format!("/x{i}.dpa")));
        }
        assert_eq!(list.entries.len(), 2);
        assert_eq!(list.entries[0].name, "P4");
        assert_eq!(list.entries[1].name, "P3");
    }

    #[test]
    fn upsert_falls_back_to_default_cap_when_zero() {
        let mut list = RecentList {
            max_entries: 0,
            ..RecentList::default()
        };
        for i in 0..15 {
            let p = Project::new(format!("P{i}"));
            list = upsert_recent_entry(list, &p, Path::new(&format!("/x{i}.dpa")));
        }
        assert_eq!(list.entries.len(), 10);
    }

    #[test]
    fn push_recent_by_path_deduplicates() {
        let list = RecentList::default();
        let list = push_recent_entry_by_path(list, "/a.dpa", "A", "/a.dpa");
        let list = push_recent_entry_by_path(list, "/b.dpa", "B", "/b.dpa");
        let list = push_recent_entry_by_path(list, "/a.dpa", "A2", "/a.dpa");
        assert_eq!(list.entries.len(), 2);
        assert_eq!(list.entries[0].path, "/a.dpa");
        assert_eq!(list.entries[0].name, "A2");
    }

    #[test]
    fn push_recent_caps() {
        let mut list = RecentList {
            max_entries: 2,
            ..Default::default()
        };
        for i in 0..5 {
            list = push_recent_entry_by_path(list, &format!("/x{i}.dpa"), &format!("P{i}"), &format!("/x{i}.dpa"));
        }
        assert_eq!(list.entries.len(), 2);
    }

    #[test]
    fn recent_file_constant_is_canonical() {
        assert_eq!(RECENT_FILE, "recent_projects.json");
    }

    #[test]
    fn legacy_recent_file_constant_is_legacy() {
        assert_eq!(LEGACY_RECENT_FILE, "recent.json");
    }
}
