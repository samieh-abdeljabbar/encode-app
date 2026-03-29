type ShortcutHandler = () => void;

interface Shortcut {
  key: string;
  meta: boolean;
  shift: boolean;
  label: string;
  handler: ShortcutHandler;
}

const registry: Shortcut[] = [];

export function registerShortcut(
  key: string,
  handler: ShortcutHandler,
  label: string,
  options: { meta?: boolean; shift?: boolean } = {},
) {
  const k = key.toLowerCase();
  const meta = options.meta ?? true;
  const shift = options.shift ?? false;

  // Replace existing registration for the same key combo (idempotent)
  const existing = registry.findIndex(
    (s) => s.key === k && s.meta === meta && s.shift === shift,
  );
  const entry = { key: k, meta, shift, label, handler };
  if (existing !== -1) {
    registry[existing] = entry;
  } else {
    registry.push(entry);
  }
}

export function unregisterShortcut(
  key: string,
  options: { meta?: boolean; shift?: boolean } = {},
) {
  const k = key.toLowerCase();
  const meta = options.meta ?? true;
  const shift = options.shift ?? false;
  const idx = registry.findIndex(
    (s) => s.key === k && s.meta === meta && s.shift === shift,
  );
  if (idx !== -1) registry.splice(idx, 1);
}

export function getShortcuts(): readonly Shortcut[] {
  return registry;
}

export function handleKeyDown(e: KeyboardEvent) {
  const isMeta = e.metaKey || e.ctrlKey;

  for (const shortcut of registry) {
    if (
      shortcut.key === e.key.toLowerCase() &&
      shortcut.meta === isMeta &&
      shortcut.shift === e.shiftKey
    ) {
      e.preventDefault();
      shortcut.handler();
      return;
    }
  }
}
