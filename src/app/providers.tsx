"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppQueryProvider } from "@/lib/server-state/query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AppQueryProvider>{children}</AppQueryProvider>
    </ThemeProvider>
  );
}
