import {
  APPEARANCE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  appearances,
  defaultAppearance,
  defaultTheme,
  themes,
} from "./preferences";

export function getThemeBootstrapScript(): string {
  return `
(() => {
  const themeStorageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
  const appearanceStorageKey = ${JSON.stringify(APPEARANCE_STORAGE_KEY)};
  const themes = ${JSON.stringify(themes)};
  const appearances = ${JSON.stringify(appearances)};
  const defaultTheme = ${JSON.stringify(defaultTheme)};
  const defaultAppearance = ${JSON.stringify(defaultAppearance)};
  const root = document.documentElement;

  const read = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const theme = themes.includes(read(themeStorageKey)) ? read(themeStorageKey) : defaultTheme;
  const appearance = appearances.includes(read(appearanceStorageKey))
    ? read(appearanceStorageKey)
    : defaultAppearance;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedAppearance = appearance === "system" ? (prefersDark ? "dark" : "light") : appearance;

  root.dataset.theme = theme;
  root.dataset.appearance = appearance;
  root.dataset.resolvedAppearance = resolvedAppearance;
  root.style.colorScheme = resolvedAppearance;
})();
  `.trim();
}
