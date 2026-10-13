import { DeletionExperience } from "@/components/data-management/DeletionExperience";
import { getRequestLocale } from "@/i18n/request-locale";
export default async function Page() {
  return <DeletionExperience locale={await getRequestLocale()} />;
}
