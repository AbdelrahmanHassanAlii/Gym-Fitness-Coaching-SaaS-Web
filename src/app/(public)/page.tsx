import styles from "./page.module.css";
import { ThemeControls } from "@/theme/ThemeControls";

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.main} aria-labelledby="foundation-title">
        <p className={styles.eyebrow}>Web foundation</p>
        <h1 id="foundation-title" className={styles.title}>
          Hassan Gym & Fitness Coaching SaaS
        </h1>
        <p className={styles.copy}>
          The Next.js web application foundation is ready for the upcoming gym
          staff, platform, and authentication surfaces.
        </p>
        <div className={styles.swatches} aria-label="Semantic color token preview">
          <div className={`${styles.swatch} ${styles.primary}`}>
            <strong>Primary</strong>
          </div>
          <div className={`${styles.swatch} ${styles.success}`}>
            <strong>Success</strong>
          </div>
          <div className={`${styles.swatch} ${styles.warning}`}>
            <strong>Warning</strong>
          </div>
          <div className={`${styles.swatch} ${styles.danger}`}>
            <strong>Danger</strong>
          </div>
        </div>
        <ThemeControls />
      </section>
    </main>
  );
}
