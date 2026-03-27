use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub text: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone)]
pub struct AiRuntimeConfig {
    pub provider: String,
    pub model: String,
    pub url: String,
    pub api_key: Option<String>,
    pub cli_command: String,
    pub cli_args: Vec<String>,
    pub cli_workdir: String,
}

/// Send a request to the configured AI provider.
pub async fn ai_request(
    config: &AiRuntimeConfig,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<AiResponse, String> {
    if config.provider == "cli" {
        return cli_request(config, system_prompt, user_prompt).await;
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .no_proxy()
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    // Normalize localhost to 127.0.0.1 to avoid DNS resolution issues on macOS
    let url = config.url.replace("localhost", "127.0.0.1");
    let api_key = config.api_key.as_deref();

    let mut response = match config.provider.as_str() {
        "ollama" => {
            ollama_request(
                &client,
                &url,
                &config.model,
                system_prompt,
                user_prompt,
                max_tokens,
            )
            .await
        }
        "claude" => {
            claude_request(
                &client,
                api_key,
                &config.model,
                system_prompt,
                user_prompt,
                max_tokens,
            )
            .await
        }
        "gemini" => {
            gemini_request(
                &client,
                api_key,
                &config.model,
                system_prompt,
                user_prompt,
                max_tokens,
            )
            .await
        }
        "openai" => {
            openai_request(
                &client,
                api_key,
                &config.model,
                system_prompt,
                user_prompt,
                max_tokens,
            )
            .await
        }
        "deepseek" => {
            deepseek_request(
                &client,
                api_key,
                &config.model,
                system_prompt,
                user_prompt,
                max_tokens,
            )
            .await
        }
        "none" | "" => Err("No AI provider configured".to_string()),
        other => Err(format!("Unknown AI provider: {}", other)),
    }?;
    response.model = config.model.to_string();
    Ok(response)
}

async fn ollama_request(
    client: &reqwest::Client,
    url: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<AiResponse, String> {
    let body = serde_json::json!({
        "model": model,
        "prompt": user_prompt,
        "system": system_prompt,
        "stream": false,
        "options": { "num_predict": max_tokens }
    });

    let resp = client
        .post(&format!("{}/api/generate", url))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Ollama returned {}: {}", status, text));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Invalid JSON from Ollama: {}", e))?;

    let response_text = parsed["response"].as_str().unwrap_or("").to_string();

    Ok(AiResponse {
        text: response_text,
        provider: "ollama".to_string(),
        model: String::new(),
    })
}

async fn claude_request(
    client: &reqwest::Client,
    api_key: Option<&str>,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<AiResponse, String> {
    let key = api_key.ok_or("Claude API key not configured")?;
    let model_name = if model.is_empty() {
        "claude-sonnet-4-20250514"
    } else {
        model
    };

    let body = serde_json::json!({
        "model": model_name,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Claude request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Claude returned {}: {}", status, text));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Invalid JSON from Claude: {}", e))?;

    let response_text = parsed["content"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|block| block["text"].as_str())
        .unwrap_or("")
        .to_string();

    Ok(AiResponse {
        text: response_text,
        provider: "claude".to_string(),
        model: String::new(),
    })
}

async fn gemini_request(
    client: &reqwest::Client,
    api_key: Option<&str>,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<AiResponse, String> {
    let key = api_key.ok_or("Gemini API key not configured")?;
    let model_name = if model.is_empty() {
        "gemini-2.0-flash"
    } else {
        model
    };

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model_name, key
    );

    let body = serde_json::json!({
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens}
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Gemini returned {}", status));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Invalid JSON from Gemini: {}", e))?;

    let response_text = parsed["candidates"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c["content"]["parts"].as_array())
        .and_then(|parts| parts.first())
        .and_then(|p| p["text"].as_str())
        .unwrap_or("")
        .to_string();

    Ok(AiResponse {
        text: response_text,
        provider: "gemini".to_string(),
        model: String::new(),
    })
}

async fn openai_request(
    client: &reqwest::Client,
    api_key: Option<&str>,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<AiResponse, String> {
    let key = api_key.ok_or("OpenAI API key not configured")?;
    let model_name = if model.is_empty() {
        "gpt-4o-mini"
    } else {
        model
    };

    let body = serde_json::json!({
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_tokens": max_tokens,
    });

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("OpenAI returned {}: {}", status, text));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {}", e))?;

    let response_text = parsed["choices"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c["message"]["content"].as_str())
        .unwrap_or("")
        .to_string();

    Ok(AiResponse {
        text: response_text,
        provider: "openai".to_string(),
        model: String::new(),
    })
}

async fn deepseek_request(
    client: &reqwest::Client,
    api_key: Option<&str>,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<AiResponse, String> {
    let key = api_key.ok_or("DeepSeek API key not configured")?;
    let model_name = if model.is_empty() {
        "deepseek-chat"
    } else {
        model
    };

    // DeepSeek Reasoner (R1) doesn't support the "system" role —
    // merge system prompt into user message instead
    let is_reasoner = model_name.contains("reasoner");
    let messages = if is_reasoner {
        serde_json::json!([
            {"role": "user", "content": format!("{}\n\n{}", system_prompt, user_prompt)}
        ])
    } else {
        serde_json::json!([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ])
    };

    let body = serde_json::json!({
        "model": model_name,
        "messages": messages,
        "max_tokens": max_tokens,
    });

    let resp = client
        .post("https://api.deepseek.com/chat/completions")
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("DeepSeek request failed: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("DeepSeek returned {}: {}", status, text));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {}", e))?;

    let response_text = parsed["choices"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c["message"]["content"].as_str())
        .unwrap_or("")
        .to_string();

    Ok(AiResponse {
        text: response_text,
        provider: "deepseek".to_string(),
        model: String::new(),
    })
}

fn sanitize_cli_message(message: &str) -> String {
    let trimmed = message.trim();
    if trimmed.len() > 300 {
        format!("{}...", &trimmed[..300])
    } else {
        trimmed.to_string()
    }
}

async fn cli_request(
    config: &AiRuntimeConfig,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<AiResponse, String> {
    let command = config.cli_command.trim().to_string();
    if command.is_empty() {
        return Err("CLI command not configured".to_string());
    }

    let args = config.cli_args.clone();
    let workdir = config.cli_workdir.trim().to_string();
    let prompt = format!("System:\n{}\n\nUser:\n{}\n", system_prompt, user_prompt);
    let model = if config.model.is_empty() {
        Path::new(&command)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("cli")
            .to_string()
    } else {
        config.model.clone()
    };

    tauri::async_runtime::spawn_blocking(move || {
        // Interpreter-based dispatch: .sh via sh, .ps1 via powershell, else direct
        let cmd_lower = command.to_lowercase();
        let mut cmd = if cmd_lower.ends_with(".sh") {
            let mut c = Command::new("sh");
            c.arg(&command);
            c.args(&args);
            c
        } else if cmd_lower.ends_with(".ps1") {
            let mut c = Command::new("powershell.exe");
            c.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &command]);
            c.args(&args);
            c
        } else {
            let mut c = Command::new(&command);
            c.args(&args);
            c
        };

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Augment PATH for macOS/Linux GUI apps that have restricted PATH
        #[cfg(unix)]
        {
            let home = std::env::var("HOME").unwrap_or_default();
            let current_path = std::env::var("PATH").unwrap_or_default();
            let extra = [
                "/usr/local/bin",
                "/opt/homebrew/bin",
                &format!("{}/.local/bin", home),
                &format!("{}/.cargo/bin", home),
            ];
            let augmented = format!("{}:{}", extra.join(":"), current_path);
            cmd.env("PATH", augmented);
        }

        if !workdir.is_empty() {
            cmd.current_dir(&workdir);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("CLI launch failed: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(prompt.as_bytes())
                .map_err(|e| format!("Failed to write prompt to CLI stdin: {}", e))?;
            // stdin dropped here — sends EOF to the child process
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to read CLI response: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if !output.status.success() {
            let detail = if stderr.is_empty() {
                String::new()
            } else {
                format!(": {}", sanitize_cli_message(&stderr))
            };
            return Err(format!("CLI returned {}{}", output.status, detail));
        }

        if stdout.is_empty() {
            return Err(if stderr.is_empty() {
                "CLI returned an empty response".to_string()
            } else {
                format!("CLI returned no stdout: {}", sanitize_cli_message(&stderr))
            });
        }

        Ok(AiResponse {
            text: stdout,
            provider: "cli".to_string(),
            model,
        })
    })
    .await
    .map_err(|e| format!("CLI task failed: {}", e))?
}
