# Quiz Customization + Pixel Cat Loading Design

## Overview

Add difficulty level (beginner/intermediate/expert) and question count selection when generating a quiz. Replace the loading spinner with an animated pixel cat.

## Quiz Config Panel

When user clicks "New Quiz" or "Take Quiz", before generation:
1. Chapter picker (existing)
2. Difficulty selector: 3 buttons — Beginner / Intermediate / Expert (default: Intermediate)
3. Question count: dropdown — 4, 6, 8, 10, 12 (default: 8, capped at section_count)
4. "Generate Quiz" button

## Backend Changes

- `generate_quiz` command gains: `difficulty: String`, `question_count: i32`
- Difficulty passed to AI prompt to control question style
- Question count overrides `min(8, section_count)` formula, capped at section_count
- Both stored in quiz `config_json`

## AI Prompt Changes

- Beginner: "Focus on definitions, key terms, and basic recall. Use more multiple choice and true/false."
- Intermediate: "Test understanding and application. Mix question types." (current default)
- Expert: "Test deep analysis, comparison, and synthesis. Prefer short answer questions that require explanation."

## Pixel Cat Loading

CSS-only pixel art cat animation during quiz generation. No images — pure CSS/HTML. Cat walks/bounces with animated "Generating your quiz..." dots text.

## Files Changed

- `src-tauri/src/services/quiz.rs` — accept difficulty + count, modify prompt
- `src-tauri/src/commands/quiz.rs` — pass new params
- `src/lib/tauri.ts` — update generateQuiz signature
- `src/pages/Quiz.tsx` — config panel + pixel cat loading
- `src/pages/Quizzes.tsx` — update New Quiz flow
