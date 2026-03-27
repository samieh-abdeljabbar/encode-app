interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: "Cmd + O", action: "Quick Switcher" },
  { keys: "Cmd + \\", action: "Toggle sidebar" },
  { keys: "Cmd + Shift + F", action: "Focus search" },
  { keys: "Cmd + Enter", action: "Submit answer" },
  { keys: "→ / Space", action: "Next section (Reader)" },
  { keys: "←", action: "Previous section (Reader)" },
  { keys: "Cmd + =", action: "Zoom in" },
  { keys: "Cmd + -", action: "Zoom out" },
  { keys: "Cmd + 0", action: "Reset zoom" },
  { keys: "?", action: "Show shortcuts" },
  { keys: "Esc", action: "Close modal / cancel" },
];

export default function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-surface border border-border rounded-xl shadow-2xl p-6 w-[360px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text mb-4">Keyboard Shortcuts</h3>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{s.action}</span>
              <kbd className="app-font-mono text-[11px] bg-surface-2 border border-border px-2 py-0.5 rounded text-text">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-text-muted text-center mt-4">Press Esc to close</p>
      </div>
    </div>
  );
}
