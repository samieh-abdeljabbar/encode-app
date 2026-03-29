# Sub-project 3A: AI Router — Design Spec

## Problem

The app has no AI integration. All evaluation is self-check. The blueprint specifies a multi-provider AI system where features like Reader checks, quiz generation, and teach-back evaluation can send typed requests to any configured provider.

## Solution

Build a Rust AI router service that accepts typed requests, routes to the configured provider (Claude, OpenAI, Gemini, Deepseek, Ollama), logs every call to `ai_runs`, and returns structured responses. Backend-only — no UI changes.

## Architecture

### AI Service — `services/ai.rs`

**Core function:**
```rust
async fn ai_request(
    http: &reqwest::Client,
    config: &AiConfig,
    profile: &ProfileConfig,
    request: AiRequest,
) -> Result<AiResponse, String>
```

**Request/Response types:**
```rust
struct AiRequest {
    feature: String,           // "reader.section_check", "quiz.generate", etc.
    system_prompt: String,     // feature-specific system prompt
    user_prompt: String,       // the actual content to evaluate
    model_policy: String,      // "cheap_local", "balanced", "strong_reasoning"
    timeout_ms: u64,           // per-call timeout (default 30000)
}

struct AiResponse {
    content: String,           // raw response text from the model
    provider: String,          // "claude", "openai", "gemini", "deepseek", "ollama"
    model: String,             // actual model used (e.g., "claude-sonnet-4-20250514")
    latency_ms: u64,           // time taken
}
```

### Provider Implementations

Each provider is a function: `async fn call_<provider>(http, config, system, user, model) -> Result<(String, String), String>`

**Claude** (Messages API):
- Endpoint: `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`
- Body: `{ model, max_tokens: 1024, system, messages: [{ role: "user", content }] }`

**OpenAI** (Chat Completions):
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Headers: `Authorization: Bearer {key}`
- Body: `{ model, max_tokens: 1024, messages: [{ role: "system", content: system }, { role: "user", content }] }`

**Gemini** (generateContent):
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Headers: `x-goog-api-key: {key}` (NOT in URL query — security requirement from blueprint)
- Body: `{ system_instruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text }] }] }`

**Deepseek** (OpenAI-compatible):
- Endpoint: `https://api.deepseek.com/v1/chat/completions`
- Same format as OpenAI

**Ollama** (OpenAI-compatible, local):
- Endpoint: `{ollama_url}/v1/chat/completions` (default: `http://localhost:11434`)
- Same format as OpenAI, no API key needed

### Model Policy Resolution

| Policy | Claude | OpenAI | Gemini | Deepseek | Ollama |
|---|---|---|---|---|---|
| `cheap_local` | — | — | — | — | config.ollama_model |
| `balanced` | claude-sonnet-4-20250514 | gpt-4o-mini | gemini-2.0-flash | deepseek-chat | config.ollama_model |
| `strong_reasoning` | claude-sonnet-4-20250514 | gpt-4o | gemini-2.5-pro | deepseek-reasoner | config.ollama_model |

If the policy is `cheap_local` and no Ollama is configured, fall back to the active provider's balanced model.

Config overrides: `config.toml` has per-provider model fields that override these defaults.

### Profile Injection

The `ProfileConfig` from config.toml is prepended to the system prompt:

```
You are helping a {role} studying {domain}. Context: {learning_context}.

{feature-specific system prompt}
```

### `ai_runs` Logging

Every call — success or failure — is logged to the existing `ai_runs` table:

```sql
INSERT INTO ai_runs (feature, provider, model, prompt_version, status, latency_ms, error_summary, created_at)
VALUES (?, ?, ?, 'v1', ?, ?, ?, datetime('now'))
```

- `status`: "success" or "error"
- `error_summary`: sanitized error message (no API keys). NULL on success.
- `latency_ms`: wall-clock time of the HTTP call

### Error Handling

- **No API key configured**: return error "No API key configured for {provider}"
- **HTTP timeout**: return error "Request timed out after {n}ms"
- **HTTP error (4xx/5xx)**: return error "Provider returned {status}: {sanitized body}"
- **No provider configured**: return error "AI provider is set to 'none'"
- **All errors are sanitized**: API keys, tokens, and full request bodies are never included in error messages

### IPC Command

**`ai.check_status()`** → `AiStatus`

One command to verify AI is working from the Settings page:

```rust
struct AiStatus {
    provider: String,
    configured: bool,
    has_api_key: bool,
}
```

The actual `ai_request` function is NOT exposed via IPC — it's called internally by other Rust services (reader, quiz, teachback).

## Files to Create/Modify

| File | Action |
|------|--------|
| `src-tauri/src/services/ai.rs` | Create — AI router, provider implementations, logging |
| `src-tauri/src/services/mod.rs` | Modify — export ai module |
| `src-tauri/src/commands/ai.rs` | Create — check_status command |
| `src-tauri/src/commands/mod.rs` | Modify — export ai module |
| `src-tauri/src/lib.rs` | Modify — register ai command |

## What NOT to Build

- No streaming responses (future)
- No automatic retries or failover
- No token counting or cost tracking
- No response caching
- No UI changes (this is backend-only)
- No CLI provider (future — needs command allowlist + sandbox)

## Verification

1. `cargo test` — unit tests for model policy resolution, profile injection, error sanitization
2. Integration test: configure Ollama locally, send a test request, verify `ai_runs` row created
3. `cargo check` — compiles clean
4. Verify Settings page shows AI status (provider + configured)
