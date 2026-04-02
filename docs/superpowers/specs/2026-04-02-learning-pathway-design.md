# AI Learning Pathway Generator Design

## Overview

A wizard on the Queue page where you tell the AI what you want to learn. AI generates a curriculum outline, you review/edit it, then AI generates all chapter content, flashcards, and suggested sources. Everything lands in Library as a normal subject.

## User Flow

### Step 1: Input (one screen)
- "What do you want to learn?" — free text (e.g., "Docker containerization")
- Mastery level: Beginner / Intermediate / Expert
- Scope: Quick Overview (3-4 chapters) / Standard Course (6-8) / Deep Dive (10-15)
- "Generate Outline" button

### Step 2: Review Outline (AI generates, you approve)
- AI returns a proposed subject name + chapter list with titles and brief descriptions
- You can: edit chapter titles, reorder, delete chapters, add your own
- Each chapter shows estimated reading time
- "Generate Curriculum" button to proceed
- Pixel cat loading animation during generation

### Step 3: Generation (AI bulk creates everything)
- For each chapter: AI generates markdown content (2-4 sections each), with citations/references
- For each chapter: AI generates 3-5 flashcards from key concepts
- For each chapter: AI suggests 2-3 real URLs for further reading (optional import)
- Progress bar showing "Generating chapter 3 of 8..."
- All content stored as a normal subject with chapters in Library

### Step 4: Done
- Summary: "Created [subject] with X chapters, Y flashcards"
- "Start Studying" button → goes to Queue/Library
- "Import Suggested Sources" → shows the URL suggestions, one-click import

## AI Prompts

### Outline Generation (one AI call)
- Input: topic, mastery level, scope
- Output: JSON with subject name + array of {title, description, estimated_minutes}
- Model policy: `balanced`, timeout: 60s

System prompt:
```
You are a curriculum designer. Given a learning topic, mastery level, and scope, create a structured course outline.

Return JSON only:
{
  "subject_name": "Course title",
  "chapters": [
    {
      "title": "Chapter title",
      "description": "Brief description of what this chapter covers",
      "estimated_minutes": 10
    }
  ]
}

Rules:
- Chapter titles should be clear and specific
- Order chapters from foundational to advanced
- For beginner: focus on core concepts, definitions, practical basics
- For intermediate: assume fundamentals, focus on application and deeper understanding
- For expert: assume strong foundation, focus on advanced topics, edge cases, best practices
- Quick Overview: 3-4 chapters
- Standard Course: 6-8 chapters
- Deep Dive: 10-15 chapters
- Return ONLY valid JSON, no markdown fences
```

### Chapter Content Generation (one AI call per chapter)
- Input: topic, mastery level, chapter title/description, chapter position in curriculum
- Output: markdown content + flashcards + suggested URLs
- Model policy: `balanced`, timeout: 90s

System prompt:
```
You are a study content writer. Given a chapter topic within a course, generate comprehensive study material.

Return JSON only:
{
  "content": "Full markdown content with ## section headings, explanations, examples, and code if relevant. Include a ## References section at the bottom with cited sources.",
  "flashcards": [
    {"prompt": "Question testing a key concept", "answer": "Clear, concise answer"}
  ],
  "suggested_urls": [
    {"title": "Resource title", "url": "https://..."}
  ]
}

Rules:
- Content should have 2-4 sections with ## headings
- Write for the specified mastery level (beginner/intermediate/expert)
- Include concrete examples and practical applications
- For beginner: explain terms, use analogies, step-by-step
- For intermediate: assume basics, go deeper, show patterns
- For expert: advanced techniques, trade-offs, real-world considerations
- Generate 3-5 flashcards per chapter testing key concepts (use "why" and "how" questions, not just "what")
- Suggest 2-3 real, well-known URLs for further reading (official docs, reputable tutorials)
- Content should be 500-1500 words depending on complexity
- Return ONLY valid JSON, no markdown fences
```

## Backend

### Service: `src-tauri/src/services/pathway.rs`

Types:
```rust
struct PathwayOutline {
    subject_name: String,
    chapters: Vec<ChapterOutline>,
}

struct ChapterOutline {
    title: String,
    description: String,
    estimated_minutes: i32,
}

struct ChapterContent {
    content: String,
    flashcards: Vec<FlashcardPair>,
    suggested_urls: Vec<SuggestedUrl>,
}

struct FlashcardPair {
    prompt: String,
    answer: String,
}

struct SuggestedUrl {
    title: String,
    url: String,
}

struct PathwayResult {
    subject_id: i64,
    subject_name: String,
    chapters_created: i32,
    flashcards_created: i32,
    suggested_urls: Vec<SuggestedUrl>,
}
```

Functions:
- `generate_outline(http, config, topic, mastery, scope)` → async, calls AI, returns PathwayOutline
- `generate_chapter_content(http, config, topic, mastery, chapter)` → async, calls AI, returns ChapterContent
- `create_pathway(conn, outline, chapter_contents)` → sync, creates subject + chapters + cards in DB using existing create_subject, create_chapter, create_card functions

### Commands: `src-tauri/src/commands/pathway.rs`

```
generate_pathway_outline(topic, mastery, scope) → PathwayOutline  // async
generate_pathway_chapter(topic, mastery, title, description, chapter_index, total_chapters) → ChapterContent  // async
create_pathway_subject(subject_name, chapters: Vec<{title, content, estimated_minutes}>, flashcards: Vec<{chapter_index, prompt, answer}>) → PathwayResult  // sync
```

Three commands instead of two — this lets the frontend generate chapters one at a time (for progress tracking) and then bulk-create the subject at the end.

## Frontend

### New page: `src/pages/Pathway.tsx`

State machine: `input → generating_outline → outline → generating_content → done`

**input phase:**
- Text input: "What do you want to learn?"
- 3 mastery buttons: Beginner / Intermediate / Expert
- 3 scope buttons: Quick Overview / Standard / Deep Dive
- "Generate Outline" button (disabled until topic entered)

**generating_outline phase:**
- Pixel cat loading + "Creating your learning plan..."

**outline phase:**
- Shows proposed subject name (editable)
- List of chapters with title (editable) + description + estimated time
- Delete chapter button per row
- "Add Chapter" button at bottom
- Drag to reorder (or up/down arrows for simplicity)
- "Generate Curriculum" button

**generating_content phase:**
- Progress bar: "Generating chapter 2 of 8..."
- Pixel cat animation
- Chapters generated one at a time so user sees progress

**done phase:**
- Summary card: subject name, chapter count, flashcard count
- "Start Studying" → navigate to Library
- "Suggested Sources" section with URL list + "Import" button per URL

### Queue page modification: `src/pages/Queue.tsx`

Add a "Learn Something New" button at the top of the queue, before the queue items list. Clicking navigates to `/pathway`.

### Route

Add `/pathway` to App.tsx inside Shell route group.

### Ribbon

No new ribbon icon — accessed from Queue page button.

## IPC Types

```typescript
interface PathwayOutline {
  subject_name: string;
  chapters: ChapterOutline[];
}

interface ChapterOutline {
  title: string;
  description: string;
  estimated_minutes: number;
}

interface ChapterContent {
  content: string;
  flashcards: { prompt: string; answer: string }[];
  suggested_urls: { title: string; url: string }[];
}

interface PathwayResult {
  subject_id: number;
  subject_name: string;
  chapters_created: number;
  flashcards_created: number;
  suggested_urls: { title: string; url: string }[];
}
```

## No New Dependencies
- Uses existing AI router (`services/ai.rs`)
- Uses existing `create_subject`, `create_chapter`, `create_card` functions
- Uses existing `import_url` for optional source import
- No new database tables

## Testing

### Rust Unit Tests
- `test_create_pathway_creates_subject_and_chapters` — verify DB state after creation
- `test_create_pathway_creates_flashcards` — verify cards created with correct source_type

### Frontend
- `npx tsc --noEmit` — zero errors
- `npx biome check .` — clean
