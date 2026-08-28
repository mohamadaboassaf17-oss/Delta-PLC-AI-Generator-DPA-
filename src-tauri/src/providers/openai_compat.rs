//! OpenAI-compatible wire format. Used by both `openai` and `custom`.

use super::{GenConfig, HttpRequestParts, Message, ProviderError, StreamChunk};

pub fn build_chat_completions_request(
    base_url: &str, // e.g. "https://api.openai.com/v1" or "https://openrouter.ai/api/v1"
    api_key: &str,
    messages: &[Message],
    config: &GenConfig,
) -> Result<HttpRequestParts, ProviderError> {
    let body = serde_json::json!({
        "model": config.model,
        "messages": messages.iter().map(|m| serde_json::json!({
            "role": m.role,
            "content": m.content,
        })).collect::<Vec<_>>(),
        "stream": true,
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
    });
    let body_str = serde_json::to_string(&body)
        .map_err(|e| ProviderError::MalformedChunk(format!("serialize body: {e}")))?;
    let url = join_url(base_url, "chat/completions");
    Ok(HttpRequestParts {
        url,
        method: "POST".to_string(),
        headers: vec![
            ("Authorization".to_string(), format!("Bearer {api_key}")),
            ("Content-Type".to_string(), "application/json".to_string()),
        ],
        body_json: body_str,
    })
}

/// Combine a base URL (e.g. `https://api.openai.com/v1`) and a path
/// (`chat/completions`) into a single URL. Trailing `/` on the base is
/// tolerated. The path must not start with `/`.
pub fn join_url(base: &str, path: &str) -> String {
    let base = base.trim_end_matches('/');
    let path = path.trim_start_matches('/');
    if path.is_empty() {
        base.to_string()
    } else {
        format!("{base}/{path}")
    }
}

/// Map an OpenAI-compatible error response to a human-readable Arabic message
/// with a recharge/manage link. Extracts the provider's `error.message` when
/// present, falls back to the raw body, and prefixes an Arabic explanation
/// based on HTTP status.
///
/// `key_url` is the BYOK key-management URL for the provider (e.g.
/// `https://platform.openai.com/api-keys`). Included for 401/429 so the
/// frontend can render a deep-link.
pub fn format_openai_compat_error(status: u16, body: &str, key_url: &str) -> String {
    let extracted = extract_error_message(body);
    let detail = if extracted.is_empty() {
        body.trim().to_string()
    } else {
        extracted
    };
    // Truncate detail to keep toast/banner readable (keep first 300 chars).
    let detail_short = if detail.len() > 300 {
        format!("{}…", &detail[..300])
    } else {
        detail
    };
    match status {
        401 => format!(
            "مفتاح API غير صالح — تحقق من لوحة التحكم: {} — {}",
            key_url, detail_short
        ),
        402 => format!(
            "الرصيد منتهٍ / الدفع مطلوب — اشحن الرصيد: {} — {}",
            key_url, detail_short
        ),
        403 => format!(
            "الوصول مرفوض — تحقق من صلاحيات المفتاح والفوترة: {} — {}",
            key_url, detail_short
        ),
        429 => format!(
            "تم تجاوز الحد المسموح / الرصيد منتهٍ — اشحن الرصيد أو حاول بعد قليل: {} — {}",
            key_url, detail_short
        ),
        500 | 502 | 503 | 504 => format!(
            "الخدمة غير متاحة مؤقتاً ({}): {}",
            status, detail_short
        ),
        _ => {
            if detail_short.is_empty() {
                format!("provider returned {status}: {body}")
            } else {
                detail_short
            }
        }
    }
}

fn extract_error_message(body: &str) -> String {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        // OpenAI: { error: { message: "..." } }
        if let Some(msg) = v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
            return msg.to_string();
        }
        // Anthropic nested: { error: { message: "..." } } or { error: { error: { message } } }
        if let Some(msg) = v
            .get("error")
            .and_then(|e| e.get("error"))
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return msg.to_string();
        }
        // Generic top-level message
        if let Some(msg) = v.get("message").and_then(|m| m.as_str()) {
            return msg.to_string();
        }
        if let Some(msg) = v.get("error").and_then(|e| e.as_str()) {
            return msg.to_string();
        }
    }
    String::new()
}

/// Parse one OpenAI-compatible SSE `data: <json>` line. The caller has
/// already stripped the `data: ` prefix. Returns:
/// - `Ok(StreamChunk { delta: Some(text), finished: false })` for content
/// - `Ok(StreamChunk { delta: None, finished: true })` for the `[DONE]` sentinel
///   (caller should pass the literal string `[DONE]`)
/// - `Ok(StreamChunk { delta: None, finished: false })` for non-content events
///   (role-only deltas, etc.) — caller should NOT emit a token to the frontend
pub fn parse_chat_completions_line(data: &str) -> Result<StreamChunk, ProviderError> {
    if data == "[DONE]" {
        return Ok(StreamChunk {
            delta: None,
            finished: true,
        });
    }
    let v: serde_json::Value = serde_json::from_str(data)
        .map_err(|e| ProviderError::MalformedChunk(format!("invalid JSON: {e}")))?;
    let content = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("delta"))
        .and_then(|d| d.get("content"))
        .and_then(|c| c.as_str());
    match content {
        Some(text) => Ok(StreamChunk {
            delta: Some(text.to_string()),
            finished: false,
        }),
        None => Ok(StreamChunk {
            delta: None,
            finished: false,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::{GenConfig, Message};

    fn cfg(model: &str) -> GenConfig {
        GenConfig { temperature: 0.2, max_tokens: 100, model: model.to_string() }
    }

    #[test]
    fn build_request_produces_chat_completions_url() {
        let msgs = vec![Message { role: "user".into(), content: "ping".into() }];
        let parts = build_chat_completions_request("https://api.openai.com/v1", "sk-x", &msgs, &cfg("gpt-4o")).expect("ok");
        assert_eq!(parts.url, "https://api.openai.com/v1/chat/completions");
        assert_eq!(parts.method, "POST");
        assert!(parts.headers.iter().any(|(k, v)| k == "Authorization" && v == "Bearer sk-x"));
    }

    #[test]
    fn build_request_tolerates_trailing_slash() {
        let msgs = vec![Message { role: "user".into(), content: "hi".into() }];
        let parts = build_chat_completions_request("https://openrouter.ai/api/v1/", "k", &msgs, &cfg("x")).expect("ok");
        assert_eq!(parts.url, "https://openrouter.ai/api/v1/chat/completions");
    }

    #[test]
    fn join_url_handles_edge_cases() {
        assert_eq!(join_url("https://a.com/v1", "chat/completions"), "https://a.com/v1/chat/completions");
        assert_eq!(join_url("https://a.com/v1/", "/chat/completions"), "https://a.com/v1/chat/completions");
        assert_eq!(join_url("https://a.com/v1", ""), "https://a.com/v1");
    }

    #[test]
    fn format_error_401_prefixes_arabic_and_key_url() {
        let body = r#"{"error":{"message":"bad key"}}"#;
        let msg = format_openai_compat_error(401, body, "https://platform.openai.com/api-keys");
        assert!(msg.contains("https://platform.openai.com/api-keys"), "got {msg}");
        assert!(msg.contains("مفتاح"), "got {msg}");
        assert!(msg.contains("bad key"), "got {msg}");
    }

    #[test]
    fn format_error_429_contains_rate_limit_and_truncates() {
        let long = "x".repeat(500);
        let body = format!(r#"{{"error":{{"message":"{long}"}}}}"#);
        let msg = format_openai_compat_error(429, &body, "https://example.com/keys");
        assert!(msg.contains("الحد"), "got {msg}");
        assert!(msg.len() < 600, "must truncate");
    }

    #[test]
    fn format_error_500_contains_status() {
        let msg = format_openai_compat_error(500, "oops", "https://k");
        assert!(msg.contains("500"), "got {msg}");
        assert!(msg.contains("غير متاحة"), "got {msg}");
    }

    #[test]
    fn extract_error_message_prefers_nested() {
        let body = r#"{"error":{"message":"outer"}}"#;
        assert_eq!(extract_error_message(body), "outer");
        let body2 = r#"{"message":"top"}"#;
        assert_eq!(extract_error_message(body2), "top");
        let body3 = r#"{"error":"plain"}"#;
        assert_eq!(extract_error_message(body3), "plain");
        assert_eq!(extract_error_message("not json"), "");
    }

    #[test]
    fn parse_line_extracts_content_and_done() {
        let line = r#"{"choices":[{"delta":{"content":"hello"}}]}"#;
        let c = parse_chat_completions_line(line).expect("ok");
        assert_eq!(c.delta.as_deref(), Some("hello"));
        let done = parse_chat_completions_line("[DONE]").expect("done");
        assert!(done.finished);
    }

    #[test]
    fn parse_line_no_content_returns_none() {
        let line = r#"{"choices":[{"delta":{"role":"assistant"}}]}"#;
        let c = parse_chat_completions_line(line).expect("ok");
        assert!(c.delta.is_none());
        assert!(!c.finished);
    }

    #[test]
    fn parse_line_invalid_json_errors() {
        assert!(parse_chat_completions_line("bad json").is_err());
    }
}
