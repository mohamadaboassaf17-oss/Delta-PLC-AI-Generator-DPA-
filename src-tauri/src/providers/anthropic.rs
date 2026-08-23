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
        ProviderError::Api {
            status,
            message: body.to_string(),
        }
    }
}
