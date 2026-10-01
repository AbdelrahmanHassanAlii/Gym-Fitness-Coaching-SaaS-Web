import styles from "./page.module.css";

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
      </section>
    </main>
  );
}
