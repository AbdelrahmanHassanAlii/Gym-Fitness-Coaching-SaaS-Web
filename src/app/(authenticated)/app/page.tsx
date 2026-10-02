import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import styles from "./page.module.css";

export default async function AuthenticatedFoundationPage() {
  const locale = await getRequestLocale();
  const { staffShell } = getMessages(locale);

  return (
    <section className={styles.overview} aria-labelledby="staff-shell-title">
      <h1 id="staff-shell-title">{staffShell.overview.title}</h1>
      <p>{staffShell.overview.copy}</p>
    </section>
  );
}
