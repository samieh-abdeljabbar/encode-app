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
  const [themeName, setThemeName] = useState(
    () => localStorage.getItem("encode-theme") ?? "parchment",
  );
  const [customCSS, setCustomCSS] = useState(
    () => localStorage.getItem("encode-custom-css") ?? "",
  );

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
    localStorage.setItem("encode-theme", name);
  };

  const handleSetCustomCSS = (css: string) => {
    setCustomCSS(css);
    localStorage.setItem("encode-custom-css", css);
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
