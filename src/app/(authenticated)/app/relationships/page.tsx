import { RelationshipManagement } from "@/components/relationships/RelationshipManagement";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function RelationshipsPage() {
  const locale = await getRequestLocale();
  const { relationships } = getMessages(locale);

  return <RelationshipManagement labels={relationships} />;
}
