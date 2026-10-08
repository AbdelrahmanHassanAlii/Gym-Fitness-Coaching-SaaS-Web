import { AnalyticsExperience } from "@/components/analytics/AnalyticsExperience";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function AnalyticsPage() {
  const locale = await getRequestLocale();
  return (
    <AnalyticsExperience
      labels={getMessages(locale).analyticsExperience}
      locale={locale}
    />
  );
}
