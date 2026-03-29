---
name: review-epic
description: Review a completed epic against the blueprint and implementation backlog. Checks exit criteria, finds divergences, and runs the gate checks.
disable-model-invocation: true
---

You are reviewing a completed epic for the Encode v2 rebuild.

## Steps

1. **Read the spec**: Read `second_shot/blueprint.md` and `second_shot/implementation_backlog.md` to understand the full requirements.

2. **Identify the epic**: Ask the user which epic was just completed, or infer from recent git changes.

3. **Check exit criteria**: Find the exit criteria for that epic in the implementation backlog. For each criterion, verify it is actually met by reading the relevant code.

4. **Run gate checks**: Execute all verification gates:
   - `npx tsc --noEmit`
   - `npm run check`
   - `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`
   - `cd src-tauri && cargo test`
   - `npm test`

5. **Run the code-reviewer subagent**: Launch a code review agent against all files that were created or modified for this epic.

6. **Report findings**: Output a structured report:

   ### Epic [X.Y]: [Name]

   **Exit Criteria Status:**
   | Criterion | Met? | Evidence |
   |-----------|------|----------|

   **Gate Results:**
   | Gate | Result |
   |------|--------|

   **Issues Found:**
   - [Priority] Description (file:line)

   **Blueprint Divergences:**
   - What the blueprint says vs what was built

   **Verdict:** PASS / NEEDS FIXES (list what)
