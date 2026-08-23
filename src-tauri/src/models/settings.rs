//! User settings, including active LLM provider, generation parameters, and UI.

use serde::{Deserialize, Serialize};

/// Root settings object persisted to `<app_data_dir>/settings.json`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    pub active_provider: Provider,
    pub generation: GenerationSettings,
    pub ui: UiSettings,
    /// M11.3: Custom provider base URL. Must be `https://` or
    /// `http://localhost`/`http://127.0.0.1` (validated at use sites).
    /// `None` unless `active_provider == Custom`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_base_url: Option<String>,
    /// M11.3: Custom provider model name. Free-form text.
    /// `None` unless `active_provider == Custom`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_model_name: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            active_provider: Provider::Openai,
            generation: GenerationSettings {
                model: "gpt-4o".into(),
                temperature: 0.2,
                max_tokens: 4096,
            },
            ui: UiSettings {
                theme: Theme::System,
                language: "en-US".into(),
            },
            custom_base_url: None,
            custom_model_name: None,
        }
    }
}

/// Supported LLM providers.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Openai,
    Anthropic,
    /// Google Gemini (native integration, distinct wire format from
    /// OpenAI/Anthropic).
    Gemini,
    /// OpenAI-compatible custom endpoint. Requires a `custom_base_url`
    /// stored separately in the active project (validated in M11.3+).
    Custom,
}

impl Provider {
    /// Stable username used in the OS keyring. Lowercase to match the
    /// serde representation.
    pub fn keyring_username(self) -> &'static str {
        match self {
            Provider::Openai => "openai",
            Provider::Anthropic => "anthropic",
            Provider::Gemini => "gemini",
            Provider::Custom => "custom",
        }
    }
}

/// Generation-time parameters sent to the LLM on each call.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GenerationSettings {
    /// Model identifier, e.g. `gpt-4o` or `claude-3-5-sonnet-20241022`.
    pub model: String,
    /// Sampling temperature. Validated to be in `[0.0, 2.0]`.
    pub temperature: f32,
    /// Hard cap on tokens generated per call.
    pub max_tokens: u32,
}

/// UI preferences.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UiSettings {
    pub theme: Theme,
    /// BCP-47 language tag, e.g. `en-US`, `pt-BR`.
    pub language: String,
}

/// Color theme preference.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    System,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_serialize_as_expected() {
        let s = Settings::default();
        let value = serde_json::to_value(&s).expect("to_value");
        assert_eq!(value["active_provider"], "openai");
        assert_eq!(value["generation"]["model"], "gpt-4o");
        let temp = value["generation"]["temperature"]
            .as_f64()
            .expect("temperature should be a number");
        assert!((temp - 0.2_f64).abs() < 1e-6, "temperature was {temp}");
        assert_eq!(value["ui"]["theme"], "system");
        assert_eq!(value["ui"]["language"], "en-US");
        // The new optional fields are skipped when None -- they should
        // not appear in the serialized form of `Settings::default()`.
        assert!(value.get("custom_base_url").is_none());
        assert!(value.get("custom_model_name").is_none());
    }

    #[test]
    fn default_settings_roundtrip() {
        let s = Settings::default();
        let json = serde_json::to_string(&s).expect("serialize");
        let back: Settings = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(s, back);
    }

    #[test]
    fn custom_settings_roundtrip() {
        let s = Settings {
            active_provider: Provider::Anthropic,
            generation: GenerationSettings {
                model: "claude-3-5-sonnet-20241022".into(),
                temperature: 0.0,
                max_tokens: 8192,
            },
            ui: UiSettings {
                theme: Theme::Dark,
                language: "pt-BR".into(),
            },
            custom_base_url: None,
            custom_model_name: None,
        };
        let json = serde_json::to_string(&s).expect("serialize");
        let back: Settings = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(s, back);
    }

    #[test]
    fn custom_provider_with_base_url_roundtrips() {
        let s = Settings {
            active_provider: Provider::Custom,
            generation: GenerationSettings {
                model: "meta-llama/llama-3.3-70b".into(),
                temperature: 0.2,
                max_tokens: 4096,
            },
            ui: UiSettings {
                theme: Theme::System,
                language: "en-US".into(),
            },
            custom_base_url: Some("https://openrouter.ai/api/v1".into()),
            custom_model_name: Some("meta-llama/llama-3.3-70b".into()),
        };
        let json = serde_json::to_string(&s).expect("serialize");
        let back: Settings = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(s, back);
    }

    /// Backwards-compat: an old settings.json file written by M11.1/2
    /// (no `custom_base_url`, no `custom_model_name`) must still load
    /// via `#[serde(default)]` and produce the same Settings.
    #[test]
    fn legacy_settings_without_custom_fields_load_as_none() {
        let legacy = r#"{
            "active_provider": "openai",
            "generation": {"model": "gpt-4o", "temperature": 0.2, "max_tokens": 4096},
            "ui": {"theme": "system", "language": "en-US"}
        }"#;
        let s: Settings = serde_json::from_str(legacy).expect("legacy must still load");
        assert_eq!(s, Settings::default());
        assert!(s.custom_base_url.is_none());
        assert!(s.custom_model_name.is_none());
    }

    #[test]
    fn provider_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&Provider::Openai).unwrap(),
            "\"openai\""
        );
        assert_eq!(
            serde_json::to_string(&Provider::Anthropic).unwrap(),
            "\"anthropic\""
        );
        assert_eq!(
            serde_json::to_string(&Provider::Gemini).unwrap(),
            "\"gemini\""
        );
        assert_eq!(
            serde_json::to_string(&Provider::Custom).unwrap(),
            "\"custom\""
        );
    }

    #[test]
    fn provider_keyring_username() {
        assert_eq!(Provider::Openai.keyring_username(), "openai");
        assert_eq!(Provider::Anthropic.keyring_username(), "anthropic");
        assert_eq!(Provider::Gemini.keyring_username(), "gemini");
        assert_eq!(Provider::Custom.keyring_username(), "custom");
    }

    #[test]
    fn theme_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&Theme::Light).unwrap(), "\"light\"");
        assert_eq!(serde_json::to_string(&Theme::Dark).unwrap(), "\"dark\"");
        assert_eq!(serde_json::to_string(&Theme::System).unwrap(), "\"system\"");
    }
}
