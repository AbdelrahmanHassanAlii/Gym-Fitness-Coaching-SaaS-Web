import { ExportExperience } from "@/components/data-management/ExportExperience";
import { getRequestLocale } from "@/i18n/request-locale";
export default async function Page() {
  return <ExportExperience locale={await getRequestLocale()} />;
}
