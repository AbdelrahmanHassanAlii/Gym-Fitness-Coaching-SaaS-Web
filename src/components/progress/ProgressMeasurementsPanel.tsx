import type {
  MeasurementDto,
  MetricDefinitionDto,
  ProgressAnalyticsDto,
} from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import type { ProgressLabels } from "./ProgressExperience";
import styles from "./progress.module.css";

export function ProgressMeasurementsPanel({
  analytics,
  canCreate,
  canUpdate,
  isLoading,
  labels,
  measurementNotes,
  measurementValue,
  measurements,
  metrics,
  onCreate,
  onMeasurementNotesChange,
  onMeasurementValueChange,
  onUpdate,
  pendingCreate,
  pendingUpdate,
  readDecision,
}: {
  analytics?: ProgressAnalyticsDto;
  canCreate: AccessDecision;
  canUpdate: AccessDecision;
  isLoading: boolean;
  labels: ProgressLabels;
  measurementNotes: string;
  measurementValue: string;
  measurements: readonly MeasurementDto[];
  metrics: readonly MetricDefinitionDto[];
  onCreate: () => void;
  onMeasurementNotesChange: (value: string) => void;
  onMeasurementValueChange: (value: string) => void;
  onUpdate: () => void;
  pendingCreate: boolean;
  pendingUpdate: boolean;
  readDecision: AccessDecision;
}) {
  if (!readDecision.allowed) {
    return <DeniedPanel labels={labels} />;
  }

  return (
    <section className={styles.panel}>
      <h2>{labels.measurements.title}</h2>
      {isLoading ? <p>{labels.loading}</p> : null}
      <div className={styles.summaryGrid}>
        <span>{labels.analytics.progress}</span>
        <strong>
          {analytics?.summary.latest?.value ?? "-"}{" "}
          {analytics?.summary.latest?.unit ?? ""}
        </strong>
      </div>
      <form
        className={styles.formGrid}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <label>
          <span>{labels.fields.metric}</span>
          <select disabled>
            {metrics.length === 0 ? (
              <option value="">{labels.empty.measurements}</option>
            ) : null}
            {metrics.map((metric) => (
              <option key={metric.id} value={metric.id}>
                {metric.name} ({metric.unit})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{labels.fields.value}</span>
          <input
            inputMode="decimal"
            onChange={(event) => onMeasurementValueChange(event.target.value)}
            required
            type="number"
            value={measurementValue}
          />
        </label>
        <label>
          <span>{labels.fields.notes}</span>
          <input
            onChange={(event) => onMeasurementNotesChange(event.target.value)}
            value={measurementNotes}
          />
        </label>
        <button
          disabled={!canCreate.allowed || metrics.length === 0 || pendingCreate}
          type="submit"
        >
          {labels.actions.create}
        </button>
        <button
          disabled={
            !canUpdate.allowed || measurements.length === 0 || pendingUpdate
          }
          onClick={onUpdate}
          type="button"
        >
          {labels.actions.update}
        </button>
      </form>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{labels.fields.metric}</th>
            <th>{labels.fields.value}</th>
            <th>{labels.fields.source}</th>
            <th>{labels.fields.expectedVersion}</th>
          </tr>
        </thead>
        <tbody>
          {measurements.length === 0 ? (
            <tr>
              <td colSpan={4}>{labels.empty.measurements}</td>
            </tr>
          ) : (
            measurements.map((measurement) => (
              <tr key={measurement.id}>
                <td>{measurement.metricDefinitionId}</td>
                <td>{measurement.value}</td>
                <td>
                  {labels.values[measurement.source] ?? measurement.source}
                </td>
                <td>{measurement.version}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function DeniedPanel({ labels }: { labels: ProgressLabels }) {
  return (
    <section className={styles.statePanel}>
      <p>{labels.errors.denied}</p>
    </section>
  );
}
