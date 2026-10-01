import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getRequestLocale();
  const { auth } = getMessages(locale);

  return <AuthGate loadingLabel={auth.loading}>{children}</AuthGate>;
}
