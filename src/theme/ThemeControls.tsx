"use client";

import {
  appearances,
  themes,
  type AppearanceMode,
  type ThemeName,
} from "./preferences";
import { useThemePreferences } from "./ThemeProvider";

const themeLabels: Record<ThemeName, string> = {
  forge: "Forge",
  pulse: "Pulse",
  summit: "Summit",
};

const appearanceLabels: Record<AppearanceMode, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

export function ThemeControls() {
  const { appearance, resolvedAppearance, setAppearance, setTheme, theme } = useThemePreferences();

  return (
    <form className="theme-controls" aria-label="Theme and appearance preview controls">
      <label className="theme-controls__field">
        <span>Theme</span>
        <select
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemeName)}
          aria-label="Theme"
        >
          {themes.map((themeName) => (
            <option key={themeName} value={themeName}>
              {themeLabels[themeName]}
            </option>
          ))}
        </select>
      </label>

      <label className="theme-controls__field">
        <span>Appearance</span>
        <select
          value={appearance}
          onChange={(event) => setAppearance(event.target.value as AppearanceMode)}
          aria-label="Appearance"
        >
          {appearances.map((appearanceMode) => (
            <option key={appearanceMode} value={appearanceMode}>
              {appearanceLabels[appearanceMode]}
            </option>
          ))}
        </select>
      </label>

      <p className="theme-controls__status" aria-live="polite">
        Resolved {resolvedAppearance}
      </p>
    </form>
  );
}
