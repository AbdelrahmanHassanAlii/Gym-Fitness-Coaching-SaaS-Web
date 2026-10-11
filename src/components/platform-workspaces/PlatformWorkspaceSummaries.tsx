"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BillingPeriod,
  PlatformFoundationPermission,
  SubscriptionLifecycleStatus,
  WorkspaceId,
} from "@/contracts";
import type { Locale } from "@/i18n/locales";
import { isApiError, type ApiClient } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import {
  formatInstantInTimeZone,
  parseIanaTimeZone,
  parseOffsetTimestamp,
} from "@/lib/date-time";
import { usePlatformAuthority } from "@/lib/platform-access";
import { platformWorkspaceDirectoryKeys } from "@/lib/platform-workspaces";
import { useProtectedAsyncEpoch } from "@/lib/platform-workspaces/use-protected-async-epoch";
import {
  getPlatformSubscriptionSummary,
  getPlatformWorkspaceCounts,
  type SubscriptionSummary,
} from "@/lib/platform-workspaces/summaries";
import styles from "./platform-workspace-summaries.module.css";

export interface PlatformWorkspaceSummaryLabels {
  dateTimeZone: string;
  subscription: string;
  summary: string;
  loading: string;
  restricted: string;
  retry: string;
  noSubscription: string;
  noCurrentPlan: string;
  subscriptionUnavailable: string;
  countsUnavailable: string;
  currentPlan: string;
  subscriptionStatus: string;
  billingPeriod: string;
  termStarts: string;
  termEnds: string;
  startedAt: string;
  expiresAt: string;
  graceEndsAt: string;
  frozenAt: string;
  expiredAt: string;
  cancelledAt: string;
  activeBranches: string;
  activeTrainees: string;
  needsReassignment: string;
  activeStaff: string;
  liveCounts: string;
  statuses: Record<SubscriptionLifecycleStatus, string>;
  billingPeriods: Record<BillingPeriod, string>;
}
type Props = {
  labels: PlatformWorkspaceSummaryLabels;
  locale: Locale;
  workspaceId: string;
  onNotFound: () => void;
};

export function PlatformWorkspaceSummaries(props: Props) {
  return (
    <div className={styles.cards}>
      <SubscriptionCard {...props} />
      <CountsCard {...props} />
    </div>
  );
}
function useSummary<T>(
  workspaceId: string,
  permission: PlatformFoundationPermission,
  kind: "subscription-summary" | "counts",
  read: (
    client: ApiClient,
    id: WorkspaceId,
    signal?: AbortSignal,
  ) => Promise<T>,
  onNotFound: () => void,
) {
  const authority = usePlatformAuthority();
  const { apiClient, markSessionExpired } = useAuthSession();
  const queryClient = useQueryClient();
  const allowed = authority.allows(permission);
  const queryKey = useMemo(
    () =>
      platformWorkspaceDirectoryKeys.summary(
        {
          workspaceId: workspaceId as WorkspaceId,
          principalId: authority.principalId,
          sessionGeneration: authority.sessionGeneration,
          membershipId: authority.membershipId,
          accessVersion: authority.accessVersion,
          authorityValidUntil: authority.validUntil,
        },
        kind,
        permission,
        allowed,
      ),
    [
      workspaceId,
      authority.principalId,
      authority.sessionGeneration,
      authority.membershipId,
      authority.accessVersion,
      authority.validUntil,
      kind,
      permission,
      allowed,
    ],
  );
  const token = JSON.stringify(queryKey);
  const epoch = useProtectedAsyncEpoch(token);
  const [deniedToken, setDeniedToken] = useState<string | null>(null);
  const denied = deniedToken === token;
  const query = useQuery({
    queryKey,
    retry: false,
    enabled: allowed && !denied,
    queryFn: async ({ signal }) => {
      const started = epoch.capture();
      const result = await read(apiClient, workspaceId as WorkspaceId, signal);
      if (!epoch.isCurrent(started) || signal.aborted)
        throw new Error("Retired Platform summary request");
      return result;
    },
  });
  useEffect(
    () => () => {
      void queryClient.cancelQueries({ exact: true, queryKey });
      queryClient.removeQueries({ exact: true, queryKey });
    },
    [queryClient, queryKey],
  );
  useEffect(() => {
    const error = query.error;
    if (!isApiError(error)) return;
    if (error.category === "unauthenticated") {
      markSessionExpired(error);
      return;
    }
    if (error.kind !== "backend") return;
    if (error.status === 404 && error.code === "WORKSPACE_NOT_FOUND") {
      onNotFound();
      return;
    }
    if (error.status === 403 && !denied) {
      // Retire this identity before refreshing the central Platform authority.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeniedToken(token);
      epoch.invalidate();
      void queryClient.cancelQueries({ exact: true, queryKey });
      queryClient.removeQueries({ exact: true, queryKey });
      void authority.refresh();
    }
  }, [
    authority,
    denied,
    epoch,
    markSessionExpired,
    onNotFound,
    query.error,
    queryClient,
    queryKey,
    token,
  ]);
  return { query, restricted: !allowed || denied };
}
function SubscriptionCard({ labels, locale, workspaceId, onNotFound }: Props) {
  const state = useSummary(
    workspaceId,
    "subscriptions.read",
    "subscription-summary",
    getPlatformSubscriptionSummary,
    onNotFound,
  );
  return (
    <Card title={labels.subscription}>
      <ReadState
        state={state}
        labels={labels}
        unavailable={labels.subscriptionUnavailable}
      >
        {state.query.data ? (
          <SubscriptionContent
            labels={labels}
            locale={locale}
            subscription={state.query.data.subscription}
          />
        ) : null}
      </ReadState>
    </Card>
  );
}
function CountsCard({ labels, locale, workspaceId, onNotFound }: Props) {
  const state = useSummary(
    workspaceId,
    "platform_workspaces.manage",
    "counts",
    getPlatformWorkspaceCounts,
    onNotFound,
  );
  const counts = state.query.data?.counts;
  return (
    <Card title={labels.summary}>
      <ReadState
        state={state}
        labels={labels}
        unavailable={labels.countsUnavailable}
      >
        {counts ? (
          <>
            <p className={styles.note}>{labels.liveCounts}</p>
            <dl className={styles.metrics}>
              <Fact label={labels.activeBranches}>
                {counts.branches.active.toLocaleString(locale)}
              </Fact>
              <Fact label={labels.activeTrainees}>
                {counts.trainees.active.toLocaleString(locale)}
              </Fact>
              <Fact label={labels.needsReassignment}>
                {counts.trainees.needsReassignment.toLocaleString(locale)}
              </Fact>
              <Fact label={labels.activeStaff}>
                {counts.staff.activeIncludingOwners.toLocaleString(locale)}
              </Fact>
            </dl>
          </>
        ) : null}
      </ReadState>
    </Card>
  );
}
function ReadState({
  state,
  labels,
  unavailable,
  children,
}: {
  state: {
    restricted: boolean;
    query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  };
  labels: PlatformWorkspaceSummaryLabels;
  unavailable: string;
  children: ReactNode;
}) {
  if (state.restricted) return <p role="status">{labels.restricted}</p>;
  if (state.query.isPending)
    return (
      <p aria-busy="true" role="status">
        {labels.loading}
      </p>
    );
  if (state.query.isError)
    return (
      <div role="alert">
        <p>{unavailable}</p>
        <button type="button" onClick={() => void state.query.refetch()}>
          {labels.retry}
        </button>
      </div>
    );
  return children;
}
function SubscriptionContent({
  subscription,
  labels,
  locale,
}: {
  subscription: SubscriptionSummary["subscription"];
  labels: PlatformWorkspaceSummaryLabels;
  locale: Locale;
}) {
  if (subscription === null)
    return <p role="status">{labels.noSubscription}</p>;
  const terms = subscription.currentTerms;
  const dateKeys = [
    "startedAt",
    "expiresAt",
    "graceEndsAt",
    "frozenAt",
    "expiredAt",
    "cancelledAt",
  ] as const;
  return (
    <>
      {terms || dateKeys.some((key) => subscription[key] !== null) ? (
        <p className={styles.note}>{labels.dateTimeZone}</p>
      ) : null}
      <p className={styles.badge}>
        <span>{labels.subscriptionStatus}: </span>
        {labels.statuses[subscription.lifecycleStatus]}
      </p>
      {terms ? (
        <dl className={styles.facts}>
          <Fact label={labels.currentPlan}>{terms.planName}</Fact>
          <Fact label={labels.billingPeriod}>
            {labels.billingPeriods[terms.billingPeriod]}
          </Fact>
          <DateFact
            label={labels.termStarts}
            value={terms.effectiveFrom}
            locale={locale}
          />
          {terms.effectiveTo === null ? null : (
            <DateFact
              label={labels.termEnds}
              value={terms.effectiveTo}
              locale={locale}
            />
          )}
        </dl>
      ) : (
        <p>{labels.noCurrentPlan}</p>
      )}
      {dateKeys.some((key) => subscription[key] !== null) ? (
        <dl className={styles.facts}>
          {dateKeys.map((key) =>
            subscription[key] === null ? null : (
              <DateFact
                key={key}
                label={labels[key]}
                value={subscription[key]}
                locale={locale}
              />
            ),
          )}
        </dl>
      ) : null}
    </>
  );
}
function DateFact({
  label,
  value,
  locale,
}: {
  label: string;
  value: string;
  locale: Locale;
}) {
  return (
    <Fact label={label}>
      <time dir="auto" dateTime={value}>
        {formatInstantInTimeZone(
          parseOffsetTimestamp(value),
          locale,
          parseIanaTimeZone("UTC"),
        )}
      </time>
    </Fact>
  );
}
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={styles.card}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
