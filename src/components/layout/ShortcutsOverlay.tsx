import { X } from "lucide-react";
import { getShortcuts } from "../../lib/shortcuts";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsOverlay({ open, onClose }: Props) {
  if (!open) return null;

  const shortcuts = getShortcuts();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/10 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <dialog
        className="w-full max-w-sm rounded-2xl border border-border bg-panel p-6 shadow-xl shadow-text/5 open:block"
        onClick={(e) => e.stopPropagation()}
        aria-label="Keyboard Shortcuts"
        open
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-text">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-panel-alt hover:text-text"
          >
            <X size={15} />
          </button>
        </div>
        <div className="space-y-1">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between rounded-lg px-2 py-2"
            >
              <span className="text-[13px] text-text-muted">{s.label}</span>
              <kbd className="rounded-md border border-border-subtle bg-panel-alt px-2 py-0.5 font-mono text-[11px] text-text-muted">
                {s.meta ? "⌘" : ""}
                {s.shift ? "⇧" : ""}
                {s.key.toUpperCase()}
              </kbd>
            </div>
          ))}
          {shortcuts.length === 0 && (
            <p className="py-4 text-center text-xs text-text-muted">
              No shortcuts registered yet.
            </p>
          )}
        </div>
      </dialog>
    </div>
  );
}
