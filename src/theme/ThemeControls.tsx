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

type ThemeControlsLabels = {
  appearanceLabel: string;
  resolvedPrefix: string;
  themeLabel: string;
};

type ThemeControlsProps = {
  labels?: ThemeControlsLabels;
};

const defaultLabels: ThemeControlsLabels = {
  appearanceLabel: "Appearance",
  resolvedPrefix: "Resolved",
  themeLabel: "Theme",
};

export function ThemeControls({ labels = defaultLabels }: ThemeControlsProps) {
  const { appearance, resolvedAppearance, setAppearance, setTheme, theme } =
    useThemePreferences();

  return (
    <form
      className="theme-controls"
      aria-label="Theme and appearance preview controls"
    >
      <label className="theme-controls__field">
        <span>{labels.themeLabel}</span>
        <select
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemeName)}
          aria-label={labels.themeLabel}
        >
          {themes.map((themeName) => (
            <option key={themeName} value={themeName}>
              {themeLabels[themeName]}
            </option>
          ))}
        </select>
      </label>

      <label className="theme-controls__field">
        <span>{labels.appearanceLabel}</span>
        <select
          value={appearance}
          onChange={(event) =>
            setAppearance(event.target.value as AppearanceMode)
          }
          aria-label={labels.appearanceLabel}
        >
          {appearances.map((appearanceMode) => (
            <option key={appearanceMode} value={appearanceMode}>
              {appearanceLabels[appearanceMode]}
            </option>
          ))}
        </select>
      </label>

      <p className="theme-controls__status" aria-live="polite">
        {labels.resolvedPrefix} {resolvedAppearance}
      </p>
    </form>
  );
}
