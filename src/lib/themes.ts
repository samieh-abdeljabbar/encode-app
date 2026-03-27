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
