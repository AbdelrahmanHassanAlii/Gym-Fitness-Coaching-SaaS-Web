import { LocaleSwitcher } from "@/components/locale-switcher";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { ThemeControls } from "@/theme/ThemeControls";
import styles from "./page.module.css";

export default async function Home() {
  const locale = await getRequestLocale();
  const { localeSwitcher, publicHome, themeControls } = getMessages(locale);

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
        <div
          className={styles.swatches}
          aria-label={publicHome.tokenPreviewLabel}
        >
          <div className={`${styles.swatch} ${styles.primary}`}>
            <strong>{publicHome.tokenLabels.primary}</strong>
          </div>
          <div className={`${styles.swatch} ${styles.success}`}>
            <strong>{publicHome.tokenLabels.success}</strong>
          </div>
          <div className={`${styles.swatch} ${styles.warning}`}>
            <strong>{publicHome.tokenLabels.warning}</strong>
          </div>
          <div className={`${styles.swatch} ${styles.danger}`}>
            <strong>{publicHome.tokenLabels.danger}</strong>
          </div>
        </div>
        <ThemeControls labels={themeControls} />
      </section>
    </main>
  );
}
