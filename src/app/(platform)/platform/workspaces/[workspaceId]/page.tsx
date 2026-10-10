import { PlatformWorkspaceDetail } from "@/components/platform-workspaces/PlatformWorkspaceDetail";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function PlatformWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const [{ workspaceId }, locale] = await Promise.all([
    params,
    getRequestLocale(),
  ]);
  const messages = getMessages(locale);
  return (
    <PlatformWorkspaceDetail
      labels={{
        ...messages.platformWorkspaceDetail,
        statuses: messages.platformWorkspaces.statuses,
      }}
      locale={locale}
      workspaceId={workspaceId}
    />
  );
}
