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
        ProviderError::Api {
            status,
            message: body.to_string(),
        }
    }
}
