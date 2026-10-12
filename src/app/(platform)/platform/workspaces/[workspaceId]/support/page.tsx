import { SupportConsole } from "@/components/platform-support/SupportConsole";
import { getRequestLocale } from "@/i18n/request-locale";
export default async function WorkspaceSupportPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const [{ workspaceId }, locale] = await Promise.all([
    params,
    getRequestLocale(),
  ]);
  return <SupportConsole workspaceId={workspaceId} locale={locale} />;
}
