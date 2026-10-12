"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Locale } from "@/i18n/locales";
import { getLocaleDirection } from "@/i18n/locales";
import { getMessages } from "@/i18n/messages";
import { createIdempotencyKey, isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import {
  formatInstantInTimeZone,
  parseIanaTimeZone,
  parseOffsetTimestamp,
} from "@/lib/date-time";
import { usePlatformAuthority } from "@/lib/platform-access";
import { platformUserKeys } from "@/lib/platform-users";
import type { PlatformUserDetail } from "@/lib/platform-users/contracts";
import {
  getManagementState,
  lifecycleActions,
  managementKey,
  mutateLifecycle,
  type LifecycleCommand,
  type ManagementState,
} from "@/lib/platform-users/lifecycle";
import { useProtectedAsyncEpoch } from "@/lib/platform-workspaces/use-protected-async-epoch";
import styles from "./platform-user-lifecycle.module.css";

type Labels = ReturnType<typeof getMessages>["platformUsers"]["lifecycle"];
type Intent = {
  target: string;
  command: LifecycleCommand;
  version: number;
  key: string;
};
const utc = parseIanaTimeZone("UTC");
function authorityExpired(validUntil: string) {
  return Date.parse(validUntil) <= Date.now();
}

export function PlatformUserLifecycle({
  userId,
  locale,
  labels,
}: {
  userId: string;
  locale: Locale;
  labels: Labels;
}) {
  const authority = usePlatformAuthority();
  const key = managementKey(authority, userId);
  if (
    !authority.allows("platform_users.manage") ||
    (authority.validUntil !== null && authorityExpired(authority.validUntil))
  )
    return null;
  return (
    <LifecycleCard
      key={JSON.stringify(key)}
      userId={userId}
      locale={locale}
      labels={labels}
    />
  );
}

function LifecycleCard({
  userId,
  locale,
  labels,
}: {
  userId: string;
  locale: Locale;
  labels: Labels;
}) {
  const authority = usePlatformAuthority();
  const { apiClient, markSessionExpired } = useAuthSession();
  const client = useQueryClient();
  const identity = JSON.stringify(managementKey(authority, userId));
  const key = useMemo(
    () => JSON.parse(identity) as readonly unknown[],
    [identity],
  );
  const epoch = useProtectedAsyncEpoch(JSON.stringify(key));
  const [denied, setDenied] = useState(false);
  const [dialog, setDialog] = useState<LifecycleCommand>();
  const [pending, setPending] = useState(false);
  const [intent, setIntent] = useState<Intent>();
  const [message, setMessage] = useState<{ error?: string; success?: string }>(
    {},
  );
  const busy = useRef(false);
  const generation = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const cardHeading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const self = authority.principalId === userId;
  const current = (captured: number | undefined, request: number) =>
    epoch.isCurrent(captured) &&
    generation.current === request &&
    (authority.validUntil === null ||
      Date.parse(authority.validUntil) > Date.now());
  const state = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getManagementState(apiClient, userId, signal),
    enabled: !denied && /^[0-9a-f]{24}$/.test(userId),
    retry: false,
  });
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey: key, exact: true });
      client.removeQueries({ queryKey: key, exact: true });
    },
    [client, key],
  );
  const retire = useCallback(() => {
    epoch.invalidate();
    generation.current++;
    setDenied(true);
    setDialog(undefined);
    setIntent(undefined);
    setPending(false);
    void client.cancelQueries({ queryKey: key, exact: true });
    client.removeQueries({ queryKey: key, exact: true });
    void authority.refresh();
  }, [authority, client, epoch, key]);
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (!state.error || handled.current === state.error) return;
    handled.current = state.error;
    if (isApiError(state.error) && state.error.status === 403) {
      // A domain denial retires only this management authority.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      retire();
    } else if (
      isApiError(state.error) &&
      state.error.category === "unauthenticated"
    )
      markSessionExpired(state.error);
  }, [state.error, retire, markSessionExpired]);
  const close = useCallback(() => {
    setDialog(undefined);
    queueMicrotask(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
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
      );
      const first = buttons[0],
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
  const currentReadAuthority = (query: { queryKey: readonly unknown[] }) => {
    const identity = query.queryKey[3] as
      | {
          principalId?: string;
          sessionGeneration?: number;
          membershipId?: string;
          accessVersion?: number;
          authorityValidUntil?: string | null;
        }
      | undefined;
    return (
      identity?.principalId === authority.principalId &&
      identity.sessionGeneration === authority.sessionGeneration &&
      identity.membershipId === authority.membershipId &&
      identity.accessVersion === authority.accessVersion &&
      identity.authorityValidUntil === authority.validUntil
    );
  };
  const readTarget = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[1] === "platform-users" &&
    currentReadAuthority(query) &&
    query.queryKey[2] === "detail" &&
    (query.queryKey[3] as { userId?: string })?.userId === userId;
  async function refresh() {
    await Promise.all([
      state.refetch(),
      client.invalidateQueries({
        queryKey: platformUserKeys.all,
        predicate: (query) =>
          (query.queryKey[2] === "directory" && currentReadAuthority(query)) ||
          readTarget(query),
      }),
    ]);
  }
  async function run(next: Intent) {
    if (busy.current || denied || self) return;
    const captured = epoch.capture(),
      request = ++generation.current;
    if (!current(captured, request)) return;
    busy.current = true;
    setPending(true);
    setMessage({});
    try {
      await client.cancelQueries({ queryKey: key, exact: true });
      const snapshot = await mutateLifecycle(
        apiClient,
        next.target,
        next.command,
        next.version,
        next.key,
      );
      if (!current(captured, request)) return;
      setIntent(undefined);
      close();
      await client.cancelQueries({ predicate: readTarget });
      if (!current(captured, request)) return;
      client.setQueryData(key, snapshot);
      // Reflect only authoritative lifecycle fields in the existing READ cache.
      client.setQueriesData<PlatformUserDetail>(
        { predicate: readTarget },
        (old) =>
          old
            ? {
                ...old,
                platformMembership: {
                  ...old.platformMembership,
                  status: snapshot.platformMembership.status,
                  suspendedAt:
                    snapshot.platformMembership.suspendedAt ?? undefined,
                  endedAt: snapshot.platformMembership.endedAt ?? undefined,
                },
              }
            : old,
      );
      await refresh();
      if (current(captured, request)) {
        setMessage({ success: labels.changed });
      }
    } catch (error) {
      if (!current(captured, request)) return;
      if (isApiError(error) && error.category === "unauthenticated") {
        markSessionExpired(error);
        return;
      }
      if (
        isApiError(error) &&
        error.status === 403 &&
        error.code !== "PLATFORM_MEMBERSHIP_SELF_MUTATION_FORBIDDEN"
      ) {
        retire();
        return;
      }
      const code = isApiError(error) ? error.code : undefined;
      const errors: Record<string, string> = {
        PLATFORM_MEMBERSHIP_VERSION_CONFLICT: labels.errors.conflict,
        PLATFORM_MEMBERSHIP_TRANSITION_INVALID: labels.errors.transition,
        PLATFORM_MEMBERSHIP_TARGET_ACCOUNT_INACTIVE: labels.errors.inactive,
        PLATFORM_LAST_MANAGEMENT_AUTHORITY_REQUIRED: labels.errors.lockout,
        PLATFORM_AUTHORITY_EVALUATION_LIMIT_EXCEEDED: labels.errors.evaluation,
        PLATFORM_MEMBERSHIP_SELF_MUTATION_FORBIDDEN: labels.errors.self,
        IDEMPOTENCY_KEY_REUSED: labels.errors.keyReused,
        IDEMPOTENCY_REQUEST_IN_PROGRESS: labels.errors.processing,
      };
      const uncertain =
        !isApiError(error) ||
        error.kind === "network" ||
        error.kind === "abort" ||
        error.kind === "malformed-response" ||
        (error.status !== undefined && error.status >= 500) ||
        code === "IDEMPOTENCY_REQUEST_IN_PROGRESS";
      setIntent(uncertain ? next : undefined);
      close();
      if (!uncertain) {
        // Retire the stale snapshot without replaying the command against a new revision.
        await client.cancelQueries({ queryKey: key, exact: true });
        client.removeQueries({ queryKey: key, exact: true });
        await refresh();
      }
      if (current(captured, request))
        setMessage({
          error: (code && errors[code]) || labels.errors.unavailable,
        });
    } finally {
      if (current(captured, request)) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  if (denied || (isApiError(state.error) && state.error.status === 403))
    return null;
  const snapshot: ManagementState | undefined = state.isError
    ? undefined
    : state.data;
  return (
    <section
      className={styles.card}
      dir={getLocaleDirection(locale)}
      aria-labelledby="user-lifecycle-title"
      aria-busy={pending || state.isPending || undefined}
    >
      <div inert={dialog ? true : undefined}>
        <h2 id="user-lifecycle-title" ref={cardHeading} tabIndex={-1}>
          {labels.title}
        </h2>
        {snapshot ? (
          <>
            <dl>
              <dt>{labels.status}</dt>
              <dd>{labels.statuses[snapshot.platformMembership.status]}</dd>
              {(["suspendedAt", "endedAt"] as const).map((field) =>
                snapshot.platformMembership[field] === null ? null : (
                  <div key={field}>
                    <dt>{labels[field]}</dt>
                    <dd>
                      <time dateTime={snapshot.platformMembership[field]}>
                        {formatInstantInTimeZone(
                          parseOffsetTimestamp(
                            snapshot.platformMembership[field],
                          ),
                          locale,
                          utc,
                        )}
                      </time>
                    </dd>
                  </div>
                ),
              )}
            </dl>
            {self ? (
              <p>{labels.errors.self}</p>
            ) : (
              <div className={styles.actions}>
                {lifecycleActions(snapshot.platformMembership.status).map(
                  (command) => (
                    <button
                      key={command}
                      disabled={pending || !!intent}
                      type="button"
                      onClick={(event) => {
                        trigger.current = event.currentTarget;
                        setDialog(command);
                      }}
                    >
                      {labels.actions[command]}
                    </button>
                  ),
                )}
              </div>
            )}
          </>
        ) : (
          <p role={state.isPending ? "status" : "alert"}>
            {state.isPending ? labels.loading : labels.errors.unavailable}
          </p>
        )}
        {message.error ? <p role="alert">{message.error}</p> : null}
        {message.success ? <p role="status">{message.success}</p> : null}
        {intent ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void run(intent)}
          >
            {labels.retry}
          </button>
        ) : !snapshot &&
          !state.isPending &&
          !(isApiError(state.error) && state.error.status === 404) ? (
          <button type="button" onClick={() => void state.refetch()}>
            {labels.retry}
          </button>
        ) : null}
      </div>
      {dialog && snapshot ? (
        <div className={styles.backdrop} role="presentation">
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-lifecycle-dialog-title"
            aria-describedby="user-lifecycle-consequence"
            aria-busy={pending || undefined}
            ref={panel}
          >
            <h3 id="user-lifecycle-dialog-title" tabIndex={-1} ref={heading}>
              {labels.confirmations[dialog].title}
            </h3>
            <p id="user-lifecycle-consequence">
              {labels.confirmations[dialog].copy}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (busy.current) return;
                  void run({
                    target: userId,
                    command: dialog,
                    version: snapshot.platformMembership.version,
                    key: createIdempotencyKey(),
                  });
                }}
              >
                {labels.actions[dialog]}
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
