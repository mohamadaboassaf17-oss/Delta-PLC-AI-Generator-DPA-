//! Project file commands: new, open, save, save-as, recent list, clear active.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::Utc;
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::limits::MAX_DPA_BYTES;
use crate::models::project::{
    migrate_v2_to_v3, ActiveProjectState, Project, RecentEntry, RecentList, SCHEMA_VERSION,
};
use crate::paths;

/// Filename for the MRU list inside `app_data_dir`.
const RECENT_FILE: &str = "recent.json";

/// Managed state holding the currently-open project (if any) and its path.
#[derive(Default)]
pub struct ActiveProject(pub Mutex<Option<ActiveProjectState>>);

/// Create a new, in-memory `Project` with a fresh UUID v4 and the current
/// UTC timestamp. The returned project is NOT yet associated with a file on
/// disk; call `project_save_as` to persist it.
#[tauri::command]
pub fn project_new(name: String) -> Result<Project, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::InvalidPath(
            "project name must not be empty".into(),
        ));
    }
    Ok(Project::new(name))
}

/// Open a `.dpa` project file from disk. Sanitizes the path, validates the
/// schema version, sets the active project state, and adds the project to
/// the recent-files list.
#[tauri::command]
pub async fn project_open(path: String, app: AppHandle) -> Result<Project, AppError> {
    let p = paths::sanitize_dpa_path(&path)?;
    let project = read_project(&p).await?;

    set_active(
        &app,
        ActiveProjectState {
            path: p.clone(),
            project: project.clone(),
        },
    )?;
    upsert_recent(&app, &project, &p).await?;

    Ok(project)
}

/// Save the currently-active project to its existing path. Errors if no
/// project is active. On success, the in-memory project is updated so
/// `updated_at` and any edited fields are reflected in the next save.
#[tauri::command]
pub async fn project_save(project: Project, app: AppHandle) -> Result<(), AppError> {
    let path = {
        let state = app.state::<ActiveProject>();
        let guard = state
            .0
            .lock()
            .map_err(|e| AppError::Other(format!("active project lock poisoned: {e}")))?;
        let active = guard.as_ref().ok_or_else(|| {
            AppError::ProjectNotFound("no active project; use project_save_as".into())
        })?;
        active.path.clone()
    };

    let mut to_write = project;
    to_write.updated_at = Utc::now();
    if to_write.version != SCHEMA_VERSION {
        return Err(AppError::ProjectNotFound(format!(
            "refusing to write project with version {}, expected {}",
            to_write.version, SCHEMA_VERSION
        )));
    }

    let json = serde_json::to_string_pretty(&to_write)?;
    atomic_write(&path, &json).await?;

    let state = app.state::<ActiveProject>();
    let mut guard = state
        .0
        .lock()
        .map_err(|e| AppError::Other(format!("active project lock poisoned: {e}")))?;
    if let Some(active) = guard.as_mut() {
        active.project = to_write;
    }
    Ok(())
}

/// Save the project to a new path, set it as the active project, and add it
/// to the recent list. The path may omit `.dpa`; in that case the extension
/// is appended. Traversal and empty paths are rejected.
#[tauri::command]
pub async fn project_save_as(
    project: Project,
    path: String,
    app: AppHandle,
) -> Result<(), AppError> {
    if path.trim().is_empty() {
        return Err(AppError::InvalidPath("save-as path is empty".into()));
    }
    if path.contains("..") {
        return Err(AppError::InvalidPath(format!(
            "save-as path contains traversal: {path}"
        )));
    }
    let p = paths::ensure_dpa_extension(Path::new(&path));
    let p_str = p.to_string_lossy().to_string();
    let p = paths::sanitize_dpa_path(&p_str)?;

    let mut to_write = project;
    to_write.updated_at = Utc::now();
    if to_write.version != SCHEMA_VERSION {
        return Err(AppError::ProjectNotFound(format!(
            "refusing to write project with version {}, expected {}",
            to_write.version, SCHEMA_VERSION
        )));
    }

    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(AppError::Io)?;
        }
    }

    let json = serde_json::to_string_pretty(&to_write)?;
    atomic_write(&p, &json).await?;

    set_active(
        &app,
        ActiveProjectState {
            path: p.clone(),
            project: to_write.clone(),
        },
    )?;
    upsert_recent(&app, &to_write, &p).await?;
    Ok(())
}

/// Return the most-recently-opened projects, MRU first.
#[tauri::command]
pub async fn project_list_recent(app: AppHandle) -> Result<Vec<RecentEntry>, AppError> {
    let list = read_recent(&app).await?;
    Ok(list.entries)
}

/// Clear the active project state. Does not delete any files.
#[tauri::command]
pub fn project_clear_active(app: AppHandle) -> Result<(), AppError> {
    let state = app.state::<ActiveProject>();
    let mut guard = state
        .0
        .lock()
        .map_err(|e| AppError::Other(format!("active project lock poisoned: {e}")))?;
    *guard = None;
    Ok(())
}

// --- internal helpers -------------------------------------------------------

/// Read and parse a `.dpa` file from disk.
async fn read_project(path: &Path) -> Result<Project, AppError> {
    let metadata = tokio::fs::metadata(path).await.map_err(AppError::Io)?;
    let size = metadata.len();
    if size > MAX_DPA_BYTES {
        return Err(AppError::FileTooLarge {
            size,
            max: MAX_DPA_BYTES,
        });
    }
    let json = tokio::fs::read_to_string(path)
        .await
        .map_err(AppError::Io)?;
    // Two-step pipeline (M11.1):
    // 1. If the JSON is well-formed and the project deserialises as a v3
    //    `Project` (the fast path), return it.
    // 2. Otherwise, parse the JSON as a `Value` to inspect the schema
    //    version. If the version is older than SCHEMA_VERSION, run the
    //    migration. If the version is missing or unknown, surface the
    //    same error the pre-M11.1 code did: `Json` for missing/wrong
    //    shape, `ProjectNotFound` for an explicitly-stated bad version.
    if let Ok(p) = serde_json::from_str::<Project>(&json) {
        match p.version.cmp(&SCHEMA_VERSION) {
            std::cmp::Ordering::Equal => return Ok(p),
            std::cmp::Ordering::Greater => {
                return Err(AppError::ProjectNotFound(format!(
                    "unsupported project version {}, expected {}",
                    p.version, SCHEMA_VERSION
                )));
            }
            std::cmp::Ordering::Less => {
                // Older version. Fall through to migration.
            }
        }
    }
    // Step 2: try migration.
    let value: serde_json::Value = serde_json::from_str(&json)?;
    let on_disk_version = match value.get("version").and_then(|v| v.as_u64()) {
        Some(v) => v,
        None => {
            // No version field at all: the JSON shape is wrong. Surface
            // the same `Json` error the pre-M11.1 read_project did for
            // {"hello":"world"} and similar payloads.
            return Err(serde_json::from_str::<Project>(&json)
                .err()
                .map(AppError::Json)
                .unwrap_or_else(|| AppError::Other("invalid project shape".into())));
        }
    };
    let migrated_json = if on_disk_version == SCHEMA_VERSION as u64 {
        json.clone()
    } else if on_disk_version < SCHEMA_VERSION as u64 {
        migrate_v2_to_v3(&json)?
    } else {
        return Err(AppError::ProjectNotFound(format!(
            "unsupported project version {on_disk_version}, expected {}",
            SCHEMA_VERSION
        )));
    };
    let project: Project = serde_json::from_str(&migrated_json)?;
    Ok(project)
}
/// Install a new `ActiveProjectState` as the active project.
fn set_active(app: &AppHandle, new_state: ActiveProjectState) -> Result<(), AppError> {
    let state = app.state::<ActiveProject>();
    let mut guard = state
        .0
        .lock()
        .map_err(|e| AppError::Other(format!("active project lock poisoned: {e}")))?;
    *guard = Some(new_state);
    Ok(())
}

/// Read the persisted recent list, or return a default if absent/corrupt.
async fn read_recent(app: &AppHandle) -> Result<RecentList, AppError> {
    let path = recent_path(app)?;
    if !path.exists() {
        return Ok(RecentList::default());
    }
    let json = tokio::fs::read_to_string(&path)
        .await
        .map_err(AppError::Io)?;
    if json.trim().is_empty() {
        return Ok(RecentList::default());
    }
    let list = serde_json::from_str(&json).unwrap_or_else(|_| RecentList::default());
    Ok(list)
}

/// Atomically replace the file at `path` with `json` (H4).
///
/// Mirrors every other persistence site in the crate
/// (`commands/settings.rs`, `write_recent` below,
/// `providers/domain_trust.rs`, export temp handling): the payload is
/// written to a `.tmp` sibling in the SAME directory, then renamed over
/// the target. A crash mid-write therefore leaves either the previous
/// good `.dpa` or the new one — never a truncated mix. If anything fails
/// after the temp file was created, the temp file is removed (best
/// effort) before the original error propagates.
async fn atomic_write(path: &Path, json: &str) -> Result<(), AppError> {
    let tmp = path.with_extension("dpa.tmp");
    let result = async {
        tokio::fs::write(&tmp, json).await?;
        tokio::fs::rename(&tmp, path).await
    }
    .await;
    match result {
        Ok(()) => Ok(()),
        Err(e) => {
            // Best-effort cleanup of leftover temp data; secondary errors
            // are ignored so the original failure is what surfaces.
            let _ = tokio::fs::remove_file(&tmp).await;
            Err(AppError::Io(e))
        }
    }
}

/// Persist the recent list atomically (write to temp, then rename).
async fn write_recent(app: &AppHandle, list: &RecentList) -> Result<(), AppError> {
    let path = recent_path(app)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(AppError::Io)?;
        }
    }
    let json = serde_json::to_string_pretty(list)?;
    let tmp = path.with_extension("json.tmp");
    tokio::fs::write(&tmp, json).await.map_err(AppError::Io)?;
    tokio::fs::rename(&tmp, &path).await.map_err(AppError::Io)?;
    Ok(())
}

/// Insert or move the given project to the front of the MRU list, then
/// truncate to the effective cap.
async fn upsert_recent(app: &AppHandle, project: &Project, path: &Path) -> Result<(), AppError> {
    let list = read_recent(app).await?;
    let updated = upsert_recent_entry(list, project, path);
    write_recent(app, &updated).await
}

/// Pure function (no I/O) that performs the MRU upsert + truncation. Kept
/// separate from `upsert_recent` so it can be unit-tested without an
/// `AppHandle`.
pub fn upsert_recent_entry(mut list: RecentList, project: &Project, path: &Path) -> RecentList {
    list.entries.retain(|e| e.id != project.id);
    list.entries.insert(
        0,
        RecentEntry {
            id: project.id.clone(),
            name: project.name.clone(),
            path: path.to_string_lossy().to_string(),
            last_opened: Utc::now(),
        },
    );
    let cap = list.effective_cap();
    list.entries.truncate(cap);
    list
}

/// Resolve the path to `<app_data_dir>/recent.json`.
fn recent_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = paths::app_data_dir(app)?;
    Ok(dir.join(RECENT_FILE))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn new_project_has_version_three() {
        let p = project_new("Test".into()).expect("new");
        assert_eq!(p.version, 3);
        assert_eq!(p.version, SCHEMA_VERSION);
    }

    #[test]
    fn new_project_rejects_empty_name() {
        let err = project_new("   ".into()).expect_err("empty name rejected");
        assert!(matches!(err, AppError::InvalidPath(_)));
    }

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
    fn upsert_moves_existing_entry_to_front() {
        let p1 = Project::new("A".into());
        let p2 = Project::new("B".into());
        let list = RecentList::default();
        let list = upsert_recent_entry(list, &p1, Path::new("/a.dpa"));
        let list = upsert_recent_entry(list, &p2, Path::new("/b.dpa"));
        let list = upsert_recent_entry(list, &p1, Path::new("/a.dpa"));
        assert_eq!(list.entries.len(), 2);
        assert_eq!(list.entries[0].name, "A");
        assert_eq!(list.entries[1].name, "B");
    }

    #[test]
    fn upsert_caps_at_max_entries() {
        let mut list = RecentList {
            max_entries: 2,
            ..RecentList::default()
        };
        for i in 0..5 {
            let p = Project::new(format!("P{i}"));
            list = upsert_recent_entry(list, &p, Path::new("/x.dpa"));
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
            list = upsert_recent_entry(list, &p, Path::new("/x.dpa"));
        }
        assert_eq!(list.entries.len(), 10);
    }

    #[test]
    fn upsert_preserves_path_string() {
        let p = Project::new("X".into());
        let list = upsert_recent_entry(RecentList::default(), &p, Path::new("/some/dir/x.dpa"));
        assert_eq!(list.entries[0].path, "/some/dir/x.dpa");
    }

    /// Write `content` to a fresh file under the OS temp dir. Returns
    /// the path. The file is auto-cleaned by the OS once the last
    /// handle drops.
    fn write_temp_dpa(name: &str, content: &[u8]) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "dpa-project-test-{}-{}.dpa",
            std::process::id(),
            name
        ));
        let mut f = std::fs::File::create(&path).expect("create temp file");
        f.write_all(content).expect("write temp file");
        path
    }

    fn write_valid_small_dpa(name: &str) -> PathBuf {
        // Serialise a minimal Project and append padding so we have a
        // known-good small file under the cap.
        let p = Project::new("small".into());
        let json = serde_json::to_string_pretty(&p).expect("serialize");
        write_temp_dpa(name, json.as_bytes())
    }

    /// A v2 `.dpa` file (older schema) loads through the migration
    /// path and is automatically upgraded to v3 on read.
    #[tokio::test]
    async fn read_project_migrates_v2_to_v3() {
        // Build a v2 project JSON. The `version: 2` field is the only
        // meaningful difference from a v3 file.
        let v2_json = "{\"id\":\"abc\",\"name\":\"v2-proj\",\"created_at\":\"2025-01-01T00:00:00Z\",\"updated_at\":\"2025-01-01T00:00:00Z\",\"version\":2,\"meta\":{\"author\":\"qa\"}}";
        let path = write_temp_dpa("v2", v2_json.as_bytes());
        let p = read_project(&path)
            .await
            .expect("v2 must load via migration");
        assert_eq!(p.version, 3, "v2 file must be migrated to v3 on read");
        assert_eq!(p.name, "v2-proj");
    }

    #[tokio::test]
    async fn read_project_under_cap_succeeds() {
        let path = write_valid_small_dpa("small");
        let p = read_project(&path).await.expect("under cap ok");
        assert_eq!(p.name, "small");
    }

    #[tokio::test]
    async fn read_project_over_cap_rejects() {
        // 51 MiB body, 1 MiB over the 50 MiB cap.
        let body = vec![b'p'; 51 * 1024 * 1024];
        let path = write_temp_dpa("oversize", &body);
        let err = read_project(&path).await.expect_err("over cap must error");
        match err {
            AppError::FileTooLarge { size, max } => {
                assert!(size > MAX_DPA_BYTES);
                assert_eq!(max, MAX_DPA_BYTES);
            }
            other => panic!("expected FileTooLarge, got {other:?}"),
        }
    }

    // --- M10.6.6 §2A: malformed JSON .dpa --------------------------------

    /// A `.dpa` file that is not valid JSON must surface as
    /// `AppError::Json(_)` — no panic, no silent fallback, and the
    /// parse error carries enough detail for the user-facing toast.
    #[tokio::test]
    async fn read_project_rejects_malformed_json_without_panic() {
        let path = write_temp_dpa("malformed", b"{ not valid json");
        let err = read_project(&path)
            .await
            .expect_err("malformed JSON must error");
        match err {
            AppError::Json(_) => {}
            other => panic!("expected Json error variant, got {other:?}"),
        }
    }

    /// A `.dpa` file that is valid JSON but does not deserialize into
    /// `Project` (missing required fields, wrong types) must also
    /// surface as `AppError::Json(_)` — same contract as the malformed
    /// case from the user's perspective.
    #[tokio::test]
    async fn read_project_rejects_valid_json_with_wrong_shape() {
        let path = write_temp_dpa("wrong-shape", br#"{"hello":"world"}"#);
        let err = read_project(&path)
            .await
            .expect_err("wrong-shape JSON must error");
        assert!(matches!(err, AppError::Json(_)));
    }

    /// A `.dpa` file whose JSON body parses cleanly but advertises an
    /// unsupported schema version must surface as
    /// `AppError::ProjectNotFound(_)` (the variant we use for
    /// version-mismatch — see `read_project`).
    #[tokio::test]
    async fn read_project_rejects_wrong_schema_version() {
        let mut p = Project::new("v999".into());
        p.version = 999;
        let json = serde_json::to_string(&p).expect("serialize");
        let path = write_temp_dpa("wrong-version", json.as_bytes());
        let err = read_project(&path)
            .await
            .expect_err("wrong version must error");
        match err {
            AppError::ProjectNotFound(msg) => assert!(msg.contains("999")),
            other => panic!("expected ProjectNotFound, got {other:?}"),
        }
    }

    // --- M10.6.6 §2B: large project files --------------------------------

    /// A 10 MB description (well under the 50 MiB cap) must load
    /// successfully. This proves the cap is generous enough for
    /// any plausible legitimate project.
    #[tokio::test]
    async fn read_project_with_10mb_description_succeeds() {
        let mut p = Project::new("big-desc".into());
        // 10 * 1024 * 1024 = 10,485,760 bytes of description. A real
        // .dpa with this description serializes to a hair over 10 MB,
        // still well under MAX_DPA_BYTES (50 MiB).
        p.meta.description = Some("x".repeat(10 * 1024 * 1024));
        let json = serde_json::to_string(&p).expect("serialize");
        assert!(json.len() < MAX_DPA_BYTES as usize);
        let path = write_temp_dpa("10mb-desc", json.as_bytes());
        let back = read_project(&path).await.expect("10 MB description loads");
        assert_eq!(back.name, "big-desc");
        assert_eq!(
            back.meta.description.as_deref().map(|s| s.len()),
            Some(10 * 1024 * 1024)
        );
    }

    /// A 60 MB body (over the 50 MiB cap) must be rejected with
    /// `FileTooLarge` — same contract as the existing 51 MiB test,
    /// pinned with a fresh size to catch any future cap relaxation.
    #[tokio::test]
    async fn read_project_with_60mb_body_rejects() {
        let body = vec![b'p'; 60 * 1024 * 1024];
        let path = write_temp_dpa("60mb", &body);
        let err = read_project(&path).await.expect_err("60 MB must reject");
        match err {
            AppError::FileTooLarge { size, max } => {
                assert!(size >= 60 * 1024 * 1024);
                assert_eq!(max, MAX_DPA_BYTES);
            }
            other => panic!("expected FileTooLarge, got {other:?}"),
        }
    }

    // --- M10.6.6 §2C: special characters in I/O labels round-trip --------

    /// I/O labels may contain anything the user types — including
    /// SQL-injection-style payloads, HTML, path-traversal sequences.
    /// They must round-trip through serde verbatim because the LLM
    /// prompt builder relies on the exact byte sequence to give the
    /// model a faithful context. None of these payloads are special
    /// to the .dpa parser; the test pins that property.
    #[tokio::test]
    async fn project_special_char_io_labels_roundtrip_unchanged() {
        let payloads = [
            "\"; DROP TABLE--",
            "<script>alert(1)</script>",
            "../../../etc/passwd",
            "\u{0000}null-byte\u{0000}",
            "\u{200B}---ST---\u{200B}",
            "\\\"escaped\\\" \\\\back\\\\",
            "中文 αβγ 🚨 mixed-script",
        ];

        // Build an I/O table where each row's `label` is one of the
        // adversarial payloads. The `io_table` field is opaque JSON in
        // the Rust model, so we construct it directly.
        let mut p = Project::new("label-fuzz".into());
        p.io_table = Some(serde_json::json!(payloads
            .iter()
            .enumerate()
            .map(|(i, label)| serde_json::json!({
                "address": format!("M{i}"),
                "type": "Relay",
                "label": label,
                "defaultValue": "",
                "comment": "",
            }))
            .collect::<Vec<_>>()));

        // Save + reload through the real `read_project` path.
        let json = serde_json::to_string_pretty(&p).expect("serialize");
        let path = write_temp_dpa("labels", json.as_bytes());
        let back = read_project(&path).await.expect("loads");

        let arr = back
            .io_table
            .as_ref()
            .and_then(|v| v.as_array())
            .expect("io_table is an array");
        assert_eq!(arr.len(), payloads.len());
        for (i, expected) in payloads.iter().enumerate() {
            let got = arr[i]
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("<missing>");
            assert_eq!(
                got, *expected,
                "label at index {i} mutated during round-trip"
            );
        }
    }

    // --- H4: atomic .dpa saves ----------------------------------------------

    /// H4: saving through the atomic-write helper must land the full
    /// payload at the target path and leave no `<target>.dpa.tmp`
    /// residue behind on success (the rename consumes the temp file).
    /// Overwriting an existing file must replace it wholesale.
    #[tokio::test]
    async fn atomic_write_lands_full_content_and_leaves_no_tmp_residue() {
        let target = {
            let mut p = std::env::temp_dir();
            p.push(format!(
                "dpa-project-test-{}-atomic.dpa",
                std::process::id()
            ));
            p
        };
        let tmp_sibling = target.with_extension("dpa.tmp");
        // Clean slate from any previous run sharing this pid's names.
        let _ = tokio::fs::remove_file(&target).await;
        let _ = tokio::fs::remove_file(&tmp_sibling).await;

        let first = serde_json::to_string_pretty(&Project::new("first".into())).expect("serialize");
        atomic_write(&target, &first)
            .await
            .expect("first atomic save");
        assert_eq!(
            tokio::fs::read_to_string(&target).await.expect("read back"),
            first,
            "target must contain exactly the saved JSON"
        );
        assert!(
            !tmp_sibling.exists(),
            "no .tmp residue may remain after a successful save"
        );

        // A second save over an existing file must also be clean end-to-end.
        let second =
            serde_json::to_string_pretty(&Project::new("second".into())).expect("serialize");
        atomic_write(&target, &second)
            .await
            .expect("overwrite save");
        assert_eq!(
            tokio::fs::read_to_string(&target).await.expect("read back"),
            second
        );
        assert!(!tmp_sibling.exists(), "no residue after overwrite");

        // Tidy up (best effort; tests share the OS temp dir by convention).
        let _ = tokio::fs::remove_file(&target).await;
    }

    /// H4: when the rename cannot land (here: target directory does not
    /// exist, so the temp write fails), the helper must surface an I/O
    /// error rather than panic and must leave no partial temp file.
    #[tokio::test]
    async fn atomic_write_failure_surfaces_io_error_without_residue() {
        let missing_dir = {
            let mut p = std::env::temp_dir();
            p.push(format!(
                "dpa-project-test-{}-atomic-missing-{:?}",
                std::process::id(),
                std::time::SystemTime::now()
            ));
            p
        };
        let target = missing_dir.join("x.dpa");
        let tmp_sibling = target.with_extension("dpa.tmp");
        assert!(!missing_dir.exists());

        let err = atomic_write(&target, "{}")
            .await
            .expect_err("write into a nonexistent dir must fail");
        assert!(matches!(err, AppError::Io(_)));
        assert!(
            !tmp_sibling.exists(),
            "failed write must not leave temp residue"
        );
    }
}
