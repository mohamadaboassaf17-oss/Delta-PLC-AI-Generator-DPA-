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
