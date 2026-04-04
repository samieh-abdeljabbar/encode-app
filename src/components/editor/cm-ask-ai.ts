import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export type AskAiHandler = (
  selectedText: string,
  coords: { top: number; left: number },
) => void;

type MenuPosition = {
  top: number;
  left: number;
};

/**
 * CM6 ViewPlugin that shows a floating "Ask AI" button when text is selected
 * and exposes a custom right-click Study Help menu entry for highlighted text.
 */
function createAskAiPlugin(onAskAi: AskAiHandler) {
  return ViewPlugin.fromClass(
    class {
      tooltip: HTMLDivElement;
      contextMenu: HTMLDivElement;
      view: EditorView;
      menuPosition: MenuPosition | null = null;
      onDocumentPointerDown: (event: MouseEvent) => void;
      onContextMenu: (event: MouseEvent) => void;

      constructor(view: EditorView) {
        this.view = view;

        this.tooltip = document.createElement("div");
        this.tooltip.className = "cm-ask-ai-toolbar";
        this.tooltip.innerHTML = `<button class="cm-ask-ai-btn" title="Ask for study help about this selection">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
          </svg>
          <span>Study Help</span>
        </button>`;
        this.tooltip.style.display = "none";

        this.contextMenu = document.createElement("div");
        this.contextMenu.className = "cm-ask-ai-context-menu";
        this.contextMenu.innerHTML = `<button class="cm-ask-ai-context-item" title="Ask for study help about this selection">
          Study Help
        </button>`;
        this.contextMenu.style.display = "none";

        const parent = view.dom.parentElement;
        parent?.appendChild(this.tooltip);
        parent?.appendChild(this.contextMenu);

        this.tooltip.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.openAskAi();
        });

        this.contextMenu.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.openAskAi();
        });

        this.onDocumentPointerDown = (event) => {
          const target = event.target as Node;
          if (
            this.contextMenu.contains(target) ||
            this.tooltip.contains(target) ||
            this.view.dom.contains(target)
          ) {
            return;
          }
          this.hideContextMenu();
        };

        this.onContextMenu = (event) => {
          const selection = this.view.state.selection.main;
          const text = this.view.state
            .sliceDoc(selection.from, selection.to)
            .trim();
          if (selection.empty || text.length < 3) {
            this.hideContextMenu();
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          this.menuPosition = {
            top: event.clientY + 6,
            left: event.clientX + 6,
          };
          this.showContextMenu();
        };

        document.addEventListener("mousedown", this.onDocumentPointerDown);
        this.view.dom.addEventListener("contextmenu", this.onContextMenu);
      }

      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged || update.focusChanged) {
          this.repositionToolbar();
          if (update.selectionSet || update.docChanged) {
            this.hideContextMenu();
          }
        }
      }

      openAskAi() {
        const selection = this.view.state.selection.main;
        const text = this.view.state
          .sliceDoc(selection.from, selection.to)
          .trim();
        if (!text) return;

        const coords = this.menuPosition ?? {
          top: this.view.coordsAtPos(selection.to)?.bottom ?? 0,
          left: this.view.coordsAtPos(selection.to)?.left ?? 0,
        };

        this.hideContextMenu();
        this.hideToolbar();
        onAskAi(text, coords);
      }

      repositionToolbar() {
        const selection = this.view.state.selection.main;
        if (selection.empty || !this.view.hasFocus) {
          this.hideToolbar();
          return;
        }

        const text = this.view.state
          .sliceDoc(selection.from, selection.to)
          .trim();
        if (!text || text.length < 3) {
          this.hideToolbar();
          return;
        }

        const coords = this.view.coordsAtPos(selection.from);
        if (!coords) {
          this.hideToolbar();
          return;
        }

        const editorRect = this.view.dom.getBoundingClientRect();
        const toolbarWidth = 96;
        let left = coords.left - editorRect.left;
        left = Math.max(4, Math.min(left, editorRect.width - toolbarWidth - 4));

        this.tooltip.style.display = "block";
        this.tooltip.style.top = `${coords.top - editorRect.top - 32}px`;
        this.tooltip.style.left = `${left}px`;
      }

      showContextMenu() {
        if (!this.menuPosition) return;

        this.contextMenu.style.display = "block";
        this.contextMenu.style.top = `${this.menuPosition.top}px`;
        this.contextMenu.style.left = `${this.menuPosition.left}px`;
      }

      hideToolbar() {
        this.tooltip.style.display = "none";
      }

      hideContextMenu() {
        this.contextMenu.style.display = "none";
        this.menuPosition = null;
      }

      destroy() {
        document.removeEventListener("mousedown", this.onDocumentPointerDown);
        this.view.dom.removeEventListener("contextmenu", this.onContextMenu);
        this.tooltip.remove();
        this.contextMenu.remove();
      }
    },
  );
}

const askAiTheme = EditorView.baseTheme({
  "& .cm-ask-ai-toolbar": {
    position: "absolute",
    zIndex: "50",
    pointerEvents: "auto",
  },
  "& .cm-ask-ai-btn": {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 10px",
    borderRadius: "8px",
    border: "1px solid var(--color-border, #e0e0e0)",
    background: "var(--color-panel, #fff)",
    color: "var(--color-accent, #7c5cbf)",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
    transition: "background 0.15s, box-shadow 0.15s",
    whiteSpace: "nowrap",
    lineHeight: "1",
  },
  "& .cm-ask-ai-btn:hover": {
    background: "var(--color-surface, #f8f8f8)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
  },
  "& .cm-ask-ai-context-menu": {
    position: "fixed",
    zIndex: "70",
    overflow: "hidden",
    borderRadius: "12px",
    border: "1px solid var(--color-border, #e0e0e0)",
    background: "var(--color-panel, #fff)",
    boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
  },
  "& .cm-ask-ai-context-item": {
    display: "block",
    width: "100%",
    border: "0",
    background: "transparent",
    padding: "10px 14px",
    textAlign: "left",
    color: "var(--color-text, #2b2b2b)",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  "& .cm-ask-ai-context-item:hover": {
    background: "var(--color-surface, #f8f8f8)",
    color: "var(--color-accent, #7c5cbf)",
  },
});

export function askAiExtension(onAskAi: AskAiHandler) {
  return [createAskAiPlugin(onAskAi), askAiTheme];
}
