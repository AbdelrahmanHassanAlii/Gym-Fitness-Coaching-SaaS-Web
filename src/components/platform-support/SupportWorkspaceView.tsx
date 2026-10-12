"use client";
import Link from "next/link";
import { useAuthSession } from "@/lib/auth";
import {
  useSupportRuntime,
  useSupportSnapshot,
} from "@/lib/platform-support/support-context";
import { getSupportLabels } from "@/i18n/support";
import type { Locale } from "@/i18n/locales";
import { WorkspaceFacts } from "./SupportConsole";
import styles from "./support.module.css";
export function SupportWorkspaceView({ locale }: { locale: Locale }) {
  const snapshot = useSupportSnapshot(),
    runtime = useSupportRuntime(),
    { apiClient } = useAuthSession(),
    labels = getSupportLabels(locale);
  return (
    <main className={styles.page}>
      <h1>{labels.context}</h1>
      <p>{labels.boundary}</p>
      {snapshot.context ? (
        <section className={styles.card}>
          <WorkspaceFacts
            workspace={snapshot.context.workspace}
            labels={labels}
          />
          <button
            type="button"
            onClick={() => void runtime.validate(apiClient)}
          >
            {labels.refresh}
          </button>
        </section>
      ) : (
        <p role="status">
          {snapshot.pending ? labels.pending : labels.inactive}
        </p>
      )}
      <Link href="/platform/support">{labels.console}</Link>
    </main>
  );
}
