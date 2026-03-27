# Editor Command Audit

## Slash commands

- Slash commands are **template inserts**, not semantic operations.
- They are effectively a **Source-mode authoring aid** and should be described that way in the UI.
- Added `/synthesis` so chapter synthesis has a first-class template.

## Command mismatches found

- `embed` previously read as a true embed feature, but current behavior is only a linked-note style insertion.
- The toolbar exposed `Highlight` syntax without rendered support, which made it look partially broken.

## v0.9 cleanup decisions

- Relabel `embed` to **Linked Note** to match actual current behavior.
- Add an explicit source-mode note to the slash menu UI.
- Support rendered `==highlight==` output so the toolbar no longer over-promises.

## Follow-up candidates

- Audit whether linked-note embed syntax should become a true rendered embed later.
- Decide whether slash-command help belongs in the editor chrome or settings docs as a separate discoverability pass.
