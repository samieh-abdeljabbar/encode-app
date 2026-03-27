# Encode Improvement Plan

## Summary

This plan turns the app review into an implementation-ready roadmap focused on four areas:

- fix trust-breaking bugs in vault safety, digestion progress, date handling, and stale tests
- strengthen weak architecture around AI config, rendering/theme consistency, and search UX
- add high-value study workflow improvements without bloating the product
- introduce a local CLI-agent provider so users can use command-line AI tools without API keys

The implementation should preserve the core product rule that markdown files remain the source of truth and SQLite remains an index/cache only.

## Priority 1 Fixes

### Vault path safety

- Harden all vault write, rename, and directory operations so destination paths are validated before filesystem mutation.
- Reject absolute paths and any destination that escapes the vault root.
- Apply the same boundary validation standard to file writes, file renames, directory creates, and directory renames.
- Keep error messages user-safe and consistent with existing Tauri command patterns.

### Reader completion accuracy

- Change chapter digestion completion so `status: digested` is written only after the reader has truly completed the final readable section, not when the last section is merely revealed.
- Ensure progress/mastery calculations and any downstream readiness UI reflect this corrected definition.
- Preserve current digestion markdown output format unless a bug fix requires a minimal change.

### Local date correctness

- Replace UTC-based date helpers used for daily commitments, due cards, and spaced repetition with local-date helpers based on the user’s machine timezone.
- Standardize one shared frontend date utility for `YYYY-MM-DD` local dates and reuse it across Home, app store helpers, flashcards, SR, quiz save naming, and tracking where appropriate.
- Verify that “today,” due counts, streaks, and saved filenames behave correctly near local midnight.

### Test suite health

- Update the outdated gate-skip test to match the current adaptive gating logic.
- Add regression coverage for the corrected vault-boundary behavior, final-section digestion behavior, and local-date handling.
- Keep `npm test`, `npx tsc --noEmit`, and `cargo check` green as baseline acceptance criteria.

## Architecture Improvements

### AI config model cleanup

- Replace the overloaded `ollamaModel` usage with provider-aware model settings.
- Extend the app config shape to support at least:
  - `ai_provider`
  - `ollama_model`
  - `ollama_url`
  - `openai_model`
  - `deepseek_model`
  - `claude_model`
  - `gemini_model`
  - `api_key`
- Keep backward compatibility by reading older configs that only contain `ollama_model` and mapping sensible defaults for cloud providers.
- Use structured Rust deserialization for config loading/saving instead of line-by-line parsing.

### Theme/rendering consistency

- Make Mermaid rendering theme-aware so diagrams follow the active app theme instead of always using the dark palette.
- Fix the theme picker so active-state UI updates immediately after selecting a theme.
- Preserve current markdown sanitization behavior, including quiz result styling and escaped quiz free-text.

### Quick Switcher quality

- Change Quick Switcher from per-open full reload plus substring filtering to a cached file list with lightweight fuzzy matching.
- Continue showing file type and subject metadata, but improve ranking so partial names and abbreviation-style queries work better.
- Avoid introducing heavy search dependencies unless needed; prefer a small deterministic matcher first.

## Additions

### Study Queue

- Add a unified “Study Queue” experience that combines:
  - due flashcards
  - at-risk cards
  - weak quiz topics
  - unfinished reading targets
  - flagged quiz questions
- Place it where it complements the dashboard instead of replacing existing pages.
- Back it with existing markdown plus SQLite-derived signals; do not introduce new source-of-truth data in the database.

### Better no-AI fallback

- Improve `provider = none` behavior so digestion gates, quiz flows, and teach-back flows degrade gracefully with local heuristics and helpful copy instead of simply losing most of the coaching value.
- Do not try to replicate full AI evaluation locally; focus on predictable prompts, rule-based feedback, and clean disabled states where necessary.

## CLI Agent Integration

### Product goal

- Allow Encode to use a local CLI-based AI tool so users can get AI features without entering API keys.
- Keep the frontend contract unchanged: the app still calls a single AI request path and the backend chooses the provider.

### Provider design

- Add a new provider value: `cli`.
- Route `ai_request_cmd` to a new backend adapter when `ai_provider = "cli"`.
- Keep the frontend on the existing `aiRequest(systemPrompt, userPrompt, maxTokens)` interface.

### Backend behavior

- Implement a CLI adapter that launches a hidden child process, sends a structured request on `stdin`, and reads a structured response from `stdout`.
- Do not depend on scraping a visible terminal window.
- Use a simple request/response JSON protocol:
  - request: `system_prompt`, `user_prompt`, `max_tokens`
  - response: `text`, `provider`, `model`
- Return errors as normal Tauri command errors with sanitized messages.

### Execution model

- Start with one-shot request/response execution for reliability.
- Defer session reuse and response streaming until the basic provider is stable.
- If streaming is added later, use Tauri events rather than changing the base command contract first.

### Safety and packaging

- Do not allow arbitrary shell command entry from the UI.
- Restrict execution to either:
  - an allowlisted configured executable path, or
  - a bundled sidecar binary
- Prefer a sidecar-capable design in Tauri so packaged builds remain predictable.
- Add the required Tauri shell/sidecar permissions and config only as narrowly as needed.

### Config additions

- Extend app config for CLI support with:
  - `cli_command` or sidecar identifier
  - optional `cli_args`
  - optional `cli_workdir`
- Default to empty values so the provider is inert until configured.
- Validate configuration before enabling the `cli` provider in settings.

### Settings UI

- Add a new “CLI Agent” provider option beside existing AI providers.
- Show setup guidance explaining that Encode will call a local CLI tool in the background and no API key is required.
- Provide a connection test action similar to existing providers.
- Keep terminology simple and user-facing; avoid exposing implementation jargon like stdin/stdout in the UI.

## Public Interface Changes

- `AppConfig` gains provider-specific model fields and CLI provider fields.
- `ai_provider` valid values expand to include `cli`.
- The frontend `aiRequest()` signature stays unchanged.
- Tauri backend gains CLI-provider execution support behind the existing `ai_request_cmd`.
- Any new helper types for config parsing should be internal unless needed by the frontend settings screen.

## Test Plan

- Unit tests for local-date helpers around midnight and timezone-sensitive boundaries.
- Rust tests or targeted validation coverage for rejecting absolute and escaping vault paths.
- Reader tests confirming a chapter is marked digested only after true completion.
- Settings/config tests covering backward compatibility with older config files.
- Quick Switcher tests for ranking and matching common partial/fuzzy queries.
- CLI provider tests for:
  - valid JSON round-trip
  - malformed output
  - process failure
  - timeout handling
  - disabled or missing executable configuration
- Full verification baseline:
  - `npm test`
  - `npx tsc --noEmit`
  - `cargo check`

## Defaults And Assumptions

- Markdown remains the only source of truth for user knowledge artifacts.
- SQLite continues to store only index/cache/analytics data and may be rebuilt without knowledge loss.
- The first CLI-agent version uses one-shot background execution, not persistent sessions.
- CLI execution is allowlisted and not an arbitrary shell runner.
- Existing quiz result rendering and DOMPurify behavior should be preserved unless a security fix requires narrowing it.
- Backward compatibility for existing `config.toml` files is required.
