# Obsidian-Style UI Spacing Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the app from a "floating island" layout to Obsidian-style edge-to-edge panels with custom title bar, compact ribbon, and consistent DESIGN.md-aligned spacing.

**Architecture:** Remove the native title bar in favor of a CSS drag region overlay. Compact the Ribbon from 68px to 48px with icon-only buttons. Flatten the Library page by removing its outer wrapper/island container. Align all page padding to DESIGN.md's `px-7 py-7` standard.

**Tech Stack:** Tauri 2.0 (window config), React 18, Tailwind CSS 4, Lucide icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/tauri.conf.json` | Modify | Add `titleBarStyle: "overlay"` to window config |
| `src/index.css` | Modify | Add drag region CSS rules |
| `src/components/layout/Shell.tsx` | Modify | Add drag region bar with route-based page label |
| `src/components/layout/Ribbon.tsx` | Modify | Compact to 48px, icon-only, hover tooltips, traffic light clearance |
| `src/pages/Library.tsx` | Modify | Remove island wrapper, edge-to-edge layout, fix border-radius |
| `src/pages/Settings.tsx` | Modify | Align padding to DESIGN.md, fix border-radius |
| `DESIGN.md` | Modify | Update Ribbon, title bar, and border-radius documentation |
| `src/__tests__/app-shell.test.tsx` | Modify | Update test to reflect new drag region and structure |

---

### Task 1: Custom Title Bar — Tauri Config + CSS

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src/index.css`

- [ ] **Step 1: Add titleBarStyle to Tauri window config**

In `src-tauri/tauri.conf.json`, add `"titleBarStyle": "overlay"` to the window object:

```json
{
  "windows": [
    {
      "title": "Encode",
      "width": 1200,
      "height": 800,
      "minWidth": 900,
      "minHeight": 600,
      "titleBarStyle": "overlay"
    }
  ]
}
```

- [ ] **Step 2: Add drag region CSS to index.css**

Append these rules at the end of `src/index.css`:

```css
/* Drag region for custom title bar */
[data-tauri-drag-region] {
  -webkit-app-region: drag;
}

[data-tauri-drag-region] button,
[data-tauri-drag-region] a,
[data-tauri-drag-region] input {
  -webkit-app-region: no-drag;
}
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json src/index.css
git commit -m "feat: enable overlay title bar and add drag region CSS"
```

---

### Task 2: Shell Drag Region Bar

**Files:**
- Modify: `src/components/layout/Shell.tsx`

- [ ] **Step 1: Add useLocation import and route label map**

Add at the top of Shell.tsx:

```tsx
import { Outlet, useLocation } from "react-router-dom";
```

Remove the existing `Outlet` import from `react-router-dom`.

Add a route label map inside the `Shell` function, before the return:

```tsx
const location = useLocation();
const pageLabel: Record<string, string> = {
  "/": "Queue",
  "/library": "Library",
  "/reader": "Reader",
  "/review": "Review",
  "/settings": "Settings",
};
const label = pageLabel[location.pathname] ?? "";
```

- [ ] **Step 2: Add drag region bar inside main**

Replace the current `<main>` block:

```tsx
<main className="flex-1 overflow-auto">
  <Outlet />
</main>
```

With:

```tsx
<main className="flex flex-1 flex-col overflow-hidden">
  <div
    data-tauri-drag-region
    className="flex h-[38px] shrink-0 items-center border-b border-border-subtle bg-panel px-5"
  >
    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
      {label}
    </span>
  </div>
  <div className="flex-1 overflow-auto">
    <Outlet />
  </div>
</main>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Shell.tsx
git commit -m "feat: add drag region bar with route label to Shell"
```

---

### Task 3: Ribbon Compaction

**Files:**
- Modify: `src/components/layout/Ribbon.tsx`

- [ ] **Step 1: Separate nav items from settings**

Split the `NAV_ITEMS` array so Settings is separate. Replace the entire `NAV_ITEMS` const:

```tsx
const NAV_ITEMS = [
  { path: "/", icon: LayoutDashboard, label: "Queue" },
  { path: "/library", icon: BookOpen, label: "Library" },
  { path: "/review", icon: Repeat, label: "Review" },
] as const;

const SETTINGS_ITEM = { path: "/settings", icon: Settings, label: "Settings" } as const;
```

- [ ] **Step 2: Rewrite the Ribbon component**

Replace the entire `Ribbon` function body with:

```tsx
type NavItem = (typeof NAV_ITEMS)[number] | typeof SETTINGS_ITEM;

export function Ribbon() {
  const navigate = useNavigate();
  const location = useLocation();

  const renderNavButton = (item: NavItem, key?: string) => {
    const isActive = location.pathname === item.path;
    return (
      <button
        key={key ?? item.path}
        type="button"
        onClick={() => navigate(item.path)}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 ${
          isActive
            ? "bg-accent text-white shadow-sm"
            : "text-text-muted hover:bg-panel-active hover:text-text"
        }`}
      >
        <item.icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
        <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-text px-2 py-1 text-[11px] font-medium text-panel shadow-lg group-hover:block">
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center border-r border-border-subtle bg-panel px-1 pb-3 pt-[38px]">
      <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
        <GraduationCap size={16} className="text-accent" />
      </div>

      <div className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => renderNavButton(item))}
      </div>

      <div className="mt-auto">
        {renderNavButton(SETTINGS_ITEM)}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run existing tests**

Run: `npm test`
Expected: All tests pass. The `app-shell.test.tsx` checks for `aria-label` attributes which are preserved.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Ribbon.tsx
git commit -m "feat: compact Ribbon to 48px icon-only with hover tooltips"
```

---

### Task 4: Library Page Flatten

**Files:**
- Modify: `src/pages/Library.tsx`

- [ ] **Step 1: Replace the root wrapper and container**

Replace lines 153-155 (the opening of the return):

```tsx
  return (
    <div className="h-full p-6">
      <div className="flex h-full overflow-hidden rounded-[28px] border border-border-subtle bg-surface shadow-[0_18px_60px_rgba(30,42,34,0.08)]">
```

With:

```tsx
  return (
    <div className="flex h-full">
```

- [ ] **Step 2: Close the root wrapper correctly**

Replace the closing of the return (lines 491-493):

```tsx
      </div>
    </div>
  );
```

With:

```tsx
    </div>
  );
```

This removes the extra `</div>` that closed the old island container.

- [ ] **Step 3: Fix sidebar header padding**

Replace:

```tsx
<div className="flex items-center justify-between border-b border-border-subtle/60 px-5 py-5">
```

With:

```tsx
<div className="flex items-center justify-between border-b border-border-subtle/60 px-5 py-4">
```

- [ ] **Step 4: Fix content area background**

Replace:

```tsx
<div className="flex flex-1 flex-col overflow-hidden bg-bg">
```

With:

```tsx
<div className="flex flex-1 flex-col overflow-hidden">
```

- [ ] **Step 5: Fix search header padding**

Replace:

```tsx
<div className="shrink-0 border-b border-border-subtle/60 px-7 py-5">
```

With:

```tsx
<div className="shrink-0 border-b border-border-subtle/60 px-7 py-4">
```

- [ ] **Step 6: Fix chapter card border-radius**

Replace all `rounded-2xl` on chapter cards and search results with `rounded-xl`. There are multiple instances:

In the search results button (around line 285):
```tsx
className="mb-3 w-full rounded-2xl border border-border bg-panel p-5 text-left transition-all hover:border-accent/30 hover:shadow-sm"
```
Change `rounded-2xl` to `rounded-xl`.

In the chapter list button (around line 435):
```tsx
className="mb-3 flex w-full items-center gap-4 rounded-2xl border border-border bg-panel p-5 text-left transition-all hover:border-accent/25 hover:shadow-sm"
```
Change `rounded-2xl` to `rounded-xl`.

In the import URL form container:
```tsx
className="mb-6 rounded-2xl border border-border bg-panel p-6"
```
Change `rounded-2xl` to `rounded-xl`.

In the new chapter form container:
```tsx
className="mb-6 rounded-2xl border border-border bg-panel p-6"
```
Change `rounded-2xl` to `rounded-xl`.

- [ ] **Step 7: Fix empty state border-radius**

Replace:

```tsx
className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-panel/50 py-20 text-center"
```

With:

```tsx
className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel/50 py-20 text-center"
```

And in the "Select a subject" empty state, replace:

```tsx
className="mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] bg-accent/6"
```

With:

```tsx
className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-accent/6"
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add src/pages/Library.tsx
git commit -m "feat: flatten Library page to edge-to-edge layout"
```

---

### Task 5: Settings Page Align

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Fix page wrapper padding**

Replace:

```tsx
<div className="mx-auto max-w-5xl px-10 pb-16 pt-10">
```

With:

```tsx
<div className="mx-auto max-w-5xl px-7 py-7">
```

- [ ] **Step 2: Fix heading bottom margin**

Replace:

```tsx
<h1 className="mb-12 text-2xl font-semibold tracking-tight text-text">
```

With:

```tsx
<h1 className="mb-8 text-2xl font-semibold tracking-tight text-text">
```

- [ ] **Step 3: Fix card border-radius (all instances)**

Replace all `rounded-[24px]` with `rounded-xl` in Settings.tsx. There are 5 instances:

1. Export card:
```tsx
<div className="rounded-[24px] border border-border bg-panel p-7 shadow-[0_12px_32px_rgba(30,42,34,0.06)]">
```

2. Snapshot card:
```tsx
<div className="rounded-[24px] border border-border bg-panel p-7 shadow-[0_12px_32px_rgba(30,42,34,0.06)]">
```

3. Snapshots list:
```tsx
<div className="rounded-[24px] border border-border bg-panel p-4">
```

4. Profile placeholder:
```tsx
<div className="rounded-[24px] border border-dashed border-border bg-panel/40 px-8 py-12 text-center">
```

Replace each `rounded-[24px]` with `rounded-xl`.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: align Settings page spacing to DESIGN.md"
```

---

### Task 6: Update Tests

**Files:**
- Modify: `src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Update the main content area test**

The Shell now wraps the `<Outlet>` in a flex column with a drag region. Update the third test:

Replace:

```tsx
it("mounts with a main content area", async () => {
  const { container } = render(<App />);
  await waitFor(() => {
    expect(container.querySelector("main")).toBeInTheDocument();
  });
});
```

With:

```tsx
it("mounts with a main content area and drag region", async () => {
  const { container } = render(<App />);
  await waitFor(() => {
    expect(container.querySelector("main")).toBeInTheDocument();
    expect(
      container.querySelector("[data-tauri-drag-region]"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All 3 tests pass (smoke + 3 app-shell tests)

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/app-shell.test.tsx
git commit -m "test: update app-shell test for drag region"
```

---

### Task 7: Update DESIGN.md

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Update the Page Layout section**

Replace the entire `### Page Layout` section:

```markdown
### Page Layout
- **Page outer padding**: `p-6` (24px) — space between window edge and content card
- **Content horizontal**: `px-7` (28px) — inside the content area
- **Content vertical**: `py-7` (28px) — inside the content area
- **Section gap**: `mb-10` (40px) — between major sections on a page
- **Title bottom margin**: `mb-8` to `mb-12` depending on page density
```

With:

```markdown
### Page Layout
- **Title bar**: Custom overlay (`titleBarStyle: "overlay"` in tauri.conf.json). Drag region bar is 38px tall with `data-tauri-drag-region` attribute.
- **Content horizontal**: `px-7` (28px) — inside the content area
- **Content vertical**: `py-7` (28px) — inside the content area
- **Section gap**: `mb-10` (40px) — between major sections on a page
- **Title bottom margin**: `mb-8` (32px)
- **Layout style**: Edge-to-edge panels. No floating "island" containers. Sidebars extend full height with `border-r`.
```

- [ ] **Step 2: Add a Ribbon section after Sidebar**

After the `### Sidebar` section, add:

```markdown
### Ribbon (Navigation Rail)
- **Width**: `w-12` (48px)
- **Top padding**: `pt-[38px]` (traffic light clearance)
- **Logo**: `h-8 w-8 rounded-lg`
- **Nav buttons**: `h-9 w-9 rounded-lg` icon-only with hover tooltips
- **Gap**: `gap-1` (4px) between nav items
- **Settings button**: Pinned to bottom with `mt-auto`
```

- [ ] **Step 3: Update Cards & Panels section**

Replace:

```markdown
- **Border radius**: `rounded-2xl` (16px) for cards, `rounded-xl` (12px) for inputs/buttons
- **Large container radius**: `rounded-[28px]` for the main app card wrapper only
```

With:

```markdown
- **Border radius**: `rounded-xl` (12px) for all cards, inputs, and buttons. No custom `rounded-[Npx]` values.
```

- [ ] **Step 4: Update Empty States icon container**

Replace:

```markdown
- **Icon container**: `h-16 w-16 rounded-[24px] bg-accent/6` centered
```

With:

```markdown
- **Icon container**: `h-16 w-16 rounded-xl bg-accent/6` centered
```

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md
git commit -m "docs: update DESIGN.md for Obsidian-style layout changes"
```

---

### Task 8: Lint, Format, and Final Verification

- [ ] **Step 1: Run Biome check and auto-fix**

Run: `npx biome check --write .`
Expected: All files formatted, no remaining issues

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit any formatting fixes**

```bash
git add -A
git commit -m "style: biome formatting pass"
```

(Skip this commit if Biome made no changes.)

- [ ] **Step 5: Visual verification with Tauri dev**

Run: `npm run tauri dev`

Verify:
1. Custom title bar — no native title bar visible, traffic lights sit inside the Ribbon area
2. Window is draggable from the top bar (the page label area)
3. Ribbon — 48px wide, icons only, tooltips appear on hover
4. Library page — sidebar extends full height edge-to-edge, no floating island container
5. Settings page — tighter padding (28px sides), `rounded-xl` cards
6. Test at minimum window size (900x600) — no overflow or clipping
