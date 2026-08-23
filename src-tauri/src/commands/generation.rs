//! LLM code generation command: streaming HTTP to OpenAI / Anthropic /
//! Gemini (and any OpenAI-compatible custom endpoint) via the unified
//! `AiProvider` trait, with token-by-token event emission to the
//! frontend.

use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::commands::ladder;
use crate::models::ladder::LadderGraph;
use crate::prompts::sanitize_prompt_input;
use crate::providers::{
    AiProvider, GenConfig, HttpRequestParts, Message, ProviderError, ProviderKind, StreamChunk,
};

/// Stream timeout applied to every LLM HTTP call (seconds).
const STREAM_TIMEOUT_SECS: u64 = 120;

fn provider_kind_from_str(s: &str) -> Option<ProviderKind> {
    match s.to_lowercase().as_str() {
        "openai" => Some(ProviderKind::Openai),
        "anthropic" => Some(ProviderKind::Anthropic),
        "gemini" => Some(ProviderKind::Gemini),
        "custom" => Some(ProviderKind::Custom),
        _ => None,
    }
}

fn error_kind_label(err: &ProviderError) -> &'static str {
    match err {
        ProviderError::Network(_) => "network",
        ProviderError::Api { .. } => "provider",
        ProviderError::ContentFiltered(_) => "filtered",
        ProviderError::MalformedChunk(_) => "malformed",
        ProviderError::UnknownProvider(_) => "provider",
    }
}

fn provider_error_to_generation_error(err: ProviderError) -> GenerationError {
    let kind = error_kind_label(&err).to_string();
    let message = match err {
        ProviderError::Network(s) => format!("HTTP request failed: {s}"),
        ProviderError::Api { message, .. } => message,
        ProviderError::ContentFiltered(c) => {
            format!("content filtered: {}", c.reason)
        }
        ProviderError::MalformedChunk(s) => format!("malformed stream chunk: {s}"),
        ProviderError::UnknownProvider(p) => format!("unsupported provider: {p}"),
    };
    GenerationError {
        message,
        kind: Some(kind),
    }
}

// ---------------------------------------------------------------------------
// Event payload types emitted to the frontend during generation
// ---------------------------------------------------------------------------

/// Emitted per token as it arrives from the LLM stream.
///
/// The frontend (`useGenerationStream`) treats this as a bare string,
/// not a JSON object. Using a type alias makes the wire contract
/// impossible to break on the Rust side: every call to
/// `app.emit("generation-token", ...)` must pass a `String` value.
#[allow(dead_code)] // public type alias documenting the event contract
pub type GenerationToken = String;

/// Emitted once when the full LLM response has been received and parsed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationDone {
    pub st_code: String,
    pub il_code: String,
    /// Pre-rendered Ladder Diagram graph, computed deterministically from
    /// `st_code` via the v1 ST->LD parser. `None` when the parser
    /// produces no nodes (empty / comment-only ST).
    pub ld_graph: Option<LadderGraph>,
    pub raw_response: String,
    /// Raw HMI tag JSON text extracted from the LLM response (after
    /// `---HMI---`), or empty string when the model did not emit an
    /// HMI block. Omitted from the wire when empty so older frontends
    /// see no change.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub hmi_tags_raw: String,
}

/// Emitted when the generation fails (auth, network, provider, etc.).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationError {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/// Stream generated PLC code from an LLM provider.
///
/// The command returns immediately after validation and spawns a background
/// task that emits `generation-token`, `generation-error`, and
/// `generation-done` events.
#[tauri::command]
pub async fn generate_code(
    app: AppHandle,
    prompt: String,
    provider: String,
    model: String,
    api_key: String,
    custom_base_url: Option<String>,
    custom_model_name: Option<String>,
) -> Result<(), String> {
    if prompt.trim().is_empty() {
        return Err("Prompt cannot be empty".into());
    }
    if api_key.trim().is_empty() {
        return Err("API key cannot be empty".into());
    }
    let prompt = sanitize_prompt_input(&prompt);

    let app_clone = app.clone();
    let prompt_owned = prompt;
    tokio::spawn(async move {
        let kind = match provider_kind_from_str(&provider) {
            Some(k) => k,
            None => {
                let _ = app_clone.emit(
                    "generation-error",
                    GenerationError {
                        message: format!("Unsupported provider: {}", provider),
                        kind: Some("provider".into()),
                    },
                );
                return;
            }
        };
        let result = stream_via_provider(
            &app_clone,
            &prompt_owned,
            kind,
            // For Custom, prefer the explicit `custom_model_name` arg
            // over the generic `model` (the frontend may pass the
            // built-in default as `model` while the user's real model
            // is in `custom_model_name`).
            if kind == ProviderKind::Custom {
                custom_model_name.as_deref().unwrap_or(&model)
            } else {
                &model
            },
            &api_key,
            custom_base_url.as_deref(),
            GenerationEventKind::Generate,
        )
        .await;
        if let Err(e) = result {
            let _ = app_clone.emit("generation-error", e);
        }
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Provider-agnostic streaming core
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
enum GenerationEventKind {
    /// `generate_code` — emits `generation-*` events and parses ST/IL/HMI.
    Generate,
    /// `modify_code` — emits `modification-*` events and parses ST only.
    Modify,
}

/// Parse and dispatch one complete stream line. Returns `true` when the
/// provider signalled end-of-stream (`finished`) so the caller can stop
/// feeding further lines of the current batch.
fn handle_stream_line(
    provider: &dyn AiProvider,
    app: &AppHandle,
    event_kind: GenerationEventKind,
    full_text: &mut String,
    line: &str,
) -> Result<bool, GenerationError> {
    let line = line.trim();
    if line.is_empty() {
        return Ok(false);
    }
    let data = line.strip_prefix("data: ").unwrap_or(line);
    match provider.parse_stream_line(data) {
        Ok(StreamChunk {
            delta: Some(d),
            finished: _,
        }) => {
            full_text.push_str(&d);
            let _ = match event_kind {
                GenerationEventKind::Generate => app.emit("generation-token", d),
                GenerationEventKind::Modify => app.emit("modification-token", d),
            };
            Ok(false)
        }
        Ok(StreamChunk {
            delta: None,
            finished: true,
        }) => Ok(true),
        Ok(StreamChunk {
            delta: None,
            finished: false,
        }) => Ok(false),
        Err(e) => Err(provider_error_to_generation_error(e)),
    }
}

/// Incremental byte-and-line assembler for the streaming hot path.
///
/// Fixes CRITICAL finding C1: the previous loop applied
/// `String::from_utf8_lossy` per TCP chunk and iterated `text.lines()`
/// per chunk, which corrupted any multi-byte UTF-8 character straddling
/// a chunk boundary into U+FFFD garbage, truncated SSE `data:` lines
/// split across two chunks into malformed JSON, and carried no state
/// between iterations.
///
/// Raw bytes accumulate in `pending_bytes`; only fully decodable
/// prefixes become text (an incomplete trailing sequence is kept for
/// the next chunk). Only `'\n'`-terminated segments become complete
/// lines; a trailing fragment without its newline is kept in
/// `pending_line`. At EOF call [`StreamAssembler::finish`] to flush
/// both buffers.
#[derive(Debug, Default)]
struct StreamAssembler {
    /// Raw bytes not yet consumed by the incremental UTF-8 decoder.
    pending_bytes: Vec<u8>,
    /// Trailing text segment still waiting for its terminating `'\n'`.
    pending_line: String,
}

impl StreamAssembler {
    fn new() -> Self {
        Self::default()
    }

    /// Feed one raw HTTP chunk. Returns every complete line made
    /// available by this chunk, in order. Returns `Err` only when the
    /// buffer holds a genuinely invalid UTF-8 sequence — an incomplete
    /// trailing multi-byte character is retained instead.
    fn push(&mut self, chunk: &[u8]) -> Result<Vec<String>, ProviderError> {
        self.pending_bytes.extend_from_slice(chunk);
        let mut lines = Vec::new();
        match std::str::from_utf8(&self.pending_bytes) {
            Ok(text) => {
                Self::split_lines(&mut self.pending_line, text, &mut lines);
                self.pending_bytes.clear();
            }
            Err(e) => {
                let valid_up_to = e.valid_up_to();
                if valid_up_to > 0 {
                    // The error guarantees bytes up to here are valid;
                    // process them and keep the tail for the next chunk.
                    let head = std::str::from_utf8(&self.pending_bytes[..valid_up_to]).map_err(
                        |inner| ProviderError::MalformedChunk(format!("invalid UTF-8: {inner}")),
                    )?;
                    Self::split_lines(&mut self.pending_line, head, &mut lines);
                }
                if e.error_len().is_none() {
                    // Incomplete multi-byte character at the end of the
                    // buffer: keep the tail bytes for the next chunk.
                    self.pending_bytes.drain(..valid_up_to);
                } else {
                    return Err(ProviderError::MalformedChunk(format!(
                        "invalid UTF-8 sequence at stream offset {}",
                        valid_up_to
                    )));
                }
            }
        }
        Ok(lines)
    }

    /// Split decoded `text` on complete `'\n'`-terminated segments,
    /// pushing each complete line onto `lines` and retaining any
    /// trailing fragment (no terminating `'\n'`) in `pending_line`.
    /// A free-standing helper (not a method) so `push` can mutate
    /// `pending_line` while the decoded text still borrows from
    /// `pending_bytes`.
    fn split_lines(pending_line: &mut String, text: &str, lines: &mut Vec<String>) {
        pending_line.push_str(text);
        while let Some(nl) = pending_line.find('\n') {
            lines.push(pending_line[..nl].to_string());
            pending_line.drain(..nl + 1);
        }
    }

    /// Flush both buffers once the stream body reaches EOF so no
    /// trailing content is dropped. Residual undecoded bytes are lossily
    /// decoded (a truncated multi-byte character becomes U+FFFD).
    fn finish(mut self) -> Vec<String> {
        let mut lines = Vec::new();
        if !self.pending_bytes.is_empty() {
            let tail = String::from_utf8_lossy(&self.pending_bytes).into_owned();
            self.pending_bytes.clear();
            Self::split_lines(&mut self.pending_line, &tail, &mut lines);
        }
        if !self.pending_line.is_empty() {
            lines.push(std::mem::take(&mut self.pending_line));
        }
        lines
    }
}

async fn stream_via_provider(
    app: &AppHandle,
    prompt: &str,
    kind: ProviderKind,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
    event_kind: GenerationEventKind,
) -> Result<(), GenerationError> {
    // Build the request via the provider trait.
    let provider: Box<dyn AiProvider> = if kind == ProviderKind::Custom {
        let url = custom_base_url.ok_or_else(|| GenerationError {
            message: "Custom provider requires a base URL".into(),
            kind: Some("provider".into()),
        })?;
        // Defense-in-depth: validate URL shape (rejects http to
        // non-localhost, userinfo, etc.) and check the trust list.
        crate::providers::custom::validate_custom_base_url(url).map_err(|e| GenerationError {
            message: format!("invalid custom_base_url: {e}"),
            kind: Some("provider".into()),
        })?;
        // Trust check: a Custom domain must be either hardcoded
        // (it isn't — only OpenAI/Anthropic/Gemini are) or in the
        // user's trusted-domains list. Otherwise refuse the request
        // — the frontend should have shown the TrustDomainModal
        // before reaching this point, and the user may have
        // declined.
        let domain = extract_host_port(url).ok_or_else(|| GenerationError {
            message: "Could not extract domain from custom_base_url".into(),
            kind: Some("provider".into()),
        })?;
        if !is_custom_domain_trusted(app, &domain) {
            return Err(GenerationError {
                message: format!(
                    "المزوّود '{domain}' غير موثوق. أضفه إلى قائمة الموثوقين في الإعدادات أولاً."
                ),
                kind: Some("provider".into()),
            });
        }
        Box::new(crate::providers::custom::CustomProvider::new(
            url.to_string(),
        ))
    } else {
        kind.as_trait()
    };

    let config = GenConfig {
        temperature: 0.2,
        max_tokens: 4096,
        model: model.to_string(),
    };
    let messages = vec![Message {
        role: "user".to_string(),
        content: prompt.to_string(),
    }];
    let parts: HttpRequestParts = provider
        .build_request(api_key, &messages, &config)
        .map_err(provider_error_to_generation_error)?;

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(STREAM_TIMEOUT_SECS))
        .build()
        .map_err(|e| GenerationError {
            message: format!("Failed to create HTTP client: {}", e),
            kind: Some("network".into()),
        })?;

    let mut req = client.request(
        reqwest::Method::from_bytes(parts.method.as_bytes()).map_err(|e| GenerationError {
            message: format!("invalid method {}: {}", parts.method, e),
            kind: Some("network".into()),
        })?,
        &parts.url,
    );
    for (k, v) in &parts.headers {
        req = req.header(k.as_str(), v.as_str());
    }
    req = req.body(parts.body_json);

    let response = req.send().await.map_err(|e| GenerationError {
        message: format!("HTTP request failed: {}", e),
        kind: Some("network".into()),
    })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let pe = provider.parse_error(status.as_u16(), &body);
        return Err(provider_error_to_generation_error(pe));
    }

    let mut full_text = String::new();
    let mut assembler = StreamAssembler::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| GenerationError {
            message: format!("Stream read error: {}", e),
            kind: Some("network".into()),
        })?;
        let lines = assembler
            .push(&chunk)
            .map_err(provider_error_to_generation_error)?;
        for line in &lines {
            if handle_stream_line(provider.as_ref(), app, event_kind, &mut full_text, line)? {
                break;
            }
        }
    }
    // End-of-stream: flush whatever remains in both buffers as final
    // line(s) so nothing is silently dropped (C1).
    for line in &assembler.finish() {
        let _ = handle_stream_line(provider.as_ref(), app, event_kind, &mut full_text, line)?;
    }

    match event_kind {
        GenerationEventKind::Generate => {
            let (st_code, il_code, hmi_tags_raw) = parse_st_il_hmi_blocks(&full_text);
            let ld_graph = Some(ladder::parse_st_to_ladder(&st_code));
            let _ = app.emit(
                "generation-done",
                GenerationDone {
                    st_code,
                    il_code,
                    ld_graph,
                    raw_response: full_text,
                    hmi_tags_raw,
                },
            );
        }
        GenerationEventKind::Modify => {
            let st_code = extract_st_from_modification(&full_text);
            let ld_graph = Some(ladder::parse_st_to_ladder(&st_code));
            let _ = app.emit(
                "modification-done",
                ModificationDone {
                    st_code,
                    ld_graph,
                    raw_response: full_text,
                },
            );
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// ST / IL block parser
// ---------------------------------------------------------------------------

/// Parses the LLM response text to extract Structured Text (ST),
/// Instruction List (IL), and HMI tag blocks.
fn parse_st_il_hmi_blocks(raw: &str) -> (String, String, String) {
    let st_marker = "---ST---";
    let il_marker = "---IL---";
    let hmi_marker = "---HMI---";

    let st_start = raw.find(st_marker);
    let il_start = raw.find(il_marker);
    let hmi_start = raw.find(hmi_marker);

    let st_code = if let Some(st_idx) = st_start {
        let begin = st_idx + st_marker.len();
        let end = il_start.filter(|&i| i > st_idx).unwrap_or(raw.len());
        raw[begin..end].trim().to_string()
    } else {
        raw.trim().to_string()
    };

    let il_code = if let Some(il_idx) = il_start {
        let begin = il_idx + il_marker.len();
        let end = hmi_start.filter(|&i| i > il_idx).unwrap_or(raw.len());
        raw[begin..end].trim().to_string()
    } else {
        String::new()
    };

    let hmi_code = if let Some(hmi_idx) = hmi_start {
        raw[hmi_idx + hmi_marker.len()..].trim().to_string()
    } else {
        String::new()
    };

    (st_code, il_code, hmi_code)
}

// ---------------------------------------------------------------------------
// M6: Chat modification command (context-anchored ST modification)
// ---------------------------------------------------------------------------

/// Emitted per token during a chat modification stream.
#[allow(dead_code)]
pub type ModificationToken = String;

/// Emitted when the full modified ST response has been received and parsed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModificationDone {
    pub st_code: String,
    /// Pre-rendered Ladder Diagram graph from the modified ST.
    pub ld_graph: Option<LadderGraph>,
    /// The raw full LLM response for debugging/transparency.
    pub raw_response: String,
}

/// Emitted when the modification stream fails.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModificationError {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

/// Extract the host[:port] portion of a URL like `https://host:port/v1`.
/// Hand-rolled (rather than using a URL crate) to avoid adding a
/// dependency. Returns `None` if the URL has no `://` separator or
/// no host portion.
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

/// True when `domain` is trusted: either a hardcoded provider or in
/// the user's `trusted_domains.json`.
///
/// M11.7.3: The cloud metadata endpoint (`169.254.x.x`) is ALWAYS
/// rejected, even if the user accidentally added it to their trusted
/// list. This blocks a class of SSRF attacks where a malicious LLM
/// response (or a misconfigured Custom base URL) would attempt to
/// read instance metadata.
fn is_custom_domain_trusted(app: &AppHandle, domain: &str) -> bool {
    use crate::providers::domain_trust::{
        classify_ssrf, is_hardcoded_trusted, read_trusted_domains_file, trusted_domains_path,
        SsrfSeverity,
    };
    // Hard block: never trust the cloud-metadata IP block, even if the
    // user has whitelisted it.
    if matches!(classify_ssrf(domain), SsrfSeverity::MetadataEndpoint) {
        return false;
    }
    if is_hardcoded_trusted(domain) {
        return true;
    }
    let dir = match crate::paths::app_data_dir(app) {
        Ok(d) => d,
        Err(_) => return false,
    };
    let path = trusted_domains_path(&dir);
    let list = match read_trusted_domains_file(&path) {
        Ok(l) => l,
        Err(_) => return false,
    };
    list.is_trusted(domain)
}

#[cfg(test)]
mod trust_helpers {
    use super::*;

    #[test]
    fn extract_host_port_basic() {
        assert_eq!(
            extract_host_port("https://openrouter.ai/api/v1"),
            Some("openrouter.ai".to_string())
        );
    }

    #[test]
    fn extract_host_port_with_port() {
        assert_eq!(
            extract_host_port("https://api.example.com:8443/v1"),
            Some("api.example.com:8443".to_string())
        );
    }

    #[test]
    fn extract_host_port_localhost() {
        assert_eq!(
            extract_host_port("http://localhost:11434/v1"),
            Some("localhost:11434".to_string())
        );
    }

    #[test]
    fn extract_host_port_no_path() {
        assert_eq!(
            extract_host_port("https://example.com"),
            Some("example.com".to_string())
        );
    }

    #[test]
    fn extract_host_port_strips_query() {
        assert_eq!(
            extract_host_port("https://example.com/v1?token=abc"),
            Some("example.com".to_string())
        );
    }

    #[test]
    fn extract_host_port_invalid_returns_none() {
        assert_eq!(extract_host_port("not-a-url"), None);
        assert_eq!(extract_host_port(""), None);
    }

    // --- M11.7.3: SSRF hard block on cloud metadata endpoint ---
    // The 169.254.x.x block must NEVER be considered trusted, even if
    // the user managed to whitelist it. We assert the building blocks
    // (extract + classify) that the production `is_custom_domain_trusted`
    // uses to gate the call. The full integration is exercised
    // end-to-end in `M11.7.3` docs / manual test.
    #[test]
    fn m11_7_3_aws_metadata_url_yields_metadata_severity() {
        let domain = extract_host_port("http://169.254.169.254/latest/meta-data/").unwrap();
        assert_eq!(
            crate::providers::domain_trust::classify_ssrf(&domain),
            crate::providers::domain_trust::SsrfSeverity::MetadataEndpoint
        );
    }

    #[test]
    fn m11_7_3_aws_metadata_with_trailing_path_still_detected() {
        // extract_host_port should drop the path, leaving just the IP.
        let domain = extract_host_port("http://169.254.169.254:80/foo").unwrap();
        assert!(domain.starts_with("169.254."));
        assert_eq!(
            crate::providers::domain_trust::classify_ssrf(&domain),
            crate::providers::domain_trust::SsrfSeverity::MetadataEndpoint
        );
    }
}

/// Stream a context-anchored ST modification from an LLM provider.
#[tauri::command]
pub async fn modify_code(
    app: AppHandle,
    prompt: String,
    provider: String,
    model: String,
    api_key: String,
    custom_base_url: Option<String>,
    custom_model_name: Option<String>,
) -> Result<(), String> {
    if prompt.trim().is_empty() {
        return Err("Prompt cannot be empty".into());
    }
    if api_key.trim().is_empty() {
        return Err("API key cannot be empty".into());
    }
    let prompt = sanitize_prompt_input(&prompt);

    let app_clone = app.clone();
    let prompt_owned = prompt;
    tokio::spawn(async move {
        let kind = match provider_kind_from_str(&provider) {
            Some(k) => k,
            None => {
                let _ = app_clone.emit(
                    "modification-error",
                    ModificationError {
                        message: format!("Unsupported provider: {}", provider),
                        kind: Some("provider".into()),
                    },
                );
                return;
            }
        };
        let result = stream_via_provider(
            &app_clone,
            &prompt_owned,
            kind,
            if kind == ProviderKind::Custom {
                custom_model_name.as_deref().unwrap_or(&model)
            } else {
                &model
            },
            &api_key,
            custom_base_url.as_deref(),
            GenerationEventKind::Modify,
        )
        .await;
        if let Err(e) = result {
            // stream_via_provider returns GenerationError, but the
            // modification surface uses ModificationError. Map it.
            let kind_str = e.kind.clone().unwrap_or_else(|| "provider".into());
            let _ = app_clone.emit(
                "modification-error",
                ModificationError {
                    message: e.message,
                    kind: Some(kind_str),
                },
            );
        }
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Modification response parser
// ---------------------------------------------------------------------------

/// Extracts the ST code block from a modification response.
fn extract_st_from_modification(raw: &str) -> String {
    let start_marker = "---ST---";
    let end_marker = "---END-ST---";
    if let Some(start_idx) = raw.find(start_marker) {
        let begin = start_idx + start_marker.len();
        if let Some(end_idx) = raw[begin..].find(end_marker) {
            return raw[begin..begin + end_idx].trim().to_string();
        }
    }
    raw.trim().to_string()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ProviderKind;

    #[test]
    fn parse_st_il_extracts_both_blocks() {
        let raw = "---ST---\nX0 := TRUE;\n---IL---\nLD X0\nOUT Y0\n---HMI---\n[{\"address\":null,\"type\":\"Button\",\"label\":\"Start\",\"plcRef\":\"M0\"}]";
        let (st, il, hmi) = parse_st_il_hmi_blocks(raw);
        assert_eq!(st, "X0 := TRUE;");
        assert_eq!(il, "LD X0\nOUT Y0");
        assert_eq!(
            hmi,
            "[{\"address\":null,\"type\":\"Button\",\"label\":\"Start\",\"plcRef\":\"M0\"}]"
        );
    }

    #[test]
    fn parse_st_il_st_only() {
        let raw = "---ST---\nX0 := TRUE;";
        let (st, il, hmi) = parse_st_il_hmi_blocks(raw);
        assert_eq!(st, "X0 := TRUE;");
        assert!(il.is_empty());
        assert!(hmi.is_empty());
    }

    #[test]
    fn parse_st_il_no_markers() {
        let raw = "X0 := TRUE;\nY0 := X0;";
        let (st, il, hmi) = parse_st_il_hmi_blocks(raw);
        assert_eq!(st, "X0 := TRUE;\nY0 := X0;");
        assert!(il.is_empty());
        assert!(hmi.is_empty());
    }

    #[test]
    fn parse_st_il_empty() {
        let (st, il, hmi) = parse_st_il_hmi_blocks("");
        assert!(st.is_empty());
        assert!(il.is_empty());
        assert!(hmi.is_empty());
    }

    #[test]
    fn generation_error_auth_kind() {
        let err = GenerationError {
            message: "Invalid key".into(),
            kind: Some("auth".into()),
        };
        assert_eq!(err.kind.as_deref(), Some("auth"));
    }

    #[test]
    fn generation_error_serializes_correctly() {
        let err = GenerationError {
            message: "test error".into(),
            kind: None,
        };
        let json = serde_json::to_string(&err).expect("serialize");
        assert!(json.contains("test error"));
        assert!(!json.contains("kind"));
    }

    #[test]
    fn generation_error_serializes_with_kind() {
        let err = GenerationError {
            message: "auth failed".into(),
            kind: Some("auth".into()),
        };
        let json = serde_json::to_string(&err).expect("serialize");
        assert!(json.contains("auth failed"));
        assert!(json.contains("\"auth\""));
    }

    #[test]
    fn generation_done_serializes_camelcase() {
        let done = GenerationDone {
            st_code: "Y0 := 1;".into(),
            il_code: String::new(),
            ld_graph: None,
            raw_response: "---ST---\nY0 := 1;".into(),
            hmi_tags_raw: "[]".into(),
        };
        let value = serde_json::to_value(&done).expect("to_value");
        assert!(value.get("stCode").is_some());
        assert!(value.get("ilCode").is_some());
        assert!(value.get("ldGraph").is_some());
        assert!(value.get("rawResponse").is_some());
        assert!(value.get("hmiTagsRaw").is_some());
        assert!(value.get("st_code").is_none());
        assert!(value.get("il_code").is_none());
        assert!(value.get("ld_graph").is_none());
        assert!(value.get("raw_response").is_none());
        assert!(value.get("hmi_tags_raw").is_none());
    }

    #[test]
    fn generation_done_ld_graph_none_serializes() {
        let done = GenerationDone {
            st_code: String::new(),
            il_code: String::new(),
            ld_graph: None,
            raw_response: String::new(),
            hmi_tags_raw: String::new(),
        };
        let value = serde_json::to_value(&done).expect("to_value");
        assert!(value.get("ldGraph").is_some());
        assert_eq!(value["ldGraph"], serde_json::Value::Null);
    }

    #[test]
    fn generation_token_serializes_as_bare_string() {
        let token: GenerationToken = "hello".to_string();
        let value = serde_json::to_value(&token).expect("to_value");
        assert_eq!(value, serde_json::Value::String("hello".to_string()));
    }

    #[test]
    fn generation_error_serializes_camelcase() {
        let err = GenerationError {
            message: "x".into(),
            kind: Some("auth".into()),
        };
        let value = serde_json::to_value(&err).expect("to_value");
        assert_eq!(value["message"], "x");
        assert_eq!(value["kind"], "auth");
    }

    #[test]
    fn parse_st_il_blocks_still_works_after_generation_changes() {
        let raw = "---ST---\nY0 := X0;\n---IL---\nLD X0\nOUT Y0";
        let (st, il, hmi) = parse_st_il_hmi_blocks(raw);
        assert_eq!(st, "Y0 := X0;");
        assert_eq!(il, "LD X0\nOUT Y0");
        assert!(hmi.is_empty());
    }

    #[test]
    fn parse_st_il_hmi_hmi_only() {
        let raw = "---HMI---\n[{\"address\":null,\"type\":\"Lamp\"}]";
        let (st, il, hmi) = parse_st_il_hmi_blocks(raw);
        assert_eq!(st, raw.trim());
        assert!(il.is_empty());
        assert_eq!(hmi, "[{\"address\":null,\"type\":\"Lamp\"}]");
    }

    #[test]
    fn generation_done_serializes_hmi_tags_raw() {
        let done = GenerationDone {
            st_code: String::new(),
            il_code: String::new(),
            ld_graph: None,
            raw_response: String::new(),
            hmi_tags_raw: "[]".into(),
        };
        let json = serde_json::to_string(&done).expect("serialize");
        assert!(json.contains("\"hmiTagsRaw\":\"[]\""), "got: {}", json);
        assert!(!json.contains("hmi_tags_raw"), "got: {}", json);
    }

    #[test]
    fn generation_done_omits_hmi_tags_raw_when_empty() {
        let done = GenerationDone {
            st_code: String::new(),
            il_code: String::new(),
            ld_graph: None,
            raw_response: String::new(),
            hmi_tags_raw: String::new(),
        };
        let json = serde_json::to_string(&done).expect("serialize");
        assert!(!json.contains("hmiTagsRaw"), "got: {}", json);
    }

    #[test]
    fn provider_kind_from_str_recognises_known_names() {
        assert_eq!(provider_kind_from_str("openai"), Some(ProviderKind::Openai));
        assert_eq!(provider_kind_from_str("OpenAI"), Some(ProviderKind::Openai));
        assert_eq!(
            provider_kind_from_str("anthropic"),
            Some(ProviderKind::Anthropic)
        );
        assert_eq!(provider_kind_from_str("gemini"), Some(ProviderKind::Gemini));
        assert_eq!(provider_kind_from_str("custom"), Some(ProviderKind::Custom));
        assert_eq!(provider_kind_from_str("nope"), None);
    }

    #[test]
    fn provider_error_to_generation_error_carries_kind() {
        let pe = ProviderError::Network("timeout".into());
        let ge = provider_error_to_generation_error(pe);
        assert_eq!(ge.kind.as_deref(), Some("network"));
        assert!(ge.message.contains("timeout"));
    }

    #[test]
    fn provider_error_to_generation_error_content_filtered() {
        let pe = ProviderError::ContentFiltered(crate::providers::ContentFiltered {
            reason: "SAFETY".into(),
        });
        let ge = provider_error_to_generation_error(pe);
        assert_eq!(ge.kind.as_deref(), Some("filtered"));
        assert!(ge.message.contains("SAFETY"));
    }

    #[test]
    fn openai_provider_builds_chat_completions_request() {
        let p = crate::providers::openai::OpenAiProvider;
        let msgs = vec![Message {
            role: "user".to_string(),
            content: "ping".to_string(),
        }];
        let cfg = GenConfig {
            temperature: 0.2,
            max_tokens: 4096,
            model: "gpt-4o".into(),
        };
        let parts = p.build_request("k", &msgs, &cfg).expect("ok");
        assert_eq!(parts.url, "https://api.openai.com/v1/chat/completions");
        assert!(parts
            .headers
            .iter()
            .any(|(k, v)| k == "Authorization" && v == "Bearer k"));
    }

    #[test]
    fn gemini_provider_builds_stream_url() {
        let p = crate::providers::gemini::GeminiProvider;
        let msgs = vec![Message {
            role: "user".to_string(),
            content: "ping".to_string(),
        }];
        let cfg = GenConfig {
            temperature: 0.2,
            max_tokens: 4096,
            model: "gemini-2.5-flash".into(),
        };
        let parts = p.build_request("k", &msgs, &cfg).expect("ok");
        assert!(parts.url.contains(":streamGenerateContent"));
        assert!(parts.url.contains("alt=sse"));
        assert!(parts.headers.iter().any(|(k, _)| k == "x-goog-api-key"));
    }

    // --- C1: incremental UTF-8 / line assembly across chunk boundaries ---

    #[test]
    fn c1_multibyte_char_split_across_chunks_decodes_intact() {
        // Arabic 'ا' U+0627 encodes as [0xD8, 0xA7]; split exactly
        // between lead byte and continuation byte.
        let arabic = "\u{0627}";
        let mut asm = StreamAssembler::new();
        let full = format!("data: {{\"d\":\"{}\"}}\n", arabic);
        let bytes = full.as_bytes();
        let split_at = bytes
            .iter()
            .position(|&b| b == 0xD8)
            .expect("lead byte present");
        let (head, tail) = bytes.split_at(split_at);

        let l1 = asm.push(head).expect("push head");
        assert!(l1.is_empty(), "incomplete char must yield no lines");

        let l2 = asm.push(tail).expect("push tail");
        assert_eq!(l2, vec![format!("data: {{\"d\":\"{}\"}}", arabic)]);
        assert!(asm.finish().is_empty());

        // Same scenario with a CJK character '中' U+4E2D ([0xE4, 0xB8, 0xAD]).
        let mut asm = StreamAssembler::new();
        let full = format!("data: {{\"d\":\"中\"}}\n");
        let bytes = full.as_bytes();
        let split_at = bytes
            .iter()
            .position(|&b| b == 0xE4)
            .expect("lead byte present");
        let (head, tail) = bytes.split_at(split_at + 1); // mid-character
        assert!(asm.push(head).expect("push head").is_empty());
        let l = asm.push(tail).expect("push tail");
        assert_eq!(l, vec!["data: {\"d\":\"中\"}"]);
        assert!(asm.finish().is_empty());
    }

    #[test]
    fn c1_sse_data_line_split_mid_json_parsed_once_complete() {
        let mut asm = StreamAssembler::new();
        let line = r#"data: {"choices":[{"delta":{"content":"X0 := TRUE;"}}]}"#;
        let mid = line.find("\"content\"").expect("marker in line");
        let bytes = line.as_bytes();

        let l1 = asm.push(&bytes[..mid]).expect("first half");
        assert!(l1.is_empty(), "truncated JSON must not be yielded");

        let mut rest = line[mid..].to_string();
        rest.push('\n');
        let l2 = asm.push(rest.as_bytes()).expect("second half");
        assert_eq!(l2, vec![line]);
        assert!(asm.finish().is_empty());
    }

    #[test]
    fn c1_complete_lines_emitted_and_partial_flushed_at_eof() {
        let mut asm = StreamAssembler::new();

        // Two complete lines plus a trailing partial line.
        let l = asm
            .push(b"data: {\"a\":1}\ndata: {\"b\":2}\ndata: {\"c\":")
            .expect("batch 1");
        assert_eq!(l, vec![r#"data: {"a":1}"#, r#"data: {"b":2}"#]);

        // The partial line completes; then a new unterminated line arrives.
        let l = asm.push(b"3}\ndata: [DONE]").expect("batch 2");
        assert_eq!(l, vec![r#"data: {"c":3}"#]);

        // The unterminated trailing line is only delivered by finish().
        let flushed = asm.finish();
        assert_eq!(flushed, vec!["data: [DONE]"]);
    }

    #[test]
    fn c1_unterminated_trailing_line_delivered_by_finish_only() {
        let mut asm = StreamAssembler::new();
        let l = asm.push(b"data: [DONE]").expect("push");
        assert!(l.is_empty(), "no newline means no complete line yet");
        assert_eq!(asm.finish(), vec!["data: [DONE]"]);
    }

    #[test]
    fn c1_empty_chunks_interleaved_cause_no_spurious_errors() {
        let mut asm = StreamAssembler::new();
        assert!(asm.push(b"").expect("empty 1").is_empty());
        let l = asm.push(b"data: {\"ok\":1}\n").expect("real chunk");
        assert_eq!(l.len(), 1);
        assert!(asm.push(b"").expect("empty 2").is_empty());
        assert!(asm.push(b"").expect("empty 3").is_empty());
        assert!(asm.finish().is_empty());
    }

    #[test]
    fn c1_genuinely_invalid_utf8_routes_to_error() {
        let mut asm = StreamAssembler::new();
        // 0xFF is never valid anywhere in UTF-8 (unlike an incomplete
        // multi-byte sequence at buffer end).
        let err = asm.push(b"data: {\xff}\n").expect_err("must error");
        assert!(matches!(err, ProviderError::MalformedChunk(_)));
    }
}
