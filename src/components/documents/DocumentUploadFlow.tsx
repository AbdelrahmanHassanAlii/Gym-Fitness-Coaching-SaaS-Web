import type { ChangeEvent, FormEvent } from "react";
import type { DocumentCategory, UploadMimeType } from "@/contracts";
import { documentCategories, uploadMimeTypes } from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import { UploadState, type UploadStateValue } from "./UploadState";
import styles from "./documents.module.css";

export interface UploadFormValues {
  category: DocumentCategory;
  checksumSha256: string;
  description: string;
  documentDate: string;
  file: File | null;
  title: string;
}

export function DocumentUploadFlow({
  canMedicalUpload,
  canUpload,
  disabledReason,
  labels,
  onChange,
  onFileChange,
  onRestart,
  onSubmit,
  pending,
  progress,
  state,
  values,
}: {
  canMedicalUpload: AccessDecision;
  canUpload: AccessDecision;
  disabledReason: string;
  labels: {
    actions: { restartUpload: string; upload: string };
    fields: Record<
      | "category"
      | "checksum"
      | "description"
      | "documentDate"
      | "file"
      | "title",
      string
    >;
    medicalDenied: string;
    states: Record<UploadStateValue, string>;
    values: Record<string, string>;
  };
  onChange: (values: Partial<UploadFormValues>) => void;
  onFileChange: (file: File | null) => void;
  onRestart: () => void;
  onSubmit: () => void;
  pending: boolean;
  progress: { indeterminate: boolean; value: number | null };
  state: UploadStateValue;
  values: UploadFormValues;
}) {
  const medicalCategory = isMedicalCategory(values.category);
  const blocked =
    pending ||
    !canUpload.allowed ||
    (medicalCategory && !canMedicalUpload.allowed);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) {
      return;
    }
    onSubmit();
  }

  return (
    <form className={styles.panel} onSubmit={submit}>
      <h2>{labels.actions.upload}</h2>
      <label className={styles.field}>
        <span>{labels.fields.file}</span>
        <input
          accept={uploadMimeTypes.join(",")}
          disabled={pending}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onFileChange(event.currentTarget.files?.[0] ?? null)
          }
          type="file"
        />
      </label>
      <label className={styles.field}>
        <span>{labels.fields.category}</span>
        <select
          disabled={pending}
          onChange={(event) =>
            onChange({
              category: event.currentTarget.value as DocumentCategory,
            })
          }
          value={values.category}
        >
          {documentCategories.map((category) => (
            <option key={category} value={category}>
              {labels.values[category] ?? category}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{labels.fields.title}</span>
        <input
          disabled={pending}
          onChange={(event) => onChange({ title: event.currentTarget.value })}
          value={values.title}
        />
      </label>
      <label className={styles.field}>
        <span>{labels.fields.description}</span>
        <textarea
          disabled={pending}
          onChange={(event) =>
            onChange({ description: event.currentTarget.value })
          }
          value={values.description}
        />
      </label>
      <label className={styles.field}>
        <span>{labels.fields.documentDate}</span>
        <input
          disabled={pending}
          onChange={(event) =>
            onChange({ documentDate: event.currentTarget.value })
          }
          type="date"
          value={values.documentDate}
        />
      </label>
      <label className={styles.field}>
        <span>{labels.fields.checksum}</span>
        <input
          disabled={pending}
          onChange={(event) =>
            onChange({ checksumSha256: event.currentTarget.value })
          }
          value={values.checksumSha256}
        />
      </label>
      {medicalCategory && !canMedicalUpload.allowed ? (
        <p className={styles.danger}>{labels.medicalDenied}</p>
      ) : null}
      {!canUpload.allowed ? (
        <p className={styles.danger}>{disabledReason}</p>
      ) : null}
      <UploadState
        indeterminate={progress.indeterminate}
        labels={labels}
        progress={progress.value}
        state={state}
      />
      <div className={styles.actions}>
        <button disabled={blocked} type="submit">
          {labels.actions.upload}
        </button>
        <button disabled={pending} onClick={onRestart} type="button">
          {labels.actions.restartUpload}
        </button>
      </div>
    </form>
  );
}

export function isAllowedUploadMimeType(
  value: string,
): value is UploadMimeType {
  return (uploadMimeTypes as readonly string[]).includes(value);
}

export function isMedicalCategory(category: DocumentCategory): boolean {
  return (
    category === "INBODY" ||
    category === "BLOOD_TEST" ||
    category === "MEDICAL_REPORT" ||
    category === "INJURY_REPORT"
  );
}
