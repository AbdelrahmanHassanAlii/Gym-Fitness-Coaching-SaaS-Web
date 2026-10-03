import { TrainingExperience } from "@/components/training/TrainingExperience";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function TrainingPage() {
  const locale = await getRequestLocale();
  const { training } = getMessages(locale);

  return <TrainingExperience labels={training} />;
}
