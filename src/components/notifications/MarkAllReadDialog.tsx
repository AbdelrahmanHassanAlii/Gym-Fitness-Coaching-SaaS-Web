import styles from "./notifications.module.css";

export function MarkAllReadDialog({
  cancel,
  confirm,
  message,
  onCancel,
  onConfirm,
  pending,
  title,
}: {
  cancel: string;
  confirm: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  title: string;
}) {
  return (
    <div
      aria-labelledby="mark-all-title"
      aria-modal="true"
      className={styles.backdrop}
      role="dialog"
    >
      <div className={styles.dialog}>
        <h2 id="mark-all-title">{title}</h2>
        <p>{message}</p>
        <div className={styles.actions}>
          <button disabled={pending} onClick={onCancel} type="button">
            {cancel}
          </button>
          <button disabled={pending} onClick={onConfirm} type="button">
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
