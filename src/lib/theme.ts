import { useEffect, useState } from "react";

/** Studio themes; each id has a matching `[data-theme]` block in styles.css. */
export const THEMES = [
  { id: "dark", label: "Dark", mode: "dark" },
  { id: "light", label: "Light", mode: "light" },
  { id: "paper", label: "Paper", mode: "light" },
  { id: "midnight", label: "Midnight", mode: "dark" },
  { id: "moss", label: "Moss", mode: "dark" },
  { id: "dusk", label: "Dusk", mode: "dark" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "dark";

const THEME_KEY = "studio-theme";

function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = id;
  root.classList.toggle(
    "dark",
    THEMES.find((theme) => theme.id === id)?.mode === "dark",
  );
}

/**
 * Runs in <head> before first paint so a saved theme doesn't flash the default.
 * Self-contained: it can't import anything.
 */
export const THEME_SCRIPT = `(() => {
  try {
    const themes = ${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.mode])))};
    const id = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    if (!themes[id]) return;
    document.documentElement.dataset.theme = id;
    document.documentElement.classList.toggle("dark", themes[id] === "dark");
  } catch {}
})()`;

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // localStorage only exists on the client; reading it during render would break hydration.
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (isTheme(saved)) setThemeState(saved);
  }, []);

  const setTheme = (id: ThemeId) => {
    setThemeState(id);
    applyTheme(id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      // Private mode: the theme still applies for this visit.
    }
  };

  return { theme, setTheme };
}
