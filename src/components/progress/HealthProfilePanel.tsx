import type { HealthProfileDto } from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import type { ProgressLabels } from "./ProgressExperience";
import styles from "./progress.module.css";

export function HealthProfilePanel({
  allergyOnly,
  health,
  isLoading,
  labels,
  readDecision,
}: {
  allergyOnly: boolean;
  health: HealthProfileDto | null;
  isLoading: boolean;
  labels: ProgressLabels;
  readDecision: AccessDecision;
}) {
  if (!readDecision.allowed) {
    return (
      <section className={styles.statePanel}>
        <p>{labels.errors.denied}</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <h2>{labels.health.title}</h2>
      <p className={styles.muted}>
        {labels.health.readOnly} ·{" "}
        {allergyOnly ? labels.health.allergyOnly : labels.health.full}
      </p>
      {isLoading ? <p>{labels.loading}</p> : null}
      {health === null ? <p>{labels.empty.health}</p> : null}
      {health ? (
        <dl className={styles.list}>
          <div className={styles.item}>
            <dt>{labels.fields.allergies}</dt>
            <dd>{health.foodAllergies.join(", ") || "-"}</dd>
          </div>
          {!allergyOnly ? (
            <>
              <div className={styles.item}>
                <dt>{labels.fields.health}</dt>
                <dd>{health.medicalNotes ?? "-"}</dd>
              </div>
              <div className={styles.item}>
                <dt>{labels.fields.notes}</dt>
                <dd>{health.emergencyNotes ?? "-"}</dd>
              </div>
            </>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
