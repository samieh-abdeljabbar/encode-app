export type FontSlot = "ui" | "reading" | "mono";

export interface FontOption {
  id: string;
  label: string;
  css: string;
}

const FONT_VARIABLES: Record<FontSlot, string> = {
  ui: "--font-sans",
  reading: "--font-serif",
  mono: "--font-mono",
};

const FONT_STORAGE_KEYS: Record<FontSlot, string> = {
  ui: "encode-ui-font",
  reading: "encode-reading-font",
  mono: "encode-mono-font",
};

const FONT_STACKS: Record<string, string> = {
  inter: "'Inter', system-ui, sans-serif",
  "ibm-plex-sans": "'IBM Plex Sans', system-ui, sans-serif",
  manrope: "'Manrope', system-ui, sans-serif",
  "source-serif-4": "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif",
  literata: "'Literata Variable', 'Literata', Georgia, serif",
  georgia: "Georgia, 'Times New Roman', serif",
  system: "system-ui, -apple-system, sans-serif",
  "jetbrains-mono": "'JetBrains Mono', 'SFMono-Regular', ui-monospace, monospace",
  "system-mono": "ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
};

const DEFAULT_FONT_IDS: Record<FontSlot, string> = {
  ui: "inter",
  reading: "source-serif-4",
  mono: "jetbrains-mono",
};

const LEGACY_READING_FONT_MAP: Record<string, string> = {
  inter: "inter",
  georgia: "georgia",
  system: "system",
  mono: "jetbrains-mono",
};

export const UI_FONT_OPTIONS: FontOption[] = [
  { id: "inter", label: "Inter", css: FONT_STACKS.inter },
  { id: "ibm-plex-sans", label: "IBM Plex Sans", css: FONT_STACKS["ibm-plex-sans"] },
  { id: "manrope", label: "Manrope", css: FONT_STACKS.manrope },
  { id: "system", label: "System", css: FONT_STACKS.system },
];

export const READING_FONT_OPTIONS: FontOption[] = [
  { id: "source-serif-4", label: "Source Serif 4", css: FONT_STACKS["source-serif-4"] },
  { id: "literata", label: "Literata", css: FONT_STACKS.literata },
  { id: "georgia", label: "Georgia", css: FONT_STACKS.georgia },
  { id: "inter", label: "Inter", css: FONT_STACKS.inter },
  { id: "ibm-plex-sans", label: "IBM Plex Sans", css: FONT_STACKS["ibm-plex-sans"] },
  { id: "manrope", label: "Manrope", css: FONT_STACKS.manrope },
  { id: "system", label: "System", css: FONT_STACKS.system },
  { id: "jetbrains-mono", label: "JetBrains Mono", css: FONT_STACKS["jetbrains-mono"] },
];

export const MONO_FONT_OPTIONS: FontOption[] = [
  { id: "jetbrains-mono", label: "JetBrains Mono", css: FONT_STACKS["jetbrains-mono"] },
  { id: "system-mono", label: "System Mono", css: FONT_STACKS["system-mono"] },
];

function fontStack(fontId: string | null | undefined, slot: FontSlot): string {
  const fallbackId = DEFAULT_FONT_IDS[slot];
  return FONT_STACKS[fontId || ""] || FONT_STACKS[fallbackId];
}

export function getStoredFontId(slot: FontSlot): string {
  return localStorage.getItem(FONT_STORAGE_KEYS[slot]) || DEFAULT_FONT_IDS[slot];
}

export function applyFontPreference(slot: FontSlot, fontId: string): string {
  const css = fontStack(fontId, slot);
  document.documentElement.style.setProperty(FONT_VARIABLES[slot], css);
  return css;
}

export function persistFontPreference(slot: FontSlot, fontId: string): string {
  const nextId = FONT_STACKS[fontId] ? fontId : DEFAULT_FONT_IDS[slot];
  localStorage.setItem(FONT_STORAGE_KEYS[slot], nextId);
  return applyFontPreference(slot, nextId);
}

export function initializeFontPreferences(): void {
  const storedUi = localStorage.getItem(FONT_STORAGE_KEYS.ui);
  const storedReading = localStorage.getItem(FONT_STORAGE_KEYS.reading);
  const storedMono = localStorage.getItem(FONT_STORAGE_KEYS.mono);

  if (!storedUi && !storedReading && !storedMono) {
    const legacyFont = localStorage.getItem("encode-font-family");
    if (legacyFont) {
      localStorage.setItem(FONT_STORAGE_KEYS.ui, DEFAULT_FONT_IDS.ui);
      localStorage.setItem(FONT_STORAGE_KEYS.reading, LEGACY_READING_FONT_MAP[legacyFont] || DEFAULT_FONT_IDS.reading);
      localStorage.setItem(FONT_STORAGE_KEYS.mono, DEFAULT_FONT_IDS.mono);
      localStorage.removeItem("encode-font-family");
    }
  }

  applyFontPreference("ui", getStoredFontId("ui"));
  applyFontPreference("reading", getStoredFontId("reading"));
  applyFontPreference("mono", getStoredFontId("mono"));
}
