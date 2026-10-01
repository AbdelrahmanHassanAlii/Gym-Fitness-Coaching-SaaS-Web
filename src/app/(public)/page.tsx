import { LocaleSwitcher } from "@/components/locale-switcher";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import styles from "./page.module.css";

export default async function Home() {
  const locale = await getRequestLocale();
  const { localeSwitcher, publicHome } = getMessages(locale);

  return (
    <main className={styles.page}>
      <section className={styles.main} aria-labelledby="foundation-title">
        <div className={styles.toolbar}>
          <LocaleSwitcher label={localeSwitcher.label} locale={locale} />
        </div>
        <p className={styles.eyebrow}>{publicHome.eyebrow}</p>
        <h1 id="foundation-title" className={styles.title}>
          {publicHome.title}
        </h1>
        <p className={styles.copy}>{publicHome.copy}</p>
      </section>
    </main>
  );
}
