export interface Theme {
  id: string;
  name: string;
  preview: string; // Color for the preview swatch
  colors: {
    bg: string;
    surface: string;
    "surface-2": string;
    border: string;
    text: string;
    "text-muted": string;
    purple: string;
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
      bg: "#0f0f0f",
      surface: "#1a1a1a",
      "surface-2": "#252525",
      border: "#333333",
      text: "#e5e5e5",
      "text-muted": "#888880",
      purple: "#7F77DD",
      teal: "#1D9E75",
      coral: "#D85A30",
      amber: "#BA7517",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    preview: "#282a36",
    colors: {
      bg: "#282a36",
      surface: "#2d303e",
      "surface-2": "#343746",
      border: "#44475a",
      text: "#f8f8f2",
      "text-muted": "#6272a4",
      purple: "#bd93f9",
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
      bg: "#f5f5f5",
      surface: "#ffffff",
      "surface-2": "#eaeaea",
      border: "#d4d4d4",
      text: "#1a1a1a",
      "text-muted": "#737373",
      purple: "#6d5dd3",
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
      bg: "#fdf2f4",
      surface: "#fff5f7",
      "surface-2": "#fce7eb",
      border: "#f5c6ce",
      text: "#3d1f27",
      "text-muted": "#9b6b7a",
      purple: "#c45b9a",
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
}

/** Get the current theme ID */
export function getCurrentTheme(): string {
  return localStorage.getItem("encode-theme") || "midnight";
}
