# Obsidian-Style UI Spacing Overhaul

## Problem

The app's color scheme is solid but spacing is broken in several ways:

1. **Library "island" effect** — The entire Library page is wrapped in `p-6` with a `rounded-[28px]` container, creating a floating card inside the window. This wastes 24px on every side and adds 4 layers of nesting (Shell > wrapper > rounded container > sidebar/content > cards).
2. **Inconsistent page padding** — Library uses `p-6` outer + `px-7 py-7` inner, Settings uses `px-10 pt-10 pb-16`. DESIGN.md specifies `px-7 py-7` for all pages.
3. **Wasted Ribbon top padding** — `pt-8` (32px) on the Ribbon suggests title bar clearance, but the Tauri config uses native title bar. The padding serves no purpose.
4. **No custom title bar** — Native title bar adds ~28px of vertical chrome that Obsidian avoids entirely.
5. **Excessive border-radius** — `rounded-[28px]` and `rounded-[24px]` on containers create a bubbly look that conflicts with the editorial density goal.

The user wants Obsidian-style design: edge-to-edge panels, flat hierarchy, compact spacing, custom title bar.

## Design

### Layer 1: Custom Title Bar

**tauri.conf.json changes:**
- Add `"titleBarStyle": "overlay"` to the window config
- This embeds macOS traffic lights into the app content area

**Shell-level changes:**
- Add an inline `<div>` drag region bar at the top of `<main>` in Shell.tsx (38px height, not a separate component)
- CSS: `-webkit-app-region: drag` on the bar, with `-webkit-app-region: no-drag` on any interactive children
- The drag bar shows the current page name as a subtle uppercase label (derived from current route)
- Style: `h-[38px] border-b border-border-subtle bg-panel` with drag region styles in index.css

**Ribbon changes:**
- Replace `pt-8` with `pt-[38px]` to clear the macOS traffic lights (3 dots)
- Traffic lights sit naturally above the logo in the Ribbon column

**Files:** `src-tauri/tauri.conf.json`, `src/components/layout/Shell.tsx`, `src/components/layout/Ribbon.tsx`

### Layer 2: Ribbon Compaction

**Width:** `w-[68px]` → `w-12` (48px)

**Icons:** Remove text labels. Keep icons only. Add hover tooltips using Tailwind `group`/`group-hover` pattern — a hidden `<span>` sibling that appears to the right on hover with `absolute left-full ml-2` positioning. No tooltip library needed.

**Button size:** `h-12 w-12` → `h-9 w-9` (36px)

**Gap:** `gap-1` → `gap-1` (keep, already tight)

**Logo:** `h-9 w-9` → `h-8 w-8` (32px)

**Active state:** Keep `bg-accent text-white shadow-sm` — this reads well at the smaller size.

**Settings button:** Move to bottom of Ribbon with `mt-auto` separator from the main nav group.

**Files:** `src/components/layout/Ribbon.tsx`

### Layer 3: Library Page Flatten

**Remove the island container entirely:**
- Delete the outer `<div className="h-full p-6">` wrapper
- Delete the `rounded-[28px] border shadow` container
- Root element becomes `<div className="flex h-full">` — subject sidebar and content area are direct flex children, extending edge-to-edge

**Subject sidebar:**
- Keep `w-72` (288px) width — matches DESIGN.md
- Extends full height with `border-r border-border-subtle`
- Background: `bg-panel` (keep)
- Header padding: `px-5 py-4` (tighten from `py-5`)
- List item padding: keep `px-3 py-2`

**Content area:**
- Remove `bg-bg` (inherits from Shell)
- Search header: `px-7 py-4` (tighten vertical only, keep horizontal per DESIGN.md)
- Content scroll: `px-7 py-7` (match DESIGN.md exactly)
- Chapter cards: `rounded-xl` (downgrade from `rounded-2xl`), keep `border bg-panel p-5`
- Subject title: keep `text-xl font-semibold`

**Empty state:**
- Replace `rounded-[24px]` with `rounded-xl`

**Files:** `src/pages/Library.tsx`

### Layer 4: Settings Page Align

**Page wrapper:**
- `px-10 pt-10 pb-16` → `px-7 py-7` (match DESIGN.md)
- Keep `max-w-5xl mx-auto`

**Heading:**
- `mb-12` → `mb-8` (DESIGN.md section spacing is `mb-10`, but title-to-content is tighter)

**Cards:**
- `rounded-[24px]` → `rounded-xl` (12px, consistent with rest of app)
- Keep `p-7` card padding (within DESIGN.md range)
- Keep `shadow-[0_12px_32px_rgba(30,42,34,0.06)]`

**Info box:**
- Keep as-is, already well-spaced

**Placeholder section:**
- `rounded-[24px]` → `rounded-xl`

**Files:** `src/pages/Settings.tsx`

### Layer 5: Global CSS Cleanup

**index.css:**
- No changes to color tokens (color scheme is approved)
- No changes to font stack

**Consistency rules enforced:**
- All container border-radius: `rounded-xl` (12px) max, never custom `rounded-[Npx]`
- All page content padding: aligned to DESIGN.md spacing scale
- All inputs: `h-11` (44px) — already enforced
- All buttons: `h-10` (40px) — already enforced

## Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/tauri.conf.json` | Add `titleBarStyle: "overlay"` |
| `src/components/layout/Shell.tsx` | Add drag region bar |
| `src/components/layout/Ribbon.tsx` | Compact to 48px, icon-only, tooltip, traffic light clearance |
| `src/pages/Library.tsx` | Remove island wrapper, edge-to-edge layout |
| `src/pages/Settings.tsx` | Align padding to DESIGN.md |
| `src/index.css` | Add drag region styles, tooltip styles |
| `DESIGN.md` | Update Ribbon width and title bar documentation |

## What NOT to Change

- Color palette (approved by user)
- Font stack and sizes
- Component logic (state, handlers, IPC)
- Card content layout (icon + title + status pattern)
- Modal overlays (QuickSwitcher, ShortcutsOverlay)
- Any backend/Rust code

## Verification

1. `npm run tauri dev` — app launches with custom title bar, traffic lights visible in Ribbon area
2. Window is draggable from the top bar region
3. Library page: sidebar extends full height, no floating island container, content reaches edges
4. Settings page: padding matches DESIGN.md (28px sides)
5. Ribbon: 48px wide, icons only, tooltips appear on hover
6. `npx tsc --noEmit` — zero type errors
7. `npx biome check .` — zero lint errors
8. `npm test` — all tests pass
9. Test at minimum window size (900x600) — no overflow or clipping
