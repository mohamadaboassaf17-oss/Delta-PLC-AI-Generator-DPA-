use super::openai_compat::parse_chat_completions_line;
use super::{AiProvider, GenConfig, HttpRequestParts, Message, ProviderError, StreamChunk};

/// Custom OpenAI-compatible provider. Constructed with a runtime base URL
/// (validated by the caller — see M11.3).
pub struct CustomProvider {
    base_url: String,
}

impl CustomProvider {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
        }
    }

    #[allow(dead_code)] // exposed for future callers / debug overlays
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

impl AiProvider for CustomProvider {
    fn build_request(
        &self,
        api_key: &str,
        messages: &[Message],
        config: &GenConfig,
    ) -> Result<HttpRequestParts, ProviderError> {
        // Validate the base URL shape up-front so a misconfigured
        // settings file can never lead to a request going to a
        // disallowed host.
        validate_custom_base_url(&self.base_url).map_err(|e| ProviderError::Api {
            status: 0,
            message: format!("invalid custom_base_url: {e}"),
        })?;
        super::openai_compat::build_chat_completions_request(
            &self.base_url,
            api_key,
            messages,
            config,
        )
    }
    fn parse_stream_line(&self, line: &str) -> Result<StreamChunk, ProviderError> {
        parse_chat_completions_line(line)
    }
    fn parse_error(&self, status: u16, body: &str) -> ProviderError {
        ProviderError::Api {
            status,
            message: body.to_string(),
        }
    }
}

/// Errors that `validate_custom_base_url` can surface. These are
/// converted into `ProviderError::Api` (or surfaced directly to the
/// user) at the call site.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CustomUrlError {
    Empty,
    /// URL has no `://` separator.
    MissingScheme,
    /// URL contains userinfo (could leak an API key).
    UserinfoNotAllowed,
    /// Scheme is not https (or http+localhost).
    UnsupportedScheme,
    /// http:// to a non-loopback host (plaintext key leak risk).
    HttpToNonLocalhost,
}

impl std::fmt::Display for CustomUrlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let msg = match self {
            Self::Empty => "Base URL is required",
            Self::MissingScheme => "URL must start with https:// or http://localhost",
            Self::UserinfoNotAllowed => {
                "URL must not contain userinfo (https://user:pass@host is rejected)"
            }
            Self::UnsupportedScheme => "URL must start with https:// or http://localhost",
            Self::HttpToNonLocalhost => {
                "http:// is only allowed for localhost or 127.0.0.1 (for local servers)"
            }
        };
        f.write_str(msg)
    }
}

impl std::error::Error for CustomUrlError {}

/// Defense-in-depth mirror of `src/lib/validators/customProvider.ts`.
/// The frontend validates first, but the backend MUST NOT trust
/// the frontend — a malicious caller could skip the check.
///
/// Rules:
///  - Must be `https://...` (preferred) OR `http://localhost` /
///    `http://127.0.0.1` (for local Ollama / LM Studio).
///  - Must NOT contain userinfo (`https://user:pass@host` rejected).
///  - Must contain a `://` separator.
///
/// This is hand-rolled rather than using a URL crate to avoid adding
/// a new dependency. The implementation is intentionally conservative:
/// when in doubt, reject.
pub fn validate_custom_base_url(url: &str) -> Result<(), CustomUrlError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(CustomUrlError::Empty);
    }
    // Split at "://"
    let scheme_end = trimmed.find("://").ok_or(CustomUrlError::MissingScheme)?;
    if scheme_end + 3 >= trimmed.len() {
        return Err(CustomUrlError::MissingScheme);
    }
    let scheme = &trimmed[..scheme_end];
    let after_scheme = &trimmed[scheme_end + 3..];
    // Reject userinfo (any '@' after the scheme separator)
    if after_scheme.contains('@') {
        return Err(CustomUrlError::UserinfoNotAllowed);
    }
    // Extract host[:port] (everything before the first '/')
    let path_start = after_scheme.find('/').unwrap_or(after_scheme.len());
    let host_port = &after_scheme[..path_start];
    // Accept https always
    if scheme.eq_ignore_ascii_case("https") {
        return Ok(());
    }
    // Accept http only for loopback
    if scheme.eq_ignore_ascii_case("http") {
        let host = host_port
            .split(':')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        if host == "localhost" || host == "127.0.0.1" {
            return Ok(());
        }
        return Err(CustomUrlError::HttpToNonLocalhost);
    }
    Err(CustomUrlError::UnsupportedScheme)
}

/// Combine a Custom Provider base URL and a relative path into a full
/// URL. Tolerates a trailing `/` on the base. Exposed for the
/// `secret_test` probe which hits `{base}/models`.
pub fn join_custom_url(base: &str, path: &str) -> String {
    super::openai_compat::join_url(base, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_accepts_https_public() {
        assert!(validate_custom_base_url("https://openrouter.ai/api/v1").is_ok());
        assert!(validate_custom_base_url("https://api.openai.com/v1").is_ok());
    }

    #[test]
    fn validate_accepts_https_with_port() {
        assert!(validate_custom_base_url("https://example.com:8443/v1").is_ok());
    }

    #[test]
    fn validate_accepts_http_localhost() {
        assert!(validate_custom_base_url("http://localhost:11434/v1").is_ok());
        assert!(validate_custom_base_url("http://localhost/v1").is_ok());
    }

    #[test]
    fn validate_accepts_http_loopback_ip() {
        assert!(validate_custom_base_url("http://127.0.0.1:11434/v1").is_ok());
    }

    #[test]
    fn validate_rejects_empty() {
        assert_eq!(validate_custom_base_url(""), Err(CustomUrlError::Empty));
        assert_eq!(validate_custom_base_url("   "), Err(CustomUrlError::Empty));
    }

    #[test]
    fn validate_rejects_missing_scheme() {
        assert_eq!(
            validate_custom_base_url("example.com/v1"),
            Err(CustomUrlError::MissingScheme)
        );
    }

    #[test]
    fn validate_rejects_userinfo() {
        assert_eq!(
            validate_custom_base_url("https://user:pass@example.com/v1"),
            Err(CustomUrlError::UserinfoNotAllowed)
        );
    }

    #[test]
    fn validate_rejects_http_to_public_host() {
        assert_eq!(
            validate_custom_base_url("http://openrouter.ai/api/v1"),
            Err(CustomUrlError::HttpToNonLocalhost)
        );
    }

    #[test]
    fn validate_rejects_http_to_private_ip() {
        assert_eq!(
            validate_custom_base_url("http://192.168.1.5:11434/v1"),
            Err(CustomUrlError::HttpToNonLocalhost)
        );
    }

    #[test]
    fn validate_rejects_other_schemes() {
        assert!(validate_custom_base_url("ftp://example.com").is_err());
        assert!(validate_custom_base_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn validate_scheme_is_case_insensitive() {
        // https:// — case-insensitive
        assert!(validate_custom_base_url("HTTPS://example.com/v1").is_ok());
        // http://localhost — case-insensitive
        assert!(validate_custom_base_url("HTTP://Localhost:11434/v1").is_ok());
    }

    #[test]
    fn join_custom_url_strips_trailing_slash_on_base() {
        assert_eq!(
            join_custom_url("https://example.com/v1/", "models"),
            "https://example.com/v1/models"
        );
    }

    #[test]
    fn join_custom_url_handles_no_trailing_slash() {
        assert_eq!(
            join_custom_url("https://example.com/v1", "models"),
            "https://example.com/v1/models"
        );
    }

    #[test]
    fn custom_provider_build_request_uses_openai_compat() {
        let p = CustomProvider::new("https://openrouter.ai/api/v1");
        let msgs = vec![Message {
            role: "user".into(),
            content: "ping".into(),
        }];
        let cfg = GenConfig {
            temperature: 0.2,
            max_tokens: 4096,
            model: "x".into(),
        };
        let parts = p.build_request("k", &msgs, &cfg).expect("ok");
        assert_eq!(parts.url, "https://openrouter.ai/api/v1/chat/completions");
        assert!(parts
            .headers
            .iter()
            .any(|(k, v)| k == "Authorization" && v == "Bearer k"));
    }

    #[test]
    fn custom_provider_rejects_invalid_base_url_at_build_time() {
        let p = CustomProvider::new("http://example.com");
        let msgs = vec![Message {
            role: "user".into(),
            content: "ping".into(),
        }];
        let cfg = GenConfig {
            temperature: 0.2,
            max_tokens: 4096,
            model: "x".into(),
        };
        let err = p.build_request("k", &msgs, &cfg).expect_err("must error");
        match err {
            ProviderError::Api { message, .. } => {
                assert!(message.contains("invalid custom_base_url"));
            }
            other => panic!("expected Api, got {other:?}"),
        }
    }
}
