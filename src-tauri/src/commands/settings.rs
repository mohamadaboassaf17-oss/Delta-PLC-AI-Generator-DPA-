//! User-settings commands: read and write the persistent settings file.

use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::error::AppError;
use crate::limits::MAX_SETTINGS_BYTES;
use crate::models::settings::Settings;
use crate::paths;

/// Filename for settings inside `app_data_dir`.
const SETTINGS_FILE: &str = "settings.json";

/// Read settings from `<app_data_dir>/settings.json`. If the file is
/// missing or unreadable, returns `Settings::default()`. Parse failures
/// also return defaults to keep the app launchable. Files that exceed
/// the size cap do NOT silently fall back to defaults — they surface
/// as [`AppError::FileTooLarge`] so the frontend can warn the user;
/// the size cap is a security control, not a data-recovery mechanism.
#[tauri::command]
pub fn settings_get(app: AppHandle) -> Result<Settings, AppError> {
    let path = settings_path(&app)?;
    read_settings_file(&path)
}

/// Read and parse `path` as a settings file. The path-taking shape
/// keeps this helper unit-testable without a Tauri `AppHandle`.
/// See [`settings_get`] for the full contract.
fn read_settings_file(path: &Path) -> Result<Settings, AppError> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let metadata = std::fs::metadata(path).map_err(AppError::Io)?;
    let size = metadata.len();
    if size > MAX_SETTINGS_BYTES {
        return Err(AppError::FileTooLarge {
            size,
            max: MAX_SETTINGS_BYTES,
        });
    }
    let json = std::fs::read_to_string(path).map_err(AppError::Io)?;
    if json.trim().is_empty() {
        return Ok(Settings::default());
    }
    let settings: Settings = serde_json::from_str(&json).unwrap_or_default();
    Ok(settings)
}

/// Persist `settings` to `<app_data_dir>/settings.json` as pretty JSON.
/// Writes are atomic (temp file + rename) so a crash mid-write cannot
/// corrupt the existing settings.
#[tauri::command]
pub fn settings_set(settings: Settings, app: AppHandle) -> Result<(), AppError> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let json = serde_json::to_string_pretty(&settings)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = paths::app_data_dir(app)?;
    Ok(dir.join(SETTINGS_FILE))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::settings::{GenerationSettings, Provider, Theme, UiSettings};
    use std::io::Write;

    #[test]
    fn default_roundtrips_via_serde() {
        let s = Settings::default();
        let json = serde_json::to_string_pretty(&s).expect("serialize");
        let back: Settings = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(s, back);
    }

    #[test]
    fn custom_roundtrips_via_serde() {
        let s = Settings {
            active_provider: Provider::Anthropic,
            generation: GenerationSettings {
                model: "claude-3-5-sonnet-20241022".into(),
                temperature: 0.7,
                max_tokens: 2048,
            },
            ui: UiSettings {
                theme: Theme::Light,
                language: "fr-FR".into(),
            },
            custom_base_url: None,
            custom_model_name: None,
        };
        let json = serde_json::to_string_pretty(&s).expect("serialize");
        let back: Settings = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(s, back);
    }

    #[test]
    fn empty_string_falls_back_to_default_via_serde() {
        // `serde_json::from_str("")` fails with an EOF error, so the
        // production path uses `unwrap_or_default` to keep the app
        // launchable when the settings file is empty or malformed.
        let parsed: Settings = serde_json::from_str("").unwrap_or_default();
        assert_eq!(parsed, Settings::default());
    }

    /// Helper: write `content` to a temp file under the OS temp dir with
    /// a unique name, return the path. The file is auto-cleaned by the
    /// OS once the last handle drops.
    fn write_temp_settings(name: &str, content: &[u8]) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("dpa-settings-test-{}-{}", std::process::id(), name));
        let mut f = std::fs::File::create(&path).expect("create temp file");
        f.write_all(content).expect("write temp file");
        path
    }

    #[test]
    fn read_settings_missing_file_returns_default() {
        let mut path = std::env::temp_dir();
        path.push(format!("dpa-settings-missing-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let out = read_settings_file(&path).expect("missing file is ok");
        assert_eq!(out, Settings::default());
    }

    #[test]
    fn read_settings_small_file_succeeds() {
        // 512 KiB is well under the 1 MiB cap.
        let body = b"{\"activeProvider\":\"openai\",\"generation\":{\"model\":\"gpt-4o\",\"temperature\":0.2,\"max_tokens\":4096},\"ui\":{\"theme\":\"system\",\"language\":\"en-US\"}}";
        let pad = vec![b' '; 512 * 1024];
        let mut buf: Vec<u8> = Vec::with_capacity(body.len() + pad.len());
        buf.extend_from_slice(body);
        buf.extend_from_slice(&pad);
        let path = write_temp_settings("small.json", &buf);
        let out = read_settings_file(&path).expect("under cap succeeds");
        assert_eq!(out.active_provider, Provider::Openai);
    }

    #[test]
    fn read_settings_over_cap_returns_file_too_large() {
        // 2 MiB body — 1 MiB over the cap.
        let pad = vec![b'x'; 2 * 1024 * 1024];
        let path = write_temp_settings("oversize.json", &pad);
        let err = read_settings_file(&path).expect_err("over cap must error");
        match err {
            AppError::FileTooLarge { size, max } => {
                assert!(size > MAX_SETTINGS_BYTES);
                assert_eq!(max, MAX_SETTINGS_BYTES);
            }
            other => panic!("expected FileTooLarge, got {other:?}"),
        }
    }

    #[test]
    fn read_settings_empty_file_returns_default() {
        let path = write_temp_settings("empty.json", b"");
        let out = read_settings_file(&path).expect("empty file is ok");
        assert_eq!(out, Settings::default());
    }
}
