import { PlatformUserDetail } from "@/components/platform-users/PlatformUserDetail";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
export default async function PlatformUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const [{ userId }, locale] = await Promise.all([params, getRequestLocale()]);
  return (
    <PlatformUserDetail
      labels={getMessages(locale).platformUsers}
      locale={locale}
      userId={userId}
    />
  );
}
