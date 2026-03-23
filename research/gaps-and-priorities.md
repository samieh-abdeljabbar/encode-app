# Known Gaps & Next Priorities

## Bugs
1. **Stale flashcard count** — Dashboard shows "1 Cards Due" after card file deleted. DB sr_schedule not cleaned up on file delete.
2. **Flashcard Dashboard shows "No flashcards"** — The dashboard reads from allCards (file scan) but the DB still has stale entries.

## Quiz System Gaps
3. **No quiz history view** — Past quizzes save to files but there's no UI to browse them.
4. **Single chapter only** — Can't quiz across a whole subject or multiple chapters.
5. **Free-recall only** — No multiple choice, fill-in-blank, true/false.
6. **No answer verification** — AI-generated answers could be wrong, no way to flag.
7. **No SQL/code questions** — For Data Science, need runnable SQL queries in quizzes.

## Flashcard Gaps
8. **No card deletion** — Can't delete individual flashcards.
9. **No card editing** — Can't edit a card's Q/A after creation.

## Quiz Types Needed
- **Free recall** (current) — "Explain X in your own words"
- **Multiple choice** — 4 options, one correct
- **Fill in the blank** — Statement with ___ to complete
- **True/False** — Statement to evaluate
- **SQL/Code** — Write a query, system validates it
- **Matching** — Match terms to definitions

## SQL/Code Quiz Feature
- Embed a code editor (Monaco or CM6) in the quiz
- For SQL: create an in-memory SQLite database with sample tables
- User writes a query, clicks Run, sees results
- AI evaluates if the result matches the expected output
- Could use the existing SQLite infrastructure in Rust

## AI Accuracy
- Add "Flag as incorrect" button on quiz feedback
- Flagged questions get stored for review
- For code/SQL: automated verification by actually running the code
- Source citations: AI should reference which section the answer comes from
