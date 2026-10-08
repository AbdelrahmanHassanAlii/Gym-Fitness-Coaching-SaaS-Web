import { NotificationsExperience } from "@/components/notifications/NotificationsExperience";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function NotificationsPage() {
  const locale = await getRequestLocale();
  return (
    <NotificationsExperience
      labels={getMessages(locale).notifications}
      locale={locale}
    />
  );
}
