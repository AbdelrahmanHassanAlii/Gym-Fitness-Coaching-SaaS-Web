"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/auth";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import { evaluateAccess } from "@/lib/access";
import { accessRequirement } from "@/lib/staff-shell/model";
import { isApiError } from "@/lib/api";
import {
  getDataManagementLabels,
  type DataManagementLabels,
} from "@/i18n/data-management";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import {
  createExport,
  getExport,
  handoffDownload,
  issueDownload,
  listExports,
} from "@/lib/data-management/api";
import { malformed, type ExportDto } from "@/lib/data-management/decoders";
import {
  activeExport,
  errorMessage,
  isUncertain,
  MemoryIntent,
  MemoryRows,
} from "@/lib/data-management/state";
import {
  Dialog,
  Facts,
  useExpiryClock,
  useRequestGuard,
  useRevalidation,
} from "./shared";
import styles from "./data-management.module.css";
type ExportIntent = { key: string; reconciled: boolean };

export function ExportExperience({ locale }: { locale: Locale }) {
  const { state, generation } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  const labels = getDataManagementLabels(locale);
  const actorIdentity = JSON.stringify([
    state.status === "authenticated" ? state.user.id : null,
    generation,
    workspace?.membershipId,
    workspace?.workspaceId,
    workspace?.accessVersion,
  ]);
  const intentMemory = useMemo(
    () => new MemoryIntent<ExportIntent>(actorIdentity),
    [actorIdentity],
  );
  const rowMemory = useMemo(
    () => new MemoryRows<ExportDto>(actorIdentity),
    [actorIdentity],
  );
  const native =
    state.status === "authenticated" &&
    !state.restrictedUntilVerified &&
    shellContext?.accessContext === "user" &&
    workspace !== null;
  const permissions = { read: false, create: false, download: false };
  if (native && shellContext) {
    for (const action of ["read", "create", "download"] as const)
      permissions[action] = evaluateAccess(accessFacts, {
        ...accessRequirement(shellContext, `exports.workspace.${action}`),
        scope: "workspace",
        branchId: undefined,
      }).allowed;
  }
  if (!native || (!permissions.read && !permissions.create))
    return (
      <section>
        <h1>{labels.exportTitle}</h1>
        <p>{labels.denied}</p>
      </section>
    );
  const identity = JSON.stringify([
    state.status === "authenticated" ? state.user.id : null,
    generation,
    workspace!.membershipId,
    workspace!.workspaceId,
    workspace!.accessVersion,
    permissions,
    accessFacts?.status,
  ]);
  return (
    <NativeExports
      key={identity}
      locale={locale}
      labels={labels}
      workspaceId={workspace!.workspaceId}
      permissions={permissions}
      intentMemory={intentMemory}
      rowMemory={rowMemory}
    />
  );
}

export function NativeExports({
  locale,
  labels,
  workspaceId,
  permissions,
  intentMemory,
  rowMemory,
}: {
  locale: Locale;
  labels: DataManagementLabels;
  workspaceId: string;
  permissions: { read: boolean; create: boolean; download: boolean };
  intentMemory?: MemoryIntent<ExportIntent>;
  rowMemory?: MemoryRows<ExportDto>;
}) {
  const { apiClient, markSessionExpired } = useAuthSession(),
    queryClient = useQueryClient();
  const expireRef = useRef(markSessionExpired);
  useEffect(() => {
    expireRef.current = markSessionExpired;
  }, [markSessionExpired]);
  const guard = useRequestGuard();
  const [store] = useState(() => rowMemory ?? new MemoryRows<ExportDto>());
  const [rows, setRows] = useState<ExportDto[]>(() => store.read()),
    rowsRef = useRef<ExportDto[]>(store.read());
  const [cursor, setCursor] = useState<string | null>(null),
    cursorRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState<unknown>(null);
  const [blocked, setBlocked] = useState(false),
    blockedRef = useRef(false);
  const [confirming, setConfirming] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const [intent] = useState(
    () => intentMemory ?? new MemoryIntent<ExportIntent>(),
  );
  const [pendingIntent, setPendingIntent] = useState(
      () => intent.get() !== null,
    ),
    [canReplay, setCanReplay] = useState(false);
  const paginationStarted = useRef(false);
  const handleError = useCallback(
    (failure: unknown) => {
      if (!guard.alive()) return;
      setError(failure);
      if (
        isApiError(failure) &&
        (failure.status === 401 ||
          failure.status === 403 ||
          failure.kind === "malformed-response")
      ) {
        blockedRef.current = true;
        setBlocked(true);
        setConfirming(false);
        if (failure.category === "unauthenticated") expireRef.current(failure);
        void queryClient.invalidateQueries({
          predicate: (q) =>
            JSON.stringify(q.queryKey).includes("staff-shell") ||
            JSON.stringify(q.queryKey).includes(
              "current-user-effective-access",
            ),
        });
      }
    },
    [guard, queryClient],
  );
  const accept = useCallback(
    (incoming: ExportDto[]) => {
      if (incoming.some((row) => row.workspaceId !== workspaceId)) malformed();
      rowsRef.current = store.merge(incoming);
      setRows(rowsRef.current);
    },
    [workspaceId, store],
  );
  const refresh = useCallback(async () => {
    if (!permissions.read || busyRef.current || !guard.alive()) return;
    const ticket = guard.start();
    setLoading(true);
    try {
      const page = await listExports(apiClient, workspaceId);
      const details = await Promise.all(
        rowsRef.current
          .filter(
            (r) =>
              activeExport(r.status) ||
              (r.status === "READY" &&
                r.expiresAt &&
                Date.parse(r.expiresAt) <= Date.now()),
          )
          .map((r) => getExport(apiClient, workspaceId, r.id)),
      );
      if (!guard.alive() || !guard.current(ticket)) return;
      accept([...page.items, ...details]);
      // Preserve the explicit pagination position when refreshing the newest page.
      if (!paginationStarted.current || cursorRef.current === null) {
        cursorRef.current = page.nextCursor;
        setCursor(page.nextCursor);
      }
      setError(null);
      blockedRef.current = false;
      setBlocked(false);
      const pending = intent.get();
      if (pending) {
        intent.set({ ...pending, reconciled: true });
        setCanReplay(true);
      }
    } catch (failure) {
      if (guard.current(ticket)) handleError(failure);
    } finally {
      if (guard.alive() && guard.current(ticket)) setLoading(false);
    }
  }, [
    apiClient,
    workspaceId,
    permissions.read,
    guard,
    accept,
    handleError,
    intent,
  ]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);
  const expiries = rows
    .filter((r) => r.status === "READY" && r.expiresAt)
    .map((r) => r.expiresAt!);
  const now = useExpiryClock(expiries);
  useRevalidation(
    refresh,
    rows.some((r) => activeExport(r.status)) ? 5000 : null,
    expiries,
  );
  async function older() {
    if (!cursor || loading || busyRef.current || blockedRef.current) return;
    const ticket = guard.start();
    setLoading(true);
    try {
      const page = await listExports(apiClient, workspaceId, cursor);
      if (guard.alive() && guard.current(ticket)) {
        accept(page.items);
        paginationStarted.current = true;
        cursorRef.current = page.nextCursor === cursor ? null : page.nextCursor;
        setCursor(cursorRef.current);
      }
    } catch (failure) {
      if (guard.current(ticket)) handleError(failure);
    } finally {
      if (guard.alive() && guard.current(ticket)) setLoading(false);
    }
  }
  async function requestExport(replay = false) {
    if (
      busyRef.current ||
      blockedRef.current ||
      !permissions.create ||
      !guard.alive()
    )
      return;
    if (replay ? !intent.get()?.reconciled : intent.get() !== null) return;
    const current = replay
      ? intent.get()!
      : { key: crypto.randomUUID(), reconciled: false };
    intent.set(current);
    setPendingIntent(true);
    setCanReplay(false);
    busyRef.current = true;
    setBusy(true);
    guard.start();
    setConfirming(false);
    setError(null);
    setLoading(false);
    try {
      const row = await createExport(apiClient, workspaceId, current.key);
      if (!guard.alive()) return;
      accept([row]);
      intent.set(null);
      setPendingIntent(false);
      setCanReplay(false);
      setMessage(labels.success);
    } catch (failure) {
      if (!guard.alive()) return;
      handleError(failure);
      if (
        isUncertain(failure) ||
        (isApiError(failure) && failure.code?.startsWith("IDEMPOTENCY_"))
      ) {
        intent.set({ ...current, reconciled: false });
        setMessage(labels.uncertain);
      } else {
        intent.set(null);
        setPendingIntent(false);
        setCanReplay(false);
        setMessage(errorMessage(failure, labels));
      }
    } finally {
      if (guard.alive()) {
        busyRef.current = false;
        setBusy(false);
        await refresh();
      }
    }
  }
  async function detail(id: string) {
    if (!permissions.read || busyRef.current || blockedRef.current) return;
    const ticket = guard.start();
    setLoading(true);
    try {
      const row = await getExport(apiClient, workspaceId, id);
      if (guard.alive() && guard.current(ticket)) {
        if (row.id !== id) malformed();
        accept([row]);
        setSelected(id);
      }
    } catch (failure) {
      if (guard.current(ticket)) handleError(failure);
    } finally {
      if (guard.alive() && guard.current(ticket)) setLoading(false);
    }
  }
  async function download(observed: ExportDto) {
    if (
      !permissions.download ||
      busyRef.current ||
      blockedRef.current ||
      observed.status !== "READY" ||
      !observed.expiresAt ||
      Date.parse(observed.expiresAt) <= Date.now()
    )
      return;
    busyRef.current = true;
    setBusy(true);
    const ticket = guard.start();
    try {
      const transport = await issueDownload(
        apiClient,
        workspaceId,
        observed.id,
      );
      const current = rowsRef.current.find((r) => r.id === observed.id);
      if (
        !guard.alive() ||
        !guard.current(ticket) ||
        !current ||
        current.version !== observed.version ||
        current.expiresAt !== observed.expiresAt ||
        current.status !== "READY" ||
        Date.parse(transport.expiresAt) <= Date.now() ||
        Date.parse(observed.expiresAt) <= Date.now()
      )
        return;
      if (Date.parse(transport.expiresAt) > Date.parse(observed.expiresAt))
        malformed();
      handoffDownload(transport.url);
      setMessage(
        `${labels.linkIssued} ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date(transport.expiresAt))} (UTC)`,
      );
    } catch (failure) {
      if (guard.alive()) handleError(failure);
    } finally {
      if (guard.alive()) {
        busyRef.current = false;
        setBusy(false);
        await refresh();
      }
    }
  }
  const selectedRow = rows.find((r) => r.id === selected);
  return (
    <section
      className={styles.page}
      dir={getLocaleDirection(locale)}
      aria-busy={loading || busy}
    >
      <h1>{labels.exportTitle}</h1>
      <p>{labels.exportCopy}</p>
      <div className={styles.actions}>
        {permissions.create && !blocked ? (
          <button
            disabled={busy || pendingIntent}
            onClick={() => setConfirming(true)}
          >
            {rows.some((r) => r.status === "FAILED" || r.status === "EXPIRED")
              ? labels.newExport
              : labels.create}
          </button>
        ) : null}
        {permissions.read ? (
          <button disabled={busy || loading} onClick={() => void refresh()}>
            {labels.refresh}
          </button>
        ) : null}
        {canReplay && !blocked ? (
          <button disabled={busy} onClick={() => void requestExport(true)}>
            {labels.replay}
          </button>
        ) : null}
      </div>
      {pendingIntent ? <p>{labels.replayHelp}</p> : null}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {error ? (
        <p role="alert" className={styles.error}>
          {errorMessage(error, labels)}
        </p>
      ) : null}
      {loading && !rows.length ? <p>{labels.loading}</p> : null}
      {!permissions.read ? (
        <p>{labels.denied}</p>
      ) : !blocked ? (
        <>
          {!loading && !rows.length ? <p>{labels.emptyExports}</p> : null}
          <div className={styles.cards}>
            {rows.map((row) => (
              <article className={styles.card} key={row.id}>
                <h2>
                  <bdi dir="ltr">{row.id}</bdi>
                </h2>
                <p>{labels.statuses[row.status]}</p>
                <ExportFacts row={row} labels={labels} locale={locale} />
                {row.status === "FAILED" ? <p>{labels.failed}</p> : null}
                <div className={styles.actions}>
                  <button
                    disabled={loading || busy}
                    onClick={() => void detail(row.id)}
                  >
                    {labels.detail}
                  </button>
                  {permissions.download && row.status === "READY" ? (
                    <button
                      disabled={
                        busy ||
                        !row.expiresAt ||
                        Date.parse(row.expiresAt) <= now
                      }
                      onClick={() => void download(row)}
                    >
                      {labels.download}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {cursor ? (
            <button disabled={loading || busy} onClick={() => void older()}>
              {labels.olderExports}
            </button>
          ) : null}
        </>
      ) : null}
      {confirming && !blocked ? (
        <Dialog title={labels.create} onClose={() => setConfirming(false)}>
          <p>{labels.exportCopy}</p>
          <div className={styles.actions}>
            <button autoFocus onClick={() => setConfirming(false)}>
              {labels.close}
            </button>
            <button disabled={busy} onClick={() => void requestExport()}>
              {labels.confirm}
            </button>
          </div>
        </Dialog>
      ) : null}
      {selectedRow && !blocked ? (
        <Dialog title={labels.exportTitle} onClose={() => setSelected(null)}>
          <p>{labels.statuses[selectedRow.status]}</p>
          <ExportFacts row={selectedRow} labels={labels} locale={locale} />
          <button autoFocus onClick={() => setSelected(null)}>
            {labels.close}
          </button>
        </Dialog>
      ) : null}
    </section>
  );
}
function ExportFacts({
  row,
  labels,
  locale,
}: {
  row: ExportDto;
  labels: DataManagementLabels;
  locale: Locale;
}) {
  const f = labels.fields;
  return (
    <Facts
      locale={locale}
      values={[
        [f.requestedAt, row.requestedAt, true],
        [f.completedAt, row.completedAt, true],
        [f.failedAt, row.failedAt, true],
        [f.expiresAt, row.expiresAt, true],
        [f.format, row.format],
        [f.requestedByUserId, row.requestedByUserId],
        [f.version, row.version],
      ]}
    />
  );
}
