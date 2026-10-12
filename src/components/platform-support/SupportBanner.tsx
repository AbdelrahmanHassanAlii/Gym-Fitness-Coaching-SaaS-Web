"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthSession } from "@/lib/auth";
import { getSupportLabels } from "@/i18n/support";
import type { Locale } from "@/i18n/locales";
import { authorityLive } from "@/lib/platform-support/runtime";
import {
  useSupportRuntime,
  useSupportSnapshot,
} from "@/lib/platform-support/support-context";
import {
  readSession,
  terminateSession,
  uncertain,
  errorCode,
} from "@/lib/platform-support/api";
import { supportError } from "@/lib/platform-support/errors";
import { SupportTime } from "./SupportSessionDetail";
import styles from "./support.module.css";
export function SupportBanner({ locale }: { locale: Locale }) {
  const { state, generation } = useAuthSession();
  return (
    <Banner
      key={JSON.stringify([state.user?.id, generation, state.accessToken])}
      locale={locale}
    />
  );
}
function Banner({ locale }: { locale: Locale }) {
  const snapshot = useSupportSnapshot(),
    runtime = useSupportRuntime(),
    { apiClient, state, generation } = useAuthSession(),
    router = useRouter(),
    pathname = usePathname();
  const labels = getSupportLabels(locale),
    [notice, setNotice] = useState<{ text: string; epoch: number } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [endDeniedEpoch, setEndDeniedEpoch] = useState<number | null>(null);
  const endDenied = endDeniedEpoch === snapshot.epoch;
  const message = notice?.epoch === snapshot.epoch ? notice.text : "";
  const setMessage = (text: string) =>
    setNotice({ text, epoch: runtime.getSnapshot().epoch });
  const authIdentity = JSON.stringify([
    state.user?.id,
    generation,
    state.accessToken,
  ]);
  const lastIdentity = useRef(authIdentity),
    mounted = useRef(true),
    flight = useRef<AbortController | null>(null),
    guard = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flight.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!snapshot.context && !snapshot.pending && pathname === "/app/support")
      router.replace("/platform/support");
  }, [snapshot.context, snapshot.pending, pathname, router]);
  const end = async () => {
    const { context, authority, epoch } = runtime.getSnapshot();
    if (
      guard.current ||
      !context ||
      !authority ||
      endDenied ||
      !authorityLive(authority, "support.sessions.end_own")
    )
      return;
    guard.current = true;
    setBusy(true);
    setMessage("");
    const identity = authIdentity,
      controller = new AbortController();
    flight.current = controller;
    const current = () =>
      mounted.current &&
      lastIdentity.current === identity &&
      runtime.getSnapshot().epoch === epoch;
    try {
      await terminateSession(
        apiClient,
        context.supportSession.id,
        context.supportSession.version,
        "end",
        controller.signal,
      );
      if (current()) {
        runtime.retire("ended");
        router.push("/platform/support");
      }
    } catch (e) {
      if (!current()) return;
      if (uncertain(e)) {
        runtime.retire();
        const retiredEpoch = runtime.getSnapshot().epoch;
        setMessage(labels.endUncertain);
        // Read reconciliation only. Never replay an uncertain termination.
        if (authorityLive(authority, "support.sessions.read")) {
          try {
            await readSession(
              apiClient,
              context.supportSession.id,
              controller.signal,
            );
          } catch {
            /* terminal notice remains minimized */
          }
        }
        if (
          mounted.current &&
          lastIdentity.current === identity &&
          runtime.getSnapshot().epoch === retiredEpoch
        )
          router.push("/platform/support");
      } else {
        setMessage(supportError(e, labels));
        setEndDeniedEpoch(epoch);
        const code = errorCode(e);
        if (
          ["SUPPORT_SESSION_NOT_ACTIVE", "SUPPORT_SESSION_EXPIRED"].includes(
            code,
          )
        )
          runtime.retire();
        if (
          [
            "SUPPORT_SESSION_VERSION_CONFLICT",
            "SUPPORT_SESSION_OWNERSHIP_REQUIRED",
          ].includes(code)
        ) {
          if (authorityLive(authority, "support.sessions.read"))
            try {
              await readSession(
                apiClient,
                context.supportSession.id,
                controller.signal,
              );
            } catch {
              /* keep minimized notice */
            }
          if (current() && code === "SUPPORT_SESSION_VERSION_CONFLICT") {
            await runtime.validate(apiClient);
            if (current()) setEndDeniedEpoch(null);
          }
        }
      }
    } finally {
      guard.current = false;
      if (mounted.current && lastIdentity.current === identity) setBusy(false);
    }
  };
  return (
    <>
      {snapshot.context ? (
        <section className={styles.banner} aria-label={labels.title}>
          <p>
            {labels.title} · {labels.readOnly} ·{" "}
            {snapshot.context.workspace.name} · {labels.expires}{" "}
            <SupportTime
              value={snapshot.context.supportSession.expiresAt}
              locale={locale}
            />
          </p>
          {message ? (
            <p>
              {labels.version}: {snapshot.context.supportSession.version} ·{" "}
              {labels.statuses.ACTIVE}
            </p>
          ) : null}
          <div className={styles.actions}>
            {snapshot.authority &&
            authorityLive(snapshot.authority, "support.sessions.end_own") &&
            !endDenied ? (
              <button disabled={busy} type="button" onClick={() => void end()}>
                {labels.end}
              </button>
            ) : null}
            <Link href="/platform/support">{labels.console}</Link>
            <button type="button" onClick={() => runtime.retire()}>
              {labels.leave}
            </button>
          </div>
        </section>
      ) : null}
      <div
        role="status"
        aria-live="polite"
        className={snapshot.notice || message ? styles.notice : undefined}
      >
        {message || (snapshot.notice ? labels[snapshot.notice] : "")}
      </div>
    </>
  );
}
