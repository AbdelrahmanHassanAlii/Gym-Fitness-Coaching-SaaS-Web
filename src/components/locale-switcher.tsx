"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import {
  getLocaleDirection,
  localeCookieName,
  localeLabels,
  supportedLocales,
  type Locale,
} from "@/i18n/locales";

type LocaleSwitcherProps = {
  label: string;
  locale: Locale;
};

const oneYearInSeconds = 60 * 60 * 24 * 365;

export function LocaleSwitcher({ label, locale }: LocaleSwitcherProps) {
  const router = useRouter();

  function handleLocaleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as Locale;
    const direction = getLocaleDirection(nextLocale);
    const secureCookie =
      window.location.protocol === "https:" ? "; Secure" : "";

    document.cookie = `${localeCookieName}=${nextLocale}; Path=/; Max-Age=${oneYearInSeconds}; SameSite=Lax${secureCookie}`;
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = direction;
    router.refresh();
  }

  return (
    <label>
      <span>{label}</span>
      <select value={locale} onChange={handleLocaleChange}>
        {supportedLocales.map((supportedLocale) => (
          <option key={supportedLocale} value={supportedLocale}>
            {localeLabels[supportedLocale]}
          </option>
        ))}
      </select>
    </label>
  );
}
