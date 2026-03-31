# CLI Expansion + AI Async Wiring — Design Spec

## Context

The AI backbone supports 6 providers but the CLI allowlist is limited and no features actually call the AI router yet. Quiz generation and evaluation are deterministic-only. This spec expands the CLI allowlist and wires async AI calls to quiz generation and short-answer evaluation.

## Scope

### In scope
- Expand CLI allowlist with deepseek, codex, openai, anthropic, goose, aider
- Make quiz commands async to support AI calls
- AI-powered quiz question generation (with deterministic fallback)
- AI-powered short-answer evaluation (with self-rating fallback)
- All AI calls logged to ai_runs table
- Update Settings UI hint text for CLI commands

### Out of scope
- Reader section_check AI wiring (future)
- Teach-back evaluation (feature doesn't exist yet)
- New AI providers (API providers already supported)

## Part 1: CLI Allowlist Expansion

**File:** `src-tauri/src/services/ai.rs`

Current allowlist:
```rust
const CLI_ALLOWLIST: &[&str] = &[
    "claude", "gemini", "sgpt", "ollama", "aichat", "llm", "chatgpt",
];
```

New allowlist:
```rust
const CLI_ALLOWLIST: &[&str] = &[
    "claude", "gemini", "sgpt", "ollama", "aichat", "llm", "chatgpt",
    "deepseek", "codex", "openai", "anthropic", "goose", "aider",
];
```

**File:** `src/pages/Settings.tsx` — update hint text showing allowed commands.

## Part 2: Async AI Wiring

### Making Commands Async

**File:** `src-tauri/src/commands/quiz.rs`

Change `generate_quiz` and `submit_quiz_answer` from sync to async:

```rust
#[tauri::command]
pub async fn generate_quiz(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
) -> Result<quiz::QuizState, String> {
    // 1. Generate quiz (deterministic) inside with_conn
    let mut quiz_state = state.db.with_conn(|conn| quiz::generate_quiz(conn, chapter_id))?;

    // 2. If AI configured, try to improve questions
    let config = state.config.read().map_err(|e| e.to_string())?;
    if config.ai.provider != "none" {
        match quiz::enhance_with_ai(&state.http, &config, &quiz_state).await {
            Ok(ai_questions) => {
                // Replace deterministic questions with AI-generated ones
                // Update quiz_attempts in DB
                state.db.with_conn(|conn| {
                    quiz::replace_questions(conn, quiz_state.id, &ai_questions)
                })?;
                quiz_state.questions = ai_questions;
            }
            Err(_) => {
                // Fallback: keep deterministic questions, log the error
            }
        }
    }

    Ok(quiz_state)
}
```

Similarly for `submit_quiz_answer` — try AI evaluation for short answer, fall back to self-rating.

### New Async Functions in quiz.rs

**`enhance_with_ai(http, config, quiz_state) -> Result<Vec<QuizQuestion>>`**
- Builds system prompt from QUIZ_GENERATE_SYSTEM_PROMPT
- Builds user prompt with section headings + bodies from the quiz
- Calls `ai::ai_request()` with feature="quiz.generate", model_policy="balanced"
- Parses JSON response into Vec<QuizQuestion>
- Logs result via `ai::log_ai_result()`
- Returns error if parse fails (caller falls back to deterministic)

**`evaluate_with_ai(http, config, question, answer) -> Result<(String, String)>`**
- Builds system prompt from QUIZ_EVALUATE_SYSTEM_PROMPT
- Builds user prompt with question prompt + correct answer + user answer
- Calls `ai::ai_request()` with feature="quiz.evaluate", model_policy="balanced"
- Parses JSON response: { verdict, explanation }
- Returns (verdict, explanation)

**`replace_questions(conn, quiz_id, questions) -> Result<()>`**
- Updates quiz_attempts rows with new question_json from AI-generated questions
- Called after successful AI enhancement

### Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| AI not configured | Use deterministic generation, self-rating for short answer |
| AI call times out | Fall back to deterministic, log error to ai_runs |
| AI returns unparseable JSON | Fall back to deterministic, log error |
| AI evaluation fails | Return needs_self_rating=true, user self-rates |

### Frontend Impact

No frontend changes needed. The existing quiz flow handles both paths:
- `generateQuiz()` returns questions regardless of source (AI or deterministic)
- `submitQuizAnswer()` returns `needs_self_rating: true` when AI eval fails, `false` when it succeeds
- SelfRatePanel shows when needed, QuizFeedback shows when AI provides verdict

## Files to Modify

- `src-tauri/src/services/ai.rs` — expand CLI_ALLOWLIST
- `src-tauri/src/services/quiz.rs` — add enhance_with_ai, evaluate_with_ai, replace_questions
- `src-tauri/src/commands/quiz.rs` — make generate_quiz and submit_quiz_answer async
- `src/pages/Settings.tsx` — update CLI hint text

## Verification

1. Set CLI provider to "deepseek" → verify accepted
2. Configure Claude API key → generate quiz → verify AI-generated questions appear
3. Answer short-answer question → verify AI evaluation (no self-rating prompt)
4. Disable AI → generate quiz → verify deterministic fallback works
5. Check AI Activity log → verify calls logged
6. `cargo clippy && cargo test && npx tsc --noEmit && npx biome check .`
