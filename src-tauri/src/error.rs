//! Application-wide error type.
//!
//! All Tauri commands return `Result<T, AppError>`. The error implements
//! `serde::Serialize` so it crosses the IPC boundary as a structured
//! `{ "kind": "...", "message": "..." }` payload, while also satisfying
//! `std::error::Error` and `Display` for internal use.

use serde::{Serialize, Serializer};
use thiserror::Error;

/// All errors that can be produced by a Tauri command in this crate.
///
/// Some variants are reserved for future milestones and are currently
/// unused, which is why the whole enum is `dead_code`-allowed.
#[allow(dead_code)]
#[derive(Debug, Error)]
pub enum AppError {
    /// An I/O failure (file read/write, directory create, etc.).
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    /// A JSON serialization/deserialization failure.
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),

    /// A keyring (OS credential store) failure.
    #[error("keyring: {0}")]
    Keyring(#[from] keyring::Error),

    /// An HTTP request failure (network, timeout, non-2xx with no body, etc.).
    #[error("http: {0}")]
    Http(String),

    /// A path was empty, contained traversal, or was otherwise unusable.
    #[error("invalid path: {0}")]
    InvalidPath(String),

    /// A path did not have the required file extension.
    #[error("invalid extension: {0}")]
    InvalidExtension(String),

    /// The requested project was not found, or its schema version is unsupported.
    #[error("project not found: {0}")]
    ProjectNotFound(String),

    /// A requested secret key was not present in the OS credential store.
    #[error("key not found: {0}")]
    KeyNotFound(String),

    /// An LLM provider returned a non-success response or refused the request.
    #[error("provider error: {0}")]
    Provider(String),

    /// A catch-all for unexpected or unclassified failures.
    #[error("{0}")]
    Other(String),

    /// A file on disk was rejected because it exceeded the configured
    /// size cap. Returned by readers that protect the app from being
    /// asked to slurp a hostile or accidentally-oversized file into
    /// memory (see [`crate::limits`]).
    #[error("file too large: {size} bytes (max {max})")]
    FileTooLarge { size: u64, max: u64 },
}

/// Stringify an `AppError` for the IPC payload.
pub fn app_error_to_string(err: &AppError) -> String {
    err.to_string()
}

/// Map an `AppError` variant to a stable, lowercase identifier for the frontend.
fn kind_str(err: &AppError) -> &'static str {
    match err {
        AppError::Io(_) => "io",
        AppError::Json(_) => "json",
        AppError::Keyring(_) => "keyring",
        AppError::Http(_) => "http",
        AppError::InvalidPath(_) => "invalid_path",
        AppError::InvalidExtension(_) => "invalid_extension",
        AppError::ProjectNotFound(_) => "project_not_found",
        AppError::KeyNotFound(_) => "key_not_found",
        AppError::Provider(_) => "provider",
        AppError::Other(_) => "other",
        AppError::FileTooLarge { .. } => "file_too_large",
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", kind_str(self))?;
        state.serialize_field("message", &app_error_to_string(self))?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialize_emits_kind_and_message() {
        let err = AppError::Other("boom".into());
        let value = serde_json::to_value(&err).expect("serialize");
        assert_eq!(value["kind"], "other");
        assert_eq!(value["message"], "boom");
    }

    #[test]
    fn serialize_maps_each_variant() {
        let cases: Vec<(AppError, &str)> = vec![
            (
                AppError::Io(std::io::Error::new(std::io::ErrorKind::NotFound, "x")),
                "io",
            ),
            (AppError::InvalidPath("p".into()), "invalid_path"),
            (AppError::InvalidExtension("e".into()), "invalid_extension"),
            (AppError::ProjectNotFound("p".into()), "project_not_found"),
            (AppError::KeyNotFound("k".into()), "key_not_found"),
            (AppError::Http("h".into()), "http"),
            (AppError::Provider("p".into()), "provider"),
        ];
        for (err, expected_kind) in cases {
            let value = serde_json::to_value(&err).expect("serialize");
            assert_eq!(value["kind"], expected_kind, "variant mismatch for {err:?}");
        }
    }

    #[test]
    fn display_matches_message_field() {
        let err = AppError::InvalidPath("foo".into());
        let value = serde_json::to_value(&err).expect("serialize");
        assert_eq!(value["message"], err.to_string());
    }

    #[test]
    fn file_too_large_serializes_expected_shape() {
        let err = AppError::FileTooLarge { size: 100, max: 50 };
        let value = serde_json::to_value(&err).expect("serialize");
        assert_eq!(value["kind"], "file_too_large");
        assert!(value["message"].as_str().unwrap().contains("100"));
        assert!(value["message"].as_str().unwrap().contains("50"));
    }
}
