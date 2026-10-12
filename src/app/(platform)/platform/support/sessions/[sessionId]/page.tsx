import { SupportSessionDetail } from "@/components/platform-support/SupportSessionDetail";
import { getRequestLocale } from "@/i18n/request-locale";
export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const [{ sessionId }, locale] = await Promise.all([
    params,
    getRequestLocale(),
  ]);
  return <SupportSessionDetail sessionId={sessionId} locale={locale} />;
}
