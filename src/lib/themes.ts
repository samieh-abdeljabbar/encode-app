export interface Theme {
  id: string;
  name: string;
  preview: string; // Color for the preview swatch
  colors: {
    bg: string;
    surface: string;
    "surface-2": string;
    panel: string;
    "panel-alt": string;
    "panel-active": string;
    border: string;
    "border-subtle": string;
    "border-strong": string;
    text: string;
    "text-muted": string;
    purple: string;
    accent: string;
    "accent-soft": string;
    "focus-ring": string;
    teal: string;
    coral: string;
    amber: string;
  };
}

export const themes: Theme[] = [
  {
    id: "midnight",
    name: "Midnight",
    preview: "#0f0f0f",
    colors: {
      bg: "#0b0d11",
      surface: "#10141a",
      "surface-2": "#171c24",
      panel: "#121821",
      "panel-alt": "#171d27",
      "panel-active": "#1c2430",
      border: "#26303d",
      "border-subtle": "#1d2531",
      "border-strong": "#3a4657",
      text: "#dce2ec",
      "text-muted": "#8791a3",
      purple: "#8c82ff",
      accent: "#8c82ff",
      "accent-soft": "rgba(140, 130, 255, 0.16)",
      "focus-ring": "rgba(140, 130, 255, 0.32)",
      teal: "#30b38a",
      coral: "#df725d",
      amber: "#c8994d",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    preview: "#282a36",
    colors: {
      bg: "#242631",
      surface: "#2a2d3a",
      "surface-2": "#323645",
      panel: "#2c3040",
      "panel-alt": "#34394a",
      "panel-active": "#3b4154",
      border: "#454b5f",
      "border-subtle": "#3b4152",
      "border-strong": "#5f6781",
      text: "#f8f8f2",
      "text-muted": "#8a93b7",
      purple: "#bd93f9",
      accent: "#bd93f9",
      "accent-soft": "rgba(189, 147, 249, 0.18)",
      "focus-ring": "rgba(189, 147, 249, 0.36)",
      teal: "#50fa7b",
      coral: "#ff5555",
      amber: "#f1fa8c",
    },
  },
  {
    id: "light",
    name: "Light",
    preview: "#ffffff",
    colors: {
      bg: "#eceef3",
      surface: "#f7f8fb",
      "surface-2": "#e8ebf2",
      panel: "#ffffff",
      "panel-alt": "#f4f6fb",
      "panel-active": "#edf1f8",
      border: "#d1d7e3",
      "border-subtle": "#dbe1ec",
      "border-strong": "#b7c1d0",
      text: "#1f2430",
      "text-muted": "#6c7587",
      purple: "#6d5dd3",
      accent: "#6d5dd3",
      "accent-soft": "rgba(109, 93, 211, 0.12)",
      "focus-ring": "rgba(109, 93, 211, 0.26)",
      teal: "#0d7d5f",
      coral: "#c44425",
      amber: "#a36312",
    },
  },
  {
    id: "cherry-blossom",
    name: "Cherry Blossom",
    preview: "#fdf2f4",
    colors: {
      bg: "#f6eef1",
      surface: "#fff6f8",
      "surface-2": "#f8e8ed",
      panel: "#fff9fb",
      "panel-alt": "#fff2f6",
      "panel-active": "#f9e7ee",
      border: "#e8c8d2",
      "border-subtle": "#efd7de",
      "border-strong": "#d9a8b7",
      text: "#39222b",
      "text-muted": "#896775",
      purple: "#c45b9a",
      accent: "#c45b9a",
      "accent-soft": "rgba(196, 91, 154, 0.14)",
      "focus-ring": "rgba(196, 91, 154, 0.28)",
      teal: "#2d8b6f",
      coral: "#d4556b",
      amber: "#c48b2c",
    },
  },
  {
    id: "scholar-night",
    name: "Scholar Night",
    preview: "#0c1117",
    colors: {
      bg: "#0c1117",
      surface: "#111821",
      "surface-2": "#17212c",
      panel: "#131b25",
      "panel-alt": "#18212d",
      "panel-active": "#1d2936",
      border: "#283646",
      "border-subtle": "#1f2a36",
      "border-strong": "#3c4e62",
      text: "#e6edf5",
      "text-muted": "#94a3b8",
      purple: "#7c8cff",
      accent: "#7c8cff",
      "accent-soft": "rgba(124, 140, 255, 0.16)",
      "focus-ring": "rgba(124, 140, 255, 0.3)",
      teal: "#2fa58d",
      coral: "#d97757",
      amber: "#c59a3d",
    },
  },
  {
    id: "parchment",
    name: "Parchment",
    preview: "#f2ebdd",
    colors: {
      bg: "#f2ebdd",
      surface: "#f8f2e8",
      "surface-2": "#ebe0cf",
      panel: "#fbf7ef",
      "panel-alt": "#f5eee2",
      "panel-active": "#ede2d1",
      border: "#d4c5af",
      "border-subtle": "#e4d7c4",
      "border-strong": "#bcae99",
      text: "#2a241b",
      "text-muted": "#6e6254",
      purple: "#6b5fa8",
      accent: "#6b5fa8",
      "accent-soft": "rgba(107, 95, 168, 0.12)",
      "focus-ring": "rgba(107, 95, 168, 0.22)",
      teal: "#2d7a67",
      coral: "#b85c3f",
      amber: "#a8771f",
    },
  },
  {
    id: "forest-archive",
    name: "Forest Archive",
    preview: "#0e1513",
    colors: {
      bg: "#0e1513",
      surface: "#121c19",
      "surface-2": "#182621",
      panel: "#15201c",
      "panel-alt": "#1b2823",
      "panel-active": "#223129",
      border: "#2b3c35",
      "border-subtle": "#23312b",
      "border-strong": "#41584e",
      text: "#e4eee7",
      "text-muted": "#8aa095",
      purple: "#a58ad8",
      accent: "#a58ad8",
      "accent-soft": "rgba(165, 138, 216, 0.14)",
      "focus-ring": "rgba(165, 138, 216, 0.28)",
      teal: "#3d9d84",
      coral: "#c96b4b",
      amber: "#be8f3d",
    },
  },
  {
    id: "slate-brass",
    name: "Slate & Brass",
    preview: "#111315",
    colors: {
      bg: "#111315",
      surface: "#171a1d",
      "surface-2": "#1d2124",
      panel: "#191c1f",
      "panel-alt": "#202428",
      "panel-active": "#272d32",
      border: "#343a40",
      "border-subtle": "#2a2f34",
      "border-strong": "#4f5963",
      text: "#e7e1d6",
      "text-muted": "#978e80",
      purple: "#c3a35a",
      accent: "#c3a35a",
      "accent-soft": "rgba(195, 163, 90, 0.15)",
      "focus-ring": "rgba(195, 163, 90, 0.28)",
      teal: "#3b9d8a",
      coral: "#c86a4a",
      amber: "#d0a246",
    },
  },
];

/** Apply a theme by setting CSS custom properties on <html> */
export function applyTheme(themeId: string): void {
  const theme = themes.find((t) => t.id === themeId) || themes[0];
  const root = document.documentElement;

  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--color-${key}`, value);
  }

  localStorage.setItem("encode-theme", themeId);
  window.dispatchEvent(new CustomEvent("encode-theme-change", { detail: themeId }));
}

/** Get the current theme ID */
export function getCurrentTheme(): string {
  return localStorage.getItem("encode-theme") || "midnight";
}
