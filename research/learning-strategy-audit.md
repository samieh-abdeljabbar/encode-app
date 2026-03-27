# Learning Strategy Audit

## Current strengths

- Section-by-section reading already forces retrieval through digestion gates.
- Gate evaluation gives immediate verification and surfaces gaps.
- Wrong quiz answers already feed flashcard creation, which supports spaced review.
- Teach-Back exists as a separate Feynman-style generation step.

## Main gaps identified

- There was no required whole-chapter generation step after finishing a chapter.
- Chapters could move from reading directly into quiz generation without a synthesis pass.
- Quiz feedback was often too shallow on incorrect answers, especially when AI fallback logic was triggered.
- The quiz dashboard made completed attempts harder to discover than they should be.

## v0.9 decisions

- Add a required **post-reading chapter synthesis** step before quiz and teach-back unlock.
- Keep synthesis **non-blocking in quality**. Submission is required; AI evaluation is advisory.
- Keep the flow markdown-first:
  - chapter markdown stores `## Digestion`
  - chapter markdown now also stores `## Synthesis`
- Do not add backend loop-state tracking in this release.

## Why this direction

- It preserves the existing section-level retrieval loop.
- It adds chapter-level generation at the point where the learner actually has material to integrate.
- It avoids overengineering a pre-read lock or a new DB-backed chapter workflow before the lighter version proves useful.
