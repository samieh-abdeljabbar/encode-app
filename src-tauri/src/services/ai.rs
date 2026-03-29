// Functions in this module are called by commands::ai and other services.
// They are declared pub so the commands layer can use them; dead_code lint
// fires until Task 2 (commands/ai.rs) wires them up.
#![allow(dead_code)]

use crate::services::config::{AiConfig, ProfileConfig};
use rusqlite::Connection;
use serde::Serialize;
use std::time::Instant;

#[derive(Debug)]
pub struct AiRequest {
    pub feature: String,
    pub system_prompt: String,
    pub user_prompt: String,
    pub model_policy: String,
    pub timeout_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct AiResponse {
    pub content: String,
    pub provider: String,
    pub model: String,
    pub latency_ms: u64,
}

#[derive(Serialize)]
pub struct AiStatus {
    pub provider: String,
    pub configured: bool,
    pub has_api_key: bool,
}

/// Build the full system prompt with profile context prepended.
pub fn build_system_prompt(profile: &ProfileConfig, feature_prompt: &str) -> String {
    let mut parts = Vec::new();

    if !profile.role.is_empty() || !profile.domain.is_empty() {
        let role = if profile.role.is_empty() { "learner" } else { &profile.role };
        let domain = if profile.domain.is_empty() { "general studies" } else { &profile.domain };
        let mut ctx = format!("You are helping a {role} studying {domain}.");
        if !profile.learning_context.is_empty() {
            ctx.push_str(&format!(" Context: {}.", profile.learning_context));
        }
        parts.push(ctx);
    }

    parts.push(feature_prompt.to_string());
    parts.join("\n\n")
}

/// Resolve model policy + provider → concrete model name.
pub fn resolve_model(config: &AiConfig, policy: &str) -> (String, String) {
    let provider = config.provider.as_str();

    // Check for config overrides first
    let override_model: Option<&str> = match provider {
        "claude" if !config.claude_model.is_empty() => Some(&config.claude_model),
        "openai" if !config.openai_model.is_empty() => Some(&config.openai_model),
        "gemini" if !config.gemini_model.is_empty() => Some(&config.gemini_model),
        "deepseek" if !config.deepseek_model.is_empty() => Some(&config.deepseek_model),
        "ollama" if !config.ollama_model.is_empty() => Some(&config.ollama_model),
        _ => None,
    };

    if let Some(m) = override_model {
        return (provider.to_string(), m.to_string());
    }

    let model = match (provider, policy) {
        // Cheap local — prefer Ollama
        (_, "cheap_local") if !config.ollama_url.is_empty() => {
            return ("ollama".to_string(), config.ollama_model.clone());
        }

        // Claude
        ("claude", "balanced") => "claude-sonnet-4-20250514",
        ("claude", "strong_reasoning") => "claude-sonnet-4-20250514",

        // OpenAI
        ("openai", "balanced") => "gpt-4o-mini",
        ("openai", "strong_reasoning") => "gpt-4o",

        // Gemini
        ("gemini", "balanced") => "gemini-2.0-flash",
        ("gemini", "strong_reasoning") => "gemini-2.5-pro",

        // Deepseek
        ("deepseek", "balanced") => "deepseek-chat",
        ("deepseek", "strong_reasoning") => "deepseek-reasoner",

        // Ollama
        ("ollama", _) => return ("ollama".to_string(), config.ollama_model.clone()),

        // CLI — model is the command itself
        ("cli", _) => return ("cli".to_string(), config.cli_command.clone()),

        // Fallback
        _ => "unknown",
    };

    (provider.to_string(), model.to_string())
}

/// Sanitize error messages to never leak API keys.
fn sanitize_error(err: &str, config: &AiConfig) -> String {
    let mut sanitized = err.to_string();
    let keys = [
        &config.claude_api_key,
        &config.gemini_api_key,
        &config.openai_api_key,
        &config.deepseek_api_key,
    ];
    for key in keys {
        if !key.is_empty() && sanitized.contains(key.as_str()) {
            sanitized = sanitized.replace(key.as_str(), "[REDACTED]");
        }
    }
    // Truncate long error bodies
    if sanitized.len() > 500 {
        sanitized.truncate(500);
        sanitized.push_str("...");
    }
    sanitized
}

/// Log an AI call to the ai_runs table.
fn log_ai_run(
    conn: &Connection,
    feature: &str,
    provider: &str,
    model: &str,
    status: &str,
    latency_ms: u64,
    error_summary: Option<&str>,
) {
    let _ = conn.execute(
        "INSERT INTO ai_runs (feature, provider, model, prompt_version, status, latency_ms, error_summary, created_at)
         VALUES (?1, ?2, ?3, 'v1', ?4, ?5, ?6, datetime('now'))",
        rusqlite::params![feature, provider, model, status, latency_ms as i64, error_summary],
    );
}

// ── Provider call functions ──

async fn call_openai_compatible(
    http: &reqwest::Client,
    endpoint: &str,
    api_key: Option<&str>,
    model: &str,
    system: &str,
    user: &str,
    timeout_ms: u64,
) -> Result<(String, String), String> {
    let mut builder = http
        .post(endpoint)
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .header("Content-Type", "application/json");

    if let Some(key) = api_key {
        builder = builder.header("Authorization", format!("Bearer {key}"));
    }

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ]
    });

    let resp = builder
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Provider returned {status}: {}", &text[..text.len().min(200)]));
    }

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let used_model = json["model"].as_str().unwrap_or(model).to_string();

    Ok((content, used_model))
}

async fn call_claude(
    http: &reqwest::Client,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    timeout_ms: u64,
) -> Result<(String, String), String> {
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "system": system,
        "messages": [
            { "role": "user", "content": user }
        ]
    });

    let resp = http
        .post("https://api.anthropic.com/v1/messages")
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .header("Content-Type", "application/json")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Provider returned {status}: {}", &text[..text.len().min(200)]));
    }

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let content = json["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let used_model = json["model"].as_str().unwrap_or(model).to_string();

    Ok((content, used_model))
}

async fn call_gemini(
    http: &reqwest::Client,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    timeout_ms: u64,
) -> Result<(String, String), String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    );

    let body = serde_json::json!({
        "system_instruction": {
            "parts": [{ "text": system }]
        },
        "contents": [{
            "parts": [{ "text": user }]
        }]
    });

    let resp = http
        .post(&url)
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Provider returned {status}: {}", &text[..text.len().min(200)]));
    }

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let content = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok((content, model.to_string()))
}

// ── CLI provider ──

const CLI_ALLOWLIST: &[&str] = &[
    "claude", "gemini", "sgpt", "ollama", "aichat", "llm", "chatgpt",
];

const CLI_BLOCKLIST: &[&str] = &[
    "rm", "dd", "bash", "sh", "zsh", "curl", "wget", "python", "node",
    "sudo", "chmod", "chown", "kill", "mkfs", "fdisk",
];

fn validate_cli_command(command: &str) -> Result<(), String> {
    let base = command.split('/').last().unwrap_or(command);
    if CLI_BLOCKLIST.contains(&base) {
        return Err(format!("CLI command '{base}' is blocked for security"));
    }
    if !CLI_ALLOWLIST.contains(&base) {
        return Err(format!(
            "CLI command '{base}' is not in the allowlist. Allowed: {}",
            CLI_ALLOWLIST.join(", ")
        ));
    }
    Ok(())
}

fn call_cli_blocking(
    command: &str,
    args: &[String],
    system: &str,
    user: &str,
    timeout_ms: u64,
) -> Result<(String, String), String> {
    validate_cli_command(command)?;

    let full_prompt = format!("{system}\n\n{user}");

    let mut child = std::process::Command::new(command)
        .args(args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn CLI command '{command}': {e}"))?;

    // Write prompt to stdin
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(full_prompt.as_bytes());
        // stdin is dropped here, closing the pipe
    }

    // Wait with timeout
    let timeout = std::time::Duration::from_millis(timeout_ms);
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break,
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    return Err(format!("CLI command timed out after {timeout_ms}ms"));
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => return Err(format!("Failed to wait for CLI: {e}")),
        }
    }

    let output = child.wait_with_output()
        .map_err(|e| format!("CLI command failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "CLI exited with {}: {}",
            output.status,
            &stderr[..stderr.len().min(200)]
        ));
    }

    let content = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((content, format!("cli:{command}")))
}

// ── Main router ──

/// Send an AI request to the configured provider.
/// This is called internally by other services — not exposed via IPC.
pub async fn ai_request(
    http: &reqwest::Client,
    config: &AiConfig,
    profile: &ProfileConfig,
    request: AiRequest,
) -> Result<AiResponse, String> {
    if config.provider == "none" {
        return Err("AI provider is set to 'none'".to_string());
    }

    let (provider, model) = resolve_model(config, &request.model_policy);
    let system = build_system_prompt(profile, &request.system_prompt);
    let start = Instant::now();

    let result = match provider.as_str() {
        "claude" => {
            let key = &config.claude_api_key;
            if key.is_empty() {
                return Err("No API key configured for claude".to_string());
            }
            call_claude(http, key, &model, &system, &request.user_prompt, request.timeout_ms).await
        }
        "openai" => {
            let key = &config.openai_api_key;
            if key.is_empty() {
                return Err("No API key configured for openai".to_string());
            }
            call_openai_compatible(
                http, "https://api.openai.com/v1/chat/completions",
                Some(key), &model, &system, &request.user_prompt, request.timeout_ms,
            ).await
        }
        "gemini" => {
            let key = &config.gemini_api_key;
            if key.is_empty() {
                return Err("No API key configured for gemini".to_string());
            }
            call_gemini(http, key, &model, &system, &request.user_prompt, request.timeout_ms).await
        }
        "deepseek" => {
            let key = &config.deepseek_api_key;
            if key.is_empty() {
                return Err("No API key configured for deepseek".to_string());
            }
            call_openai_compatible(
                http, "https://api.deepseek.com/v1/chat/completions",
                Some(key), &model, &system, &request.user_prompt, request.timeout_ms,
            ).await
        }
        "ollama" => {
            let endpoint = format!("{}/v1/chat/completions", config.ollama_url);
            call_openai_compatible(
                http, &endpoint,
                None, &model, &system, &request.user_prompt, request.timeout_ms,
            ).await
        }
        "cli" => {
            if config.cli_command.is_empty() {
                return Err("No CLI command configured".to_string());
            }
            call_cli_blocking(
                &config.cli_command, &config.cli_args,
                &system, &request.user_prompt, request.timeout_ms,
            )
        }
        _ => Err(format!("Unknown provider: {provider}")),
    };

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok((content, used_model)) => Ok(AiResponse {
            content,
            provider,
            model: used_model,
            latency_ms,
        }),
        Err(e) => Err(sanitize_error(&e, config)),
    }
}

/// Log an AI call result. Call this after ai_request returns.
/// Separated from ai_request because the DB connection isn't async.
pub fn log_result(
    conn: &Connection,
    feature: &str,
    response: Result<&AiResponse, &str>,
) {
    match response {
        Ok(r) => log_ai_run(conn, feature, &r.provider, &r.model, "success", r.latency_ms, None),
        Err(e) => log_ai_run(conn, feature, "unknown", "unknown", "error", 0, Some(e)),
    }
}

pub fn check_status(config: &AiConfig) -> AiStatus {
    let provider = config.provider.clone();
    let configured = provider != "none";
    let has_api_key = match provider.as_str() {
        "claude" => !config.claude_api_key.is_empty(),
        "openai" => !config.openai_api_key.is_empty(),
        "gemini" => !config.gemini_api_key.is_empty(),
        "deepseek" => !config.deepseek_api_key.is_empty(),
        "ollama" => true, // no key needed
        "cli" => !config.cli_command.is_empty(),
        _ => false,
    };
    AiStatus { provider, configured, has_api_key }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::config::{AiConfig, ProfileConfig};

    fn default_config() -> AiConfig {
        AiConfig {
            provider: "claude".to_string(),
            ollama_model: "llama3.1:8b".to_string(),
            ollama_url: "http://localhost:11434".to_string(),
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

    #[test]
    fn test_resolve_model_claude_balanced() {
        let config = default_config();
        let (provider, model) = resolve_model(&config, "balanced");
        assert_eq!(provider, "claude");
        assert_eq!(model, "claude-sonnet-4-20250514");
    }

    #[test]
    fn test_resolve_model_openai_strong() {
        let mut config = default_config();
        config.provider = "openai".to_string();
        let (_, model) = resolve_model(&config, "strong_reasoning");
        assert_eq!(model, "gpt-4o");
    }

    #[test]
    fn test_resolve_model_cheap_local_uses_ollama() {
        let config = default_config();
        let (provider, model) = resolve_model(&config, "cheap_local");
        assert_eq!(provider, "ollama");
        assert_eq!(model, "llama3.1:8b");
    }

    #[test]
    fn test_resolve_model_config_override() {
        let mut config = default_config();
        config.claude_model = "claude-opus-4-20250514".to_string();
        let (_, model) = resolve_model(&config, "balanced");
        assert_eq!(model, "claude-opus-4-20250514");
    }

    #[test]
    fn test_build_system_prompt_with_profile() {
        let profile = ProfileConfig {
            role: "student".to_string(),
            domain: "physics".to_string(),
            learning_context: "AP Physics C".to_string(),
        };
        let result = build_system_prompt(&profile, "Evaluate this response.");
        assert!(result.contains("student"));
        assert!(result.contains("physics"));
        assert!(result.contains("AP Physics C"));
        assert!(result.contains("Evaluate this response."));
    }

    #[test]
    fn test_build_system_prompt_empty_profile() {
        let profile = ProfileConfig::default();
        let result = build_system_prompt(&profile, "Evaluate this.");
        assert_eq!(result, "Evaluate this.");
    }

    #[test]
    fn test_sanitize_error_redacts_key() {
        let mut config = default_config();
        config.claude_api_key = "sk-ant-secret123".to_string();
        let err = "Request failed with key sk-ant-secret123 in header";
        let sanitized = sanitize_error(err, &config);
        assert!(!sanitized.contains("sk-ant-secret123"));
        assert!(sanitized.contains("[REDACTED]"));
    }

    #[test]
    fn test_sanitize_error_truncates_long() {
        let config = default_config();
        let long_err = "x".repeat(1000);
        let sanitized = sanitize_error(&long_err, &config);
        assert!(sanitized.len() <= 504); // 500 + "..."
    }

    #[test]
    fn test_check_status_none() {
        let mut config = default_config();
        config.provider = "none".to_string();
        let status = check_status(&config);
        assert!(!status.configured);
    }

    #[test]
    fn test_check_status_ollama_no_key_needed() {
        let mut config = default_config();
        config.provider = "ollama".to_string();
        let status = check_status(&config);
        assert!(status.configured);
        assert!(status.has_api_key);
    }

    #[test]
    fn test_check_status_claude_no_key() {
        let config = default_config();
        let status = check_status(&config);
        assert!(status.configured);
        assert!(!status.has_api_key);
    }

    #[test]
    fn test_check_status_claude_with_key() {
        let mut config = default_config();
        config.claude_api_key = "sk-test".to_string();
        let status = check_status(&config);
        assert!(status.configured);
        assert!(status.has_api_key);
    }

    #[test]
    fn test_cli_allowlist_accepts_claude() {
        assert!(validate_cli_command("claude").is_ok());
    }

    #[test]
    fn test_cli_allowlist_accepts_gemini() {
        assert!(validate_cli_command("gemini").is_ok());
    }

    #[test]
    fn test_cli_blocklist_rejects_rm() {
        assert!(validate_cli_command("rm").is_err());
    }

    #[test]
    fn test_cli_blocklist_rejects_bash() {
        assert!(validate_cli_command("bash").is_err());
    }

    #[test]
    fn test_cli_unknown_command_rejected() {
        assert!(validate_cli_command("my_random_tool").is_err());
    }

    #[test]
    fn test_cli_full_path_uses_basename() {
        assert!(validate_cli_command("/usr/local/bin/claude").is_ok());
    }

    #[test]
    fn test_check_status_cli_with_command() {
        let mut config = default_config();
        config.provider = "cli".to_string();
        config.cli_command = "claude".to_string();
        let status = check_status(&config);
        assert!(status.configured);
        assert!(status.has_api_key);
    }

    #[test]
    fn test_check_status_cli_no_command() {
        let mut config = default_config();
        config.provider = "cli".to_string();
        let status = check_status(&config);
        assert!(status.configured);
        assert!(!status.has_api_key);
    }

    #[test]
    fn test_resolve_model_cli() {
        let mut config = default_config();
        config.provider = "cli".to_string();
        config.cli_command = "claude".to_string();
        let (provider, model) = resolve_model(&config, "balanced");
        assert_eq!(provider, "cli");
        assert_eq!(model, "claude");
    }
}
