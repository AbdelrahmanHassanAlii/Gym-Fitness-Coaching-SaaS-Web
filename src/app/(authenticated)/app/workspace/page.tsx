import { WorkspaceManagement } from "@/components/workspace-management/WorkspaceManagement";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function WorkspaceManagementPage() {
  const locale = await getRequestLocale();
  const { workspaceManagement } = getMessages(locale);

  return <WorkspaceManagement labels={workspaceManagement} />;
}
