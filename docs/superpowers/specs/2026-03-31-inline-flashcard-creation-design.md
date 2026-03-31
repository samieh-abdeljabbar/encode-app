# Inline Flashcard Creation — Design Spec

## Context

The chapter editor has a `/flashcard` slash command that inserts `Q: \nA: ` template text, but doesn't create a real card in the database. Users want to create flashcards while taking notes and have them immediately appear in the Cards page and review queue.

## Scope

- Modify `/flashcard` slash command to open an inline form
- Create card in DB via existing `create_card` command
- Insert Q:/A: reference text into editor after creation
- No backend changes needed

## Design

### Flow

1. User types `/flashcard` in editor → slash menu appears → selects Flashcard
2. Inline form appears below cursor position
3. User fills in: Prompt (Q), Answer (A), Card Type (Basic/Cloze/Reversed)
4. Click "Create" or press Ctrl+Enter
5. Card saved via `createCard(subjectId, chapterId, prompt, answer, cardType)`
6. `Q: {prompt}\nA: {answer}` inserted into editor at cursor
7. Form dismisses

### Component: FlashcardInlineForm

Rendered inside `MarkdownEditor.tsx`. Positioned absolutely at cursor coordinates.

**Props:**
- `position: { top: number; left: number }` — cursor screen coords
- `subjectId: number`
- `chapterId: number`
- `onCreated: (prompt: string, answer: string) => void` — callback to insert text
- `onCancel: () => void`

**UI:**
- Small card (280px wide) with subtle border + shadow
- Prompt textarea (2 rows, placeholder "Question / front")
- Answer textarea (2 rows, placeholder "Answer / back")
- Card type select: Basic, Cloze, Reversed (default: Basic)
- Create button + Cancel link
- Escape to cancel, Ctrl+Enter to create

**Style:** Same as existing editor UI — `bg-panel`, `border-border`, `rounded-xl`, `text-sm`

### Changes to cm-slash.ts

The `flashcard` command's `insert` function currently returns `"Q: \nA: "`. Change it to return an empty string and instead trigger an external callback. Add an `onFlashcard` callback option to the slash command system.

The `SlashCommand` interface needs an optional `action` field:
```typescript
interface SlashCommand {
  name: string;
  label: string;
  description: string;
  insert: (view: EditorView) => string;
  action?: (view: EditorView) => void;  // custom action instead of insert
}
```

When `action` is defined, the plugin calls it instead of inserting text.

### Changes to MarkdownEditor.tsx

- Add state: `flashcardForm: { top: number; left: number } | null`
- Pass a callback to the slash commands extension that sets the form position
- Render `<FlashcardInlineForm>` when state is set
- On create: call `createCard()`, insert Q/A text into editor, clear state

## Files to Create

- `src/components/editor/FlashcardInlineForm.tsx`

## Files to Modify

- `src/components/editor/cm-slash.ts` — add `action` field to SlashCommand, update flashcard command
- `src/components/editor/MarkdownEditor.tsx` — add form state + rendering

## Verification

1. Open a chapter in the editor
2. Type `/flashcard` → select from menu
3. Inline form appears at cursor
4. Fill Q and A → click Create
5. Card appears in Cards page immediately
6. Q:/A: text inserted into editor
7. `npx tsc --noEmit && npx biome check . && cargo clippy && cargo test`
