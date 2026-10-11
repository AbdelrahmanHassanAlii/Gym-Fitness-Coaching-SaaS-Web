import { PlatformWorkspaceCreate } from "@/components/platform-workspaces/PlatformWorkspaceCreate";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function PlatformWorkspaceCreatePage() {
  const locale = await getRequestLocale();
  return (
    <PlatformWorkspaceCreate
      labels={getMessages(locale).platformWorkspaceManagement}
      locale={locale}
    />
  );
}
