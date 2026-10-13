"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Locale } from "@/i18n/locales";
import styles from "./data-management.module.css";

export function Facts({
  values,
  locale,
}: {
  values: [string, string | number | undefined, boolean?][];
  locale: Locale;
}) {
  return (
    <dl className={styles.facts}>
      {values
        .filter(([, value]) => value !== undefined)
        .map(([label, value, date]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt>{label}</dt>
            <dd>
              {date && typeof value === "string" ? (
                <time dateTime={value}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(value))}{" "}
                  (UTC)
                </time>
              ) : (
                <bdi dir="ltr">{value}</bdi>
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  const prior = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current!,
      originalFocus = prior.current;
    dialog.showModal();
    return () => {
      dialog.close();
      originalFocus?.focus();
    };
  }, []);
  return (
    <dialog
      className={styles.dialog}
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const nodes = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]",
          ),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (
          first &&
          last &&
          ((event.shiftKey && document.activeElement === first) ||
            (!event.shiftKey && document.activeElement === last))
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}

// Guards supplement cancellation: every asynchronous continuation checks that its
// authority-bound component is still mounted, and that its request epoch is current.
export function useRequestGuard() {
  const aliveRef = useRef(false),
    epochRef = useRef(0);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  return useMemo(
    () => ({
      alive: () => aliveRef.current,
      start: () => ++epochRef.current,
      current: (ticket: number) =>
        aliveRef.current && epochRef.current === ticket,
    }),
    [],
  );
}
export function useExpiryClock(expiries: readonly string[]) {
  const [now, setNow] = useState(() => Date.now());
  const expiryKey = [...expiries].sort().join("|");
  useEffect(() => {
    const expiresAt = expiryKey
      .split("|")
      .find((date) => Date.parse(date) > now);
    if (!expiresAt) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = Date.parse(expiresAt) - Date.now();
      if (remaining <= 0) {
        setNow(Date.now());
        return;
      }
      timer = setTimeout(schedule, Math.min(remaining, 2147483647));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [expiryKey, now]);
  return now;
}
export function useRevalidation(
  refresh: () => Promise<void>,
  interval: number | null,
  expiries: readonly string[] = [],
) {
  const expiryKey = [...expiries].sort().join("|");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined,
      disposed = false;
    const checked = new Set<string>();
    let flight: Promise<void> | null = null;
    const visible = () =>
      document.visibilityState !== "hidden" && navigator.onLine;
    const revalidate = () => {
      if (!visible() || disposed) return Promise.resolve();
      if (!flight)
        flight = refresh().finally(() => {
          flight = null;
        });
      return flight;
    };
    const schedule = () => {
      if (disposed) return;
      clearTimeout(timer);
      const expiresAt = expiryKey
        .split("|")
        .find((date) => date && !checked.has(date));
      const expiryDelay = expiresAt
        ? Math.max(0, Date.parse(expiresAt) - Date.now())
        : null;
      const delay =
        interval !== null && expiryDelay !== null
          ? Math.min(interval, expiryDelay)
          : (interval ?? expiryDelay);
      if (delay === null) return;
      timer = setTimeout(
        async () => {
          if (expiresAt && Date.parse(expiresAt) <= Date.now())
            checked.add(expiresAt);
          await revalidate();
          schedule();
        },
        Math.min(delay, 2147483647),
      );
    };
    const resume = () => {
      if (visible()) {
        clearTimeout(timer);
        void revalidate().finally(schedule);
      }
    };
    schedule();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [refresh, interval, expiryKey]);
}
