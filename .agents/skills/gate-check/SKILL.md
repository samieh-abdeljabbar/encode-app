---
name: gate-check
description: Run all verification gates for Encode v2 (tsc, biome, clippy, cargo test, vitest). Use after completing any task to verify nothing is broken.
---

Run these commands sequentially from the project root at /Users/samiehabdeljabbar/Desktop/actually_learn. Stop and report at the first failure. Report pass/fail with counts for each.

1. TypeScript check: `npx tsc --noEmit`
2. Biome lint/format: `npm run check`
3. Cargo check: `cd src-tauri && cargo check`
4. Cargo clippy (strict): `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`
5. Rust tests: `cd src-tauri && cargo test`
6. Frontend tests: `npm test`

After all gates run, output a summary table:

| Gate | Result | Details |
|------|--------|---------|
| tsc | PASS/FAIL | error count |
| biome | PASS/FAIL | file count checked |
| cargo check | PASS/FAIL | warnings |
| clippy | PASS/FAIL | warning count |
| cargo test | PASS/FAIL | X passed, Y failed |
| vitest | PASS/FAIL | X passed, Y failed |

If any gate fails, clearly state which one and show the relevant error output.
