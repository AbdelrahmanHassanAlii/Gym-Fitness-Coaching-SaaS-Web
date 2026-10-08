import type { DocumentDto } from "@/contracts";
import styles from "./documents.module.css";

export function DeleteDocumentDialog({
  cancelLabel,
  confirmLabel,
  document,
  message,
  onCancel,
  onConfirm,
  pending,
  title,
}: {
  cancelLabel: string;
  confirmLabel: string;
  document: DocumentDto | null;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  title: string;
}) {
  if (document === null) {
    return null;
  }

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <div aria-modal="true" className={styles.dialog} role="dialog">
        <h2>{title}</h2>
        <p>{message}</p>
        <strong>{document.title ?? document.id}</strong>
        <div className={styles.actions}>
          <button disabled={pending} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button disabled={pending} onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
