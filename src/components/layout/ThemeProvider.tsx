import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { THEMES, type Theme } from "../../lib/themes";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (name: string) => void;
  customCSS: string;
  setCustomCSS: (css: string) => void;
}>({
  theme: THEMES[0],
  setTheme: () => {},
  customCSS: "",
  setCustomCSS: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState(() => {
    try {
      return localStorage.getItem("encode-theme") ?? "parchment";
    } catch {
      return "parchment";
    }
  });
  const [customCSS, setCustomCSS] = useState(() => {
    try {
      return localStorage.getItem("encode-custom-css") ?? "";
    } catch {
      return "";
    }
  });

  const theme = THEMES.find((t) => t.name === themeName) ?? THEMES[0];

  // Apply theme CSS variables to :root
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.colors)) {
      root.style.setProperty(key, value);
    }
  }, [theme]);

  // Apply custom CSS
  useEffect(() => {
    let styleEl = document.getElementById("encode-custom-css");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "encode-custom-css";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = customCSS;
  }, [customCSS]);

  const handleSetTheme = (name: string) => {
    setThemeName(name);
    try {
      localStorage.setItem("encode-theme", name);
    } catch {
      /* test env */
    }
  };

  const handleSetCustomCSS = (css: string) => {
    setCustomCSS(css);
    try {
      localStorage.setItem("encode-custom-css", css);
    } catch {
      /* test env */
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: handleSetTheme,
        customCSS,
        setCustomCSS: handleSetCustomCSS,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
