"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PlatformWorkspaceDetailDto, WorkspaceId } from "@/contracts";
import { useAuthSession } from "@/lib/auth";
import { usePlatformAuthority } from "@/lib/platform-access";
import { getPlatformWorkspace } from "@/lib/platform-workspaces";
import { useProtectedAsyncEpoch } from "@/lib/platform-workspaces/use-protected-async-epoch";
import { getSupportLabels, type SupportLabels } from "@/i18n/support";
import type { Locale } from "@/i18n/locales";
import {
  freezeStartIntent,
  startSupport,
  uncertain,
  type StartIntent,
} from "@/lib/platform-support/api";
import {
  isObjectId,
  makeStartBody,
  type StartBody,
  type TargetType,
} from "@/lib/platform-support/contracts";
import {
  authorityIdentity,
  authorityLive,
  supportAuthority,
} from "@/lib/platform-support/runtime";
import { supportError } from "@/lib/platform-support/errors";
import {
  useSupportRuntime,
  useSupportSnapshot,
} from "@/lib/platform-support/support-context";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { SupportSessionDetail } from "./SupportSessionDetail";
import styles from "./support.module.css";

export function SupportConsole({
  locale,
  workspaceId,
}: {
  locale: Locale;
  workspaceId?: string;
}) {
  const authority = usePlatformAuthority(),
    auth = useAuthSession(),
    snapshot = useSupportSnapshot();
  const a = supportAuthority(authority),
    labels = getSupportLabels(locale);
  const identity = JSON.stringify([
    authorityIdentity(a),
    auth.state.accessToken,
  ]);
  return (
    <article className={styles.page}>
      <h1>{labels.title}</h1>
      <p>{labels.boundary}</p>
      {snapshot.context ? (
        <div className={styles.card}>
          <p>
            {snapshot.context.workspace.name} · {labels.readOnly}
          </p>
          <Link href="/app/support">{labels.enter}</Link>
        </div>
      ) : null}
      {authority.allows("platform_workspaces.manage") ? (
        <Link href="/platform/workspaces">{labels.directory}</Link>
      ) : null}
      {authorityLive(a, "support.sessions.start") ? (
        <SupportEntry
          key={identity}
          locale={locale}
          labels={labels}
          workspaceId={workspaceId}
          identity={identity}
        />
      ) : (
        <p role="status">{labels.denied}</p>
      )}
      {snapshot.context && authorityLive(a, "support.sessions.read") ? (
        <SupportSessionDetail
          sessionId={snapshot.context.supportSession.id}
          locale={locale}
          inline
        />
      ) : null}
    </article>
  );
}
function SupportEntry({
  locale,
  labels,
  workspaceId,
  identity,
}: {
  locale: Locale;
  labels: SupportLabels;
  workspaceId?: string;
  identity: string;
}) {
  const authority = usePlatformAuthority(),
    { apiClient } = useAuthSession();
  const [workspace, setWorkspace] = useState<PlatformWorkspaceDetailDto | null>(
      null,
    ),
    [error, setError] = useState(false);
  const managed = authority.allows("platform_workspaces.manage");
  useEffect(() => {
    if (!workspaceId || !managed) return;
    const controller = new AbortController();
    if (!isObjectId(workspaceId)) return;
    void getPlatformWorkspace(
      apiClient,
      workspaceId as WorkspaceId,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setWorkspace(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [apiClient, workspaceId, managed]);
  if (workspaceId && !isObjectId(workspaceId))
    return <p role="status">{labels.failed}</p>;
  if (workspaceId && managed && !workspace)
    return <p role="status">{error ? labels.failed : labels.loading}</p>;
  return (
    <section className={styles.card} aria-labelledby="support-start-heading">
      <h2 id="support-start-heading">{labels.start}</h2>
      {workspace ? (
        <WorkspaceFacts workspace={workspace} labels={labels} />
      ) : (
        <p>{labels.known}</p>
      )}
      <StartSupportForm
        key={workspaceId ?? "known"}
        locale={locale}
        labels={labels}
        identity={identity}
        workspace={workspace ?? undefined}
        workspaceId={workspaceId}
      />
    </section>
  );
}
export function WorkspaceFacts({
  workspace,
  labels,
}: {
  workspace: {
    id: string;
    name: string;
    type: TargetType;
    status: keyof SupportLabels["workspaceStatuses"];
    timezone: string;
    defaultLanguage: "en" | "ar";
  };
  labels: SupportLabels;
}) {
  return (
    <dl className={styles.facts}>
      <dt>{labels.workspace}</dt>
      <dd>{workspace.name}</dd>
      <dt>{labels.workspaceId}</dt>
      <dd>
        <bdi>{workspace.id}</bdi>
      </dd>
      <dt>{labels.type}</dt>
      <dd>{workspace.type === "GYM" ? labels.gym : labels.trainer}</dd>
      <dt>{labels.status}</dt>
      <dd>{labels.workspaceStatuses[workspace.status]}</dd>
      <dt>{labels.timezone}</dt>
      <dd>
        <bdi>{workspace.timezone}</bdi>
      </dd>
      <dt>{labels.language}</dt>
      <dd>{workspace.defaultLanguage === "ar" ? "العربية" : "English"}</dd>
    </dl>
  );
}
export function StartSupportForm({
  labels,
  identity,
  workspace,
  workspaceId,
}: {
  locale: Locale;
  labels: SupportLabels;
  identity: string;
  workspace?: PlatformWorkspaceDetailDto;
  workspaceId?: string;
}) {
  const authority = usePlatformAuthority(),
    { apiClient } = useAuthSession(),
    runtime = useSupportRuntime(),
    snapshot = useSupportSnapshot(),
    router = useRouter();
  const [target, setTarget] = useState(workspace?.id ?? workspaceId ?? ""),
    [type, setType] = useState<TargetType>(workspace?.type ?? "GYM");
  const [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [duration, setDuration] = useState("30");
  const [confirmation, setConfirmation] = useState<StartBody | null>(null),
    [intent, setIntent] = useState<StartIntent | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [isUncertain, setUncertain] = useState(false),
    [invalid, setInvalid] = useState(false),
    [denied, setDenied] = useState(false);
  const epoch = useProtectedAsyncEpoch(identity),
    flight = useRef<AbortController | null>(null),
    guard = useRef(false);
  useEffect(
    () => () => {
      flight.current?.abort();
    },
    [],
  );
  const send = async (frozen: StartIntent) => {
    if (
      guard.current ||
      frozen.identity !== identity ||
      denied ||
      !authorityLive(supportAuthority(authority), "support.sessions.start")
    )
      return;
    guard.current = true;
    const capture = epoch.capture(),
      supportEpoch = runtime.getSnapshot().epoch;
    const current = () =>
      epoch.isCurrent(capture) && runtime.getSnapshot().epoch === supportEpoch;
    const controller = new AbortController();
    flight.current = controller;
    setBusy(true);
    setConfirmation(null);
    setMessage("");
    try {
      const session = await startSupport(apiClient, frozen, controller.signal);
      if (!current()) return;
      if (session.realActorPlatformMembershipId !== authority.membershipId)
        throw new Error("Support actor mismatch");
      setIntent(null);
      setUncertain(false);
      setReason("");
      setReference("");
      const activated = await runtime.select(
        apiClient,
        session.id,
        frozen.body.targetWorkspaceId,
        supportAuthority(authority),
      );
      if (!epoch.isCurrent(capture)) {
        if (runtime.isSelected(session.id)) runtime.retire();
        return;
      }
      if (
        activated &&
        runtime.getSnapshot().context?.workspace.type !== frozen.body.targetType
      ) {
        runtime.retire();
        setMessage(labels.failed);
        return;
      }
      if (activated) router.push("/app/support");
      else setMessage(labels.failed);
    } catch (error) {
      if (!current()) return;
      if (uncertain(error)) {
        setIntent(frozen);
        setUncertain(true);
        setMessage(labels.uncertain);
      } else {
        setIntent(null);
        setUncertain(false);
        setMessage(supportError(error, labels));
        if (
          supportError(error, labels) === labels.denied ||
          supportError(error, labels) === labels.auth
        ) {
          setDenied(true);
          void authority.refresh();
        }
      }
    } finally {
      guard.current = false;
      if (epoch.isCurrent(capture)) setBusy(false);
    }
  };
  if (snapshot.context || snapshot.pending)
    return <p role="status">{labels.targetChanged}</p>;
  if (denied) return <p role="status">{message}</p>;
  return (
    <>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || intent) return;
          try {
            setConfirmation(
              makeStartBody(
                target.trim(),
                type,
                Number(duration),
                reason,
                reference,
              ),
            );
            setInvalid(false);
            setMessage("");
          } catch {
            setInvalid(true);
            setMessage(labels.invalid);
          }
        }}
        noValidate
      >
        <fieldset
          disabled={busy || isUncertain}
          className={styles.form}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <div className={styles.field}>
            <label htmlFor="support-target">{labels.workspaceId}</label>
            <input
              id="support-target"
              aria-describedby="support-form-hint support-form-error"
              aria-invalid={invalid || undefined}
              dir="ltr"
              value={target}
              readOnly={workspaceId !== undefined || workspace !== undefined}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="support-type">{labels.type}</label>
            <select
              id="support-type"
              value={type}
              disabled={workspace !== undefined}
              onChange={(e) => setType(e.target.value as TargetType)}
            >
              <option value="GYM">{labels.gym}</option>
              <option value="INDEPENDENT_TRAINER">{labels.trainer}</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="support-duration">{labels.duration}</label>
            <input
              id="support-duration"
              type="number"
              min={1}
              max={60}
              step={1}
              list="support-durations"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              aria-invalid={invalid || undefined}
              aria-describedby="support-form-hint support-form-error"
              required
            />
          </div>
          <datalist id="support-durations">
            {[15, 30, 45, 60].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <div className={styles.field}>
            <label htmlFor="support-reason">{labels.reason}</label>
            <textarea
              id="support-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={500}
              aria-invalid={invalid || undefined}
              aria-describedby="support-form-hint support-form-error support-privacy"
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="support-reference">{labels.reference}</label>
            <input
              id="support-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={120}
              aria-invalid={invalid || undefined}
              aria-describedby="support-form-hint support-form-error"
            />
          </div>
          <p id="support-form-hint">{labels.bounds}</p>
          <p id="support-privacy">{labels.privacy}</p>
          <button type="submit">{busy ? labels.loading : labels.start}</button>
        </fieldset>
      </form>
      <p id="support-form-error" role="status">
        {message}
      </p>
      {isUncertain && intent ? (
        <button disabled={busy} onClick={() => void send(intent)} type="button">
          {labels.retryIntent}
        </button>
      ) : null}
      {confirmation ? (
        <ConfirmationDialog
          title={labels.confirm}
          cancel={labels.cancel}
          confirm={labels.proceed}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            const frozen = freezeStartIntent(confirmation, identity);
            setIntent(frozen);
            void send(frozen);
          }}
        >
          <dl className={styles.facts}>
            <dt>{labels.workspace}</dt>
            <dd>
              {workspace?.name ?? <bdi>{confirmation.targetWorkspaceId}</bdi>}
            </dd>
            <dt>{labels.type}</dt>
            <dd>{type === "GYM" ? labels.gym : labels.trainer}</dd>
            <dt>{labels.context}</dt>
            <dd>{labels.readOnly}</dd>
            <dt>{labels.duration}</dt>
            <dd>{confirmation.requestedDurationMinutes}</dd>
            <dt>{labels.reason}</dt>
            <dd>{confirmation.reason}</dd>
            {confirmation.reference ? (
              <>
                <dt>{labels.reference}</dt>
                <dd>{confirmation.reference}</dd>
              </>
            ) : null}
          </dl>
        </ConfirmationDialog>
      ) : null}
    </>
  );
}
