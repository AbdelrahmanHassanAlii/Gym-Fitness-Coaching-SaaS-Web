import { describe, expect, test } from "bun:test";
import {
  appearances,
  defaultAppearance,
  defaultTheme,
  isAppearanceMode,
  isThemeName,
  parseAppearancePreference,
  parseThemePreference,
  resolveAppearance,
  themes,
} from "./preferences";

describe("theme preferences", () => {
  test("accepts the predefined V1 themes", () => {
    expect(themes).toEqual(["summit", "pulse", "forge"]);

    for (const theme of themes) {
      expect(isThemeName(theme)).toBe(true);
      expect(parseThemePreference(theme)).toBe(theme);
    }
  });

  test("falls back when a persisted theme is invalid or stale", () => {
    expect(parseThemePreference("custom-gym-brand")).toBe(defaultTheme);
    expect(parseThemePreference("")).toBe(defaultTheme);
    expect(parseThemePreference(null)).toBe(defaultTheme);
    expect(parseThemePreference(undefined)).toBe(defaultTheme);
  });

  test("accepts light, dark, and system appearance modes", () => {
    expect(appearances).toEqual(["light", "dark", "system"]);

    for (const appearance of appearances) {
      expect(isAppearanceMode(appearance)).toBe(true);
      expect(parseAppearancePreference(appearance)).toBe(appearance);
    }
  });

  test("falls back when a persisted appearance is invalid or stale", () => {
    expect(parseAppearancePreference("auto")).toBe(defaultAppearance);
    expect(parseAppearancePreference("")).toBe(defaultAppearance);
    expect(parseAppearancePreference(null)).toBe(defaultAppearance);
    expect(parseAppearancePreference(undefined)).toBe(defaultAppearance);
  });

  test("resolves system appearance from the browser preference", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
    expect(resolveAppearance("light", true)).toBe("light");
  });
});
