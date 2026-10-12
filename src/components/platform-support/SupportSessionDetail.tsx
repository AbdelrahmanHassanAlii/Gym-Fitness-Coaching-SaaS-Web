"use client";
import { useEffect, useRef, useState } from "react";
import { useAuthSession } from "@/lib/auth";
import { usePlatformAuthority } from "@/lib/platform-access";
import { useProtectedAsyncEpoch } from "@/lib/platform-workspaces/use-protected-async-epoch";
import { getSupportLabels, type SupportLabels } from "@/i18n/support";
import type { Locale } from "@/i18n/locales";
import {
  readSession,
  terminateSession,
  errorCode,
  uncertain,
} from "@/lib/platform-support/api";
import {
  isObjectId,
  type SupportSession,
} from "@/lib/platform-support/contracts";
import {
  authorityIdentity,
  authorityLive,
  supportAuthority,
} from "@/lib/platform-support/runtime";
import {
  useSupportRuntime,
  useSupportSnapshot,
} from "@/lib/platform-support/support-context";
import { supportError } from "@/lib/platform-support/errors";
import { ConfirmationDialog } from "./ConfirmationDialog";
import styles from "./support.module.css";

export function SupportSessionDetail({
  sessionId,
  locale,
  inline = false,
}: {
  sessionId: string;
  locale: Locale;
  inline?: boolean;
}) {
  const authority = usePlatformAuthority(),
    { state } = useAuthSession(),
    labels = getSupportLabels(locale);
  const snapshot = useSupportSnapshot();
  if (!authorityLive(supportAuthority(authority), "support.sessions.read"))
    return (
      <article className={styles.page}>
        <h1>{labels.detail}</h1>
        <p role="status">{labels.readDenied}</p>
      </article>
    );
  if (!isObjectId(sessionId)) return <p role="status">{labels.failed}</p>;
  const identity = JSON.stringify([
    authorityIdentity(supportAuthority(authority)),
    state.accessToken,
    sessionId,
    snapshot.epoch,
  ]);
  return (
    <Detail
      key={identity}
      id={sessionId}
      identity={identity}
      labels={labels}
      locale={locale}
      inline={inline}
    />
  );
}
function Detail({
  id,
  identity,
  labels,
  locale,
  inline,
}: {
  id: string;
  identity: string;
  labels: SupportLabels;
  locale: Locale;
  inline: boolean;
}) {
  const authority = usePlatformAuthority(),
    { apiClient } = useAuthSession(),
    runtime = useSupportRuntime();
  const [session, setSession] = useState<SupportSession | null>(null),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true),
    [confirm, setConfirm] = useState(false),
    [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [endDenied, setEndDenied] = useState(false),
    [revokeDenied, setRevokeDenied] = useState(false),
    [readDenied, setReadDenied] = useState(false);
  const epoch = useProtectedAsyncEpoch(identity),
    flight = useRef<AbortController | null>(null),
    operation = useRef(0),
    guard = useRef(false);
  const refresh = async (retainMessage = false) => {
    if (
      readDenied ||
      !authorityLive(supportAuthority(authority), "support.sessions.read")
    )
      return false;
    const capture = epoch.capture(),
      op = ++operation.current;
    flight.current?.abort();
    const controller = new AbortController();
    flight.current = controller;
    setSession(null);
    setBusy(true);
    if (!retainMessage) setMessage("");
    try {
      const next = await readSession(apiClient, id, controller.signal);
      if (!epoch.isCurrent(capture) || op !== operation.current) return false;
      setSession(next);
      setNeedsReconciliation(false);
      return true;
    } catch (e) {
      if (epoch.isCurrent(capture) && op === operation.current) {
        setMessage(supportError(e, labels));
        if (
          ["PERMISSION_DENIED", "SUPPORT_ACCESS_FORBIDDEN"].includes(
            errorCode(e),
          )
        ) {
          setReadDenied(true);
          void authority.refresh();
        }
      }
      return false;
    } finally {
      if (epoch.isCurrent(capture) && op === operation.current) setBusy(false);
    }
  };
  useEffect(() => {
    const capture = epoch.capture(),
      controller = new AbortController();
    flight.current = controller;
    void readSession(apiClient, id, controller.signal)
      .then((next) => {
        if (epoch.isCurrent(capture) && !controller.signal.aborted) {
          setSession(next);
          setBusy(false);
        }
      })
      .catch((e) => {
        if (epoch.isCurrent(capture) && !controller.signal.aborted) {
          setMessage(supportError(e, labels));
          setBusy(false);
          if (
            ["PERMISSION_DENIED", "SUPPORT_ACCESS_FORBIDDEN"].includes(
              errorCode(e),
            )
          )
            setReadDenied(true);
        }
      });
    return () => {
      controller.abort();
      flight.current?.abort();
    };
  }, [apiClient, id, epoch, labels]);
  const terminate = async (action: "end" | "revoke") => {
    const a = supportAuthority(authority);
    if (
      guard.current ||
      !session ||
      session.status !== "ACTIVE" ||
      needsReconciliation ||
      !authorityLive(
        a,
        action === "end"
          ? "support.sessions.end_own"
          : "support.sessions.revoke",
      )
    )
      return;
    guard.current = true;
    const capture = epoch.capture(),
      runtimeEpoch = runtime.getSnapshot().epoch,
      op = ++operation.current;
    const current = () => epoch.isCurrent(capture) && op === operation.current;
    const wasSelected = runtime.isSelected(id);
    const controller = new AbortController();
    flight.current = controller;
    setBusy(true);
    setConfirm(false);
    setMessage("");
    try {
      const next = await terminateSession(
        apiClient,
        id,
        session.version,
        action,
        controller.signal,
      );
      if (!current()) return;
      setSession(next);
      if (
        wasSelected &&
        runtime.getSnapshot().epoch === runtimeEpoch &&
        runtime.isSelected(id)
      )
        runtime.retire("ended");
    } catch (e) {
      if (!current()) return;
      const code = errorCode(e),
        unclear = uncertain(e);
      if (
        wasSelected &&
        runtime.getSnapshot().epoch === runtimeEpoch &&
        runtime.isSelected(id) &&
        (unclear ||
          code === "SUPPORT_SESSION_NOT_ACTIVE" ||
          code === "SUPPORT_SESSION_EXPIRED")
      )
        runtime.retire();
      setMessage(unclear ? labels.endUncertain : supportError(e, labels));
      if (code === "SUPPORT_SESSION_OWNERSHIP_REQUIRED") setEndDenied(true);
      if (["PERMISSION_DENIED", "SUPPORT_ACCESS_FORBIDDEN"].includes(code)) {
        if (action === "end") setEndDenied(true);
        else setRevokeDenied(true);
        void authority.refresh();
      }
      if (
        unclear ||
        [
          "SUPPORT_SESSION_VERSION_CONFLICT",
          "SUPPORT_SESSION_OWNERSHIP_REQUIRED",
          "SUPPORT_SESSION_NOT_ACTIVE",
          "SUPPORT_SESSION_EXPIRED",
        ].includes(code)
      ) {
        setNeedsReconciliation(true);
        await refresh(true);
      }
    } finally {
      guard.current = false;
      if (epoch.isCurrent(capture)) setBusy(false);
    }
  };
  const own = session?.realActorPlatformMembershipId === authority.membershipId;
  const Heading = inline ? "h2" : "h1";
  return (
    <article className={styles.page}>
      <Heading>{labels.detail}</Heading>
      <p>{labels.detailCopy}</p>
      <p role="status">{message}</p>
      {session ? (
        <>
          <SessionFacts session={session} labels={labels} locale={locale} />
          {session.status === "ACTIVE" ? (
            <div className={styles.actions}>
              {own &&
              !endDenied &&
              authorityLive(
                supportAuthority(authority),
                "support.sessions.end_own",
              ) ? (
                <button
                  disabled={busy || needsReconciliation}
                  onClick={() => void terminate("end")}
                  type="button"
                >
                  {labels.end}
                </button>
              ) : null}
              {!revokeDenied &&
              authorityLive(
                supportAuthority(authority),
                "support.sessions.revoke",
              ) ? (
                <button
                  disabled={busy || needsReconciliation}
                  onClick={() => setConfirm(true)}
                  type="button"
                >
                  {labels.revoke}
                </button>
              ) : null}
            </div>
          ) : (
            <p>{labels.terminal}</p>
          )}
        </>
      ) : (
        <p>{busy ? labels.loading : labels.inactive}</p>
      )}
      {!readDenied ? (
        <button disabled={busy} type="button" onClick={() => void refresh()}>
          {needsReconciliation ? labels.reconcile : labels.retry}
        </button>
      ) : null}
      {confirm && session ? (
        <ConfirmationDialog
          title={labels.confirmRevoke}
          cancel={labels.cancel}
          confirm={labels.revoke}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void terminate("revoke")}
        >
          <p>{labels.acknowledge}</p>
          <SessionFacts session={session} labels={labels} locale={locale} />
        </ConfirmationDialog>
      ) : null}
    </article>
  );
}
export function SessionFacts({
  session,
  labels,
  locale,
}: {
  session: SupportSession;
  labels: SupportLabels;
  locale: Locale;
}) {
  return (
    <dl className={styles.facts}>
      <dt>{labels.session}</dt>
      <dd>
        <bdi>{session.id}</bdi>
      </dd>
      <dt>{labels.workspaceId}</dt>
      <dd>
        <bdi>{session.targetWorkspaceId ?? "—"}</bdi>
      </dd>
      <dt>{labels.type}</dt>
      <dd>
        {session.targetType === "GYM"
          ? labels.gym
          : session.targetType === "INDEPENDENT_TRAINER"
            ? labels.trainer
            : "—"}
      </dd>
      <dt>{labels.contextType}</dt>
      <dd>
        <bdi>{session.contextType}</bdi>
      </dd>
      <dt>{labels.sessionType}</dt>
      <dd>
        <bdi>{session.sessionType}</bdi>
      </dd>
      <dt>{labels.status}</dt>
      <dd>{labels.statuses[session.status]}</dd>
      <dt>{labels.version}</dt>
      <dd>{session.version}</dd>
      <dt>{labels.started}</dt>
      <dd>
        <SupportTime value={session.startedAt} locale={locale} />
      </dd>
      <dt>{labels.expires}</dt>
      <dd>
        <SupportTime value={session.expiresAt} locale={locale} />
      </dd>
      {session.endedAt ? (
        <>
          <dt>{labels.statuses.ENDED}</dt>
          <dd>
            <SupportTime value={session.endedAt} locale={locale} />
          </dd>
        </>
      ) : null}
      {session.revokedAt ? (
        <>
          <dt>{labels.statuses.REVOKED}</dt>
          <dd>
            <SupportTime value={session.revokedAt} locale={locale} />
          </dd>
        </>
      ) : null}
    </dl>
  );
}
export function SupportTime({
  value,
  locale,
}: {
  value: string;
  locale: Locale;
}) {
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value))}{" "}
      <bdi>UTC</bdi>
    </time>
  );
}
