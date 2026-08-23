//! Hard size limits for files read from disk.
//!
//! These caps protect the app from accidentally slurping a hostile or
//! accidentally-oversized file into memory. The values are chosen to be
//! comfortably above any plausible legitimate `.dpa` project or
//! `settings.json` payload.
//!
//! A `.dpa` file contains a JSON-serialised `Project` (IoTable + ST + IL +
//! ladder cache + HMI table) which in practice is well under 1 MiB; 50 MiB
//! is a generous ceiling that still rejects the "4 GB hostile file" attack
//! from the M10.6.2 audit. The `settings.json` cap is tighter because the
//! settings schema is small and bounded.

/// Maximum size, in bytes, that `read_project` will accept for a `.dpa`
/// file before returning [`crate::error::AppError::FileTooLarge`].
///
/// 50 MiB = 50 * 1024 * 1024 = 52,428,800 bytes.
pub const MAX_DPA_BYTES: u64 = 50 * 1024 * 1024;

/// Maximum size, in bytes, that `settings_get` will accept for the
/// `settings.json` file before returning
/// [`crate::error::AppError::FileTooLarge`].
///
/// 1 MiB = 1024 * 1024 = 1,048,576 bytes. The settings schema is small
/// (active provider + generation settings + UI settings) so this is well
/// above any real payload.
pub const MAX_SETTINGS_BYTES: u64 = 1024 * 1024;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dpa_limit_is_50_mib() {
        assert_eq!(MAX_DPA_BYTES, 52_428_800);
    }

    #[test]
    fn settings_limit_is_1_mib() {
        assert_eq!(MAX_SETTINGS_BYTES, 1_048_576);
    }

    #[test]
    fn settings_limit_is_smaller_than_dpa_limit() {
        // Compile-time assertion: documented relationship between the two
        // limits, enforced so a future bump to one forces a reviewer to
        // check the other.
        const _: () = assert!(MAX_SETTINGS_BYTES < MAX_DPA_BYTES);
    }
}
