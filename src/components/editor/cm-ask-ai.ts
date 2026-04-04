import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export type AskAiHandler = (
  selectedText: string,
  coords: { top: number; left: number },
) => void;

/**
 * CM6 ViewPlugin that shows a floating "Ask AI" button when text is selected.
 * Clicking the button invokes the handler with the selected text and position.
 */
function createAskAiPlugin(onAskAi: AskAiHandler) {
  return ViewPlugin.fromClass(
    class {
      tooltip: HTMLDivElement;
      view: EditorView;

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
        view.dom.parentElement?.appendChild(this.tooltip);

        this.tooltip.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const sel = view.state.selection.main;
          const text = view.state.sliceDoc(sel.from, sel.to).trim();
          if (!text) return;
          const coords = view.coordsAtPos(sel.to);
          if (coords) {
            this.hide();
            onAskAi(text, { top: coords.bottom + 8, left: coords.left });
          }
        });
      }

      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged || update.focusChanged) {
          this.reposition();
        }
      }

      reposition() {
        const sel = this.view.state.selection.main;
        if (sel.empty || !this.view.hasFocus) {
          this.hide();
          return;
        }

        const text = this.view.state.sliceDoc(sel.from, sel.to).trim();
        if (!text || text.length < 3) {
          this.hide();
          return;
        }

        const coords = this.view.coordsAtPos(sel.from);
        if (!coords) {
          this.hide();
          return;
        }

        // Position above the selection start
        const editorRect = this.view.dom.getBoundingClientRect();
        const toolbarWidth = 80;
        let left = coords.left - editorRect.left;
        left = Math.max(4, Math.min(left, editorRect.width - toolbarWidth - 4));

        this.tooltip.style.display = "block";
        this.tooltip.style.top = `${coords.top - editorRect.top - 32}px`;
        this.tooltip.style.left = `${left}px`;
      }

      hide() {
        this.tooltip.style.display = "none";
      }

      destroy() {
        this.tooltip.remove();
      }
    },
  );
}

/** CSS for the floating toolbar */
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
});

/**
 * Create the Ask AI extension — call with a handler that opens the Q&A form.
 */
export function askAiExtension(onAskAi: AskAiHandler) {
  return [createAskAiPlugin(onAskAi), askAiTheme];
}
