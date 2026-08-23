//! File-path helpers.
//!
//! All paths coming from the frontend pass through `sanitize_dpa_path` before
//! any filesystem I/O is attempted. This guards against empty inputs and
//! obvious path-traversal attempts.

use std::path::{Component, Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::error::AppError;

/// Validate and normalize a `.dpa` file path coming from the frontend.
///
/// Rejects empty input and any path containing a `..` parent-directory
/// component. The `.dpa` extension is required.
pub fn sanitize_dpa_path(path: &str) -> Result<PathBuf, AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidPath("path is empty".into()));
    }

    let candidate = PathBuf::from(trimmed);

    for component in candidate.components() {
        if matches!(component, Component::ParentDir) {
            return Err(AppError::InvalidPath(format!(
                "path contains parent dir component: {path}"
            )));
        }
    }

    match candidate.extension().and_then(|e| e.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("dpa") => {}
        _ => {
            return Err(AppError::InvalidExtension(format!(
                "expected .dpa extension: {path}"
            )))
        }
    }

    Ok(candidate)
}

/// Ensure `path` ends in a `.dpa` extension. If the extension is missing or
/// differs (case-insensitive), it is replaced/added.
pub fn ensure_dpa_extension(path: &Path) -> PathBuf {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("dpa") => path.to_path_buf(),
        _ => {
            let mut p = path.to_path_buf();
            p.set_extension("dpa");
            p
        }
    }
}

/// Resolve the per-application data directory, creating it if it does not
/// yet exist. Used for storing `recent.json`, `settings.json`, etc.
pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(format!("could not resolve app_data_dir: {e}")))?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_dpa_path_accepted() {
        let p = sanitize_dpa_path("C:\\projects\\pump.dpa").expect("valid path");
        assert_eq!(p.to_string_lossy(), "C:\\projects\\pump.dpa");
    }

    #[test]
    fn uppercase_extension_accepted() {
        let p = sanitize_dpa_path("/tmp/foo.DPA").expect("valid path");
        assert_eq!(p.to_string_lossy(), "/tmp/foo.DPA");
    }

    #[test]
    fn missing_extension_rejected() {
        let err = sanitize_dpa_path("/tmp/foo").expect_err("should reject");
        assert!(matches!(err, AppError::InvalidExtension(_)));
    }

    #[test]
    fn wrong_extension_rejected() {
        let err = sanitize_dpa_path("/tmp/foo.txt").expect_err("should reject");
        assert!(matches!(err, AppError::InvalidExtension(_)));
    }

    #[test]
    fn empty_path_rejected() {
        let err = sanitize_dpa_path("").expect_err("should reject");
        assert!(matches!(err, AppError::InvalidPath(_)));
    }

    #[test]
    fn whitespace_only_path_rejected() {
        let err = sanitize_dpa_path("   \t  ").expect_err("should reject");
        assert!(matches!(err, AppError::InvalidPath(_)));
    }

    #[test]
    fn parent_dir_component_rejected() {
        let err = sanitize_dpa_path("/tmp/../escape.dpa").expect_err("should reject");
        assert!(matches!(err, AppError::InvalidPath(_)));
    }

    #[test]
    fn nested_parent_dir_rejected() {
        let err = sanitize_dpa_path("C:\\foo\\..\\bar.dpa").expect_err("should reject");
        assert!(matches!(err, AppError::InvalidPath(_)));
    }

    #[test]
    fn ensure_appends_when_missing() {
        let p = ensure_dpa_extension(Path::new("/tmp/foo"));
        assert_eq!(p.extension().and_then(|e| e.to_str()), Some("dpa"));
    }

    #[test]
    fn ensure_preserves_existing_dpa() {
        let p = ensure_dpa_extension(Path::new("/tmp/foo.dpa"));
        assert_eq!(p, PathBuf::from("/tmp/foo.dpa"));
    }

    #[test]
    fn ensure_preserves_uppercase_dpa() {
        let p = ensure_dpa_extension(Path::new("/tmp/foo.DPA"));
        assert_eq!(p, PathBuf::from("/tmp/foo.DPA"));
    }
}
