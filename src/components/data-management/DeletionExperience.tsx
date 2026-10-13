"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuthSession } from "@/lib/auth";
import { usePlatformAuthority } from "@/lib/platform-access";
import { isApiError } from "@/lib/api";
import {
  getDataManagementLabels,
  type DataManagementLabels,
} from "@/i18n/data-management";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import {
  getDeletion,
  listDeletions,
  mutateDeletion,
  type ActionBody,
  type DeletionAction,
} from "@/lib/data-management/api";
import { malformed, type DeletionDto } from "@/lib/data-management/decoders";
import {
  canReview,
  decisionAlive,
  errorMessage,
  isUncertain,
  MemoryIntent,
  MemoryRows,
} from "@/lib/data-management/state";
import { Dialog, Facts, useRequestGuard, useRevalidation } from "./shared";
import styles from "./data-management.module.css";

export function DeletionExperience({
  locale,
  deletionId,
}: {
  locale: Locale;
  deletionId?: string;
}) {
  const authority = usePlatformAuthority(),
    labels = getDataManagementLabels(locale);
  const { state, generation } = useAuthSession();
  const actorIdentity = JSON.stringify([
    authority.principalId,
    authority.sessionGeneration,
    authority.membershipId,
    authority.accessVersion,
    deletionId,
  ]);
  const intentMemory = useMemo(
    () => new MemoryIntent<ApprovalIntent>(actorIdentity),
    [actorIdentity],
  );
  const rowMemory = useMemo(
    () => new MemoryRows<DeletionDto>(actorIdentity),
    [actorIdentity],
  );
  const permissions = [
    "deletion.read",
    "deletion.approve",
    "deletion.postpone",
    "deletion.cancel",
  ] as const;
  const current =
    state.status === "authenticated" &&
    !state.restrictedUntilVerified &&
    state.user.id === authority.principalId &&
    generation === authority.sessionGeneration &&
    decisionAlive(authority.validUntil) &&
    decisionAlive(authority.deletionValidUntil);
  if (!current || !authority.allows("deletion.read"))
    return (
      <section>
        <h1>{labels.title}</h1>
        <p>{labels.denied}</p>
      </section>
    );
  const identity = JSON.stringify([
    authority.principalId,
    authority.sessionGeneration,
    authority.membershipId,
    authority.accessVersion,
    authority.validUntil,
    authority.deletionValidUntil,
    permissions.map((p) => authority.allows(p)),
    deletionId,
  ]);
  return deletionId ? (
    <DeletionDetail
      key={identity}
      locale={locale}
      labels={labels}
      deletionId={deletionId}
      intentMemory={intentMemory}
      rowMemory={rowMemory}
    />
  ) : (
    <DeletionQueue
      key={identity}
      locale={locale}
      labels={labels}
      rowMemory={rowMemory}
    />
  );
}

export function DeletionQueue({
  locale,
  labels,
  rowMemory,
}: {
  locale: Locale;
  labels: DataManagementLabels;
  rowMemory?: MemoryRows<DeletionDto>;
}) {
  const { apiClient, markSessionExpired } = useAuthSession(),
    authority = usePlatformAuthority();
  const expireRef = useRef(markSessionExpired);
  useEffect(() => {
    expireRef.current = markSessionExpired;
  }, [markSessionExpired]);
  const guard = useRequestGuard();
  const [store] = useState(() => rowMemory ?? new MemoryRows<DeletionDto>());
  const [rows, setRows] = useState<DeletionDto[]>(() => store.read()),
    rowsRef = useRef<DeletionDto[]>(store.read());
  const [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<unknown>(null);
  const [blocked, setBlocked] = useState(false);
  const authorityRef = useRef(authority);
  useEffect(() => {
    authorityRef.current = authority;
  }, [authority]);
  const permitted = useCallback(
    () =>
      guard.alive() &&
      authorityRef.current.allows("deletion.read") &&
      decisionAlive(authorityRef.current.validUntil) &&
      decisionAlive(authorityRef.current.deletionValidUntil),
    [guard],
  );
  const load = useCallback(
    async (after?: string) => {
      if (!permitted()) return;
      const ticket = guard.start();
      setLoading(true);
      try {
        const page = await listDeletions(apiClient, after);
        if (!permitted() || !guard.current(ticket)) return;
        rowsRef.current = store.merge(page.items);
        setRows(rowsRef.current);
        setCursor(page.nextCursor === after ? null : page.nextCursor);
        setError(null);
        setBlocked(false);
      } catch (failure) {
        if (!permitted() || !guard.current(ticket)) return;
        setError(failure);
        if (
          isApiError(failure) &&
          (failure.status === 401 ||
            failure.status === 403 ||
            failure.kind === "malformed-response")
        ) {
          setBlocked(true);
          if (failure.category === "unauthenticated")
            expireRef.current(failure);
          else if (failure.status === 403) void authorityRef.current.refresh();
        }
      } finally {
        if (permitted() && guard.current(ticket)) setLoading(false);
      }
    },
    [apiClient, permitted, guard, store],
  );
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  const refresh = useCallback(() => load(), [load]);
  useRevalidation(refresh, null);
  return (
    <section
      className={styles.page}
      dir={getLocaleDirection(locale)}
      aria-busy={loading}
    >
      <h1>{labels.title}</h1>
      <p>{labels.queueCopy}</p>
      <button disabled={loading} onClick={() => void load()}>
        {labels.refresh}
      </button>
      {loading && !rows.length ? <p>{labels.loading}</p> : null}
      {error ? <p role="alert">{errorMessage(error, labels)}</p> : null}
      {!blocked ? (
        <>
          {!loading && !rows.length ? <p>{labels.emptyDeletions}</p> : null}
          <div className={styles.cards}>
            {rows.map((row) => (
              <article className={styles.card} key={row.id}>
                <h2>
                  <Link href={`/platform/data-management/deletions/${row.id}`}>
                    <bdi dir="ltr">{row.workspaceId}</bdi>
                  </Link>
                </h2>
                <p>{labels.statuses[row.status]}</p>
                <DeletionFacts
                  row={row}
                  labels={labels}
                  locale={locale}
                  compact
                />
                <Link href={`/platform/data-management/deletions/${row.id}`}>
                  {labels.detail}
                </Link>
              </article>
            ))}
          </div>
          {cursor ? (
            <button disabled={loading} onClick={() => void load(cursor)}>
              {labels.older}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

type Confirmation = { action: DeletionAction; row: DeletionDto };
type ApprovalIntent = { body: ActionBody; key: string; reconciled: boolean };
export function DeletionDetail({
  locale,
  labels,
  deletionId,
  intentMemory,
  rowMemory,
}: {
  locale: Locale;
  labels: DataManagementLabels;
  deletionId: string;
  intentMemory?: MemoryIntent<ApprovalIntent>;
  rowMemory?: MemoryRows<DeletionDto>;
}) {
  const { apiClient, markSessionExpired } = useAuthSession(),
    authority = usePlatformAuthority();
  const authorityRef = useRef(authority);
  useEffect(() => {
    authorityRef.current = authority;
  }, [authority]);
  const expireRef = useRef(markSessionExpired);
  useEffect(() => {
    expireRef.current = markSessionExpired;
  }, [markSessionExpired]);
  const guard = useRequestGuard();
  const [store] = useState(() => rowMemory ?? new MemoryRows<DeletionDto>());
  const [row, setRow] = useState<DeletionDto | null>(
      () => store.read().find((r) => r.id === deletionId) ?? null,
    ),
    rowRef = useRef<DeletionDto | null>(row);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false),
    blockedRef = useRef(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    confirmationRef = useRef<Confirmation | null>(null);
  const [approval] = useState(
    () => intentMemory ?? new MemoryIntent<ApprovalIntent>(),
  );
  const [pendingApproval, setPendingApproval] = useState(
      () => approval.get() !== null,
    ),
    [replayReady, setReplayReady] = useState(false);
  const permitted = useCallback(
    (action?: DeletionAction) =>
      guard.alive() &&
      authorityRef.current.allows("deletion.read") &&
      (!action || authorityRef.current.allows(`deletion.${action}`)) &&
      decisionAlive(authorityRef.current.validUntil) &&
      decisionAlive(authorityRef.current.deletionValidUntil),
    [guard],
  );
  const close = useCallback(() => {
    confirmationRef.current = null;
    setConfirmation(null);
  }, []);
  const handleError = useCallback(
    (failure: unknown) => {
      if (!guard.alive()) return;
      setError(failure);
      close();
      if (
        isApiError(failure) &&
        (failure.status === 401 ||
          failure.status === 403 ||
          failure.kind === "malformed-response")
      ) {
        blockedRef.current = true;
        setBlocked(true);
        if (failure.category === "unauthenticated") expireRef.current(failure);
        else if (failure.status === 403) void authorityRef.current.refresh();
      }
    },
    [guard, close],
  );
  const accept = useCallback(
    (incoming: DeletionDto): boolean => {
      if (
        incoming.id !== deletionId ||
        (rowRef.current && incoming.workspaceId !== rowRef.current.workspaceId)
      )
        malformed();
      if (rowRef.current && incoming.version < rowRef.current.version)
        return false;
      if (
        confirmationRef.current &&
        (incoming.version !== confirmationRef.current.row.version ||
          incoming.status !== confirmationRef.current.row.status)
      )
        close();
      store.merge([incoming]);
      rowRef.current = incoming;
      setRow(incoming);
      return true;
    },
    [deletionId, close, store],
  );
  const refresh = useCallback(async () => {
    if (!permitted() || busyRef.current) return;
    const ticket = guard.start();
    setLoading(true);
    try {
      const fresh = await getDeletion(apiClient, deletionId);
      if (!permitted() || !guard.current(ticket)) return;
      if (accept(fresh)) {
        setError(null);
        setBlocked(false);
        blockedRef.current = false;
        const pending = approval.get();
        if (pending) {
          approval.set({ ...pending, reconciled: true });
          setReplayReady(true);
        }
      }
    } catch (failure) {
      if (permitted() && guard.current(ticket)) handleError(failure);
    } finally {
      if (permitted() && guard.current(ticket)) setLoading(false);
    }
  }, [apiClient, deletionId, permitted, guard, accept, handleError, approval]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);
  useRevalidation(
    refresh,
    row?.status === "APPROVED" || row?.status === "PROCESSING" ? 10000 : null,
  );
  async function begin(action: DeletionAction) {
    if (
      !permitted(action) ||
      busyRef.current ||
      blockedRef.current ||
      loading ||
      !rowRef.current ||
      !canReview(rowRef.current.status) ||
      approval.get()
    )
      return;
    close();
    const ticket = guard.start();
    setLoading(true);
    try {
      const fresh = await getDeletion(apiClient, deletionId);
      if (
        !permitted(action) ||
        !guard.current(ticket) ||
        !accept(fresh) ||
        !canReview(fresh.status)
      )
        return;
      const next = { action, row: fresh };
      confirmationRef.current = next;
      setConfirmation(next);
      setError(null);
    } catch (failure) {
      if (permitted() && guard.current(ticket)) handleError(failure);
    } finally {
      if (permitted() && guard.current(ticket)) setLoading(false);
    }
  }
  async function submit(
    action: DeletionAction,
    body: ActionBody,
    replay = false,
  ) {
    const current = rowRef.current;
    if (
      !permitted(action) ||
      busyRef.current ||
      blockedRef.current ||
      !current ||
      !canReview(current.status)
    )
      return;
    if (
      !replay &&
      (!confirmationRef.current ||
        confirmationRef.current.action !== action ||
        confirmationRef.current.row.version !== current.version ||
        body.expectedVersion !== current.version)
    ) {
      close();
      return;
    }
    if (replay && (!approval.get()?.reconciled || action !== "approve")) return;
    const intent =
      action === "approve"
        ? replay
          ? approval.get()!
          : { body: { ...body }, key: crypto.randomUUID(), reconciled: false }
        : null;
    if (intent) {
      approval.set(intent);
      setPendingApproval(true);
      setReplayReady(false);
    }
    busyRef.current = true;
    setBusy(true);
    guard.start();
    close();
    setError(null);
    setLoading(false);
    try {
      const acknowledgement = await mutateDeletion(
        apiClient,
        deletionId,
        action,
        intent?.body ?? body,
        intent?.key,
      );
      if (!permitted(action)) return;
      accept(acknowledgement);
      if (intent) {
        approval.set(null);
        setPendingApproval(false);
        setReplayReady(false);
      }
      setMessage(labels.success);
    } catch (failure) {
      if (!permitted()) return;
      handleError(failure);
      if (
        isUncertain(failure) ||
        (isApiError(failure) && failure.code?.startsWith("IDEMPOTENCY_"))
      ) {
        if (intent) approval.set({ ...intent, reconciled: false });
        setMessage(labels.uncertain);
      } else {
        if (intent) {
          approval.set(null);
          setPendingApproval(false);
          setReplayReady(false);
        }
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

  return (
    <section
      className={styles.page}
      dir={getLocaleDirection(locale)}
      aria-busy={loading || busy}
    >
      <Link href="/platform/data-management">{labels.back}</Link>
      <h1>{labels.deletionTitle}</h1>
      {loading && !row ? <p>{labels.loading}</p> : null}
      <button disabled={loading || busy} onClick={() => void refresh()}>
        {labels.refresh}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {errorMessage(error, labels)}
        </p>
      ) : null}
      {row && !blocked ? (
        <>
          <h2>{labels.statuses[row.status]}</h2>
          <DeletionFacts row={row} locale={locale} labels={labels} />
          {row.status === "COMPLETED" ? <p>{labels.completed}</p> : null}
          <div className={styles.actions}>
            {canReview(row.status) && !pendingApproval ? (
              <>
                {authority.allows("deletion.approve") ? (
                  <button
                    disabled={loading || busy}
                    onClick={() => void begin("approve")}
                  >
                    {labels.approve}
                  </button>
                ) : null}
                {authority.allows("deletion.postpone") ? (
                  <button
                    disabled={loading || busy}
                    onClick={() => void begin("postpone")}
                  >
                    {labels.postpone}
                  </button>
                ) : null}
                {authority.allows("deletion.cancel") ? (
                  <button
                    disabled={loading || busy}
                    onClick={() => void begin("cancel")}
                  >
                    {labels.cancel}
                  </button>
                ) : null}
              </>
            ) : null}
            {replayReady &&
            canReview(row.status) &&
            authority.allows("deletion.approve") ? (
              <button
                disabled={busy || loading}
                onClick={() => {
                  const intent = approval.get();
                  if (intent) void submit("approve", intent.body, true);
                }}
              >
                {labels.replay}
              </button>
            ) : null}
          </div>
          {pendingApproval ? <p>{labels.replayHelp}</p> : null}
        </>
      ) : null}
      {confirmation && !blocked ? (
        <DeletionConfirmation
          key={`${confirmation.action}:${confirmation.row.version}`}
          value={confirmation}
          locale={locale}
          labels={labels}
          onClose={close}
          onSubmit={(body) => void submit(confirmation.action, body)}
        />
      ) : null}
    </section>
  );
}

function DeletionConfirmation({
  value,
  locale,
  labels,
  onClose,
  onSubmit,
}: {
  value: Confirmation;
  locale: Locale;
  labels: DataManagementLabels;
  onClose: () => void;
  onSubmit: (body: ActionBody) => void;
}) {
  const [reason, setReason] = useState(""),
    [typed, setTyped] = useState(""),
    [reviewAfter, setReviewAfter] = useState(""),
    [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    const date = new Date(reviewAfter);
    if (
      !reason.trim() ||
      reason.trim().length > 500 ||
      (value.action === "approve" && typed !== value.row.workspaceId) ||
      (value.action === "postpone" &&
        (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()))
    ) {
      setInvalid(true);
      return;
    }
    onSubmit({
      expectedVersion: value.row.version,
      reason: reason.trim(),
      ...(value.action === "postpone"
        ? { reviewAfter: date.toISOString() }
        : {}),
    });
  }
  return (
    <Dialog title={labels[value.action]} onClose={onClose}>
      <p>
        {value.action === "approve"
          ? labels.approvalImpact
          : value.action === "postpone"
            ? labels.reviewHelp
            : labels.cancelImpact}
      </p>
      <p>{labels.statuses[value.row.status]}</p>
      <DeletionFacts row={value.row} locale={locale} labels={labels} compact />
      <form className={styles.form} onSubmit={submit} noValidate>
        <label>
          {labels.reason}
          <textarea
            required
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={invalid}
            aria-describedby={invalid ? "deletion-form-error" : undefined}
          />
        </label>
        {value.action === "approve" ? (
          <label>
            {labels.typeId}
            <input
              required
              dir="ltr"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "deletion-form-error" : undefined}
            />
          </label>
        ) : null}
        {value.action === "postpone" ? (
          <>
            <label>
              {labels.reviewAfter}
              <input
                required
                type="datetime-local"
                value={reviewAfter}
                onChange={(e) => setReviewAfter(e.target.value)}
                aria-invalid={invalid}
                aria-describedby="deletion-review-help deletion-form-error"
              />
            </label>
            <span id="deletion-review-help">{labels.reviewHelp}</span>
          </>
        ) : null}
        <p id="deletion-form-error" role={invalid ? "alert" : undefined}>
          {invalid ? labels.invalid : ""}
        </p>
        <div className={styles.actions}>
          <button autoFocus type="button" onClick={onClose}>
            {labels.close}
          </button>
          <button type="submit">{labels.confirm}</button>
        </div>
      </form>
    </Dialog>
  );
}
function DeletionFacts({
  row,
  labels,
  locale,
  compact = false,
}: {
  row: DeletionDto;
  labels: DataManagementLabels;
  locale: Locale;
  compact?: boolean;
}) {
  const f = labels.fields;
  const values: [string, string | number | undefined, boolean?][] = [
    [f.workspaceId, row.workspaceId],
    [f.eligibilityAt, row.eligibilityBasis.eligibilityAt, true],
    [f.reviewAfter, row.reviewAfter, true],
    [f.createdAt, row.createdAt, true],
    [f.updatedAt, row.updatedAt, true],
    [f.version, row.version],
  ];
  if (!compact)
    values.push(
      [f.subscriptionId, row.subscriptionId],
      [f.expiredAt, row.eligibilityBasis.expiredAt, true],
      ...(
        [
          "approvedAt",
          "cancelledAt",
          "completedAt",
          "liveDataDeletedAt",
          "backupExpiryAt",
        ] as const
      ).map(
        (k) => [f[k], row[k], true] as [string, string | undefined, boolean],
      ),
    );
  return <Facts locale={locale} values={values} />;
}
