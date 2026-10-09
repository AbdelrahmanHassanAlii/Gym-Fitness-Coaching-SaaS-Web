import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import styles from "./page.module.css";

export default async function PlatformFoundationPage() {
  const locale = await getRequestLocale();
  const { platformPortal } = getMessages(locale);

  return (
    <section className={styles.foundation} aria-labelledby="platform-title">
      <p className={styles.eyebrow}>{platformPortal.portalLabel}</p>
      <h1 id="platform-title">{platformPortal.home.title}</h1>
      <p>{platformPortal.home.copy}</p>
    </section>
  );
}
