"use client";

import type { NutritionAnalyticsDto } from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import type { NutritionAnalyticsRange } from "@/lib/nutrition";
import type { NutritionLabels } from "./NutritionExperience";
import styles from "./nutrition.module.css";

export function NutritionAnalyticsPanel({
  analytics,
  decision,
  isLoading,
  labels,
  onRangeChange,
  range,
}: {
  analytics?: NutritionAnalyticsDto;
  decision: AccessDecision;
  isLoading: boolean;
  labels: NutritionLabels;
  onRangeChange: (range: NutritionAnalyticsRange) => void;
  range: NutritionAnalyticsRange;
}) {
  if (!decision.allowed) {
    return (
      <section className={styles.statePanel}>
        <h2>{labels.analytics.title}</h2>
        <p>
          {decision.status === "unresolved"
            ? labels.loading
            : labels.errors.denied}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-busy={isLoading}>
      <h2>{labels.analytics.title}</h2>
      <div className={styles.toolbar}>
        <label>
          <span>{labels.fields.analyticsFrom}</span>
          <input
            onChange={(event) =>
              onRangeChange({ ...range, from: event.target.value })
            }
            type="date"
            value={range.from ?? ""}
          />
        </label>
        <label>
          <span>{labels.fields.analyticsTo}</span>
          <input
            onChange={(event) =>
              onRangeChange({ ...range, to: event.target.value })
            }
            type="date"
            value={range.to ?? ""}
          />
        </label>
        <label>
          <span>{labels.fields.analyticsGranularity}</span>
          <select
            onChange={(event) =>
              onRangeChange({
                ...range,
                granularity: event.target.value === "week" ? "week" : "day",
              })
            }
            value={range.granularity ?? "day"}
          >
            <option value="day">{labels.values.day}</option>
            <option value="week">{labels.values.week}</option>
          </select>
        </label>
      </div>
      {isLoading ? <p>{labels.loading}</p> : null}
      {!analytics && !isLoading ? <p>{labels.analytics.empty}</p> : null}
      {analytics ? (
        <>
          <div className={styles.summaryGrid}>
            <span>
              {labels.analytics.activePlan}:{" "}
              {analytics.activePlan?.name ?? labels.values.none}
            </span>
            <span>
              {labels.analytics.trackedDays}:{" "}
              {analytics.nutritionTracking.daysTracked}
            </span>
            <span>
              {labels.analytics.averageWater}:{" "}
              {analytics.waterTracking.averageMl ?? "—"} {labels.values.ml}
            </span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{labels.analytics.range}</th>
                <th>{labels.tracking.nutrition}</th>
                <th>{labels.tracking.water}</th>
              </tr>
            </thead>
            <tbody>
              {analytics.series.map((row) => (
                <tr key={row.key}>
                  <td>{row.key}</td>
                  <td>{formatPercent(row.nutritionAdherenceRate)}</td>
                  <td>
                    {row.averageWaterMl ?? "—"} {labels.values.ml}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
