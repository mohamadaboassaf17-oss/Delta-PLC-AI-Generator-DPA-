use super::openai_compat::{build_chat_completions_request, parse_chat_completions_line};
use super::{AiProvider, GenConfig, HttpRequestParts, Message, ProviderError, StreamChunk};

pub struct OpenAiProvider;

impl AiProvider for OpenAiProvider {
    fn build_request(
        &self,
        api_key: &str,
        messages: &[Message],
        config: &GenConfig,
    ) -> Result<HttpRequestParts, ProviderError> {
        // Use base URL "https://api.openai.com/v1" so join_url produces
        // https://api.openai.com/v1/chat/completions
        build_chat_completions_request("https://api.openai.com/v1", api_key, messages, config)
    }

    fn parse_stream_line(&self, line: &str) -> Result<StreamChunk, ProviderError> {
        parse_chat_completions_line(line)
    }

    fn parse_error(&self, status: u16, body: &str) -> ProviderError {
        let message = super::openai_compat::format_openai_compat_error(
            status,
            body,
            "https://platform.openai.com/api-keys",
        );
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
    fn build_request_sets_openai_url_and_auth() {
        let p = OpenAiProvider;
        let msgs = vec![Message {
            role: "user".into(),
            content: "hello".into(),
        }];
        let parts = p.build_request("sk-test", &msgs, &cfg("gpt-4o")).expect("ok");
        assert_eq!(parts.url, "https://api.openai.com/v1/chat/completions");
        assert_eq!(parts.method, "POST");
        assert!(parts.headers.iter().any(|(k, v)| k == "Authorization" && v == "Bearer sk-test"));
        assert!(parts.headers.iter().any(|(k, _)| k == "Content-Type"));
        let body: serde_json::Value = serde_json::from_str(&parts.body_json).expect("json");
        assert_eq!(body["model"], "gpt-4o");
        assert_eq!(body["stream"], true);
        assert!((body["temperature"].as_f64().unwrap() - 0.2).abs() < 1e-6);
    }

    #[test]
    fn build_request_preserves_messages() {
        let p = OpenAiProvider;
        let msgs = vec![
            Message { role: "system".into(), content: "sys".into() },
            Message { role: "user".into(), content: "ping".into() },
        ];
        let parts = p.build_request("k", &msgs, &cfg("gpt-4o")).expect("ok");
        let body: serde_json::Value = serde_json::from_str(&parts.body_json).expect("json");
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["content"], "ping");
    }

    #[test]
    fn parse_stream_line_delegates_to_openai_compat() {
        let p = OpenAiProvider;
        let line = r#"{"choices":[{"delta":{"content":"hello"}}]}"#;
        let chunk = p.parse_stream_line(line).expect("parse");
        assert_eq!(chunk.delta.as_deref(), Some("hello"));
        assert!(!chunk.finished);
        let done = p.parse_stream_line("[DONE]").expect("done");
        assert!(done.finished);
    }

    #[test]
    fn parse_error_401_contains_arabic_and_key_url() {
        let p = OpenAiProvider;
        let body = r#"{"error":{"message":"Incorrect API key"}}"#;
        let err = p.parse_error(401, body);
        match err {
            ProviderError::Api { status, message } => {
                assert_eq!(status, 401);
                assert!(message.contains("https://platform.openai.com/api-keys"), "got {message}");
                assert!(message.contains("مفتاح"), "got {message}");
            }
            other => panic!("expected Api, got {other:?}"),
        }
    }

    #[test]
    fn parse_error_429_contains_rate_limit() {
        let p = OpenAiProvider;
        let err = p.parse_error(429, r#"{"error":{"message":"quota exceeded"}}"#);
        match err {
            ProviderError::Api { message, .. } => assert!(message.contains("الحد"), "got {message}"),
            other => panic!("got {other:?}"),
        }
    }
}
