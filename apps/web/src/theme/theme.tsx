import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "boligdata.theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Keep initial resolution in sync with the pre-paint bootstrap in index.html. */
export function resolveInitialTheme(): Theme {
  return readPreference() ?? systemTheme();
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0e141e" : "#ffffff");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Theme | null>(readPreference);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme = preference ?? system;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystem = () => setSystem(media.matches ? "dark" : "light");
    const updatePreference = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setPreference(readPreference());
    };
    updateSystem();
    media.addEventListener("change", updateSystem);
    window.addEventListener("storage", updatePreference);
    return () => {
      media.removeEventListener("change", updateSystem);
      window.removeEventListener("storage", updatePreference);
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setPreference(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the in-memory choice when storage is blocked. */ }
  }, []);
  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
