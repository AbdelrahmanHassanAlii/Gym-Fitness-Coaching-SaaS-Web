"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Locale } from "@/i18n/locales";
import { getLocaleDirection } from "@/i18n/locales";
import { getProfileAssignmentMessages } from "@/i18n/profile-assignment";
import { createIdempotencyKey, isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import { usePlatformAuthority } from "@/lib/platform-access";
import {
  platformUserAuthorityIdentity,
  platformUserKeys,
} from "@/lib/platform-users/query-keys";
import type { PlatformUserDetail } from "@/lib/platform-users/contracts";
import { useProtectedAsyncEpoch } from "@/lib/platform-workspaces/use-protected-async-epoch";
import {
  assignmentPath,
  canonicalProfileIds,
  getAssignment,
  getSelector,
  profileAssignmentKey,
  replaceAssignment,
  sameTargetManagement,
  selectorPagesValid,
  type AssignmentIntent,
  type AssignmentState,
} from "@/lib/platform-users/profile-assignment";
import styles from "./platform-user-lifecycle.module.css";
import listStyles from "./platform-profile-assignment.module.css";

type Props = {
  userId: string;
  targetName: string;
  locale: Locale;
  accountActive?: boolean;
  externalBusy?: boolean;
  onBusyChange?: (busy: boolean) => void;
};
function authorityExpired(deadline: string) {
  return Date.parse(deadline) <= Date.now();
}
export function PlatformProfileAssignment(props: Props) {
  const authority = usePlatformAuthority();
  if (
    !authority.allows("platform_users.read") ||
    !authority.allows("platform_permissions.manage") ||
    (authority.validUntil !== null && authorityExpired(authority.validUntil))
  )
    return null;
  return (
    <AssignmentCard
      key={JSON.stringify(profileAssignmentKey(authority, props.userId))}
      {...props}
    />
  );
}
function AssignmentCard({
  userId,
  targetName,
  locale,
  accountActive = true,
  externalBusy = false,
  onBusyChange,
}: Props) {
  const labels = getProfileAssignmentMessages(locale);
  const authority = usePlatformAuthority();
  const { apiClient, markSessionExpired } = useAuthSession();
  const client = useQueryClient();
  const identity = JSON.stringify(profileAssignmentKey(authority, userId));
  const key = useMemo(
    () => profileAssignmentKey(authority, userId),
    // The serialized key contains every authority/target identity dimension.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity],
  );
  const selectorKey = useMemo(
    () => profileAssignmentKey(authority, userId, true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity],
  );
  const epoch = useProtectedAsyncEpoch(identity);
  const [denied, setDenied] = useState(false),
    [selfBlocked, setSelfBlocked] = useState(false);
  const [editing, setEditing] = useState(false),
    [dialog, setDialog] = useState(false);
  const [draft, setDraft] = useState<string[]>([]),
    [draftVersion, setDraftVersion] = useState(0);
  const [pending, setPending] = useState(false),
    [intent, setIntent] = useState<AssignmentIntent>();
  const [message, setMessage] = useState<{ error?: string; success?: string }>(
    {},
  );
  const busy = useRef(false),
    generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null),
    cardHeading = useRef<HTMLHeadingElement>(null),
    panel = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement | null>(null);
  const self = authority.principalId === userId || selfBlocked;
  const current = (captured: number | undefined, request: number) =>
    epoch.isCurrent(captured) &&
    generation.current === request &&
    (authority.validUntil === null ||
      Date.parse(authority.validUntil) > Date.now());
  const state = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getAssignment(apiClient, userId, signal),
    enabled: !denied,
    retry: false,
  });
  const selector = useInfiniteQuery({
    queryKey: selectorKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      getSelector(apiClient, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled:
      editing &&
      !denied &&
      !self &&
      state.data?.platformMembership.status === "ACTIVE" &&
      !intent,
    retry: false,
  });
  const validPages = selectorPagesValid(selector.data?.pages ?? []);
  const options = [
    ...new Map(
      [
        ...(state.data?.permissionProfiles
          .filter((p) => p.status === "ACTIVE")
          .map((p) => ({ id: p.id, name: p.name! })) ?? []),
        ...(selector.data?.pages.flatMap((p) => p.permissionProfiles) ?? []),
      ].map((p) => [p.id, p]),
    ).values(),
  ].sort(
    (a, b) => a.name.localeCompare(b.name, locale) || a.id.localeCompare(b.id),
  );
  type Recovery = "NONE" | "MEMBERSHIP" | "ACCOUNT";
  const [recoveryBlock, setRecoveryBlock] = useState<Recovery>("NONE");
  const recovery = useRef<Recovery>("NONE");
  const readIdentity = JSON.stringify(
    platformUserKeys.detail({
      ...platformUserAuthorityIdentity(authority),
      userId,
    }),
  );
  useEffect(() => {
    const captured = epoch.capture();
    return client.getQueryCache().subscribe((event) => {
      // Only a successful GET is recovery evidence. Lifecycle cache patches are not.
      if (
        event.type !== "updated" ||
        event.action.type !== "success" ||
        event.action.manual ||
        !epoch.isCurrent(captured) ||
        (authority.validUntil !== null &&
          authorityExpired(authority.validUntil))
      )
        return;
      const queryIdentity = JSON.stringify(event.query.queryKey);
      const membershipRecovered =
        recovery.current === "MEMBERSHIP" &&
        queryIdentity === identity &&
        client.getQueryData<AssignmentState>(event.query.queryKey)
          ?.platformMembership.status === "ACTIVE";
      const accountRecovered =
        recovery.current === "ACCOUNT" &&
        queryIdentity === readIdentity &&
        client.getQueryData<PlatformUserDetail>(event.query.queryKey)
          ?.status === "ACTIVE";
      if (membershipRecovered || accountRecovered) {
        recovery.current = "NONE";
        setRecoveryBlock("NONE");
        setMessage({});
      }
    });
  }, [client, epoch, identity, readIdentity, authority.validUntil]);
  const inactive =
    !accountActive ||
    recoveryBlock !== "NONE" ||
    state.data?.platformMembership.status !== "ACTIVE";
  const retire = useCallback(() => {
    epoch.invalidate();
    generation.current++;
    busy.current = false;
    setDenied(true);
    setDialog(false);
    setEditing(false);
    setDraft([]);
    setIntent(undefined);
    setPending(false);
    for (const queryKey of [key, selectorKey]) {
      void client.cancelQueries({ queryKey, exact: true });
      client.removeQueries({ queryKey, exact: true });
    }
    void authority.refresh();
  }, [authority, client, epoch, key, selectorKey]);
  const handled = useRef<unknown[]>([]);
  useEffect(() => {
    for (const error of [state.error, selector.error]) {
      if (!error || handled.current.includes(error)) continue;
      handled.current.push(error);
      if (isApiError(error) && error.status === 403) {
        // A management denial retires this capability, preserving the READ page.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        retire();
      } else if (isApiError(error) && error.category === "unauthenticated")
        markSessionExpired(error);
    }
  }, [state.error, selector.error, retire, markSessionExpired]);
  useEffect(() => {
    onBusyChange?.(pending || !!intent);
    return () => onBusyChange?.(false);
  }, [pending, intent, onBusyChange]);
  useEffect(
    () => () => {
      for (const queryKey of [key, selectorKey]) {
        void client.cancelQueries({ queryKey, exact: true });
        client.removeQueries({ queryKey, exact: true });
      }
    },
    [client, key, selectorKey],
  );
  useEffect(() => {
    if (
      editing &&
      !intent &&
      state.data &&
      (state.data.platformMembership.version !== draftVersion || inactive)
    ) {
      // A changed authoritative snapshot invalidates the draft instead of rebasing it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
      setDialog(false);
      setDraft([]);
      setMessage({ error: labels.conflict });
    }
  }, [state.data, draftVersion, editing, intent, inactive, labels.conflict]);
  const close = useCallback(() => {
    setDialog(false);
    queueMicrotask(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
      else cardHeading.current?.focus();
    });
  }, []);
  useEffect(() => {
    if (message.success && !trigger.current?.isConnected)
      cardHeading.current?.focus();
  }, [message.success]);
  useEffect(() => {
    if (!dialog) return;
    queueMicrotask(() => heading.current?.focus());
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy.current) {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
          panel.current?.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled])",
          ) ?? [],
        ),
        first = buttons[0],
        last = buttons.at(-1);
      if (!first) {
        event.preventDefault();
        heading.current?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === heading.current ||
          !panel.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [dialog, close]);
  async function refreshStates(refreshAccount = false) {
    // Cancel even an initial peer-card GET so an old response cannot satisfy refresh.
    await client.cancelQueries({
      queryKey: ["hassan-web", "platform-user-lifecycle"],
      predicate: (q) => sameTargetManagement(q, authority, userId),
    });
    await Promise.all([
      client.invalidateQueries({ queryKey: key, exact: true }),
      client.invalidateQueries({
        queryKey: ["hassan-web", "platform-user-lifecycle"],
        predicate: (q) => sameTargetManagement(q, authority, userId),
      }),
      ...(refreshAccount
        ? [
            client.refetchQueries({
              queryKey: platformUserKeys.detail({
                ...platformUserAuthorityIdentity(authority),
                userId,
              }),
              exact: true,
            }),
          ]
        : []),
    ]);
  }
  async function run(next: AssignmentIntent) {
    if (busy.current || denied || self || externalBusy) return;
    const captured = epoch.capture(),
      request = ++generation.current;
    if (!current(captured, request)) return;
    busy.current = true;
    setPending(true);
    setIntent(next);
    setMessage({});
    try {
      await client.cancelQueries({ queryKey: key, exact: true });
      if (!current(captured, request)) return;
      const snapshot = await replaceAssignment(apiClient, next);
      if (!current(captured, request)) return;
      client.setQueryData(key, snapshot);
      setIntent(undefined);
      setEditing(false);
      setDraft([]);
      close();
      await refreshStates();
      if (current(captured, request)) setMessage({ success: labels.changed });
    } catch (error) {
      if (!current(captured, request)) return;
      if (isApiError(error) && error.category === "unauthenticated") {
        markSessionExpired(error);
        return;
      }
      const code = isApiError(error) ? error.code : undefined;
      if (
        isApiError(error) &&
        error.status === 403 &&
        ![
          "DELEGATION_DENIED",
          "PLATFORM_PERMISSION_SELF_MUTATION_FORBIDDEN",
          "PLATFORM_LAST_MANAGEMENT_AUTHORITY_REQUIRED",
          "PLATFORM_AUTHORITY_EVALUATION_LIMIT_EXCEEDED",
        ].includes(code ?? "")
      ) {
        retire();
        return;
      }
      const uncertain =
        !isApiError(error) ||
        [
          "network",
          "abort",
          "malformed-response",
          "non-json-response",
        ].includes(error.kind) ||
        (error.status !== undefined && error.status >= 500) ||
        code === "IDEMPOTENCY_REQUEST_IN_PROGRESS";
      close();
      setEditing(false);
      if (uncertain) {
        setIntent(next);
        setMessage({ error: labels.uncertain });
      } else {
        setIntent(undefined);
        setDraft([]);
        if (code === "PLATFORM_PERMISSION_SELF_MUTATION_FORBIDDEN")
          setSelfBlocked(true);
        const recoveryKind: Recovery =
          code === "PLATFORM_PERMISSION_TARGET_MEMBERSHIP_INACTIVE"
            ? "MEMBERSHIP"
            : code === "PLATFORM_MEMBERSHIP_TARGET_ACCOUNT_INACTIVE"
              ? "ACCOUNT"
              : "NONE";
        if (recoveryKind !== "NONE") {
          // Retire earlier GETs before accepting fresh recovery evidence.
          await client.cancelQueries({ queryKey: key, exact: true });
          if (recoveryKind === "ACCOUNT")
            await client.cancelQueries({
              queryKey: platformUserKeys.detail({
                ...platformUserAuthorityIdentity(authority),
                userId,
              }),
              exact: true,
            });
          if (!current(captured, request)) return;
          recovery.current = recoveryKind;
          setRecoveryBlock(recoveryKind);
        }
        const errors: Record<string, string> = {
          PLATFORM_MEMBERSHIP_VERSION_CONFLICT: labels.conflict,
          PLATFORM_PERMISSION_TARGET_MEMBERSHIP_INACTIVE: labels.inactive,
          PLATFORM_MEMBERSHIP_TARGET_ACCOUNT_INACTIVE: labels.inactive,
          PLATFORM_PERMISSION_SELF_MUTATION_FORBIDDEN: labels.self,
          DELEGATION_DENIED: labels.delegation,
          PLATFORM_LAST_MANAGEMENT_AUTHORITY_REQUIRED: labels.lockout,
          PLATFORM_AUTHORITY_EVALUATION_LIMIT_EXCEEDED: labels.evaluation,
          IDEMPOTENCY_KEY_REUSED: labels.keyReused,
          VALIDATION_FAILED: labels.validation,
          PERMISSION_PROFILE_DUPLICATE: labels.validation,
          PERMISSION_PROFILE_NOT_FOUND: labels.validation,
        };
        await refreshStates(recoveryKind === "ACCOUNT");
        if (current(captured, request))
          setMessage(
            recoveryKind !== "NONE" && recovery.current === "NONE"
              ? {}
              : { error: (code && errors[code]) || labels.failed },
          );
      }
    } finally {
      if (current(captured, request)) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  if (denied || (isApiError(state.error) && state.error.status === 403))
    return null;
  const snapshot = state.isError ? undefined : state.data;
  const previous = canonicalProfileIds(
    snapshot?.permissionProfiles.map((p) => p.id) ?? [],
  );
  const chosen = canonicalProfileIds(draft);
  const changed = JSON.stringify(previous) !== JSON.stringify(chosen);
  const added = chosen.filter((id) => !previous.includes(id)),
    removed = previous.filter((id) => !chosen.includes(id));
  const name = (id: string) =>
    options.find((p) => p.id === id)?.name ??
    snapshot?.permissionProfiles.find((p) => p.id === id)?.name ??
    labels.unavailableName;
  const ready =
    snapshot &&
    !state.isFetching &&
    !self &&
    !inactive &&
    !pending &&
    !intent &&
    !externalBusy;
  const canSave =
    ready &&
    editing &&
    changed &&
    chosen.length <= 20 &&
    !selector.isPending &&
    !selector.isError &&
    validPages &&
    draftVersion === snapshot.platformMembership.version;
  return (
    <section
      className={styles.card}
      dir={getLocaleDirection(locale)}
      aria-labelledby="profile-assignment-title"
      aria-busy={pending || state.isPending || undefined}
    >
      <div inert={dialog ? true : undefined}>
        <h2 id="profile-assignment-title" ref={cardHeading} tabIndex={-1}>
          {labels.title}
        </h2>
        {snapshot ? (
          <>
            {snapshot.permissionProfiles.length ? (
              <ul className={listStyles.list}>
                {snapshot.permissionProfiles.map((p, index) => (
                  <li key={`${p.id}-${index}`}>
                    <span>{p.name ?? labels.unavailableName}</span>
                    <span className={listStyles.badge}>
                      {labels.statuses[p.status]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{labels.empty}</p>
            )}
            {self ? (
              <p>{labels.self}</p>
            ) : inactive ? (
              <p>{labels.inactive}</p>
            ) : !editing ? (
              <button
                type="button"
                disabled={!ready}
                onClick={() => {
                  setDraft(
                    canonicalProfileIds(
                      snapshot.permissionProfiles
                        .filter((p) => p.status === "ACTIVE")
                        .map((p) => p.id),
                    ),
                  );
                  setDraftVersion(snapshot.platformMembership.version);
                  setMessage({});
                  setEditing(true);
                }}
              >
                {labels.edit}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <p role={state.isPending ? "status" : "alert"}>
              {state.isPending
                ? labels.loading
                : isApiError(state.error) && state.error.status === 404
                  ? labels.notFound
                  : labels.failed}
            </p>
            {!state.isPending &&
            !(isApiError(state.error) && state.error.status === 404) ? (
              <button type="button" onClick={() => void state.refetch()}>
                {labels.retry}
              </button>
            ) : null}
          </>
        )}
        {editing ? (
          <>
            {snapshot?.permissionProfiles.some((p) => p.status !== "ACTIVE") ? (
              <p>{labels.willRemove}</p>
            ) : null}
            <p
              id="profile-assignment-limit"
              role={draft.length >= 20 ? "status" : undefined}
            >
              {labels.limit}
            </p>
            {selector.isPending ? (
              <p role="status">{labels.selectorLoading}</p>
            ) : selector.isError || !validPages ? (
              <>
                <p role="alert">{labels.failed}</p>
                <button
                  type="button"
                  onClick={() =>
                    void client.resetQueries({
                      queryKey: selectorKey,
                      exact: true,
                    })
                  }
                >
                  {labels.retry}
                </button>
              </>
            ) : (
              <fieldset
                className={listStyles.selector}
                disabled={pending || !!intent || externalBusy}
                aria-describedby="profile-assignment-limit"
              >
                <legend>{labels.select}</legend>
                {options.map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      checked={draft.includes(p.id)}
                      disabled={!draft.includes(p.id) && draft.length >= 20}
                      onChange={(event) =>
                        setDraft((ids) =>
                          event.target.checked
                            ? canonicalProfileIds([...ids, p.id])
                            : ids.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <span>{p.name}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {selector.hasNextPage && validPages && !selector.isError ? (
              <button
                type="button"
                disabled={
                  selector.isFetchingNextPage ||
                  pending ||
                  !!intent ||
                  externalBusy
                }
                onClick={() => void selector.fetchNextPage()}
              >
                {selector.isFetchingNextPage
                  ? labels.selectorLoading
                  : labels.more}
              </button>
            ) : null}
            <div className={styles.actions}>
              <button
                type="button"
                disabled={!canSave}
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setDialog(true);
                }}
              >
                {labels.save}
              </button>
              <button
                type="button"
                disabled={pending || !!intent}
                onClick={() => {
                  setEditing(false);
                  setDraft([]);
                }}
              >
                {labels.cancel}
              </button>
            </div>
          </>
        ) : null}
        {message.error ? <p role="alert">{message.error}</p> : null}
        {message.success ? <p role="status">{message.success}</p> : null}
        {intent ? (
          <button
            type="button"
            disabled={pending || externalBusy}
            onClick={() => void run(intent)}
          >
            {labels.retryIntent}
          </button>
        ) : null}
      </div>
      {dialog && snapshot ? (
        <div className={styles.backdrop} role="presentation">
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-assignment-dialog-title"
            aria-describedby="profile-assignment-consequence"
            aria-busy={pending || undefined}
            ref={panel}
          >
            <h3
              id="profile-assignment-dialog-title"
              tabIndex={-1}
              ref={heading}
            >
              {labels.confirm}
            </h3>
            <p id="profile-assignment-consequence">
              {labels.confirmCopy} {targetName}.
            </p>
            {!chosen.length ? <p>{labels.removeAll}</p> : null}
            <h4>{labels.added}</h4>
            <ul>
              {added.length ? (
                added.map((id) => <li key={id}>{name(id)}</li>)
              ) : (
                <li>{labels.none}</li>
              )}
            </ul>
            <h4>{labels.removed}</h4>
            <ul>
              {removed.length ? (
                removed.map((id) => <li key={id}>{name(id)}</li>)
              ) : (
                <li>{labels.none}</li>
              )}
            </ul>
            <div className={styles.actions}>
              <button
                type="button"
                disabled={!canSave || pending}
                onClick={() => {
                  if (!canSave || busy.current) return;
                  const body = Object.freeze({
                    expectedVersion: draftVersion,
                    profileIds: Object.freeze(chosen),
                  });
                  void run(
                    Object.freeze({
                      target: userId,
                      path: assignmentPath(userId),
                      body,
                      key: createIdempotencyKey(),
                    }),
                  );
                }}
              >
                {labels.save}
              </button>
              <button type="button" disabled={pending} onClick={close}>
                {labels.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
