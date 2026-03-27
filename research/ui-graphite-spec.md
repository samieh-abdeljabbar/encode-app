# Encode UI Graphite Spec

This document locks the Phase 1 visual system for the Obsidian-like graphite refresh.

## Layout Metrics

- Ribbon width: `56px`
- Sidebar width: `272px`
- Editor reading width: `860px`
- Spacing scale: `4, 8, 12, 16, 24, 32`
- Radius scale:
  - `sm = 8px`
  - `md = 12px`
  - `lg = 16px`
  - `pill = 999px`
- Shadows:
  - panel: `0 8px 24px rgba(0,0,0,0.18)`
  - overlay: `0 18px 48px rgba(0,0,0,0.28)`

## Visual Rules

- Use canvas vs panel vs panel-active hierarchy instead of stacking thin bordered strips.
- Accent color is reserved for primary actions, active navigation, and key highlights.
- Secondary actions use panel surfaces and stronger borders, not accent color.
- Metadata should appear as chips, not inline label soup.
- Panels should feel denser and quieter than the current UI.
- Vault remains the reference surface for typography, chrome, and spacing.

## Phase 1 Targets

- Global theme tokens
- Shared UI primitives
- Ribbon + sidebar + shell chrome
- Vault editor surface
- Flashcards dashboard/review/all-cards
- Quiz dashboard/config/question/results
- CodeMirror theme/decorations
- MarkdownRenderer prose parity
