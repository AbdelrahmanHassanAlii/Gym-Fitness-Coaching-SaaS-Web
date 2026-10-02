import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { StaffShell } from "@/components/staff-shell/StaffShell";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getRequestLocale();
  const { auth, staffShell, themeControls } = getMessages(locale);

  return (
    <AuthGate loadingLabel={auth.loading}>
      <StaffShell labels={{ ...staffShell, themeControls }} locale={locale}>
        {children}
      </StaffShell>
    </AuthGate>
  );
}
