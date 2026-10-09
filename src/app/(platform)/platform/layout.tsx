import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { PlatformShell } from "@/components/platform-shell/PlatformShell";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getRequestLocale();
  const { auth, platformPortal, themeControls } = getMessages(locale);

  return (
    <AuthGate loadingLabel={auth.loading}>
      <PlatformShell
        labels={{ ...platformPortal, themeControls }}
        locale={locale}
      >
        {children}
      </PlatformShell>
    </AuthGate>
  );
}
