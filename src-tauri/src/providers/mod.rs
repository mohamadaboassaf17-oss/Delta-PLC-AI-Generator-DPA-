//! Provider abstraction layer (M11.1+).
//!
//! All AI providers implement the `AiProvider` trait. OpenAI and Custom share
//! request/response logic via `openai_compat`. Anthropic and Gemini have
//! dedicated modules due to differing request/response schemas.

pub mod anthropic;
pub mod custom;
pub mod domain_trust;
pub mod gemini;
pub mod openai;
pub mod openai_compat;

use serde::{Deserialize, Serialize};

/// Single chat message in the universal LLM format used by the rest of
/// the application. Providers convert this into their wire format.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Message {
    pub role: String, // "system" | "user" | "assistant"
    pub content: String,
}

/// Generation config shared by all providers.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GenConfig {
    pub temperature: f32,
    pub max_tokens: u32,
    pub model: String,
}

/// Single chunk of a streaming response.
#[derive(Debug, Clone, PartialEq)]
pub struct StreamChunk {
    /// Text delta to append to the running response. `None` for events
    /// that carry no content (e.g. `message_stop` from Anthropic, or a
    /// Gemini chunk that only has `finishReason`).
    pub delta: Option<String>,
    /// `true` if the stream has finished. The backend should stop
    /// reading the HTTP body.
    pub finished: bool,
}

/// A single content-filter / safety block event from the provider.
#[derive(Debug, Clone, PartialEq)]
pub struct ContentFiltered {
    pub reason: String,
}

/// All provider-specific errors. The HTTP layer in `commands::generation`
/// catches these and emits the appropriate `generation-error` event.
#[allow(dead_code)] // some variants are constructed by tests / future callers
#[derive(Debug, Clone, PartialEq)]
pub enum ProviderError {
    /// HTTP transport failure (timeout, connection refused, DNS, etc.).
    Network(String),
    /// Provider returned non-2xx and we have a human-readable message.
    Api { status: u16, message: String },
    /// Provider content was blocked by a safety filter.
    ContentFiltered(ContentFiltered),
    /// Provider-specific stream chunk could not be parsed.
    MalformedChunk(String),
    /// The provider name is not recognised (programming error).
    UnknownProvider(String),
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Network(s) => write!(f, "network error: {s}"),
            Self::Api { status, message } => write!(f, "provider returned {status}: {message}"),
            Self::ContentFiltered(c) => write!(f, "content filtered: {}", c.reason),
            Self::MalformedChunk(s) => write!(f, "malformed stream chunk: {s}"),
            Self::UnknownProvider(p) => write!(f, "unknown provider: {p}"),
        }
    }
}

impl std::error::Error for ProviderError {}

/// Concrete types the trait must produce for HTTP requests. Keeping
/// them as a single struct (rather than `reqwest::RequestBuilder`) keeps
/// the trait testable without a Tauri runtime.
#[derive(Debug, Clone)]
pub struct HttpRequestParts {
    pub url: String,
    pub method: String, // always "POST" for chat endpoints
    pub headers: Vec<(String, String)>,
    pub body_json: String,
}

/// The contract every AI provider implementation must satisfy.
pub trait AiProvider: Send + Sync {
    /// Build the full HTTP request that the LLM stream command will send.
    fn build_request(
        &self,
        api_key: &str,
        messages: &[Message],
        config: &GenConfig,
    ) -> Result<HttpRequestParts, ProviderError>;

    /// Parse one raw SSE line (`data: ...`) from the provider's response.
    /// Empty lines, non-SSE lines, and `[DONE]` sentinels are filtered
    /// out by the caller before this is invoked.
    fn parse_stream_line(&self, line: &str) -> Result<StreamChunk, ProviderError>;

    /// Map a non-2xx HTTP response into a human-readable error.
    fn parse_error(&self, status: u16, body: &str) -> ProviderError;
}

/// Concrete provider struct the application passes around.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderKind {
    Openai,
    Anthropic,
    Gemini,
    Custom,
}

impl ProviderKind {
    pub fn as_trait(&self) -> Box<dyn AiProvider> {
        match self {
            Self::Openai => Box::new(openai::OpenAiProvider),
            Self::Anthropic => Box::new(anthropic::AnthropicProvider),
            Self::Gemini => Box::new(gemini::GeminiProvider),
            Self::Custom => Box::new(custom::CustomProvider::new("")), // placeholder
        }
    }
}
