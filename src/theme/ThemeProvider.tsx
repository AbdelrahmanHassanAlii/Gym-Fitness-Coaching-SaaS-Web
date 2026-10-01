"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type AppearanceMode,
  type ThemeName,
  defaultAppearance,
  defaultTheme,
  parseAppearancePreference,
  parseThemePreference,
  resolveAppearance,
} from "./preferences";

type ThemeProviderProps = {
  children: ReactNode;
};

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browsers may deny storage in private or restricted contexts.
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(defaultTheme);
  const [appearance, setAppearanceState] = useState<AppearanceMode>(defaultAppearance);
  const [systemIsDark, setSystemIsDark] = useState(false);

  useEffect(() => {
    // Browser storage is read after SSR; the bootstrap script has already applied root attributes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(parseThemePreference(readStorage(THEME_STORAGE_KEY)));
    setAppearanceState(parseAppearancePreference(readStorage(APPEARANCE_STORAGE_KEY)));
    setSystemIsDark(systemPrefersDark());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const resolvedAppearance = useMemo(
    () => resolveAppearance(appearance, systemIsDark),
    [appearance, systemIsDark],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.appearance = appearance;
    root.dataset.resolvedAppearance = resolvedAppearance;
    root.style.colorScheme = resolvedAppearance;
  }, [appearance, resolvedAppearance, theme]);

  const setTheme = (nextTheme: ThemeName) => {
    setThemeState(nextTheme);
    writeStorage(THEME_STORAGE_KEY, nextTheme);
  };

  const setAppearance = (nextAppearance: AppearanceMode) => {
    setAppearanceState(nextAppearance);
    writeStorage(APPEARANCE_STORAGE_KEY, nextAppearance);
  };

  return (
    <ThemePreferenceContext.Provider
      value={{
        appearance,
        resolvedAppearance,
        setAppearance,
        setTheme,
        theme,
      }}
    >
      {children}
    </ThemePreferenceContext.Provider>
  );
}

type ThemePreferenceContextValue = {
  appearance: AppearanceMode;
  resolvedAppearance: "light" | "dark";
  setAppearance: (appearance: AppearanceMode) => void;
  setTheme: (theme: ThemeName) => void;
  theme: ThemeName;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function useThemePreferences(): ThemePreferenceContextValue {
  const context = useContext(ThemePreferenceContext);

  if (context === null) {
    throw new Error("useThemePreferences must be used within ThemeProvider");
  }

  return context;
}
