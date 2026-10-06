"use client";

import type { DailyTrackingEntryDto } from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import type { NutritionLabels } from "./NutritionExperience";
import styles from "./nutrition.module.css";

export function NutritionTrackingPanel({
  decision,
  entry,
  isLoading,
  labels,
  localDate,
  onLocalDateChange,
}: {
  decision: AccessDecision;
  entry: DailyTrackingEntryDto | null;
  isLoading: boolean;
  labels: NutritionLabels;
  localDate: string;
  onLocalDateChange: (value: string) => void;
}) {
  if (!decision.allowed) {
    return (
      <section className={styles.statePanel}>
        <h2>{labels.tracking.title}</h2>
        <p>
          {decision.status === "unresolved"
            ? labels.loading
            : labels.errors.denied}
        </p>
      </section>
    );
  }

  const nutrition = metric(entry, "NUTRITION");
  const water = metric(entry, "WATER");
  return (
    <section className={styles.panel} aria-busy={isLoading}>
      <h2>{labels.tracking.title}</h2>
      <label>
        <span>{labels.fields.date}</span>
        <input
          onChange={(event) => onLocalDateChange(event.target.value)}
          type="date"
          value={localDate}
        />
      </label>
      {isLoading ? <p>{labels.loading}</p> : null}
      {!entry && !isLoading ? <p>{labels.empty.tracking}</p> : null}
      {entry ? (
        <div className={styles.summaryGrid}>
          <span>
            {labels.fields.date}: {entry.localDate}
          </span>
          <span>
            {labels.values.timezone}: {entry.timezoneAtEntry}
          </span>
          <span>
            {labels.tracking.nutrition}:{" "}
            {formatMetric(nutrition?.adherencePercent)}
          </span>
          <span>
            {labels.tracking.water}: {formatMetric(water?.ml)}{" "}
            {labels.values.ml}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function metric(
  entry: DailyTrackingEntryDto | null,
  key: string,
): Record<string, number> | null {
  const value = entry?.values[key];
  if (typeof value !== "object" || value === null) return null;
  const numeric: Record<string, number> = {};
  for (const [itemKey, itemValue] of Object.entries(value)) {
    if (typeof itemValue === "number" && Number.isFinite(itemValue)) {
      numeric[itemKey] = itemValue;
    }
  }
  return numeric;
}

function formatMetric(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}
