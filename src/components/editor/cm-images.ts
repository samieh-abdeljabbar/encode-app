import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { saveImage } from "../../lib/tauri";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a MIME type like "image/png" or "image/jpeg" to a file extension. */
function mimeToExtension(mime: string): string {
  const sub = mime.split("/")[1] ?? "png";
  if (sub === "jpeg") return "jpg";
  if (sub === "svg+xml") return "svg";
  return sub;
}

/** Build the markdown image snippet to insert. */
function imageMarkdown(relativePath: string): string {
  return `![](${relativePath})`;
}

// ---------------------------------------------------------------------------
// Paste handler
// ---------------------------------------------------------------------------

async function handlePaste(
  event: ClipboardEvent,
  view: EditorView,
): Promise<boolean> {
  const items = event.clipboardData?.items;
  if (!items) return false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.type.startsWith("image/")) continue;

    event.preventDefault();

    const blob = item.getAsFile();
    if (!blob) continue;

    const arrayBuffer = await blob.arrayBuffer();
    const data = Array.from(new Uint8Array(arrayBuffer));
    const extension = mimeToExtension(item.type);

    try {
      const relativePath = await saveImage(data, extension);
      const from = view.state.selection.main.from;
      view.dispatch({
        changes: { from, insert: imageMarkdown(relativePath) },
        selection: { anchor: from + imageMarkdown(relativePath).length },
      });
    } catch {
      // Silently ignore — do not bubble raw error detail
    }

    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Drop handler
// ---------------------------------------------------------------------------

async function handleDrop(
  event: DragEvent,
  view: EditorView,
): Promise<boolean> {
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return false;

  const imageFiles: File[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.startsWith("image/")) {
      imageFiles.push(file);
    }
  }

  if (imageFiles.length === 0) return false;

  event.preventDefault();

  // Determine drop position in the document
  const dropPos =
    view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
    view.state.doc.length;

  for (const file of imageFiles) {
    const arrayBuffer = await file.arrayBuffer();
    const data = Array.from(new Uint8Array(arrayBuffer));
    const extension = mimeToExtension(file.type);

    try {
      const relativePath = await saveImage(data, extension);
      const markdown = imageMarkdown(relativePath);
      view.dispatch({
        changes: { from: dropPos, insert: `${markdown}\n` },
        selection: { anchor: dropPos + markdown.length + 1 },
      });
    } catch {
      // Silently ignore
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const imageDropHandler: Extension = EditorView.domEventHandlers({
  paste(event, view) {
    void handlePaste(event, view);
    return false;
  },
  drop(event, view) {
    void handleDrop(event, view);
    return false;
  },
});
