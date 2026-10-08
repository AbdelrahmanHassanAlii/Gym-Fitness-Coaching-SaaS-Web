import styles from "./documents.module.css";

export type UploadStateValue =
  | "IDLE"
  | "HASHING"
  | "INTENT_CREATING"
  | "INTENT_READY"
  | "UPLOADING"
  | "PROVIDER_ERROR"
  | "UPLOAD_AMBIGUOUS"
  | "CONFIRMING"
  | "CONFIRM_UNKNOWN"
  | "CONFIRMED"
  | "DOCUMENT_CREATING"
  | "DOCUMENT_UNKNOWN"
  | "COMPLETE"
  | "FAILED_RESTARTABLE"
  | "EXPIRED";

export function UploadState({
  indeterminate,
  labels,
  progress,
  state,
}: {
  indeterminate: boolean;
  labels: { states: Record<UploadStateValue, string> };
  progress: number | null;
  state: UploadStateValue;
}) {
  const width =
    progress === null ? 100 : `${Math.max(0, Math.min(100, progress))}%`;

  return (
    <div aria-live="polite">
      <strong>{labels.states[state]}</strong>
      {state === "UPLOADING" ? (
        <div
          aria-valuemax={indeterminate ? undefined : 100}
          aria-valuemin={indeterminate ? undefined : 0}
          aria-valuenow={
            indeterminate || progress === null
              ? undefined
              : Math.round(progress)
          }
          className={styles.progressTrack}
          role="progressbar"
        >
          <div
            className={styles.progressBar}
            style={{ width: typeof width === "number" ? `${width}%` : width }}
          />
        </div>
      ) : null}
    </div>
  );
}
