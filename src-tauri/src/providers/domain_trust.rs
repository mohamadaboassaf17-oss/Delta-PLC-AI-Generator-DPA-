//! Trust on First Use (TOFU) for Custom Provider domains.
//!
//! The static allowlist (api.openai.com, api.anthropic.com,
//! generativelanguage.googleapis.com) covers the built-in providers.
//! For Custom Provider the user picks any HTTPS domain they want, but
//! the first time they target a new domain, they must explicitly
//! confirm trust via the frontend `TrustDomainModal`.
//!
//! This module persists the trusted-domain list to
//! `<app_data_dir>/trusted_domains.json` (NOT in the OS keychain
//! because the domain name is not secret — only the API key is).
//!
//! The file is plain JSON so the user can inspect and edit it manually
//! if needed. Format:
//! ```json
//! {
//!   "domains": [
//!     {"domain": "openrouter.ai", "trusted_at": "2026-06-13T10:00:00Z"},
//!     {"domain": "api.together.xyz", "trusted_at": "2026-06-12T08:30:00Z"}
//!   ]
//! }
//! ```

use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

const TRUSTED_DOMAINS_FILE: &str = "trusted_domains.json";

/// Maximum size in bytes — defense in depth, mirrors `limits::MAX_*_BYTES`.
const MAX_TRUSTED_DOMAINS_BYTES: u64 = 64 * 1024; // 64 KiB

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrustedDomain {
    pub domain: String,
    pub trusted_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct TrustedDomainList {
    pub domains: Vec<TrustedDomain>,
}

impl TrustedDomainList {
    pub fn is_trusted(&self, domain: &str) -> bool {
        let target = normalize_domain(domain);
        self.domains
            .iter()
            .any(|d| normalize_domain(&d.domain) == target)
    }

    pub fn add(&mut self, domain: &str) {
        let normalized = normalize_domain(domain);
        // Idempotent: if already present, do nothing.
        if self.is_trusted(&normalized) {
            return;
        }
        self.domains.push(TrustedDomain {
            domain: normalized,
            trusted_at: Utc::now(),
        });
    }

    pub fn remove(&mut self, domain: &str) -> bool {
        let target = normalize_domain(domain);
        let before = self.domains.len();
        self.domains
            .retain(|d| normalize_domain(&d.domain) != target);
        self.domains.len() != before
    }

    pub fn list(&self) -> Vec<TrustedDomain> {
        self.domains.clone()
    }
}

/// Lowercase, strip trailing dot, drop default ports (80/443).
/// Both sides of a comparison are normalized so trivial differences
/// don't cause false negatives.
pub fn normalize_domain(domain: &str) -> String {
    let mut s = domain.trim().to_lowercase();
    while s.ends_with('.') {
        s.pop();
    }
    // Strip default ports so "openrouter.ai:443" matches "openrouter.ai".
    if s.ends_with(":443") || s.ends_with(":80") {
        if let Some(colon) = s.rfind(':') {
            s.truncate(colon);
        }
    }
    s
}

/// Pure file I/O — testable without an AppHandle.
pub fn read_trusted_domains_file(path: &Path) -> Result<TrustedDomainList, AppError> {
    if !path.exists() {
        return Ok(TrustedDomainList::default());
    }
    let metadata = std::fs::metadata(path).map_err(AppError::Io)?;
    let size = metadata.len();
    if size > MAX_TRUSTED_DOMAINS_BYTES {
        return Err(AppError::FileTooLarge {
            size,
            max: MAX_TRUSTED_DOMAINS_BYTES,
        });
    }
    let json = std::fs::read_to_string(path).map_err(AppError::Io)?;
    if json.trim().is_empty() {
        return Ok(TrustedDomainList::default());
    }
    serde_json::from_str(&json).map_err(AppError::Json)
}

pub fn write_trusted_domains_file(path: &Path, list: &TrustedDomainList) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let json = serde_json::to_string_pretty(list)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

pub fn trusted_domains_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(TRUSTED_DOMAINS_FILE)
}

// --- SSRF protection ---

/// Hardcoded providers that are always allowed, regardless of the
/// trusted-domains list. These are the three providers the app
/// officially supports.
pub const HARDCODED_TRUSTED_DOMAINS: &[&str] = &[
    "api.openai.com",
    "api.anthropic.com",
    "generativelanguage.googleapis.com",
];

/// True when `domain` is one of the hardcoded trusted providers. Case
/// insensitive.
pub fn is_hardcoded_trusted(domain: &str) -> bool {
    let lower = domain.to_lowercase();
    HARDCODED_TRUSTED_DOMAINS.iter().any(|h| lower == *h)
}

/// Classify a domain string into a network type. Used by the trust
/// machinery to warn the user before they trust a private-IP endpoint.
#[allow(dead_code)] // surfaced via the public API + tests; not yet called from production code
pub fn is_private_or_special_ip(host: &str) -> bool {
    // Strip IPv6 brackets if present.
    let s = host.trim_start_matches('[').trim_end_matches(']');

    // 169.254.x.x — cloud metadata endpoint. ALWAYS reject.
    if s.starts_with("169.254.") {
        return true;
    }

    // Try to parse as an IPv4 address. If it isn't one, return false
    // (it's a hostname — we don't have a way to know its IP).
    let octets: Vec<&str> = s.split('.').collect();
    if octets.len() != 4 {
        return false; // not an IPv4 — could be IPv6 or hostname
    }
    let parts: Result<Vec<u8>, _> = octets.iter().map(|p| p.parse::<u8>()).collect();
    let Ok(parts) = parts else { return false };

    match parts[0] {
        10 => true,                                   // 10.0.0.0/8 (private)
        127 => true,                                  // 127.0.0.0/8 (loopback)
        172 if (16..=31).contains(&parts[1]) => true, // 172.16/12
        192 if parts[1] == 168 => true,               // 192.168/16
        169 if parts[1] == 254 => true,               // 169.254/16 (link-local)
        0 => true,                                    // 0.0.0.0/8
        _ => false,
    }
}

/// Severity for an SSRF-class warning. Metadata-endpoint IPs are
/// unconditional blocks; everything else is a warning that the user
/// can dismiss.
#[allow(dead_code)] // surfaced via the public API + tests
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SsrfSeverity {
    /// Public / loopback / unknown — no warning needed.
    None,
    /// Private IP range (10.x, 172.16/12, 192.168/16) — user should
    /// confirm they intend to talk to their own network.
    PrivateNetwork,
    /// 169.254.x.x — cloud metadata endpoint. NEVER talk to this.
    MetadataEndpoint,
}

#[allow(dead_code)] // surfaced via the public API + tests
pub fn classify_ssrf(host: &str) -> SsrfSeverity {
    if host.starts_with("169.254.") {
        SsrfSeverity::MetadataEndpoint
    } else if is_private_or_special_ip(host) {
        SsrfSeverity::PrivateNetwork
    } else {
        SsrfSeverity::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_lowercases() {
        assert_eq!(normalize_domain("OpenRouter.AI"), "openrouter.ai");
    }

    #[test]
    fn normalize_strips_trailing_dot() {
        assert_eq!(normalize_domain("openrouter.ai."), "openrouter.ai");
    }

    #[test]
    fn normalize_strips_default_ports() {
        assert_eq!(normalize_domain("openrouter.ai:443"), "openrouter.ai");
        assert_eq!(normalize_domain("openrouter.ai:80"), "openrouter.ai");
    }

    #[test]
    fn normalize_preserves_custom_port() {
        assert_eq!(normalize_domain("localhost:11434"), "localhost:11434");
        assert_eq!(
            normalize_domain("api.example.com:8080"),
            "api.example.com:8080"
        );
    }

    #[test]
    fn is_trusted_false_for_empty() {
        let list = TrustedDomainList::default();
        assert!(!list.is_trusted("openrouter.ai"));
    }

    #[test]
    fn add_then_is_trusted() {
        let mut list = TrustedDomainList::default();
        list.add("openrouter.ai");
        assert!(list.is_trusted("openrouter.ai"));
    }

    #[test]
    fn add_is_idempotent() {
        let mut list = TrustedDomainList::default();
        list.add("openrouter.ai");
        list.add("openrouter.ai");
        list.add("OPENROUTER.AI"); // case-insensitive match
        assert_eq!(list.domains.len(), 1);
    }

    #[test]
    fn remove_returns_true_when_present() {
        let mut list = TrustedDomainList::default();
        list.add("openrouter.ai");
        assert!(list.remove("openrouter.ai"));
        assert!(!list.is_trusted("openrouter.ai"));
    }

    #[test]
    fn remove_returns_false_when_absent() {
        let mut list = TrustedDomainList::default();
        assert!(!list.remove("openrouter.ai"));
    }

    #[test]
    fn is_trusted_case_insensitive() {
        let mut list = TrustedDomainList::default();
        list.add("OpenRouter.AI");
        assert!(list.is_trusted("openrouter.ai"));
        assert!(list.is_trusted("OPENROUTER.AI"));
    }

    // --- SSRF protection ---

    #[test]
    fn blocks_aws_metadata_endpoint() {
        assert!(is_private_or_special_ip("169.254.169.254"));
    }

    #[test]
    fn blocks_rfc1918_private() {
        assert!(is_private_or_special_ip("10.0.0.1"));
        assert!(is_private_or_special_ip("172.16.0.1"));
        assert!(is_private_or_special_ip("172.31.255.255"));
        assert!(is_private_or_special_ip("192.168.1.1"));
    }

    #[test]
    fn blocks_loopback() {
        assert!(is_private_or_special_ip("127.0.0.1"));
    }

    #[test]
    fn blocks_zero() {
        assert!(is_private_or_special_ip("0.0.0.0"));
    }

    #[test]
    fn allows_public_ips() {
        assert!(!is_private_or_special_ip("8.8.8.8"));
        assert!(!is_private_or_special_ip("1.1.1.1"));
    }

    #[test]
    fn allows_hostnames() {
        assert!(!is_private_or_special_ip("openrouter.ai"));
        assert!(!is_private_or_special_ip("api.example.com"));
    }

    #[test]
    fn classify_metadata_is_severe() {
        assert_eq!(
            classify_ssrf("169.254.169.254"),
            SsrfSeverity::MetadataEndpoint
        );
    }

    #[test]
    fn classify_private_is_warning() {
        assert_eq!(classify_ssrf("192.168.1.1"), SsrfSeverity::PrivateNetwork);
    }

    #[test]
    fn classify_public_is_none() {
        assert_eq!(classify_ssrf("8.8.8.8"), SsrfSeverity::None);
        assert_eq!(classify_ssrf("openrouter.ai"), SsrfSeverity::None);
    }

    #[test]
    fn hardcoded_providers_are_trusted() {
        assert!(is_hardcoded_trusted("api.openai.com"));
        assert!(is_hardcoded_trusted("api.anthropic.com"));
        assert!(is_hardcoded_trusted("generativelanguage.googleapis.com"));
        assert!(is_hardcoded_trusted("API.OPENAI.COM")); // case-insensitive
    }

    #[test]
    fn non_hardcoded_providers_are_not_trusted_by_default() {
        assert!(!is_hardcoded_trusted("openrouter.ai"));
        assert!(!is_hardcoded_trusted("example.com"));
    }

    // --- file I/O ---

    #[test]
    fn read_missing_file_returns_default() {
        let mut path = std::env::temp_dir();
        path.push(format!("dpa-domains-missing-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let out = read_trusted_domains_file(&path).expect("missing is ok");
        assert_eq!(out, TrustedDomainList::default());
    }

    #[test]
    fn read_empty_file_returns_default() {
        let mut path = std::env::temp_dir();
        path.push(format!("dpa-domains-empty-{}.json", std::process::id()));
        std::fs::write(&path, b"").expect("write");
        let out = read_trusted_domains_file(&path).expect("empty is ok");
        assert_eq!(out, TrustedDomainList::default());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn write_then_read_roundtrip() {
        let mut path = std::env::temp_dir();
        path.push(format!("dpa-domains-rt-{}.json", std::process::id()));
        let mut list = TrustedDomainList::default();
        list.add("openrouter.ai");
        list.add("api.together.xyz");
        write_trusted_domains_file(&path, &list).expect("write");
        let back = read_trusted_domains_file(&path).expect("read");
        assert_eq!(back, list);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn read_over_size_cap_rejects() {
        let mut path = std::env::temp_dir();
        path.push(format!("dpa-domains-oversize-{}.json", std::process::id()));
        // 100 KiB > 64 KiB cap
        let body = vec![b'x'; 100 * 1024];
        std::fs::write(&path, &body).expect("write");
        let err = read_trusted_domains_file(&path).expect_err("over cap must error");
        assert!(matches!(err, AppError::FileTooLarge { .. }));
        let _ = std::fs::remove_file(&path);
    }
}
