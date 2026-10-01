import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function AuthenticatedFoundationPage() {
  const locale = await getRequestLocale();
  const { auth } = getMessages(locale);

  return (
    <main>
      <h1>{auth.protected.title}</h1>
      <p>{auth.protected.copy}</p>
    </main>
  );
}
