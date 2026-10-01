import { LoginForm } from "@/components/auth/LoginForm";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function LoginPage() {
  const locale = await getRequestLocale();
  const { auth } = getMessages(locale);

  return <LoginForm labels={auth.login} />;
}
