//! Google Gemini native integration.
//!
//! Differences from the OpenAI-compatible format:
//! - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
//!   (or `:streamGenerateContent?alt=sse` for streaming).
//! - Auth: `x-goog-api-key: <key>` header (NOT a query string).
//! - Body shape:
//!   ```json
//!   {
//!     "contents": [
//!       {"role": "user", "parts": [{"text": "..."}]},
//!       {"role": "model", "parts": [{"text": "..."}]}
//!     ],
//!     "systemInstruction": {"parts": [{"text": "..."}]},
//!     "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096}
//!   }
//!   ```
//! - The role `"assistant"` (OpenAI) maps to `"model"` (Gemini).
//! - Streaming chunks: each SSE line is `data: {json}` where the json
//!   has `candidates[0].content.parts[].text` and `candidates[0].finishReason`.

use super::{AiProvider, GenConfig, HttpRequestParts, Message, ProviderError, StreamChunk};

const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";

pub struct GeminiProvider;

impl GeminiProvider {
    /// Build the full Gemini endpoint URL for a given model + streaming flag.
    pub fn endpoint_url(model: &str, streaming: bool) -> String {
        if streaming {
            format!("{}/{model}:streamGenerateContent?alt=sse", GEMINI_BASE_URL)
        } else {
            format!("{}/{model}:generateContent", GEMINI_BASE_URL)
        }
    }

    /// Convert the universal `Vec<Message>` into Gemini's `contents` array,
    /// extracting any leading `role == "system"` message into a separate
    /// `systemInstruction` field. Map `"assistant"` to `"model"`.
    pub fn split_system_and_contents(
        messages: &[Message],
    ) -> (Option<String>, Vec<serde_json::Value>) {
        let system = match messages.first() {
            Some(m) if m.role == "system" => Some(m.content.clone()),
            _ => None,
        };
        let skip_system = if system.is_some() { 1 } else { 0 };
        let contents: Vec<serde_json::Value> = messages
            .iter()
            .skip(skip_system)
            .map(|m| {
                let role = match m.role.as_str() {
                    "assistant" => "model",
                    "user" => "user",
                    "model" => "model",
                    other => {
                        eprintln!("[gemini] unknown role '{other}', defaulting to 'user'");
                        "user"
                    }
                };
                serde_json::json!({
                    "role": role,
                    "parts": [{"text": m.content}],
                })
            })
            .collect();
        (system, contents)
    }
}

impl AiProvider for GeminiProvider {
    fn build_request(
        &self,
        api_key: &str,
        messages: &[Message],
        config: &GenConfig,
    ) -> Result<HttpRequestParts, ProviderError> {
        let (system, contents) = Self::split_system_and_contents(messages);
        let mut body = serde_json::json!({
            "contents": contents,
            "generationConfig": {
                "temperature": config.temperature,
                "maxOutputTokens": config.max_tokens,
            },
        });
        if let Some(s) = system {
            body["systemInstruction"] = serde_json::json!({
                "parts": [{"text": s}],
            });
        }
        let body_str = serde_json::to_string(&body)
            .map_err(|e| ProviderError::MalformedChunk(format!("serialize Gemini body: {e}")))?;
        Ok(HttpRequestParts {
            url: Self::endpoint_url(&config.model, true),
            method: "POST".to_string(),
            headers: vec![
                ("x-goog-api-key".to_string(), api_key.to_string()),
                ("Content-Type".to_string(), "application/json".to_string()),
            ],
            body_json: body_str,
        })
    }

    fn parse_stream_line(&self, line: &str) -> Result<StreamChunk, ProviderError> {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return Ok(StreamChunk {
                delta: None,
                finished: false,
            });
        }
        let json_str = trimmed.strip_prefix("data: ").unwrap_or(trimmed);
        if json_str == "[DONE]" {
            return Ok(StreamChunk {
                delta: None,
                finished: true,
            });
        }
        let v: serde_json::Value = match serde_json::from_str(json_str) {
            Ok(v) => v,
            Err(_) => {
                return Ok(StreamChunk {
                    delta: None,
                    finished: false,
                })
            }
        };
        let finish_reason = v
            .get("candidates")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("finishReason"))
            .and_then(|f| f.as_str());
        match finish_reason {
            Some("SAFETY") | Some("RECITATION") => {
                return Err(ProviderError::ContentFiltered(super::ContentFiltered {
                    reason: finish_reason.unwrap_or("UNKNOWN").to_string(),
                }));
            }
            _ => {}
        }
        let mut combined = String::new();
        if let Some(parts) = v
            .get("candidates")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|p| p.as_array())
        {
            for part in parts {
                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                    combined.push_str(text);
                }
            }
        }
        if combined.is_empty() {
            Ok(StreamChunk {
                delta: None,
                finished: false,
            })
        } else {
            Ok(StreamChunk {
                delta: Some(combined),
                finished: false,
            })
        }
    }

    fn parse_error(&self, status: u16, body: &str) -> ProviderError {
        let parsed: Result<serde_json::Value, _> = serde_json::from_str(body);
        let code = parsed
            .as_ref()
            .ok()
            .and_then(|v| v.get("error"))
            .and_then(|e| e.get("code"))
            .and_then(|c| c.as_i64());
        let msg = parsed
            .as_ref()
            .ok()
            .and_then(|v| v.get("error"))
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| body.to_string());
        let (code_label, human_msg) = match code {
            Some(400) => (
                Some("INVALID_ARGUMENT"),
                "\u{0645}\u{0641}\u{062A}\u{062D} API \u{063A}\u{064A}\u{0631} \u{0635}\u{0627}\u{0644}\u{062D} \u{2014} \u{062A}\u{062D}\u{0642}\u{0642} \u{0645}\u{0646} Google AI Studio: https://aistudio.google.com/apikey".to_string(),
            ),
            Some(403) => (
                Some("PERMISSION_DENIED"),
                "\u{0627}\u{0644}\u{0648}\u{0635}\u{0648}\u{0644} \u{0645}\u{0631}\u{0641}\u{0648}\u{0636} \u{2014} \u{062A}\u{062D}\u{0642}\u{0642} \u{0645}\u{0646} \u{062A}\u{0641}\u{0639}\u{064A}\u{0644} Generative Language API \u{0641}\u{064A} \u{0645}\u{0634}\u{0631}\u{0648}\u{0639} Google Cloud".to_string(),
            ),
            Some(429) => (
                Some("RESOURCE_EXHAUSTED"),
                "\u{062A}\u{0645} \u{062A}\u{062C}\u{0627}\u{0648}\u{0632} \u{0627}\u{0644}\u{062D}\u{062F} \u{0627}\u{0644}\u{0645}\u{0633}\u{0645}\u{0648}\u{062D} (Rate Limit) \u{2014} \u{062D}\u{0627}\u{0648}\u{0644} \u{0628}\u{0639}\u{062F} \u{0642}\u{0644}\u{064A}\u{0644}: https://aistudio.google.com/apikey".to_string(),
            ),
            Some(503) => (
                Some("UNAVAILABLE"),
                "\u{062E}\u{062F}\u{0645}\u{0629} Gemini \u{063A}\u{064A}\u{0631} \u{0645}\u{062A}\u{0627}\u{062D}\u{0629} \u{0645}\u{0624}\u{0642}\u{062A}\u{0627}".to_string(),
            ),
            _ => {
                // Fallback on HTTP status when JSON code is absent (e.g. raw 401/429)
                match status {
                    401 => (
                        Some("INVALID_ARGUMENT"),
                        "\u{0645}\u{0641}\u{062A}\u{062D} API \u{063A}\u{064A}\u{0631} \u{0635}\u{0627}\u{0644}\u{062D} \u{2014} \u{062A}\u{062D}\u{0642}\u{0642} \u{0645}\u{0646} Google AI Studio: https://aistudio.google.com/apikey".to_string(),
                    ),
                    429 => (
                        Some("RESOURCE_EXHAUSTED"),
                        "\u{062A}\u{0645} \u{062A}\u{062C}\u{0627}\u{0648}\u{0632} \u{0627}\u{0644}\u{062D}\u{062F} \u{0627}\u{0644}\u{0645}\u{0633}\u{0645}\u{0648}\u{062D} (Rate Limit) \u{2014} \u{062D}\u{0627}\u{0648}\u{0644} \u{0628}\u{0639}\u{062F} \u{0642}\u{0644}\u{064A}\u{0644}: https://aistudio.google.com/apikey".to_string(),
                    ),
                    _ => (None, msg),
                }
            }
        };
        let message = if let Some(label) = code_label {
            format!("{label}: {human_msg}")
        } else {
            human_msg
        };
        ProviderError::Api { status, message }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::{GenConfig, Message};

    fn cfg(model: &str) -> GenConfig {
        GenConfig {
            temperature: 0.2,
            max_tokens: 4096,
            model: model.to_string(),
        }
    }

    #[test]
    fn endpoint_url_streaming_has_alt_sse() {
        let url = GeminiProvider::endpoint_url("gemini-2.5-flash", true);
        assert!(url.contains("gemini-2.5-flash"));
        assert!(url.contains(":streamGenerateContent"));
        assert!(url.contains("alt=sse"));
        assert!(url.starts_with("https://generativelanguage.googleapis.com/"));
    }

    #[test]
    fn endpoint_url_non_streaming_uses_generate_content() {
        let url = GeminiProvider::endpoint_url("gemini-2.5-pro", false);
        assert!(url.contains(":generateContent"));
        assert!(!url.contains("streamGenerateContent"));
    }

    #[test]
    fn auth_headers_use_x_goog_api_key_not_authorization() {
        let msgs = vec![Message {
            role: "user".to_string(),
            content: "hi".to_string(),
        }];
        let parts = GeminiProvider
            .build_request("sk-test-key", &msgs, &cfg("gemini-2.5-flash"))
            .expect("build");
        let has_goog = parts
            .headers
            .iter()
            .any(|(k, v)| k == "x-goog-api-key" && v.contains("sk-test-key"));
        let has_bearer = parts.headers.iter().any(|(k, _)| k == "Authorization");
        assert!(has_goog, "expected x-goog-api-key header");
        assert!(!has_bearer, "must not use Authorization: Bearer");
    }

    #[test]
    fn split_system_into_separate_field() {
        let msgs = vec![
            Message {
                role: "system".to_string(),
                content: "DVP cheatsheet".to_string(),
            },
            Message {
                role: "user".to_string(),
                content: "Start motor".to_string(),
            },
        ];
        let (system, contents) = GeminiProvider::split_system_and_contents(&msgs);
        assert_eq!(system, Some("DVP cheatsheet".to_string()));
        assert_eq!(contents.len(), 1);
        assert_eq!(contents[0]["role"], "user");
        assert_eq!(contents[0]["parts"][0]["text"], "Start motor");
    }

    #[test]
    fn split_no_system_message_returns_none() {
        let msgs = vec![Message {
            role: "user".to_string(),
            content: "ping".to_string(),
        }];
        let (system, contents) = GeminiProvider::split_system_and_contents(&msgs);
        assert!(system.is_none());
        assert_eq!(contents.len(), 1);
    }

    #[test]
    fn assistant_role_maps_to_model() {
        let msgs = vec![
            Message {
                role: "user".to_string(),
                content: "X0 := TRUE;".to_string(),
            },
            Message {
                role: "assistant".to_string(),
                content: "Y0 := X0;".to_string(),
            },
            Message {
                role: "user".to_string(),
                content: "Now add a timer".to_string(),
            },
        ];
        let (system, contents) = GeminiProvider::split_system_and_contents(&msgs);
        assert!(system.is_none());
        assert_eq!(contents.len(), 3);
        assert_eq!(contents[0]["role"], "user");
        assert_eq!(contents[1]["role"], "model");
        assert_eq!(contents[2]["role"], "user");
    }

    #[test]
    fn parse_stream_chunk_extracts_text() {
        let line = r#"{"candidates":[{"content":{"parts":[{"text":"hello world"}]},"finishReason":null}]}"#;
        let chunk = GeminiProvider.parse_stream_line(line).expect("parse");
        assert_eq!(chunk.delta, Some("hello world".to_string()));
        assert!(!chunk.finished);
    }

    #[test]
    fn parse_stream_chunk_combines_multiple_text_parts() {
        let line = r#"{"candidates":[{"content":{"parts":[{"text":"hello "},{"text":"world"}]},"finishReason":null}]}"#;
        let chunk = GeminiProvider.parse_stream_line(line).expect("parse");
        assert_eq!(chunk.delta, Some("hello world".to_string()));
    }

    #[test]
    fn parse_stream_safety_returns_content_filtered() {
        let line = r#"{"candidates":[{"content":{"parts":[]},"finishReason":"SAFETY"}]}"#;
        let err = GeminiProvider
            .parse_stream_line(line)
            .expect_err("SAFETY must error");
        match err {
            ProviderError::ContentFiltered(c) => assert_eq!(c.reason, "SAFETY"),
            other => panic!("expected ContentFiltered, got {other:?}"),
        }
    }

    #[test]
    fn parse_stream_recitation_returns_content_filtered() {
        let line = r#"{"candidates":[{"content":{"parts":[]},"finishReason":"RECITATION"}]}"#;
        let err = GeminiProvider
            .parse_stream_line(line)
            .expect_err("RECITATION must error");
        assert!(matches!(err, ProviderError::ContentFiltered(_)));
    }

    #[test]
    fn parse_stream_malformed_does_not_crash() {
        let line = "this is not json at all { ] [";
        let chunk = GeminiProvider
            .parse_stream_line(line)
            .expect("malformed is ok");
        assert_eq!(chunk.delta, None);
        assert!(!chunk.finished);
    }

    #[test]
    fn parse_stream_empty_after_strip_returns_no_content() {
        let line = "   ";
        let chunk = GeminiProvider.parse_stream_line(line).expect("empty is ok");
        assert_eq!(chunk.delta, None);
    }

    #[test]
    fn parse_stream_done_sentinel_finishes_stream() {
        let chunk = GeminiProvider
            .parse_stream_line("[DONE]")
            .expect("[DONE] is ok");
        assert!(chunk.finished);
        assert_eq!(chunk.delta, None);
    }

    #[test]
    fn parse_error_400_translates_to_arabic() {
        let body =
            r#"{"error":{"code":400,"message":"API key not valid","status":"INVALID_ARGUMENT"}}"#;
        let err = GeminiProvider.parse_error(400, body);
        match err {
            ProviderError::Api { status, message } => {
                assert_eq!(status, 400);
                assert!(message.contains("INVALID_ARGUMENT"), "got: {message}");
                assert!(
                    message.contains("\u{0645}\u{0641}\u{062A}\u{062D}"),
                    "got: {message}"
                );
            }
            other => panic!("expected Api, got {other:?}"),
        }
    }

    #[test]
    fn parse_error_403_translates_to_arabic() {
        let body =
            r#"{"error":{"code":403,"message":"Permission denied","status":"PERMISSION_DENIED"}}"#;
        let err = GeminiProvider.parse_error(403, body);
        let msg = match err {
            ProviderError::Api { message, .. } => message,
            _ => panic!(),
        };
        assert!(msg.contains("PERMISSION_DENIED"));
        assert!(msg.contains("\u{0627}\u{0644}\u{0648}\u{0635}\u{0648}\u{0644}"));
    }

    #[test]
    fn parse_error_429_translates_to_arabic() {
        let body =
            r#"{"error":{"code":429,"message":"Quota exceeded","status":"RESOURCE_EXHAUSTED"}}"#;
        let err = GeminiProvider.parse_error(429, body);
        let msg = match err {
            ProviderError::Api { message, .. } => message,
            _ => panic!(),
        };
        assert!(msg.contains("Rate Limit"));
    }

    #[test]
    fn parse_error_503_translates_to_arabic() {
        let body =
            r#"{"error":{"code":503,"message":"Service unavailable","status":"UNAVAILABLE"}}"#;
        let err = GeminiProvider.parse_error(503, body);
        let msg = match err {
            ProviderError::Api { message, .. } => message,
            _ => panic!(),
        };
        assert!(msg.contains("UNAVAILABLE"));
    }

    #[test]
    fn parse_error_unknown_status_falls_back_to_body() {
        let body = "plain text error";
        let err = GeminiProvider.parse_error(500, body);
        match err {
            ProviderError::Api { status, message } => {
                assert_eq!(status, 500);
                assert!(message.contains("plain text error"));
            }
            other => panic!("expected Api, got {other:?}"),
        }
    }

    #[test]
    fn build_request_includes_generation_config() {
        let msgs = vec![Message {
            role: "user".to_string(),
            content: "ping".to_string(),
        }];
        let parts = GeminiProvider
            .build_request("k", &msgs, &cfg("gemini-2.5-flash"))
            .expect("ok");
        let v: serde_json::Value = serde_json::from_str(&parts.body_json).expect("parse body");
        let temp = v["generationConfig"]["temperature"].as_f64().expect("temp");
        assert!((temp - 0.2_f64).abs() < 1e-6, "temp was {temp}");
        assert_eq!(v["generationConfig"]["maxOutputTokens"], 4096);
    }
}
