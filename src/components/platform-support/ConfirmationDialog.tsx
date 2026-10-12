"use client";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./support.module.css";
export function ConfirmationDialog({
  title,
  children,
  confirm,
  cancel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="support-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const focusable = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
          ),
        );
        const first = focusable[0],
          last = focusable.at(-1);
        if (
          first &&
          last &&
          ((!e.shiftKey && document.activeElement === last) ||
            (e.shiftKey && document.activeElement === first))
        ) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }}
    >
      <h2 id="support-confirm-title">{title}</h2>
      {children}
      <div className={styles.actions}>
        <button autoFocus type="button" onClick={onCancel}>
          {cancel}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirm}
        </button>
      </div>
    </dialog>
  );
}
