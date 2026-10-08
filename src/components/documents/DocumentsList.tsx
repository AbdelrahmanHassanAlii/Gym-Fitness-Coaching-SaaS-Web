import type { DocumentDto } from "@/contracts";
import { isMandatorySensitiveDocumentCategory } from "@/contracts";
import type { AccessDecision } from "@/lib/access";
import { DownloadAction } from "./DownloadAction";
import styles from "./documents.module.css";

export function DocumentsList({
  canDelete,
  canDownload,
  canMedicalDownload,
  canMedicalUpload,
  documents,
  emptyLabel,
  labels,
  loading,
  onDelete,
  onDownload,
  onSelect,
  pendingDeleteId,
  pendingDownloadId,
  selectedDocumentId,
  values,
}: {
  canDelete: AccessDecision;
  canDownload: AccessDecision;
  canMedicalDownload: AccessDecision;
  canMedicalUpload: AccessDecision;
  documents: DocumentDto[];
  emptyLabel: string;
  labels: {
    actions: { delete: string; download: string };
    denied: string;
    loading: string;
    sensitive: string;
  };
  loading: boolean;
  onDelete: (document: DocumentDto) => void;
  onDownload: (document: DocumentDto) => void;
  onSelect: (document: DocumentDto) => void;
  pendingDeleteId: string | null;
  pendingDownloadId: string | null;
  selectedDocumentId: string | null;
  values: Record<string, string>;
}) {
  if (loading) {
    return <p>{labels.loading}</p>;
  }

  if (documents.length === 0) {
    return <p>{emptyLabel}</p>;
  }

  return (
    <ul className={styles.list}>
      {documents.map((document) => {
        const sensitive =
          document.classification === "SENSITIVE" ||
          isMandatorySensitiveDocumentCategory(document.category);
        const downloadAllowed = sensitive
          ? canDownload.allowed && canMedicalDownload.allowed
          : canDownload.allowed;
        const deleteAllowed = sensitive
          ? canDelete.allowed && canMedicalUpload.allowed
          : canDelete.allowed;
        return (
          <li key={document.id}>
            <div
              className={styles.row}
              data-selected={selectedDocumentId === document.id}
            >
              <button onClick={() => onSelect(document)} type="button">
                <strong>{document.title ?? values[document.category]}</strong>
                <span className={styles.meta}>
                  <span>{values[document.category] ?? document.category}</span>
                  <span>{document.documentDate ?? document.createdAt}</span>
                  <span>{values[document.status] ?? document.status}</span>
                  {sensitive ? (
                    <span className={styles.badge}>{labels.sensitive}</span>
                  ) : null}
                </span>
              </button>
              <div className={styles.actions}>
                <DownloadAction
                  allowed={downloadAllowed}
                  disabledLabel={labels.denied}
                  label={labels.actions.download}
                  loadingLabel={labels.loading}
                  onDownload={() => onDownload(document)}
                  pending={pendingDownloadId === document.id}
                />
                <button
                  disabled={pendingDeleteId === document.id || !deleteAllowed}
                  onClick={() => onDelete(document)}
                  type="button"
                >
                  {labels.actions.delete}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
