import { PlatformWorkspaceDirectory } from "@/components/platform-workspaces/PlatformWorkspaceDirectory";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function PlatformWorkspacesPage() {
  const locale = await getRequestLocale();
  return (
    <PlatformWorkspaceDirectory
      labels={getMessages(locale).platformWorkspaces}
      locale={locale}
    />
  );
}
