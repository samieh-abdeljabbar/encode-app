# AI Settings UI — Design Spec

## Context

The AI backbone (6-provider router, config management, `ai_runs` logging) is fully implemented in the Rust backend. The Settings page has a "Phase 3" placeholder where the AI configuration UI should go. This spec covers replacing that stub with a real configuration surface, plus an always-visible AI status indicator and call log.

## Scope

### In scope
- AI provider selection and API key configuration in Settings
- Profile fields (role, domain, learning context)
- Test Connection button with inline feedback
- AI status indicator in the ribbon (bottom, above Settings)
- AI log panel showing recent calls from `ai_runs` table
- New `list_ai_runs` backend command

### Out of scope
- Async AI wiring for quiz/evaluation (separate task)
- Per-feature model policy overrides (use global defaults)

## Design

### 1. Settings Page — AI Provider & Profile Section

Replace the "Phase 3" stub (Settings.tsx lines 244-255) with:

**Provider Config:**
- Dropdown: Claude, OpenAI, Gemini, Deepseek, Ollama, CLI
- API key input (type=password, with show/hide toggle) — shown for Claude/OpenAI/Gemini/Deepseek
- Ollama URL field — shown only when Ollama selected
- CLI command field — shown only when CLI selected
- Model override field (optional) — text input, shows placeholder with default model name
- "Test Connection" button — calls `check_ai_status`, shows green check or red error inline

**Profile Config:**
- Role input (e.g., "Computer Science student", "DevOps engineer")
- Domain input (e.g., "cloud infrastructure", "data science")
- Learning Context textarea (e.g., "Preparing for AWS Solutions Architect cert")

**Save behavior:**
- "Save" button calls `save_config` with the full AppConfig
- Success toast/indicator after save
- Form loads current config on mount via `get_config`

### 2. Ribbon — AI Status Button

Position: bottom of ribbon, above the Settings gear icon.

- Icon: `Brain` from lucide-react
- Status dot overlay:
  - Green (`bg-teal`): provider configured + API key present
  - Red (`bg-coral`): no provider or missing API key
- Click: opens AiLogPanel as a slide-over from the left
- Tooltip: "AI Status"

### 3. AI Log Panel

Slide-over panel that opens when clicking the ribbon AI button.

**Header:** "AI Activity" with close button
**Content:** List of recent AI calls (last 20) from `ai_runs` table

Each row shows:
- Feature name (e.g., "quiz.generate", "reader.section_check")
- Provider + model
- Status badge (success = teal, error = coral)
- Latency (e.g., "1.2s")
- Relative timestamp
- Error summary if failed (truncated)

**Empty state:** "No AI calls yet. Configure a provider in Settings to get started."

### 4. Backend — New Command

**`list_ai_runs`** — query `ai_runs` table:
```sql
SELECT id, feature, provider, model, status, latency_ms, error_summary, created_at
FROM ai_runs
ORDER BY created_at DESC
LIMIT 20
```

Returns `Vec<AiRunInfo>` with:
```rust
struct AiRunInfo {
    id: i64,
    feature: String,
    provider: String,
    model: String,
    status: String,
    latency_ms: i64,
    error_summary: Option<String>,
    created_at: String,
}
```

## Files to Modify

- `src/pages/Settings.tsx` — Replace stub with AI config form + profile form
- `src/components/layout/Ribbon.tsx` — Add AI status button
- `src/lib/tauri.ts` — Add `listAiRuns` wrapper + `AiRunInfo` type

## Files to Create

- `src/components/layout/AiLogPanel.tsx` — Slide-over log panel
- `src-tauri/src/commands/ai.rs` — Add `list_ai_runs` command (file exists, add function)
- `src-tauri/src/services/ai.rs` — Add `list_ai_runs` query function

## Verification

1. Open Settings → see provider dropdown, API key field, profile inputs
2. Select Claude → enter API key → click Test → see success/fail
3. Save → reload app → config persists
4. Check ribbon → AI status dot is green (if configured) or red
5. Click ribbon AI button → see log panel (empty if no AI calls yet)
6. `npx tsc --noEmit && npx biome check . && cargo clippy && cargo test`
