import { DeletionExperience } from "@/components/data-management/DeletionExperience";
import { getRequestLocale } from "@/i18n/request-locale";
export default async function Page({
  params,
}: {
  params: Promise<{ deletionId: string }>;
}) {
  const { deletionId } = await params;
  return (
    <DeletionExperience
      locale={await getRequestLocale()}
      deletionId={deletionId}
    />
  );
}
