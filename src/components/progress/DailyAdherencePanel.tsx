import type {
  AdherenceAnalyticsDto,
  AdherenceConfigDto,
  AdherenceMetricKey,
  ProgressDailyTrackingEntryDto,
} from "@/contracts";
import { adherenceMetricKeys } from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import type { ProgressLabels } from "./ProgressExperience";
import styles from "./progress.module.css";

export function DailyAdherencePanel({
  analytics,
  config,
  daily,
  dailyNutrition,
  dailyReason,
  dailySteps,
  dailyWater,
  isHistorical,
  isLoading,
  labels,
  localDate,
  onConfigSave,
  onDailyNutritionChange,
  onDailyReasonChange,
  onDailySave,
  onDailyStepsChange,
  onDailyWaterChange,
  pendingConfig,
  pendingDaily,
  readDecision,
  saveConfigDecision,
  saveDailyDecision,
}: {
  analytics?: AdherenceAnalyticsDto;
  config: AdherenceConfigDto | null;
  daily: ProgressDailyTrackingEntryDto | null;
  dailyNutrition: string;
  dailyReason: string;
  dailySteps: string;
  dailyWater: string;
  isHistorical: boolean;
  isLoading: boolean;
  labels: ProgressLabels;
  localDate: string;
  onConfigSave: (enabledMetrics: AdherenceMetricKey[]) => void;
  onDailyNutritionChange: (value: string) => void;
  onDailyReasonChange: (value: string) => void;
  onDailySave: () => void;
  onDailyStepsChange: (value: string) => void;
  onDailyWaterChange: (value: string) => void;
  pendingConfig: boolean;
  pendingDaily: boolean;
  readDecision: AccessDecision;
  saveConfigDecision: AccessDecision;
  saveDailyDecision: AccessDecision;
}) {
  if (!readDecision.allowed) {
    return (
      <section className={styles.statePanel}>
        <p>{labels.errors.denied}</p>
      </section>
    );
  }

  const enabled = config?.enabledMetrics ?? [];
  return (
    <section className={styles.panel}>
      <h2>{labels.tabs.adherence}</h2>
      {isLoading ? <p>{labels.loading}</p> : null}
      <p className={styles.muted}>
        {isHistorical ? labels.status.historical : labels.status.normal} ·{" "}
        {localDate}
      </p>
      <div className={styles.summaryGrid}>
        <span>{labels.analytics.adherence}</span>
        <strong>{analytics?.series.length ?? 0}</strong>
      </div>
      <form
        className={styles.formGrid}
        onSubmit={(event) => {
          event.preventDefault();
          if (!saveConfigDecision.allowed || pendingConfig) return;
          onConfigSave(["NUTRITION", "WATER", "STEPS"]);
        }}
      >
        <fieldset>
          <legend>{labels.fields.enabledMetrics}</legend>
          <div className={styles.meta}>
            {adherenceMetricKeys.map((metric) => (
              <span key={metric}>
                {labels.values[metric] ?? metric}
                {enabled.includes(metric) ? " ✓" : ""}
              </span>
            ))}
          </div>
        </fieldset>
        <span>
          {labels.fields.expectedVersion}: {config?.version ?? "-"}
        </span>
        <button
          disabled={!saveConfigDecision.allowed || pendingConfig}
          type="submit"
        >
          {labels.actions.save}
        </button>
      </form>
      <form
        className={styles.formGrid}
        onSubmit={(event) => {
          event.preventDefault();
          if (!saveDailyDecision.allowed || pendingDaily) return;
          onDailySave();
        }}
      >
        <label>
          <span>{labels.fields.water}</span>
          <input
            inputMode="numeric"
            onChange={(event) => onDailyWaterChange(event.target.value)}
            type="number"
            value={dailyWater}
          />
        </label>
        <label>
          <span>{labels.fields.nutrition}</span>
          <input
            inputMode="decimal"
            onChange={(event) => onDailyNutritionChange(event.target.value)}
            type="number"
            value={dailyNutrition}
          />
        </label>
        <label>
          <span>{labels.fields.steps}</span>
          <input
            inputMode="numeric"
            onChange={(event) => onDailyStepsChange(event.target.value)}
            type="number"
            value={dailySteps}
          />
        </label>
        {isHistorical ? (
          <label>
            <span>{labels.fields.reason}</span>
            <input
              onChange={(event) => onDailyReasonChange(event.target.value)}
              required
              value={dailyReason}
            />
          </label>
        ) : null}
        <span>
          {labels.fields.expectedVersion}: {daily?.version ?? "-"}
        </span>
        <button
          disabled={!saveDailyDecision.allowed || pendingDaily}
          type="submit"
        >
          {labels.actions.save}
        </button>
      </form>
    </section>
  );
}
