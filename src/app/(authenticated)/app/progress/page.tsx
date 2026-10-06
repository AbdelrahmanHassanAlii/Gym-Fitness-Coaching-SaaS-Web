import { ProgressExperience } from "@/components/progress/ProgressExperience";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function ProgressPage() {
  const locale = await getRequestLocale();
  const { progress } = getMessages(locale);

  return <ProgressExperience labels={progress} />;
}
