use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub text: String,
    pub provider: String,
    pub model: String,
}

/// Send a request to the configured AI provider.
pub async fn ai_request(
    provider: &str,
    model: &str,
    url: &str,
    api_key: Option<&str>,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<AiResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .no_proxy()
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    // Normalize localhost to 127.0.0.1 to avoid DNS resolution issues on macOS
    let url = url.replace("localhost", "127.0.0.1");

    let mut response = match provider {
        "ollama" => ollama_request(&client, &url, model, system_prompt, user_prompt, max_tokens).await,
        "claude" => claude_request(&client, api_key, system_prompt, user_prompt, max_tokens).await,
        "gemini" => gemini_request(&client, api_key, system_prompt, user_prompt, max_tokens).await,
        "openai" => openai_request(&client, api_key, model, system_prompt, user_prompt, max_tokens).await,
        "deepseek" => deepseek_request(&client, api_key, model, system_prompt, user_prompt, max_tokens).await,
        "none" | "" => Err("No AI provider configured".to_string()),
        other => Err(format!("Unknown AI provider: {}", other)),
    }?;
    response.model = model.to_string();
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
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Ollama returned {}: {}", status, text));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Invalid JSON from Ollama: {}", e))?;

    let response_text = parsed["response"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(AiResponse {
        text: response_text,
        provider: "ollama".to_string(),
        model: String::new(),
    })
}

async fn claude_request(
    client: &reqwest::Client,
    api_key: Option<&str>,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<AiResponse, String> {
    let key = api_key.ok_or("Claude API key not configured")?;

    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
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
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

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
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<AiResponse, String> {
    let key = api_key.ok_or("Gemini API key not configured")?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
        key
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
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

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
    let model_name = if model.is_empty() { "gpt-4o-mini" } else { model };

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

    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {}", e))?;

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
    let model_name = if model.is_empty() { "deepseek-chat" } else { model };

    let body = serde_json::json!({
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
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

    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {}", e))?;

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
