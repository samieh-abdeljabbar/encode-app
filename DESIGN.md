# DESIGN.md — Encode v2 Spacing & Layout System

This file is the source of truth for all spacing, sizing, and layout decisions. Every frontend component MUST reference these values. Do not invent new spacing — use this scale.

## Spacing Scale

| Name | Tailwind | Pixels | Use |
|------|----------|--------|-----|
| xs | `2px / 0.5` | 2 | Tight gaps between inline elements |
| sm | `4px / 1` | 4 | Icon-to-text gaps |
| md | `8px / 2` | 8 | Between related items in a group |
| lg | `12px / 3` | 12 | Padding inside small controls |
| xl | `16px / 4` | 16 | Between list items, inside compact panels |
| 2xl | `20px / 5` | 20 | Standard content padding |
| 3xl | `24px / 6` | 24 | Card inner padding, content inset |
| 4xl | `28px / 7` | 28 | Page content padding (Library, Reader) |
| 5xl | `32px / 8` | 32 | Top-of-page breathing room |
| 6xl | `40px / 10` | 40 | Between major sections |

## Component Tokens

### Page Layout
- **Title bar**: Custom overlay (`titleBarStyle: "overlay"` in tauri.conf.json). Drag region bar is 38px tall with `data-tauri-drag-region` attribute.
- **Content horizontal**: `px-7` (28px) — inside the content area
- **Content vertical**: `py-7` (28px) — inside the content area
- **Section gap**: `mb-10` (40px) — between major sections on a page
- **Title bottom margin**: `mb-8` (32px)
- **Layout style**: Edge-to-edge panels. No floating "island" containers. Sidebars extend full height with `border-r`.

### Sidebar
- **Width**: `w-72` (288px)
- **Header padding**: `px-5 py-4` (20px/16px)
- **List padding**: `px-3 py-3` (12px)
- **List item padding**: `px-3 py-2` (12px/8px)

### Ribbon (Navigation Rail)
- **Width**: `w-12` (48px)
- **Top padding**: `pt-[38px]` (traffic light clearance)
- **Logo**: `h-8 w-8 rounded-lg`
- **Nav buttons**: `h-9 w-9 rounded-lg` icon-only with hover tooltips
- **Gap**: `gap-1` (4px) between nav items
- **Settings button**: Pinned to bottom with `mt-auto`

### Cards & Panels
- **Border radius**: `rounded-xl` (12px) for all cards, inputs, and buttons. No custom `rounded-[Npx]` values.
- **Card padding**: `p-6` (24px) standard, `p-7` (28px) for feature cards
- **Card gap in grid**: `gap-5` or `gap-6` (20-24px)
- **Card shadow**: `shadow-[0_12px_32px_rgba(30,42,34,0.06)]` for elevated cards
- **Card border**: `border border-border`

### Inputs
- **Height**: `h-11` (44px) — ALL inputs, search bars, selects
- **Border radius**: `rounded-xl` (12px) for inputs, `rounded-2xl` (16px) for search
- **Horizontal padding**: `px-4` (16px), `pl-10` when icon-prefixed
- **Font size**: `text-sm` (14px)
- **Placeholder**: `placeholder:text-text-muted/50`
- **Focus**: `focus:border-accent/40 focus:outline-none`

### Buttons
- **Primary height**: `h-10` (40px)
- **Primary style**: `rounded-xl bg-accent text-white text-xs font-medium px-4`
- **Secondary height**: `h-10` (40px)
- **Secondary style**: `rounded-xl border border-border text-text-muted text-xs font-medium px-4`
- **Icon button**: `h-10 w-10 rounded-xl` (square)
- **Full-width CTA**: `h-11 rounded-2xl` (taller, wider radius for emphasis)

### Typography
- **Page title**: `text-2xl font-semibold tracking-tight`
- **Section header**: `text-sm font-semibold` with icon
- **Body text**: `text-sm` or `text-xs` depending on density
- **Muted text**: `text-text-muted`
- **Mono stats**: `font-mono text-3xl tabular-nums tracking-tight`
- **Labels**: `text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted`

### Empty States
- **Icon container**: `h-16 w-16 rounded-xl bg-accent/6` centered
- **Title**: `text-base font-medium text-text-muted`
- **Subtitle**: `text-sm text-text-muted/50 mt-2`
- **Container**: centered both axes with generous vertical padding (`py-20`)

### Modals (QuickSwitcher, ShortcutsOverlay)
- **Backdrop**: `bg-text/10 backdrop-blur-[2px]`
- **Container radius**: `rounded-2xl`
- **Container shadow**: `shadow-xl shadow-text/5`
- **Container padding**: `p-6`

## Color Tokens (from index.css @theme)

| Token | Hex | Use |
|-------|-----|-----|
| bg | #f4f0e8 | App background, window fill |
| surface | #ebe5d9 | Sidebar background |
| panel | #faf8f3 | Card/panel background |
| panel-alt | #f0ece3 | Input background, secondary panels |
| panel-active | #e4dfd4 | Hover/active states |
| border | #c8c1b0 | Card borders, dividers |
| border-subtle | #d6d0c3 | Light dividers, section separators |
| text | #1a1f17 | Primary text |
| text-muted | #6b7265 | Secondary text, labels |
| accent | #2d6a4f | Primary actions, active states |
| accent-soft | #d8e2dc | Tags, soft backgrounds |
| teal | #2d6a4f | Success/positive |
| coral | #b85c3a | Error/danger |
| amber | #a67c3d | Warning/attention |

## Rules

1. **Never invent a new spacing value.** Use the scale above.
2. **All inputs are h-11.** No exceptions.
3. **All standard buttons are h-10.** Full-width CTAs are h-11.
4. **Card padding is p-6 or p-7.** Never p-4 or p-5.
5. **Page content uses px-7 py-7.** Not px-5, not px-6, not px-8.
6. **Sections are separated by mb-10.** Not mb-8, not mb-12.
7. **The sidebar header and search toolbar must have matching vertical padding** so they align across the split.
