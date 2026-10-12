import { SupportConsole } from "@/components/platform-support/SupportConsole";
import { getRequestLocale } from "@/i18n/request-locale";
export default async function SupportPage() {
  return <SupportConsole locale={await getRequestLocale()} />;
}
