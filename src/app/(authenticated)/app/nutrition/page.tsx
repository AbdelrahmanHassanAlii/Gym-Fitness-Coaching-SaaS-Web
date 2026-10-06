import { NutritionExperience } from "@/components/nutrition/NutritionExperience";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function NutritionPage() {
  const locale = await getRequestLocale();
  const { nutrition } = getMessages(locale);

  return <NutritionExperience labels={nutrition} />;
}
