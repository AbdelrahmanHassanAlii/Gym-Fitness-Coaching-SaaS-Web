import { PlatformUserDirectory } from "@/components/platform-users/PlatformUserDirectory";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
export default async function PlatformUsersPage() {
  const locale = await getRequestLocale();
  return (
    <PlatformUserDirectory
      labels={getMessages(locale).platformUsers}
      locale={locale}
    />
  );
}
