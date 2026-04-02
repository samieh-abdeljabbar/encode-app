# Inline AI Q&A Feature Design

## Overview

Highlight text in any editor (study chapters or notes), ask AI a question about it, and get an inline answer. Keep the answer as a note callout, a flashcard, both, or dismiss it.

## Triggers

1. **Floating toolbar** — when user selects text, a small toolbar appears near the selection with an "Ask AI" button
2. **Right-click context menu** — highlight text → right-click → "Ask AI" option

Both open the same inline question input below the selection.

## User Flow

1. User highlights text in the CM6 editor
2. Floating toolbar appears above selection with "Ask AI" button (or right-click → Ask AI)
3. Click "Ask AI" → small input appears below selection: "Ask a question about this..."
4. User types question → Enter
5. Loading spinner while AI processes
6. AI answer appears in a styled card below the input
7. Four buttons: **Keep as Note** | **Keep as Flashcard** | **Keep Both** | **Dismiss**

## Actions

### Keep as Note
Inserts a callout block into the document at the selection position:
```markdown
> [!ai] Q: What does this mean?
> The answer from AI goes here...
```

### Keep as Flashcard
Creates a card via existing `createCard()` IPC:
- prompt = user's question
- answer = AI response
- source_type = "ai_inline"
- card_type = "basic"
- subject_id from current chapter/note context

### Keep Both
Inserts callout AND creates flashcard.

### Dismiss
Closes the answer widget, nothing saved.

## Backend

### New command: `ask_inline_question`

```rust
#[tauri::command]
pub async fn ask_inline_question(
    state: State<AppState>,
    context: String,    // the highlighted text
    question: String,   // the user's question
) -> Result<String, String>
```

System prompt: "You are a helpful study assistant. The student has highlighted some text and is asking a question about it. Answer clearly and concisely in 2-4 sentences. Focus on explanation, not just restating the text."

User prompt: "Highlighted text: {context}\n\nQuestion: {question}"

- Feature: `"inline.question"`
- Model policy: `balanced`
- Timeout: 60s
- Falls back to error message if AI not configured

### source_type constraint
Add `'ai_inline'` to the cards source_type CHECK constraint (migration 006).

## Frontend

### New CM6 extension: `src/components/editor/cm-ask-ai.ts`

**Floating toolbar:**
- ViewPlugin that watches selection changes
- When selection is non-empty (text highlighted), show a small floating div above the selection
- Contains: "Ask AI" button (sparkle icon)
- Positioned using `view.coordsAtPos()`
- Hides when selection is cleared

**Inline question/answer widget:**
- When "Ask AI" clicked, insert a CM6 widget decoration below the selection
- Widget contains: text input, submit button
- On submit: calls `askInlineQuestion()` IPC, shows loading, then shows answer
- Answer card has 4 buttons: Keep as Note, Keep as Flashcard, Keep Both, Dismiss

### Integration

Wire the extension into:
- `src/pages/Workspace.tsx` — chapter editor (ChapterEditor inner component)
- `src/pages/NoteEditor.tsx` — note editor

Pass context (subjectId, chapterId) so flashcard creation knows where to save.

## IPC Types

```typescript
export const askInlineQuestion = (context: string, question: string) =>
  invoke<string>("ask_inline_question", { context, question });
```

## No New Dependencies

Uses existing: AI router, createCard IPC, CM6 widget system.

## Testing

- Backend: test that ask_inline_question calls AI router correctly
- Frontend: `npx tsc --noEmit` + `npx biome check .`
