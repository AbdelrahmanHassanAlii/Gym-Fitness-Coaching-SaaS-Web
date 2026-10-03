import { CommercialExperience } from "@/components/commercial/CommercialExperience";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function LeadsCommercialPage() {
  const locale = await getRequestLocale();
  const { commercial } = getMessages(locale);

  return <CommercialExperience labels={commercial} />;
}
