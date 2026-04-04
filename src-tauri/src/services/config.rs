use serde::{Deserialize, Serialize};
use std::path::Path;

/// Durable application configuration stored in config.toml.
/// This is the human-readable source for persistent settings.
/// Ephemeral UI state (window position, last surface) goes in SQLite.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub ai: AiConfig,
    #[serde(default)]
    pub profile: ProfileConfig,
    #[serde(default)]
    pub onboarding_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    #[serde(default = "default_provider")]
    pub provider: String,

    // Ollama
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,
    #[serde(default = "default_ollama_url")]
    pub ollama_url: String,

    // Per-provider API keys
    #[serde(default)]
    pub claude_api_key: String,
    #[serde(default)]
    pub gemini_api_key: String,
    #[serde(default)]
    pub openai_api_key: String,
    #[serde(default)]
    pub deepseek_api_key: String,

    // Model overrides
    #[serde(default)]
    pub claude_model: String,
    #[serde(default)]
    pub gemini_model: String,
    #[serde(default)]
    pub openai_model: String,
    #[serde(default)]
    pub deepseek_model: String,

    // CLI provider
    #[serde(default)]
    pub cli_command: String,
    #[serde(default)]
    pub cli_args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProfileConfig {
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub domain: String,
    #[serde(default)]
    pub learning_context: String,
}

fn default_provider() -> String {
    "none".to_string()
}
fn default_ollama_model() -> String {
    "llama3.1:8b".to_string()
}
fn default_ollama_url() -> String {
    "http://localhost:11434".to_string()
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: default_provider(),
            ollama_model: default_ollama_model(),
            ollama_url: default_ollama_url(),
            claude_api_key: String::new(),
            gemini_api_key: String::new(),
            openai_api_key: String::new(),
            deepseek_api_key: String::new(),
            claude_model: String::new(),
            gemini_model: String::new(),
            openai_model: String::new(),
            deepseek_model: String::new(),
            cli_command: String::new(),
            cli_args: Vec::new(),
        }
    }
}

impl AppConfig {
    /// Read config from a TOML file. Returns default config if file doesn't exist.
    pub fn load(path: &Path) -> Result<Self, String> {
        match std::fs::read_to_string(path) {
            Ok(content) => {
                toml::from_str(&content).map_err(|e| format!("Failed to parse config: {e}"))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let config = Self::default();
                config.save(path)?;
                Ok(config)
            }
            Err(e) => Err(format!("Failed to read config: {e}")),
        }
    }

    /// Write config to a TOML file atomically.
    pub fn save(&self, path: &Path) -> Result<(), String> {
        let content =
            toml::to_string_pretty(self).map_err(|e| format!("Failed to serialize config: {e}"))?;

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {e}"))?;
        }

        // Atomic write via .tmp + rename
        let tmp = path.with_extension("toml.tmp");
        std::fs::write(&tmp, &content).map_err(|e| format!("Failed to write config tmp: {e}"))?;
        std::fs::rename(&tmp, path).map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            format!("Failed to rename config: {e}")
        })?;

        Ok(())
    }

    /// Get the API key for the currently selected provider.
    pub fn active_api_key(&self) -> Option<&str> {
        let key = match self.ai.provider.as_str() {
            "claude" => &self.ai.claude_api_key,
            "gemini" => &self.ai.gemini_api_key,
            "openai" => &self.ai.openai_api_key,
            "deepseek" => &self.ai.deepseek_api_key,
            _ => return None,
        };
        if key.is_empty() {
            None
        } else {
            Some(key)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.ai.provider, "none");
        assert_eq!(config.ai.ollama_model, "llama3.1:8b");
        assert_eq!(config.ai.ollama_url, "http://localhost:11434");
        assert!(!config.onboarding_completed);
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let path = dir.path().join("config.toml");

        let mut config = AppConfig::default();
        config.ai.provider = "claude".to_string();
        config.ai.claude_api_key = "sk-test-123".to_string();
        config.profile.role = "student".to_string();
        config.onboarding_completed = true;

        config.save(&path).expect("save");
        let loaded = AppConfig::load(&path).expect("load");

        assert_eq!(loaded.ai.provider, "claude");
        assert_eq!(loaded.ai.claude_api_key, "sk-test-123");
        assert_eq!(loaded.profile.role, "student");
        assert!(loaded.onboarding_completed);
    }

    #[test]
    fn test_load_missing_creates_default() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let path = dir.path().join("nonexistent.toml");

        let config = AppConfig::load(&path).expect("load");
        assert_eq!(config.ai.provider, "none");
        assert!(path.exists(), "should create the file");
    }

    #[test]
    fn test_active_api_key() {
        let mut config = AppConfig::default();
        assert!(config.active_api_key().is_none());

        config.ai.provider = "claude".to_string();
        assert!(config.active_api_key().is_none()); // empty key

        config.ai.claude_api_key = "sk-test".to_string();
        assert_eq!(config.active_api_key(), Some("sk-test"));
    }

    #[test]
    fn test_toml_format_is_human_readable() {
        let config = AppConfig::default();
        let content = toml::to_string_pretty(&config).expect("serialize");
        assert!(content.contains("[ai]"));
        assert!(content.contains("[profile]"));
        assert!(content.contains("provider"));
    }
}
