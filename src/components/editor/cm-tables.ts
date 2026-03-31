import { syntaxTree } from "@codemirror/language";
import { type Extension, RangeSet, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type KeyBinding,
  WidgetType,
  keymap,
} from "@codemirror/view";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the line looks like a markdown table row: | ... | */
function isTableLine(text: string): boolean {
  return /^\|.*\|$/.test(text.trim());
}

/**
 * Given a table row string, return the number of data columns (pipe count - 1).
 * e.g. "| A | B | C |" → 3
 */
function countColumns(lineText: string): number {
  const pipes = (lineText.match(/\|/g) ?? []).length;
  return Math.max(pipes - 1, 1);
}

/**
 * Find the position of the Nth pipe on the line (0-indexed pipe count).
 * Returns -1 if not found.
 */
function nthPipe(lineText: string, n: number): number {
  let count = 0;
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === "|") {
      if (count === n) return i;
      count++;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Key handlers
// ---------------------------------------------------------------------------

/**
 * Tab: move to next cell, or add a new row if at the last cell of the last row.
 */
function tabForward({
  state,
  dispatch,
}: import("@codemirror/view").EditorView): boolean {
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.head);

  if (!isTableLine(line.text)) return false;

  // Find which cell we are in by counting pipes before cursor
  const posInLine = sel.head - line.from;
  const textBefore = line.text.slice(0, posInLine);
  const pipesBeforeCursor = (textBefore.match(/\|/g) ?? []).length;

  // Count total pipes on this line
  const totalPipes = (line.text.match(/\|/g) ?? []).length;
  const isLastCellOnRow = pipesBeforeCursor >= totalPipes - 1;

  if (!isLastCellOnRow) {
    // Move to start of next cell (just after the next pipe)
    const nextPipeIdx = nthPipe(line.text, pipesBeforeCursor);
    if (nextPipeIdx === -1) return false;

    // Skip any whitespace after the pipe
    let cellStart = nextPipeIdx + 1;
    while (cellStart < line.text.length && line.text[cellStart] === " ") {
      cellStart++;
    }

    dispatch({
      selection: { anchor: line.from + cellStart },
    });
    return true;
  }

  // Last cell of this row — move to first cell of next row
  if (line.number < state.doc.lines) {
    const nextLine = state.doc.line(line.number + 1);

    if (isTableLine(nextLine.text)) {
      // Move to first data cell of next row (after the opening |)
      const firstPipe = nextLine.text.indexOf("|");
      let cellStart = firstPipe + 1;
      while (
        cellStart < nextLine.text.length &&
        nextLine.text[cellStart] === " "
      ) {
        cellStart++;
      }
      dispatch({
        selection: { anchor: nextLine.from + cellStart },
      });
      return true;
    }
  }

  // At the last row — insert a new row with empty cells
  const cols = countColumns(line.text);
  const emptyCell = " Cell     ";
  const newRow = `\n|${Array(cols).fill(emptyCell).join("|")}|`;

  dispatch({
    changes: { from: line.to, insert: newRow },
    selection: { anchor: line.to + 2 }, // position after "\n|"
  });
  return true;
}

/**
 * Shift+Tab: move to previous cell.
 */
function tabBackward({
  state,
  dispatch,
}: import("@codemirror/view").EditorView): boolean {
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.head);

  if (!isTableLine(line.text)) return false;

  const posInLine = sel.head - line.from;
  const textBefore = line.text.slice(0, posInLine);
  const pipesBeforeCursor = (textBefore.match(/\|/g) ?? []).length;

  const isFirstCellOnRow = pipesBeforeCursor <= 1;

  if (!isFirstCellOnRow) {
    // Move to start of previous cell (after the pipe that is 2 pipes back)
    const targetPipeIdx = nthPipe(line.text, pipesBeforeCursor - 2);
    if (targetPipeIdx === -1) return false;

    let cellStart = targetPipeIdx + 1;
    while (cellStart < line.text.length && line.text[cellStart] === " ") {
      cellStart++;
    }

    dispatch({
      selection: { anchor: line.from + cellStart },
    });
    return true;
  }

  // First cell — move to last cell of previous row
  if (line.number > 1) {
    const prevLine = state.doc.line(line.number - 1);

    if (isTableLine(prevLine.text)) {
      const totalPipes = (prevLine.text.match(/\|/g) ?? []).length;
      // Last data cell starts after pipe at index (totalPipes - 2)
      const lastCellPipeIdx = nthPipe(prevLine.text, totalPipes - 2);
      if (lastCellPipeIdx === -1) return false;

      let cellStart = lastCellPipeIdx + 1;
      while (
        cellStart < prevLine.text.length &&
        prevLine.text[cellStart] === " "
      ) {
        cellStart++;
      }

      dispatch({
        selection: { anchor: prevLine.from + cellStart },
      });
      return true;
    }
  }

  // Nothing to go back to — let default behavior run
  return false;
}

// ---------------------------------------------------------------------------
// Table Widget — renders markdown table as HTML <table>
// ---------------------------------------------------------------------------

class TableWidget extends WidgetType {
  constructor(private readonly source: string) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-table-widget";
    container.style.margin = "8px 0";
    container.style.overflowX = "auto";

    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    table.style.fontSize = "14px";
    table.style.fontFamily = "'Inter', system-ui, sans-serif";

    const lines = this.source.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      container.textContent = this.source;
      return container;
    }

    const parseRow = (line: string): string[] =>
      line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());

    // Header row
    const headerCells = parseRow(lines[0]);
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const cell of headerCells) {
      const th = document.createElement("th");
      th.textContent = cell;
      th.style.padding = "8px 12px";
      th.style.borderBottom = "2px solid #c8c1b0";
      th.style.textAlign = "left";
      th.style.fontWeight = "600";
      th.style.color = "#1a1f17";
      th.style.backgroundColor = "#f0ece3";
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Data rows (skip separator line at index 1)
    const tbody = document.createElement("tbody");
    for (let i = 2; i < lines.length; i++) {
      const cells = parseRow(lines[i]);
      const tr = document.createElement("tr");
      for (const cell of cells) {
        const td = document.createElement("td");
        td.textContent = cell;
        td.style.padding = "8px 12px";
        td.style.borderBottom = "1px solid #d6d0c3";
        td.style.color = "#1a1f17";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);

    return container;
  }

  eq(other: TableWidget): boolean {
    return this.source === other.source;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildTableDecorations(
  state: import("@codemirror/state").EditorState,
): RangeSet<Decoration> {
  const decorations: import("@codemirror/state").Range<Decoration>[] = [];
  const cursor = state.selection.main;

  syntaxTree(state).iterate({
    enter: ({ type, from, to }) => {
      if (type.name === "Table") {
        // Skip if cursor is inside this table
        if (cursor.from >= from && cursor.to <= to) return;

        const source = state.doc.sliceString(from, to);
        decorations.push(
          Decoration.replace({
            widget: new TableWidget(source),
            block: true,
          }).range(from, to),
        );
      }
    },
  });

  return RangeSet.of(decorations.sort((a, b) => a.from - b.from));
}

const tableDecorationField = StateField.define<RangeSet<Decoration>>({
  create(state) {
    return buildTableDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) {
      return buildTableDecorations(tr.state);
    }
    return value.map(tr.changes);
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const tableKeymap: KeyBinding[] = [
  { key: "Tab", run: tabForward },
  { key: "Shift-Tab", run: tabBackward },
];

export const tableNavigation: Extension = keymap.of(tableKeymap);

export const tableRendering: Extension = tableDecorationField;
