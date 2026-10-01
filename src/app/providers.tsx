"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppQueryProvider } from "@/lib/server-state/query-provider";
import { AuthSessionProvider } from "@/lib/auth";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AppQueryProvider>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </AppQueryProvider>
    </ThemeProvider>
  );
}
