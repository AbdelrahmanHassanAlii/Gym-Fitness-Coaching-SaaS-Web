export const supportedLocales = ["ar", "en"] as const;

export type Locale = (typeof supportedLocales)[number];
export type Direction = "ltr" | "rtl";

export const defaultLocale: Locale = "en";
export const localeCookieName = "hassan_locale";

export const localeLabels: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
};

export const localeDirections: Record<Locale, Direction> = {
  ar: "rtl",
  en: "ltr",
};

const supportedLocaleSet = new Set<string>(supportedLocales);

export function isSupportedLocale(value: string): value is Locale {
  return supportedLocaleSet.has(value);
}

export function parseLocale(value: string | null | undefined): Locale | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (isSupportedLocale(normalizedValue)) {
    return normalizedValue;
  }

  return null;
}

export function resolveLocale(value: string | null | undefined): Locale {
  return parseLocale(value) ?? defaultLocale;
}

export function getLocaleDirection(locale: Locale): Direction {
  return localeDirections[locale];
}
