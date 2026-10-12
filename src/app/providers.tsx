"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppQueryProvider } from "@/lib/server-state/query-provider";
import { AuthSessionProvider } from "@/lib/auth";
import { SupportContextProvider } from "@/lib/platform-support/support-context";
import { SupportBanner } from "@/components/platform-support/SupportBanner";
import { SupportRouteBoundary } from "@/components/platform-support/SupportRouteBoundary";
import type { Locale } from "@/i18n/locales";

export function AppProviders({
  children,
  locale = "en",
}: {
  children: ReactNode;
  locale?: Locale;
}) {
  return (
    <ThemeProvider>
      <AppQueryProvider>
        <AuthSessionProvider>
          <SupportContextProvider>
            <SupportBanner locale={locale} />
            <SupportRouteBoundary>{children}</SupportRouteBoundary>
          </SupportContextProvider>
        </AuthSessionProvider>
      </AppQueryProvider>
    </ThemeProvider>
  );
}
