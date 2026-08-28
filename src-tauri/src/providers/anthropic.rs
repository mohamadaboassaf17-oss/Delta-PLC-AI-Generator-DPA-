use super::{AiProvider, GenConfig, HttpRequestParts, Message, ProviderError, StreamChunk};

pub struct AnthropicProvider;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

impl AiProvider for AnthropicProvider {
    fn build_request(
        &self,
        api_key: &str,
        messages: &[Message],
        config: &GenConfig,
    ) -> Result<HttpRequestParts, ProviderError> {
        let (system, rest): (Option<String>, Vec<&Message>) = match messages.first() {
            Some(m) if m.role == "system" => {
                (Some(m.content.clone()), messages.iter().skip(1).collect())
            }
            _ => (None, messages.iter().collect()),
        };
        let mut body = serde_json::json!({
            "model": config.model,
            "max_tokens": config.max_tokens,
            "temperature": config.temperature,
            "messages": rest.iter().map(|m| serde_json::json!({
                "role": m.role,
                "content": m.content,
            })).collect::<Vec<_>>(),
            "stream": true,
        });
        if let Some(s) = system {
            body["system"] = serde_json::Value::String(s);
        }
        let body_str = serde_json::to_string(&body)
            .map_err(|e| ProviderError::MalformedChunk(format!("serialize: {e}")))?;
        Ok(HttpRequestParts {
            url: ANTHROPIC_URL.to_string(),
            method: "POST".to_string(),
            headers: vec![
                ("x-api-key".to_string(), api_key.to_string()),
                (
                    "anthropic-version".to_string(),
                    ANTHROPIC_VERSION.to_string(),
                ),
                ("Content-Type".to_string(), "application/json".to_string()),
            ],
            body_json: body_str,
        })
    }

    fn parse_stream_line(&self, line: &str) -> Result<StreamChunk, ProviderError> {
        let v: serde_json::Value = serde_json::from_str(line)
            .map_err(|e| ProviderError::MalformedChunk(format!("invalid JSON: {e}")))?;
        match v.get("type").and_then(|t| t.as_str()) {
            Some("content_block_delta") => {
                let text = v
                    .get("delta")
                    .and_then(|d| d.get("text"))
                    .and_then(|t| t.as_str());
                match text {
                    Some(t) => Ok(StreamChunk {
                        delta: Some(t.to_string()),
                        finished: false,
                    }),
                    None => Ok(StreamChunk {
                        delta: None,
                        finished: false,
                    }),
                }
            }
            Some("message_stop") => Ok(StreamChunk {
                delta: None,
                finished: true,
            }),
            Some("error") => {
                let msg = v
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown error")
                    .to_string();
                Err(ProviderError::Api {
                    status: 0,
                    message: msg,
                })
            }
            _ => Ok(StreamChunk {
                delta: None,
                finished: false,
            }),
        }
    }

    fn parse_error(&self, status: u16, body: &str) -> ProviderError {
        let message = super::openai_compat::format_openai_compat_error(
            status,
            body,
            "https://console.anthropic.com/settings/keys",
        );
        ProviderError::Api { status, message }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::{GenConfig, Message};

    fn cfg(model: &str) -> GenConfig {
        GenConfig { temperature: 0.3, max_tokens: 2048, model: model.to_string() }
    }

    #[test]
    fn build_request_sets_anthropic_headers_and_url() {
        let p = AnthropicProvider;
        let msgs = vec![Message { role: "user".into(), content: "hi".into() }];
        let parts = p.build_request("sk-ant-test", &msgs, &cfg("claude-sonnet-4-6")).expect("ok");
        assert_eq!(parts.url, ANTHROPIC_URL);
        assert_eq!(parts.method, "POST");
        assert!(parts.headers.iter().any(|(k, v)| k == "x-api-key" && v == "sk-ant-test"));
        assert!(parts.headers.iter().any(|(k, v)| k == "anthropic-version" && v == ANTHROPIC_VERSION));
        assert!(parts.headers.iter().any(|(k, _)| k == "Content-Type"));
        let body: serde_json::Value = serde_json::from_str(&parts.body_json).expect("json");
        assert_eq!(body["model"], "claude-sonnet-4-6");
        assert_eq!(body["stream"], true);
    }

    #[test]
    fn build_request_extracts_system_message() {
        let p = AnthropicProvider;
        let msgs = vec![
            Message { role: "system".into(), content: "DVP cheatsheet".into() },
            Message { role: "user".into(), content: "Start motor".into() },
        ];
        let parts = p.build_request("k", &msgs, &cfg("claude-sonnet-4-6")).expect("ok");
        let body: serde_json::Value = serde_json::from_str(&parts.body_json).expect("json");
        assert_eq!(body["system"], "DVP cheatsheet");
        assert_eq!(body["messages"].as_array().unwrap().len(), 1);
        assert_eq!(body["messages"][0]["role"], "user");
    }

    #[test]
    fn build_request_without_system_has_no_system_field() {
        let p = AnthropicProvider;
        let msgs = vec![Message { role: "user".into(), content: "ping".into() }];
        let parts = p.build_request("k", &msgs, &cfg("claude-sonnet-4-6")).expect("ok");
        let body: serde_json::Value = serde_json::from_str(&parts.body_json).expect("json");
        assert!(body.get("system").is_none());
    }

    #[test]
    fn parse_stream_content_block_delta() {
        let p = AnthropicProvider;
        let line = r#"{"type":"content_block_delta","delta":{"text":"hello "}}"#;
        let chunk = p.parse_stream_line(line).expect("parse");
        assert_eq!(chunk.delta.as_deref(), Some("hello "));
        assert!(!chunk.finished);
    }

    #[test]
    fn parse_stream_message_stop_finishes() {
        let p = AnthropicProvider;
        let line = r#"{"type":"message_stop"}"#;
        let chunk = p.parse_stream_line(line).expect("parse");
        assert!(chunk.finished);
        assert!(chunk.delta.is_none());
    }

    #[test]
    fn parse_stream_error_returns_api_error() {
        let p = AnthropicProvider;
        let line = r#"{"type":"error","error":{"message":"overloaded"}}"#;
        let err = p.parse_stream_line(line).expect_err("must error");
        match err {
            ProviderError::Api { message, .. } => assert!(message.contains("overloaded")),
            other => panic!("expected Api, got {other:?}"),
        }
    }

    #[test]
    fn parse_stream_unknown_type_is_noop() {
        let p = AnthropicProvider;
        let line = r#"{"type":"message_start","message":{"id":"msg_123"}}"#;
        let chunk = p.parse_stream_line(line).expect("noop");
        assert!(!chunk.finished);
        assert!(chunk.delta.is_none());
    }

    #[test]
    fn parse_stream_invalid_json_returns_malformed() {
        let p = AnthropicProvider;
        let err = p.parse_stream_line("not json").expect_err("malformed");
        assert!(matches!(err, ProviderError::MalformedChunk(_)));
    }

    #[test]
    fn parse_error_401_contains_anthropic_key_url() {
        let p = AnthropicProvider;
        let body = r#"{"error":{"message":"invalid x-api-key"}}"#;
        let err = p.parse_error(401, body);
        match err {
            ProviderError::Api { message, .. } => {
                assert!(message.contains("https://console.anthropic.com/settings/keys"));
                assert!(message.contains("مفتاح"));
            }
            other => panic!("got {other:?}"),
        }
    }
}
