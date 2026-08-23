//! Secret-storage and LLM-credential commands.
//!
//! API keys are stored in the OS credential store via the `keyring` crate
//! and are NEVER logged, returned in error messages, or serialized to the
//! frontend except via the explicit `secret_get` command.

use std::sync::OnceLock;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::AppError;
use crate::models::settings::Provider;
use crate::providers::custom::join_custom_url;
use crate::providers::domain_trust::{
    classify_ssrf, is_hardcoded_trusted, read_trusted_domains_file, trusted_domains_path,
    SsrfSeverity, TrustedDomainList,
};

/// Service identifier used for all keyring entries created by DPA.
const KEYRING_SERVICE: &str = "dpa";

/// HTTP timeout for the secret_test probe. Kept short so the UI does not
/// appear to hang when a key is invalid.
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

/// OpenAI's "list models" endpoint, used as a cheap key-validity probe.
const OPENAI_MODELS_URL: &str = "https://api.openai.com/v1/models";

/// Anthropic's "list models" endpoint.
const ANTHROPIC_MODELS_URL: &str = "https://api.anthropic.com/v1/models";

/// Required header for the Anthropic Messages API; also accepted on
/// `/v1/models` for the validity probe.
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Gemini models probe endpoint. Returns 200 with an empty model
/// list on a valid key. Uses `x-goog-api-key` header (not query string).
const GEMINI_MODELS_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";

/// Global, lazily-initialized `reqwest::Client`. Building an HTTP client
/// is relatively expensive (TLS setup, DNS resolver init), so we share one
/// across calls. Initialization is unrecoverable if it fails.
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(HTTP_TIMEOUT)
            .build()
            .expect("reqwest client must initialize (TLS backend unavailable)")
    })
}

/// Store `key` in the OS credential store under the `dpa` service and the
/// provider's username. Subsequent calls for the same provider overwrite
/// the existing entry.
#[tauri::command]
pub fn secret_set(provider: Provider, key: String) -> Result<(), AppError> {
    if key.is_empty() {
        return Err(AppError::Other("key must not be empty".into()));
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider.keyring_username())?;
    entry.set_password(&key)?;
    Ok(())
}

/// Read the stored key for `provider`, or `None` if no entry exists. Other
/// keyring errors are propagated.
#[tauri::command]
pub fn secret_get(provider: Provider) -> Result<Option<String>, AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider.keyring_username())?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keyring(e)),
    }
}

/// Delete the stored key for `provider`. A no-op if no entry exists.
#[tauri::command]
pub fn secret_delete(provider: Provider) -> Result<(), AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider.keyring_username())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keyring(e)),
    }
}

/// Result of a key-validity probe against the active provider's API.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SecretTestResult {
    /// True if the API call succeeded with a 2xx response.
    pub ok: bool,
    /// Human-readable summary; safe for display (never contains the key).
    pub message: String,
    /// Round-trip latency of the probe in milliseconds.
    pub latency_ms: u64,
    /// Number of models returned by the probe, if the response parsed.
    pub model_count: Option<usize>,
}

/// Test the validity of an LLM API key. If `key` is `None`, the stored key
/// for `provider` is used. The key itself is never logged or returned.
///
/// For `Provider::Custom`, `custom_base_url` and `custom_model_name` are
/// required: the probe hits `{custom_base_url}/models`. If the base URL
/// is missing, a clean `Ok(SecretTestResult { ok: false, ... })` is
/// returned (matching the contract for the other "no key" branches).
///
/// H6: before any HTTP request for the Custom provider, the same
/// Trust-on-First-Use + SSRF gate used by `generate_code` is enforced
/// (`commands/generation.rs`): URL shape validation, then a required
/// trusted domain, with the cloud-metadata IP block hard-refused. The
/// refusal surfaces as `Err(AppError::Provider(_))` — IPC kind
/// `"provider"`, identical to the generation-path error kind.
///
/// `app` is injected by Tauri and is NOT part of the frontend invoke
/// contract; the JS arguments (`provider`, `key`, `customBaseUrl`,
/// `customModelName`) are unchanged.
#[tauri::command]
pub async fn secret_test(
    app: AppHandle,
    provider: Provider,
    key: Option<String>,
    custom_base_url: Option<String>,
    custom_model_name: Option<String>,
) -> Result<SecretTestResult, AppError> {
    if provider == Provider::Custom {
        // Only non-empty base URLs enter the gate; missing/empty ones stay
        // on the established M11.3 soft-error path inside the probe core.
        if let Some(base) = custom_base_url
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            enforce_custom_domain_gate(&app, base)?;
        }
    }
    secret_test_core(provider, key, custom_base_url, custom_model_name).await
}

/// Core of [`secret_test`] WITHOUT the Custom-domain trust gate — the
/// command wrapper applies the gate first. Kept separate so unit tests can
/// exercise probe behaviour without an `AppHandle`.
async fn secret_test_core(
    provider: Provider,
    key: Option<String>,
    custom_base_url: Option<String>,
    custom_model_name: Option<String>,
) -> Result<SecretTestResult, AppError> {
    let key = match key {
        Some(k) if !k.is_empty() => k,
        _ => match lookup_key(provider)? {
            Some(k) => k,
            None => {
                return Ok(SecretTestResult {
                    ok: false,
                    message: format!(
                        "no key stored for provider '{}'",
                        provider.keyring_username()
                    ),
                    latency_ms: 0,
                    model_count: None,
                });
            }
        },
    };

    let start = Instant::now();
    let result = match provider {
        Provider::Openai => probe_openai(&key).await,
        Provider::Anthropic => probe_anthropic(&key).await,
        Provider::Gemini => probe_gemini(&key).await,
        Provider::Custom => {
            probe_custom(
                &key,
                custom_base_url.as_deref(),
                custom_model_name.as_deref(),
            )
            .await
        }
    };
    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(count) => Ok(SecretTestResult {
            ok: true,
            message: format!("connected; {} model(s) available", count),
            latency_ms,
            model_count: Some(count),
        }),
        Err(msg) => Ok(SecretTestResult {
            ok: false,
            message: msg,
            latency_ms,
            model_count: None,
        }),
    }
}

// --- Custom-provider trust gate (H6 / M11.4 TOFU + M11.7.3 SSRF) -------------

/// Extract the `host[:port]` portion of a URL. Local copy of the private
/// helper of the same name in `commands/generation.rs`, which cannot be
/// reused directly without editing a file outside this fix's scope.
fn extract_host_port(url: &str) -> Option<String> {
    let after_scheme = url.find("://")?;
    let rest = &url[after_scheme + 3..];
    // Trim path / query / fragment.
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let host_port = rest[..end].trim();
    if host_port.is_empty() {
        None
    } else {
        Some(host_port.to_string())
    }
}

/// Pure trust decision for a Custom-provider host, mirroring
/// `generation.rs::is_custom_domain_trusted`: the cloud-metadata IP block
/// (`169.254.x.x`) is ALWAYS rejected even if the user whitelisted it
/// (M11.7.3 SSRF hard block); hardcoded provider hosts pass; everything
/// else must appear in the user's trusted-domains list. A missing or
/// unreadable list fails closed. Takes the list directly instead of an
/// `AppHandle` so tests need neither app state nor network.
fn custom_domain_is_trusted(list: Option<&TrustedDomainList>, domain: &str) -> bool {
    if matches!(classify_ssrf(domain), SsrfSeverity::MetadataEndpoint) {
        return false;
    }
    if is_hardcoded_trusted(domain) {
        return true;
    }
    match list {
        Some(l) => l.is_trusted(domain),
        None => false,
    }
}

/// The refusal returned when a well-formed Custom base URL points at an
/// untrusted domain. The human-readable message is byte-identical to the
/// `generate_code` trust refusal in `commands/generation.rs`, and
/// `AppError::Provider(_)` serializes to IPC kind `"provider"` — the same
/// kind the generation path uses — so the frontend renders its existing
/// trust-refusal flow unchanged.
fn trust_refusal_error(domain: &str) -> AppError {
    AppError::Provider(format!(
        "المزوّود '{domain}' غير موثوق. أضفه إلى قائمة الموثوقين في الإعدادات أولاً."
    ))
}

/// Pure, network-free decision core of the gate: given the trusted-domain
/// list (`None` when it cannot be read → fail closed) and the trimmed base
/// URL, return the refusal error when the request must be blocked.
///
/// Malformed / unsupported URLs deliberately yield `None` here: they stay
/// on the established M11.3 soft-error path inside [`probe_custom`]
/// (`Ok(SecretTestResult { ok: false, .. })`) that existing tests pin.
/// Only shape-valid URLs pointing at untrusted domains produce a refusal.
fn evaluate_custom_domain_gate(
    list: Option<&TrustedDomainList>,
    base_url: &str,
) -> Option<AppError> {
    // Same sequence as generation.rs `stream_via_provider`: validate URL
    // shape FIRST, then require the domain to be trusted.
    if crate::providers::custom::validate_custom_base_url(base_url).is_err() {
        return None;
    }
    let domain = extract_host_port(base_url)?;
    if custom_domain_is_trusted(list, &domain) {
        None
    } else {
        Some(trust_refusal_error(&domain))
    }
}

/// Load `<app_data_dir>/trusted_domains.json`. Any failure yields `None`,
/// which makes the gate fail closed (mirrors generation.rs).
fn load_trusted_domains(app: &AppHandle) -> Option<TrustedDomainList> {
    let dir = crate::paths::app_data_dir(app).ok()?;
    read_trusted_domains_file(&trusted_domains_path(&dir)).ok()
}

/// Command-level gate applied BEFORE any HTTP request on the Custom-probe
/// path (H6): thread the app's trusted-domain state through the pure
/// decision in [`evaluate_custom_domain_gate`].
fn enforce_custom_domain_gate(app: &AppHandle, base_url: &str) -> Result<(), AppError> {
    let list = load_trusted_domains(app);
    match evaluate_custom_domain_gate(list.as_ref(), base_url) {
        Some(err) => Err(err),
        None => Ok(()),
    }
}

// --- internal helpers -------------------------------------------------------

fn lookup_key(provider: Provider) -> Result<Option<String>, AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider.keyring_username())?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keyring(e)),
    }
}

async fn probe_openai(key: &str) -> Result<usize, String> {
    let resp = http_client()
        .get(OPENAI_MODELS_URL)
        .bearer_auth(key)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("response parse: {e}"))?;
    let count = body
        .get("data")
        .and_then(|d| d.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    Ok(count)
}

async fn probe_anthropic(key: &str) -> Result<usize, String> {
    let resp = http_client()
        .get(ANTHROPIC_MODELS_URL)
        .header("x-api-key", key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("response parse: {e}"))?;
    let count = body
        .get("data")
        .and_then(|d| d.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    Ok(count)
}

async fn probe_gemini(key: &str) -> Result<usize, String> {
    let resp = http_client()
        .get(GEMINI_MODELS_URL)
        .header("x-goog-api-key", key)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("response parse: {e}"))?;
    // Gemini models endpoint returns { models: [...] }. A valid key returns 2xx; count is best-effort.
    let count = body
        .get("models")
        .and_then(|d| d.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    Ok(count)
}

/// Probe an OpenAI-compatible Custom Provider by hitting {base_url}/models.
/// The key is sent as Authorization: Bearer (OpenAI convention).
async fn probe_custom(
    key: &str,
    custom_base_url: Option<&str>,
    _custom_model_name: Option<&str>,
) -> Result<usize, String> {
    let base = custom_base_url
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "custom_base_url is required for the Custom provider".to_string())?;
    crate::providers::custom::validate_custom_base_url(base)
        .map_err(|e| format!("invalid custom_base_url: {e}"))?;
    let url = join_custom_url(base, "models");
    let resp = http_client()
        .get(&url)
        .bearer_auth(key)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    // The OpenAI-compatible /models endpoint returns { data: [...] }.
    // Some implementations (Ollama) return { models: [...] }. Accept either.
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("response parse: {e}"))?;
    let count = body
        .get("data")
        .or_else(|| body.get("models"))
        .and_then(|d| d.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_test_result_serializes_expected_shape() {
        let r = SecretTestResult {
            ok: true,
            message: "connected; 50 model(s) available".into(),
            latency_ms: 123,
            model_count: Some(50),
        };
        let value = serde_json::to_value(&r).expect("to_value");
        assert_eq!(value["ok"], true);
        assert_eq!(value["latency_ms"], 123);
        assert_eq!(value["model_count"], 50);
        assert!(value["message"].as_str().unwrap().contains("connected"));
    }

    #[test]
    fn secret_test_result_roundtrips() {
        let r = SecretTestResult {
            ok: false,
            message: "HTTP 401".into(),
            latency_ms: 42,
            model_count: None,
        };
        let json = serde_json::to_string(&r).expect("serialize");
        let back: SecretTestResult = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(r, back);
    }

    #[test]
    fn secret_set_rejects_empty_key() {
        let err = secret_set(Provider::Openai, String::new()).expect_err("empty rejected");
        assert!(matches!(err, AppError::Other(_)));
    }

    /// Live network test. Requires a valid OpenAI key in the OS keyring
    /// under the `dpa` / `openai` entry. Ignored by default.
    #[test]
    #[ignore = "requires network and a real API key in the OS keyring"]
    fn secret_test_live_openai() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let result = rt
            .block_on(secret_test_core(Provider::Openai, None, None, None))
            .expect("command runs");
        eprintln!("openai probe: {result:?}");
    }

    /// Live network test. Requires a valid Anthropic key in the OS
    /// keyring under the `dpa` / `anthropic` entry. Ignored by default.
    #[test]
    #[ignore = "requires network and a real API key in the OS keyring"]
    fn secret_test_live_anthropic() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let result = rt
            .block_on(secret_test_core(Provider::Anthropic, None, None, None))
            .expect("command runs");
        eprintln!("anthropic probe: {result:?}");
    }

    // --- M10.6.1: API key handling safety tests ---

    #[test]
    fn secret_set_does_not_return_key() {
        let err = secret_set(Provider::Openai, String::new()).expect_err("empty rejected");
        assert!(matches!(err, AppError::Other(_)));
    }

    #[test]
    fn secret_get_returns_none_when_no_entry() {
        let bogus = "dpa-m10-6-1-does-not-exist-test-username";
        let entry = keyring::Entry::new(KEYRING_SERVICE, bogus).expect("entry");
        let result = match entry.get_password() {
            Ok(s) => Ok(Some(s)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Keyring(e)),
        };
        assert!(matches!(result, Ok(None)), "missing key must yield None");
    }

    #[test]
    fn authorization_allowlist_covers_only_provider_hosts() {
        let allowed = [
            "https://api.openai.com/v1/models",
            "https://api.openai.com/v1/chat/completions",
            "https://api.anthropic.com/v1/models",
            "https://api.anthropic.com/v1/messages",
            "https://generativelanguage.googleapis.com/v1beta/models",
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
        ];
        for url in allowed {
            let lower = url.to_lowercase();
            assert!(
                lower.starts_with("https://api.openai.com/")
                    || lower.starts_with("https://api.anthropic.com/")
                    || lower.starts_with("https://generativelanguage.googleapis.com/"),
                "API key must only travel to a hard-coded provider host; got {url}"
            );
            assert!(
                !lower.contains("localhost") && !lower.contains("127.0.0.1"),
                "API key must never be sent to loopback: {url}"
            );
        }
    }

    #[test]
    fn secret_test_returns_clean_error_when_no_key_available() {
        let bogus_username = "dpa-m10-6-6-keyring-absent-test";
        let entry =
            keyring::Entry::new(KEYRING_SERVICE, bogus_username).expect("entry constructible");
        let stored = entry.get_password();
        assert!(
            matches!(stored, Err(keyring::Error::NoEntry)),
            "test precondition: bogus username must NOT have a real entry",
        );

        let result = SecretTestResult {
            ok: false,
            message: format!("no key stored for provider `'{}`", bogus_username),
            latency_ms: 0,
            model_count: None,
        };
        assert!(!result.ok);
        assert!(result.message.contains("no key stored"));
        assert_eq!(result.model_count, None);
        assert!(!result.message.contains("sk-"));
        assert!(!result.message.contains("Bearer"));
    }

    #[test]
    fn secret_test_result_for_failed_probe_does_not_leak_key() {
        let probed_with_key = "sk-DELIBERATELY-WRONG-key-must-not-appear-in-error";
        let result = SecretTestResult {
            ok: false,
            message: "HTTP 401".into(),
            latency_ms: 42,
            model_count: None,
        };
        assert!(!result.ok);
        assert!(result.message.contains("HTTP"));
        let json = serde_json::to_string(&result).expect("serialize");
        assert!(
            !json.contains(probed_with_key),
            "API key leaked into SecretTestResult JSON: {json}",
        );
        assert!(!json.contains("DELIBERATELY-WRONG"));
    }

    /// Live network probe with a deliberately wrong key. Ignored.
    #[test]
    #[ignore = "requires outbound network access to api.openai.com"]
    fn secret_test_live_with_wrong_openai_key_returns_clean_error() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let key = "sk-DELIBERATELY-WRONG-key-for-m10-6-6-test";
        let result = rt
            .block_on(secret_test_core(
                Provider::Openai,
                Some(key.into()),
                None,
                None,
            ))
            .expect("command runs without panic");
        assert!(!result.ok, "wrong key must report ok=false");
        assert!(!result.message.is_empty());
        assert!(
            !result.message.contains("DELIBERATELY-WRONG"),
            "API key leaked into probe message: {}",
            result.message
        );
    }

    // --- M11.3: Custom provider probe ---

    /// M11.3: with a missing `custom_base_url`, `secret_test` for the
    /// Custom provider must return a non-panicking
    /// `Ok(SecretTestResult { ok: false, ... })` with a clean message.
    /// It must not surface a `ProviderError` / `AppError` and must not
    /// contain the key.
    #[test]
    fn secret_test_custom_without_base_url_returns_clean_error() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let key = "sk-CUSTOM-DELIBERATELY-PRESENT-key-for-m11-3-test";
        let result = rt
            .block_on(secret_test_core(
                Provider::Custom,
                Some(key.into()),
                None,
                None,
            ))
            .expect("command runs without panic");
        assert!(!result.ok, "missing base url must report ok=false");
        assert!(
            result.message.contains("custom_base_url"),
            "message must mention the missing field, got: {}",
            result.message
        );
        assert!(
            !result.message.contains(key),
            "API key leaked into probe message: {}",
            result.message
        );
        assert!(
            !result.message.contains("DELIBERATELY-PRESENT"),
            "API key leaked into probe message: {}",
            result.message
        );
    }

    /// M11.3: an invalid `custom_base_url` (e.g. http to a non-local
    /// host) must surface a clean error from the backend validator,
    /// not a panic, and not contain the key.
    #[test]
    fn secret_test_custom_with_invalid_base_url_returns_clean_error() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let key = "sk-CUSTOM-DELIBERATELY-PRESENT-key-for-m11-3-test";
        let result = rt
            .block_on(secret_test_core(
                Provider::Custom,
                Some(key.into()),
                Some("http://example.com".into()),
                None,
            ))
            .expect("command runs without panic");
        assert!(!result.ok);
        assert!(
            result.message.contains("invalid custom_base_url"),
            "got: {}",
            result.message
        );
        assert!(!result.message.contains("DELIBERATELY-PRESENT"));
    }

    // --- H6: Custom-probe trust gate (pure gating tests, NO network) --------

    #[test]
    fn h6_extract_host_port_mirrors_generation_helper() {
        assert_eq!(
            extract_host_port("https://openrouter.ai/api/v1"),
            Some("openrouter.ai".into())
        );
        assert_eq!(
            extract_host_port("http://localhost:11434/v1"),
            Some("localhost:11434".into())
        );
        // Path/query are stripped so only the host remains.
        assert_eq!(
            extract_host_port("https://169.254.169.254/latest/meta-data/"),
            Some("169.254.169.254".into())
        );
        assert_eq!(extract_host_port("not-a-url"), None);
        assert_eq!(extract_host_port(""), None);
    }

    /// H6 (M11.7.3 parity): a shape-valid URL pointing at the cloud
    /// metadata endpoint must be refused by the gate BEFORE any HTTP
    /// attempt, even when the user explicitly whitelisted the IP.
    #[test]
    fn h6_metadata_endpoint_refused_even_if_whitelisted() {
        let mut list = TrustedDomainList::default();
        list.add("169.254.169.254");
        let err =
            evaluate_custom_domain_gate(Some(&list), "https://169.254.169.254/latest/meta-data/")
                .expect("metadata URL must be refused before any HTTP attempt");
        assert!(matches!(err, AppError::Provider(_)));

        // And with no list at all (fail-closed) it is equally refused.
        assert!(
            evaluate_custom_domain_gate(None, "https://169.254.169.254/v1").is_some(),
            "metadata endpoint must never pass, even with an unreadable trust list"
        );
    }

    /// H6: an untrusted custom base URL must produce the trust-refusal
    /// error with the SAME error kind ("provider") and human-readable
    /// refusal text as the generate_code path in commands/generation.rs,
    /// and it must carry no key material.
    #[test]
    fn h6_untrusted_custom_domain_returns_generation_style_refusal() {
        let err = evaluate_custom_domain_gate(None, "https://api.example.com/v1")
            .expect("untrusted domain must be refused before any HTTP request");

        let value = serde_json::to_value(&err).expect("AppError serializes kind+message");
        assert_eq!(
            value["kind"], "provider",
            "refusal kind must match the generation-path error kind"
        );
        let domain = extract_host_port("https://api.example.com/v1").unwrap_or_default();
        let expected = format!(
            "provider error: المزوّود '{domain}' غير موثوق. أضفه إلى قائمة الموثوقين في الإعدادات أولاً."
        );
        assert_eq!(
            value["message"], expected,
            "refusal message must be identical to the generate_code trust refusal"
        );
        let msg = value["message"].as_str().unwrap_or_default();
        assert!(!msg.contains("sk-") && !msg.contains("Bearer"));
    }

    /// H6: loopback behaves per domain_trust rules — localhost / 127.0.0.1
    /// get NO automatic exemption for Custom probes; they must be trusted
    /// via TOFU exactly like any other Custom domain (local Ollama /
    /// LM Studio users confirm once).
    #[test]
    fn h6_loopback_requires_explicit_trust_like_any_domain() {
        assert!(
            evaluate_custom_domain_gate(None, "http://localhost:11434/v1").is_some(),
            "untrusted localhost must be refused"
        );
        assert!(
            evaluate_custom_domain_gate(None, "http://127.0.0.1:11434/v1").is_some(),
            "untrusted 127.0.0.1 must be refused"
        );

        // After the user trusts them via TOFU, the gate passes through.
        let mut list = TrustedDomainList::default();
        list.add("localhost:11434");
        list.add("127.0.0.1:11434");
        assert!(evaluate_custom_domain_gate(Some(&list), "http://localhost:11434/v1").is_none());
        assert!(evaluate_custom_domain_gate(Some(&list), "http://127.0.0.1:11434/v1").is_none());
    }

    /// H6: a listed custom domain falls through to the probe (no refusal),
    /// while malformed / unsupported URLs stay on the pre-existing M11.3
    /// soft-error path inside `probe_custom` — the gate does not touch them.
    #[test]
    fn h6_trusted_domain_passes_and_malformed_urls_stay_soft() {
        let mut list = TrustedDomainList::default();
        list.add("openrouter.ai");
        assert!(evaluate_custom_domain_gate(Some(&list), "https://openrouter.ai/api/v1").is_none());

        // Shape-invalid URLs defer to probe_custom's soft errors.
        assert!(evaluate_custom_domain_gate(None, "").is_none());
        assert!(evaluate_custom_domain_gate(None, "example.com/v1").is_none());
        assert!(evaluate_custom_domain_gate(None, "ftp://example.com").is_none());
    }

    /// H6: the built-in provider hosts are hardcoded-trusted by the gate's
    /// decision core, so even if a non-custom request ever reached this
    /// logic it would proceed — and in practice non-custom providers never
    /// enter the gate branch at all (`provider == Provider::Custom` guard),
    /// which is why their live probes below remain unchanged.
    #[test]
    fn h6_builtin_provider_hosts_are_hardcoded_trusted() {
        for host in [
            "api.openai.com",
            "api.anthropic.com",
            "generativelanguage.googleapis.com",
        ] {
            assert!(
                custom_domain_is_trusted(None, host),
                "{host} must be hardcoded-trusted"
            );
        }
    }
}
