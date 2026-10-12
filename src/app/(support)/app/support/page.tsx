import { AuthGate } from "@/components/auth/AuthGate";
import { SupportWorkspaceView } from "@/components/platform-support/SupportWorkspaceView";
import { getRequestLocale } from "@/i18n/request-locale";
import { getSupportLabels } from "@/i18n/support";
export default async function SupportWorkspacePage() {
  const locale = await getRequestLocale();
  return (
    <AuthGate loadingLabel={getSupportLabels(locale).loading}>
      <SupportWorkspaceView locale={locale} />
    </AuthGate>
  );
}
