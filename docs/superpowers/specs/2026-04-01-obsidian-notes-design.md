# Obsidian-Style Notes Feature Design

## Overview

A personal wiki inside Encode. Plain markdown files on disk (`~/Encode/notes/`), SQLite indexes metadata for fast search/backlinks/graph. Features: file explorer with folders, `[[wikilinks]]` with autocomplete, backlinks panel, tags, full-text search, quick switcher, interactive force-directed graph view (global + local), live preview editor via CodeMirror 6. Notes optionally link to study subjects. Independent from the study loop.

## Storage Model (Hybrid)

**Files are the source of truth:**
- Notes stored as `.md` files in `~/Encode/notes/`
- Subfolders supported (user-created)
- YAML frontmatter per note:

```yaml
---
title: Binary Search Trees
tags: [data-structures, algorithms]
subject: Computer Science
created: 2026-04-01T10:30:00
modified: 2026-04-01T14:22:00
---
```

**SQLite indexes for speed:**
- `notes` table: id, title, file_path, subject_id (nullable), content_hash, created_at, modified_at
- `note_tags` table: note_id, tag (normalized)
- `note_links` table: source_note_id, target_title, target_note_id (nullable — null if target doesn't exist yet)
- FTS5 virtual table on note content for full-text search

**Reconciliation:**
- On startup: scan `~/Encode/notes/`, compare file hashes to SQLite, re-index changed/new files, remove entries for deleted files
- On save: update file, then update SQLite index
- File watcher (using `notify` crate, already in deps) detects external edits and re-indexes

## Database Migration (004)

```sql
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    modified_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (note_id, tag)
);

CREATE TABLE IF NOT EXISTS note_links (
    source_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_title TEXT NOT NULL,
    target_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
    title, content, content='', tokenize='porter'
);
```

## Backend Services

### `services/notes.rs` — Core CRUD + indexing

Functions:
- `create_note(conn, vault, title, folder, subject_id, content)` — writes .md file with frontmatter, indexes in SQLite
- `update_note(conn, vault, note_id, content)` — updates file, re-parses tags/links, updates FTS
- `delete_note(conn, vault, note_id)` — deletes file + removes from SQLite (cascades to tags, links, FTS)
- `get_note(conn, vault, note_id)` — reads file content + metadata from SQLite
- `list_notes(conn, folder, subject_id, tag)` — filtered listing from SQLite
- `move_note(conn, vault, note_id, new_path)` — moves file on disk, updates file_path in SQLite
- `rename_note(conn, vault, note_id, new_title)` — renames file, updates frontmatter title, updates all backlinks pointing to this note in other files
- `search_notes(conn, query)` — FTS5 full-text search returning matched notes with snippets
- `reindex_vault(conn, vault)` — full reconciliation: scan files, compare hashes, update/add/remove index entries

### `services/note_links.rs` — Backlink engine

Functions:
- `parse_wikilinks(content) → Vec<String>` — regex extracts `[[target]]` from markdown, handles `[[target|display]]` syntax
- `update_links(conn, note_id, links)` — replaces note_links rows for a note
- `resolve_links(conn)` — matches target_title to existing note titles, fills target_note_id
- `get_backlinks(conn, note_id)` — all notes linking TO this note (linked mentions) with surrounding context
- `get_unlinked_mentions(conn, note_id, title)` — FTS search for note title as plain text (not inside `[[]]`)
- `get_outgoing_links(conn, note_id)` — all notes this note links to (resolved + unresolved)
- `get_graph_data(conn)` — all nodes (id, title, subject_id, link_count) + edges (source_id, target_id) for graph
- `get_local_graph(conn, note_id, depth)` — BFS from note_id up to N hops, returns subgraph

### `commands/notes.rs` — Tauri IPC

Commands (all sync except reindex):
- `create_note(title, folder, subject_id, content)` → NoteInfo
- `get_note(note_id)` → NoteDetail (metadata + content)
- `update_note(note_id, content)` → NoteInfo
- `delete_note(note_id)` → ()
- `list_notes(folder, subject_id, tag)` → Vec<NoteInfo>
- `move_note(note_id, new_path)` → NoteInfo
- `rename_note(note_id, new_title)` → NoteInfo
- `search_notes(query)` → Vec<NoteSearchResult>
- `get_backlinks(note_id)` → Vec<BacklinkInfo>
- `get_outgoing_links(note_id)` → Vec<LinkInfo>
- `get_graph_data()` → GraphData
- `get_local_graph(note_id, depth)` → GraphData
- `list_folders()` → Vec<String>
- `create_folder(path)` → ()
- `reindex_vault()` → () (async — may take time on large vaults)
- `get_note_titles()` → Vec<(i64, String)> (lightweight, for autocomplete)

## Frontend

### New Pages

**`/notes`** — Notes explorer:
- Left panel: file tree sidebar (folders + notes), collapsible, drag-and-drop
- Center: note list for selected folder (or all notes), sortable by name/date/modified
- Search bar at top with tag/subject filter dropdowns
- "New Note" and "New Folder" buttons
- Click a note → navigates to `/notes/:id`

**`/notes/:id`** — Note editor:
- Full-width CodeMirror 6 editor with live preview mode
- `[[` triggers wikilink autocomplete dropdown (fuzzy search all note titles)
- `#` at word boundary triggers tag autocomplete (existing tags)
- Right sidebar (collapsible): backlinks panel
  - Linked mentions: notes that `[[link]]` to this note, with context snippet
  - Unlinked mentions: notes containing this note's title as plain text
- Header bar: editable title, tags (pill chips), optional subject dropdown
- Auto-save on change (debounced 1s, updates file + SQLite index)
- Toolbar: bold, italic, heading, list, code, link, image

**`/graph`** — Graph view:
- `react-force-graph-2d` library (Canvas + d3-force)
- All notes as nodes, backlinks as edges
- Click node → navigates to `/notes/:id`
- Hover node → highlights its connections, dims everything else
- Drag nodes to rearrange
- Scroll to zoom, drag background to pan
- Toolbar: search filter, tag filter, subject filter, toggle orphans
- Local graph mode: select a note, show only N-hop neighborhood (depth slider)
- Color nodes by subject (unlinked = gray)
- Node size scales with connection count (more backlinks = bigger)

### Quick Switcher

- Keyboard shortcut `Cmd+K` opens a modal overlay (available on any page)
- Fuzzy search across all note titles
- Arrow keys to navigate results, Enter to open, Escape to close
- Shows recently opened notes when input is empty
- Implemented as a global component in Shell.tsx

### Ribbon

- New `StickyNote` icon between Progress and the AI status button
- Click opens `/notes`
- Graph view accessible from a button inside the notes page header

### IPC Types

```typescript
interface NoteInfo {
  id: number;
  title: string;
  file_path: string;
  subject_id: number | null;
  subject_name: string | null;
  tags: string[];
  created_at: string;
  modified_at: string;
}

interface NoteDetail {
  info: NoteInfo;
  content: string;
}

interface NoteSearchResult {
  note_id: number;
  title: string;
  snippet: string;
  file_path: string;
}

interface BacklinkInfo {
  note_id: number;
  title: string;
  context: string; // surrounding text snippet
}

interface LinkInfo {
  target_title: string;
  target_note_id: number | null; // null if note doesn't exist yet
  resolved: boolean;
}

interface GraphNode {
  id: number;
  title: string;
  subject_id: number | null;
  link_count: number;
}

interface GraphEdge {
  source: number;
  target: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

### CodeMirror 6 Extensions

**Wikilink autocomplete extension:**
- Detects `[[` keystroke
- Fetches note titles via `get_note_titles()` IPC
- Shows fuzzy-filtered dropdown
- On select: inserts `[[Title]]` and closes autocomplete
- Handles `[[title|display text]]` alias syntax

**Wikilink decoration extension:**
- In live preview: renders `[[links]]` as styled clickable spans
- Click navigates to the linked note
- Unresolved links (target doesn't exist) shown in different color
- When cursor is inside the link, shows raw `[[syntax]]`

**Tag autocomplete extension:**
- Detects `#` at word boundary
- Shows existing tags from SQLite
- On select: inserts `#tagname`

### Integration with Study Loop

- Notes can set `subject: "Computer Science"` in frontmatter → linked via subject_id
- Notes are NOT part of the study queue
- Library page shows a "Notes" count per subject (future enhancement)
- Notes are a separate knowledge base alongside the study loop

## New Dependencies

- `react-force-graph-2d` — npm package for graph visualization (Canvas + d3-force)
- No new Rust dependencies needed (notify, walkdir already in Cargo.toml)

## Testing

### Rust Unit Tests
- `test_create_note_writes_file_and_indexes` — file exists, SQLite row matches
- `test_parse_wikilinks` — extracts `[[targets]]` including `[[target|alias]]`
- `test_backlinks_resolve` — link resolution fills target_note_id
- `test_rename_updates_backlinks` — renaming note X updates `[[X]]` in other files
- `test_search_notes_fts` — FTS search returns matches with snippets
- `test_reindex_reconciles` — add/remove/modify files, verify SQLite matches
- `test_delete_removes_file_and_index` — cascades to tags, links, FTS
- `test_get_graph_data` — returns correct nodes and edges
- `test_get_local_graph_depth` — BFS respects depth limit

### Integration Test
- `test_notes_full_flow` — create → add wikilinks → verify backlinks → rename → verify updated → search → graph → delete

### Frontend Verification
- `npx tsc --noEmit` — zero errors
- `npx biome check .` — clean
