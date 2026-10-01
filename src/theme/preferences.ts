export const THEME_STORAGE_KEY = "hassan-web-theme";
export const APPEARANCE_STORAGE_KEY = "hassan-web-appearance";

export const themes = ["summit", "pulse", "forge"] as const;
export const appearances = ["light", "dark", "system"] as const;

export type ThemeName = (typeof themes)[number];
export type AppearanceMode = (typeof appearances)[number];
export type ResolvedAppearance = Exclude<AppearanceMode, "system">;

export const defaultTheme: ThemeName = "summit";
export const defaultAppearance: AppearanceMode = "system";

const themeSet = new Set<string>(themes);
const appearanceSet = new Set<string>(appearances);

export function isThemeName(value: string | null | undefined): value is ThemeName {
  return typeof value === "string" && themeSet.has(value);
}

export function isAppearanceMode(value: string | null | undefined): value is AppearanceMode {
  return typeof value === "string" && appearanceSet.has(value);
}

export function parseThemePreference(value: string | null | undefined): ThemeName {
  return isThemeName(value) ? value : defaultTheme;
}

export function parseAppearancePreference(value: string | null | undefined): AppearanceMode {
  return isAppearanceMode(value) ? value : defaultAppearance;
}

export function resolveAppearance(
  appearance: AppearanceMode,
  systemPrefersDark: boolean,
): ResolvedAppearance {
  if (appearance === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  return appearance;
}
