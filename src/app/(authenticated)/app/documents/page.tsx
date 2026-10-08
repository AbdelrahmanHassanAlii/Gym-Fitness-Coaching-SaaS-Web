import { DocumentsExperience } from "@/components/documents/DocumentsExperience";
import type { DocumentsLabels } from "@/components/documents/DocumentsExperience";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function DocumentsPage() {
  const locale = await getRequestLocale();
  const documents = getMessages(locale).documents as DocumentsLabels;

  return <DocumentsExperience labels={documents} />;
}
