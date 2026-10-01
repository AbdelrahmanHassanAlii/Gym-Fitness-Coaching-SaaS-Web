import { describe, expect, test } from "bun:test";
import {
  defaultLocale,
  getLocaleDirection,
  localeDirections,
  parseLocale,
  resolveLocale,
  supportedLocales,
} from "./locales";

describe("locale model", () => {
  test("validates supported locale identifiers", () => {
    expect(parseLocale("ar")).toBe("ar");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("AR")).toBe("ar");
    expect(parseLocale(" fr ")).toBeNull();
    expect(parseLocale("")).toBeNull();
    expect(parseLocale(undefined)).toBeNull();
  });

  test("falls back safely for invalid preferences", () => {
    expect(resolveLocale("ar")).toBe("ar");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("de")).toBe(defaultLocale);
    expect(resolveLocale(null)).toBe(defaultLocale);
  });

  test("maps locales to document directions", () => {
    expect(getLocaleDirection("ar")).toBe("rtl");
    expect(getLocaleDirection("en")).toBe("ltr");
    expect(Object.keys(localeDirections).sort()).toEqual([...supportedLocales].sort());
  });
});
