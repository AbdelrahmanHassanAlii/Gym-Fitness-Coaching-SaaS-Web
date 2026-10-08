"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  GymDashboardDto,
  PermissionKey,
  ProgressAnalyticsDto,
  TrainerDashboardDto,
} from "@/contracts";
import { evaluateAccess, isCurrentAccessIdentity } from "@/lib/access";
import { isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import {
  analyticsKeys,
  appendCurrentPage,
  createPaginationGuard,
  getAdherenceAnalytics,
  getGymDashboard,
  getNutritionAnalytics,
  getProgressAnalytics,
  getRelationshipDashboard,
  getTrainerDashboard,
  getTrainingAnalytics,
  isCurrentPaginationRequest,
  listAnalyticsMetrics,
  listAnalyticsRelationships,
  localDateRangeWithinLimit,
} from "@/lib/analytics";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import { GymDashboardPanel } from "./GymDashboardPanel";
import { TrainerDashboardPanel } from "./TrainerDashboardPanel";
import { RelationshipDashboardPanel } from "./RelationshipDashboardPanel";
import { RelationshipAnalyticsPanel } from "./RelationshipAnalyticsPanels";
import styles from "./analytics.module.css";

export const analyticsDataPermissions = [
  "dashboard.gym.read",
  "dashboard.trainer.read",
  "dashboard.relationship.read",
  "analytics.training.read",
  "analytics.progress.read",
  "analytics.nutrition.read",
  "analytics.adherence.read",
] as const satisfies readonly PermissionKey[];

export const analyticsRouteAPermissions = [
  "adherence.read",
  "analytics.adherence.read",
  "analytics.nutrition.read",
  "analytics.progress.read",
  "analytics.training.read",
  "billing.subscription.read",
  "dashboard.gym.read",
  "dashboard.relationship.read",
  "dashboard.trainer.read",
  "documents.read",
  "foods.read",
  "metric_definitions.read",
  "nutrition.plans.read",
  "programs.read",
  "staff.read",
  "trainees.read",
  "workspace.read",
] as const satisfies readonly PermissionKey[];

export type AnalyticsLabels = Record<string, string>;

export function AnalyticsExperience({
  labels,
  locale,
}: {
  labels: AnalyticsLabels;
  locale: "ar" | "en";
}) {
  const { generation, state } = useAuthSession();
  const { shellContext, workspace } = useStaffWorkspaceContext();
  const principalId = state.status === "authenticated" ? state.user.id : null;
  return (
    <AnalyticsContent
      key={JSON.stringify([
        principalId,
        generation,
        workspace?.workspaceId,
        workspace?.membershipId,
        shellContext?.accessContext,
        shellContext?.branch.branchId,
        workspace?.accessVersion,
      ])}
      labels={labels}
      locale={locale}
    />
  );
}

function AnalyticsContent({
  labels,
  locale,
}: {
  labels: AnalyticsLabels;
  locale: "ar" | "en";
}) {
  const { apiClient, generation, state } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  const [relationshipId, setRelationshipId] = useState("");
  const [metricId, setMetricId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  const [progressGranularity, setProgressGranularity] = useState<
    "none" | "day" | "week" | "month"
  >("none");
  const [gymOverride, setGymOverride] = useState<{
    key: string;
    data: GymDashboardDto;
  } | null>(null);
  const [trainerOverride, setTrainerOverride] = useState<{
    key: string;
    data: TrainerDashboardDto;
  } | null>(null);
  const [progressOverride, setProgressOverride] = useState<{
    key: string;
    data: ProgressAnalyticsDto;
  } | null>(null);
  const [metricsOverride, setMetricsOverride] = useState<{
    key: string;
    data: Awaited<ReturnType<typeof listAnalyticsMetrics>>;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const paginationGeneration = useRef(0);
  const pendingPages = useRef(new Set<string>());
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const principalId = state.status === "authenticated" ? state.user.id : null;
  const currentIdentity = Boolean(
    principalId &&
    workspace &&
    shellContext &&
    accessFacts?.status === "ready" &&
    shellContext.accessContext === "user" &&
    isCurrentAccessIdentity(accessFacts, {
      accessContext: "user",
      membershipId: workspace.membershipId,
      sessionGeneration: generation,
      workspaceId: workspace.workspaceId,
    }),
  );
  const allowed = (permission: PermissionKey) =>
    Boolean(
      currentIdentity &&
      evaluateAccess(accessFacts, {
        accessContext: "user",
        context: "WORKSPACE",
        membershipId: workspace!.membershipId,
        permission,
        scope: "workspace",
        sessionGeneration: generation,
        workspaceId: workspace!.workspaceId,
      }).allowed,
    );
  const decisionPermissions = [
    ...analyticsDataPermissions,
    "trainees.read",
    "metric_definitions.read",
  ] as const satisfies readonly PermissionKey[];
  const decisions = Object.fromEntries(
    decisionPermissions.map((permission) => [permission, allowed(permission)]),
  ) as Record<PermissionKey, boolean>;
  const hasDataPermission = analyticsDataPermissions.some(
    (permission) => decisions[permission],
  );
  const identity = currentIdentity
    ? {
        accessContext: "user" as const,
        accessVersion: workspace!.accessVersion ?? null,
        membershipId: workspace!.membershipId,
        normalizedRouteA: analyticsRouteAPermissions,
        principalId: principalId!,
        sessionGeneration: generation,
        workspaceId: workspace!.workspaceId,
      }
    : null;
  const identityToken = identity ? JSON.stringify(identity) : "unresolved";
  const identityRef = useRef(identityToken);
  useEffect(() => {
    identityRef.current = identityToken;
    paginationGeneration.current += 1;
  }, [
    identityToken,
    relationshipId,
    metricId,
    from,
    to,
    granularity,
    progressGranularity,
  ]);
  const commonRange = useMemo(
    () => ({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      granularity,
    }),
    [from, to, granularity],
  );
  const rangeValid = !from || !to || localDateRangeWithinLimit(from, to);
  const branchId = shellContext?.branch.branchId ?? null;

  const relationshipsQuery = useQuery({
    enabled: Boolean(
      identity && hasDataPermission && decisions["trainees.read"],
    ),
    queryFn: ({ signal }) =>
      listAnalyticsRelationships(apiClient, identity!.workspaceId, signal),
    queryKey: identity
      ? analyticsKeys.relationships(identity)
      : ["analytics", "relationships", "disabled"],
    retry: false,
  });
  const metricsQuery = useQuery({
    enabled: Boolean(
      identity &&
      hasDataPermission &&
      decisions["analytics.progress.read"] &&
      decisions["metric_definitions.read"],
    ),
    queryFn: ({ signal }) =>
      listAnalyticsMetrics(
        apiClient,
        identity!.workspaceId,
        { limit: 100 },
        signal,
      ),
    queryKey: identity
      ? analyticsKeys.metrics({ ...identity, limit: 100 })
      : ["analytics", "metrics", "disabled"],
    retry: false,
  });
  const metrics =
    metricsOverride?.key === identityToken
      ? metricsOverride.data
      : (metricsQuery.data ?? null);
  const validRelationship =
    relationshipsQuery.data?.some((item) => item.id === relationshipId) ??
    false;
  const validMetric =
    metrics?.data.some(
      (item) => item.id === metricId && item.status === "ACTIVE",
    ) ?? false;

  const gymQuery = useQuery({
    enabled: Boolean(
      identity && hasDataPermission && decisions["dashboard.gym.read"],
    ),
    queryFn: ({ signal }) =>
      getGymDashboard(
        apiClient,
        identity!.workspaceId,
        branchId ? { branchId } : {},
        signal,
      ),
    queryKey: identity
      ? analyticsKeys.gym({ ...identity, ...(branchId ? { branchId } : {}) })
      : ["analytics", "gym", "disabled"],
    retry: false,
  });
  const gym =
    gymOverride?.key === identityToken
      ? gymOverride.data
      : (gymQuery.data ?? null);
  const trainerQuery = useQuery({
    enabled: Boolean(
      identity && hasDataPermission && decisions["dashboard.trainer.read"],
    ),
    queryFn: ({ signal }) =>
      getTrainerDashboard(apiClient, identity!.workspaceId, {}, signal),
    queryKey: identity
      ? analyticsKeys.trainer(identity)
      : ["analytics", "trainer", "disabled"],
    retry: false,
  });
  const trainer =
    trainerOverride?.key === identityToken
      ? trainerOverride.data
      : (trainerQuery.data ?? null);
  const relationshipDashboardQuery = useQuery({
    enabled: Boolean(
      identity && validRelationship && decisions["dashboard.relationship.read"],
    ),
    queryFn: ({ signal }) =>
      getRelationshipDashboard(
        apiClient,
        identity!.workspaceId,
        relationshipId,
        signal,
      ),
    queryKey: identity
      ? analyticsKeys.relationshipDashboard({ ...identity, relationshipId })
      : ["analytics", "relationship", "disabled"],
    retry: false,
  });
  const trainingQuery = useQuery({
    enabled: Boolean(
      identity &&
      rangeValid &&
      validRelationship &&
      decisions["analytics.training.read"],
    ),
    queryFn: ({ signal }) =>
      getTrainingAnalytics(
        apiClient,
        identity!.workspaceId,
        relationshipId,
        commonRange,
        signal,
      ),
    queryKey: identity
      ? analyticsKeys.training({ ...identity, relationshipId, ...commonRange })
      : ["analytics", "training", "disabled"],
    retry: false,
  });
  const nutritionQuery = useQuery({
    enabled: Boolean(
      identity &&
      rangeValid &&
      validRelationship &&
      decisions["analytics.nutrition.read"],
    ),
    queryFn: ({ signal }) =>
      getNutritionAnalytics(
        apiClient,
        identity!.workspaceId,
        relationshipId,
        commonRange,
        signal,
      ),
    queryKey: identity
      ? analyticsKeys.nutrition({ ...identity, relationshipId, ...commonRange })
      : ["analytics", "nutrition", "disabled"],
    retry: false,
  });
  const adherenceQuery = useQuery({
    enabled: Boolean(
      identity &&
      rangeValid &&
      validRelationship &&
      decisions["analytics.adherence.read"],
    ),
    queryFn: ({ signal }) =>
      getAdherenceAnalytics(
        apiClient,
        identity!.workspaceId,
        relationshipId,
        commonRange,
        signal,
      ),
    queryKey: identity
      ? analyticsKeys.adherence({ ...identity, relationshipId, ...commonRange })
      : ["analytics", "adherence", "disabled"],
    retry: false,
  });
  const progressRange = useMemo(
    () => ({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      granularity: progressGranularity,
      metricDefinitionId: metricId,
      limit: 100,
    }),
    [from, to, progressGranularity, metricId],
  );
  const progressQuery = useQuery({
    enabled: Boolean(
      identity &&
      rangeValid &&
      validRelationship &&
      validMetric &&
      decisions["analytics.progress.read"] &&
      decisions["metric_definitions.read"],
    ),
    queryFn: ({ signal }) =>
      getProgressAnalytics(
        apiClient,
        identity!.workspaceId,
        relationshipId,
        progressRange,
        signal,
      ),
    queryKey: identity
      ? analyticsKeys.progress({
          ...identity,
          relationshipId,
          ...progressRange,
        })
      : ["analytics", "progress", "disabled"],
    retry: false,
  });
  const progressKey = JSON.stringify([
    identityToken,
    relationshipId,
    progressRange,
  ]);
  const progress =
    progressOverride?.key === progressKey
      ? progressOverride.data
      : (progressQuery.data ?? null);

  useEffect(() => {
    const errors = [
      relationshipDashboardQuery.error,
      trainingQuery.error,
      progressQuery.error,
      nutritionQuery.error,
      adherenceQuery.error,
    ];
    if (
      !errors.some(isStaleRelationship) &&
      !(progressQuery.error && isNotFound(progressQuery.error))
    )
      return;
    const timer = window.setTimeout(() => {
      if (errors.some(isStaleRelationship)) {
        setRelationshipId("");
        void relationshipsQuery.refetch();
      }
      if (progressQuery.error && isNotFound(progressQuery.error)) {
        setMetricId("");
        void metricsQuery.refetch();
      }
      setMessage(labels.stale);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    relationshipDashboardQuery.error,
    trainingQuery.error,
    progressQuery.error,
    nutritionQuery.error,
    adherenceQuery.error,
    labels.stale,
    metricsQuery,
    relationshipsQuery,
  ]);

  async function loadGym(
    kind: "branch" | "attention" | "activity",
    category: string | null,
    cursor: string,
  ) {
    if (
      !identity ||
      !gym ||
      (kind === "branch" && branchId) ||
      (kind === "activity" &&
        (!gym.scope.pureWorkspaceWide || !gym.recentActivity))
    )
      return;
    const pendingKey = `gym|${kind}|${category ?? ""}|${cursor}`;
    if (pendingPages.current.has(pendingKey)) return;
    pendingPages.current.add(pendingKey);
    const captured = createPaginationGuard({
      category,
      cursor,
      generation: paginationGeneration.current,
      identity: identityToken,
    });
    const query =
      kind === "branch"
        ? { branchCursor: cursor, branchLimit: 25 }
        : kind === "attention"
          ? {
              attentionCategory: category as never,
              attentionCursor: cursor,
              attentionLimit: 20,
            }
          : {
              activityCategory: category as never,
              activityCursor: cursor,
              activityLimit: 20,
            };
    try {
      const page = await getGymDashboard(
        apiClient,
        identity.workspaceId,
        query,
      );
      if (
        !mounted.current ||
        !isCurrentPaginationRequest(
          captured,
          createPaginationGuard({
            category,
            cursor,
            generation: paginationGeneration.current,
            identity: identityRef.current,
          }),
        )
      )
        return;
      setGymOverride({
        key: identityToken,
        data: mergeGymPage(gym, page, kind, category),
      });
    } catch (error) {
      if (
        !mounted.current ||
        !isCurrentPaginationRequest(
          captured,
          createPaginationGuard({
            category,
            cursor,
            generation: paginationGeneration.current,
            identity: identityRef.current,
          }),
        )
      )
        return;
      if (isCursorError(error)) await resetGymPage(kind, category);
      else if (kind === "activity" && isRecentActivityDenied(error)) {
        setGymOverride({
          key: identityToken,
          data: { ...gym, recentActivity: null },
        });
        setMessage(labels.recentUnavailable);
      } else setMessage(errorText(error, labels));
    } finally {
      pendingPages.current.delete(pendingKey);
    }
  }
  async function loadTrainerAttention(category: string, cursor: string) {
    if (!identity || !trainer) return;
    const pendingKey = `trainer|${category}|${cursor}`;
    if (pendingPages.current.has(pendingKey)) return;
    pendingPages.current.add(pendingKey);
    const captured = createPaginationGuard({
      category,
      cursor,
      generation: paginationGeneration.current,
      identity: identityToken,
    });
    try {
      const page = await getTrainerDashboard(apiClient, identity.workspaceId, {
        attentionCategory: category as never,
        attentionCursor: cursor,
        attentionLimit: 20,
      });
      if (
        !mounted.current ||
        !isCurrentPaginationRequest(
          captured,
          createPaginationGuard({
            category,
            cursor,
            generation: paginationGeneration.current,
            identity: identityRef.current,
          }),
        )
      )
        return;
      const incoming =
        page.needsAttention[category as keyof typeof page.needsAttention];
      const current =
        trainer.needsAttention[category as keyof typeof trainer.needsAttention];
      if (incoming && current)
        setTrainerOverride({
          key: identityToken,
          data: {
            ...trainer,
            needsAttention: {
              ...trainer.needsAttention,
              [category]: {
                ...incoming,
                items: appendCurrentPage(
                  current.items,
                  incoming.items,
                  (item) => `${item.relationshipId}|${item.checkInId ?? ""}`,
                ),
              },
            },
          },
        });
    } catch (error) {
      if (
        !mounted.current ||
        !isCurrentPaginationRequest(
          captured,
          createPaginationGuard({
            category,
            cursor,
            generation: paginationGeneration.current,
            identity: identityRef.current,
          }),
        )
      )
        return;
      if (isCursorError(error)) {
        try {
          const reset = await getTrainerDashboard(
            apiClient,
            identity.workspaceId,
            {
              attentionCategory: category as never,
              attentionLimit: 20,
            },
          );
          const replacement =
            reset.needsAttention[category as keyof typeof reset.needsAttention];
          if (
            mounted.current &&
            identityRef.current === identityToken &&
            replacement
          )
            setTrainerOverride({
              key: identityToken,
              data: {
                ...trainer,
                needsAttention: {
                  ...trainer.needsAttention,
                  [category]: replacement,
                },
              },
            });
          setMessage(labels.cursorReset);
        } catch {
          setMessage(labels.unavailable);
        }
      } else setMessage(errorText(error, labels));
    } finally {
      pendingPages.current.delete(pendingKey);
    }
  }
  async function resetGymPage(
    kind: "branch" | "attention" | "activity",
    category: string | null,
  ) {
    if (!identity) return;
    const resetGeneration = paginationGeneration.current;
    const resetIdentity = identityToken;
    const query =
      kind === "branch"
        ? { branchLimit: 25 }
        : kind === "attention"
          ? { attentionCategory: category as never, attentionLimit: 20 }
          : { activityCategory: category as never, activityLimit: 20 };
    try {
      const page = await getGymDashboard(
        apiClient,
        identity.workspaceId,
        query,
      );
      if (
        mounted.current &&
        gym &&
        resetGeneration === paginationGeneration.current &&
        resetIdentity === identityRef.current
      ) {
        setGymOverride({
          key: identityToken,
          data: replaceGymPage(gym, page, kind, category),
        });
        setMessage(labels.cursorReset);
      }
    } catch {
      setMessage(labels.unavailable);
    }
  }
  async function loadMoreProgress() {
    if (
      !identity ||
      !progress?.page.nextCursor ||
      !validRelationship ||
      !validMetric
    )
      return;
    const cursor = progress.page.nextCursor;
    const pendingKey = `progress|${cursor}`;
    if (pendingPages.current.has(pendingKey)) return;
    pendingPages.current.add(pendingKey);
    const captured = createPaginationGuard({
      cursor,
      generation: paginationGeneration.current,
      identity: identityToken,
    });
    try {
      const next = await getProgressAnalytics(
        apiClient,
        identity.workspaceId,
        relationshipId,
        { ...progressRange, cursor },
      );
      if (
        !mounted.current ||
        !isCurrentPaginationRequest(
          captured,
          createPaginationGuard({
            cursor,
            generation: paginationGeneration.current,
            identity: identityRef.current,
          }),
        )
      )
        return;
      setProgressOverride({
        key: progressKey,
        data: {
          ...next,
          points: appendCurrentPage(
            progress.points,
            next.points,
            (point) => point.id,
          ),
        },
      });
    } catch (error) {
      if (
        !mounted.current ||
        !isCurrentPaginationRequest(
          captured,
          createPaginationGuard({
            cursor,
            generation: paginationGeneration.current,
            identity: identityRef.current,
          }),
        )
      )
        return;
      if (isCursorError(error)) {
        setProgressOverride(null);
        void progressQuery.refetch();
        setMessage(labels.cursorReset);
      } else setMessage(errorText(error, labels));
    } finally {
      pendingPages.current.delete(pendingKey);
    }
  }
  async function loadMoreMetrics() {
    if (!identity || !metrics?.nextCursor) return;
    const cursor = metrics.nextCursor;
    const pendingKey = `metrics|${cursor}`;
    if (pendingPages.current.has(pendingKey)) return;
    pendingPages.current.add(pendingKey);
    try {
      const next = await listAnalyticsMetrics(apiClient, identity.workspaceId, {
        cursor,
        limit: 100,
      });
      if (identityRef.current !== identityToken) return;
      setMetricsOverride({
        key: identityToken,
        data: {
          data: appendCurrentPage(
            metrics.data,
            next.data,
            (metric) => metric.id,
          ),
          nextCursor: next.nextCursor,
        },
      });
    } catch (error) {
      if (identityRef.current !== identityToken) return;
      if (isCursorError(error)) {
        setMetricsOverride(null);
        void metricsQuery.refetch();
        setMessage(labels.cursorReset);
      } else setMessage(errorText(error, labels));
    } finally {
      pendingPages.current.delete(pendingKey);
    }
  }

  if (shellContext?.accessContext === "support")
    return <State message={labels.support} />;
  if (!currentIdentity) return <State message={labels.loading} busy />;
  if (!hasDataPermission) return <State message={labels.denied} />;
  const anyError = [
    gymQuery.error,
    trainerQuery.error,
    relationshipsQuery.error,
    metricsQuery.error,
  ].find(Boolean);

  return (
    <section
      className={styles.experience}
      aria-labelledby="analytics-title"
      lang={locale}
    >
      <header className={styles.header}>
        <div>
          <h1 id="analytics-title">{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (decisions["dashboard.gym.read"]) void gymQuery.refetch();
            if (decisions["dashboard.trainer.read"])
              void trainerQuery.refetch();
            if (decisions["trainees.read"]) void relationshipsQuery.refetch();
            if (
              decisions["analytics.progress.read"] &&
              decisions["metric_definitions.read"]
            )
              void metricsQuery.refetch();
            if (validRelationship) {
              if (decisions["dashboard.relationship.read"])
                void relationshipDashboardQuery.refetch();
              if (rangeValid && decisions["analytics.training.read"])
                void trainingQuery.refetch();
              if (rangeValid && decisions["analytics.nutrition.read"])
                void nutritionQuery.refetch();
              if (rangeValid && decisions["analytics.adherence.read"])
                void adherenceQuery.refetch();
              if (
                rangeValid &&
                validMetric &&
                decisions["analytics.progress.read"] &&
                decisions["metric_definitions.read"]
              )
                void progressQuery.refetch();
            }
          }}
        >
          {labels.refresh}
        </button>
      </header>
      {message ? <p role="status">{message}</p> : null}
      {!rangeValid ? <p role="alert">{labels.invalidRange}</p> : null}
      {anyError ? <p role="alert">{errorText(anyError, labels)}</p> : null}
      <div className={styles.filters}>
        <label>
          {labels.relationship}
          <select
            value={relationshipId}
            disabled={!decisions["trainees.read"]}
            onChange={(event) => {
              setRelationshipId(event.target.value);
              setMetricId("");
            }}
          >
            <option value="">—</option>
            {relationshipsQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} · {item.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          {labels.metric}
          <select
            value={metricId}
            disabled={
              !decisions["metric_definitions.read"] ||
              !decisions["analytics.progress.read"]
            }
            onChange={(event) => setMetricId(event.target.value)}
          >
            <option value="">—</option>
            {metrics?.data.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {metrics?.nextCursor ? (
          <button type="button" onClick={() => void loadMoreMetrics()}>
            {labels.loadMore}
          </button>
        ) : null}
        <label>
          {labels.from}
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          {labels.to}
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label>
          {labels.granularity}
          <select
            value={granularity}
            onChange={(event) =>
              setGranularity(event.target.value as "day" | "week")
            }
          >
            <option value="day">{labels.day}</option>
            <option value="week">{labels.week}</option>
          </select>
        </label>
        <label>
          {labels.progress} · {labels.granularity}
          <select
            value={progressGranularity}
            onChange={(event) =>
              setProgressGranularity(event.target.value as never)
            }
          >
            <option value="none">{labels.none}</option>
            <option value="day">{labels.day}</option>
            <option value="week">{labels.week}</option>
            <option value="month">{labels.month}</option>
          </select>
        </label>
      </div>
      <p>{labels.exclusiveEnd}</p>
      <div className={styles.grid}>
        {gym ? (
          <GymDashboardPanel
            data={gym}
            labels={labels}
            onLoadBranches={(cursor) => void loadGym("branch", null, cursor)}
            onLoadAttention={(category, cursor) =>
              void loadGym("attention", category, cursor)
            }
            onLoadActivity={(category, cursor) =>
              void loadGym("activity", category, cursor)
            }
          />
        ) : null}
        {trainer ? (
          <TrainerDashboardPanel
            data={trainer}
            labels={labels}
            onLoadAttention={(category, cursor) =>
              void loadTrainerAttention(category, cursor)
            }
          />
        ) : null}
        {validRelationship && relationshipDashboardQuery.data ? (
          <RelationshipDashboardPanel
            data={relationshipDashboardQuery.data}
            labels={labels}
          />
        ) : null}
        {validRelationship && trainingQuery.data ? (
          <RelationshipAnalyticsPanel
            title={labels.training}
            data={trainingQuery.data}
            labels={labels}
          />
        ) : null}
        {validRelationship && progress ? (
          <section>
            <RelationshipAnalyticsPanel
              title={labels.progress}
              data={progress}
              labels={labels}
            />
            {progress.page.hasMore && progress.page.nextCursor ? (
              <button type="button" onClick={() => void loadMoreProgress()}>
                {labels.loadMore}
              </button>
            ) : null}
          </section>
        ) : null}
        {validRelationship && nutritionQuery.data ? (
          <RelationshipAnalyticsPanel
            title={labels.nutrition}
            data={nutritionQuery.data}
            labels={labels}
          />
        ) : null}
        {validRelationship && adherenceQuery.data ? (
          <RelationshipAnalyticsPanel
            title={labels.adherence}
            data={adherenceQuery.data}
            labels={labels}
          />
        ) : null}
      </div>
      {validRelationship &&
      decisions["analytics.progress.read"] &&
      !decisions["metric_definitions.read"] ? (
        <p>{labels.selectorDenied}</p>
      ) : null}
    </section>
  );
}

function State({ message, busy = false }: { message: string; busy?: boolean }) {
  return (
    <section aria-busy={busy || undefined} aria-live="polite">
      <h1>{message}</h1>
    </section>
  );
}
function isCursorError(error: unknown) {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    [
      "CURSOR_INVALID",
      "ATTENTION_CURSOR_INVALID",
      "ACTIVITY_CURSOR_INVALID",
      "PROGRESS_CURSOR_INVALID",
      "BRANCH_CURSOR_NOT_ALLOWED",
    ].includes(error.code ?? "")
  );
}
function isRecentActivityDenied(error: unknown) {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.code === "RECENT_ACTIVITY_NOT_ALLOWED"
  );
}
function isNotFound(error: unknown) {
  return isApiError(error) && error.kind === "backend" && error.status === 404;
}
function isStaleRelationship(error: unknown) {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    (error.code === "RELATIONSHIP_NOT_ACCESSIBLE" ||
      error.code === "RELATIONSHIP_NOT_FOUND")
  );
}
function errorText(error: unknown, labels: AnalyticsLabels) {
  if (!isApiError(error)) return labels.unavailable;
  if (error.kind === "malformed-response") return labels.malformed;
  if (error.kind === "abort") return "";
  if (error.code === "WORKSPACE_INACTIVE") return labels.workspaceInactive;
  if (
    [
      "FROM_TIMEZONE_REQUIRED",
      "TO_TIMEZONE_REQUIRED",
      "FROM_INVALID",
      "TO_INVALID",
      "DATE_RANGE_INVALID",
      "DATE_RANGE_TOO_LARGE",
      "WORKSPACE_TIMEZONE_INVALID",
      "GRANULARITY_INVALID",
    ].includes(error.code ?? "")
  )
    return labels.invalidRange;
  if (error.status === 403) return labels.deniedSection;
  return labels.unavailable;
}
function mergeGymPage(
  current: GymDashboardDto,
  page: GymDashboardDto,
  kind: "branch" | "attention" | "activity",
  category: string | null,
): GymDashboardDto {
  if (kind === "branch")
    return {
      ...current,
      branchBreakdown: {
        ...page.branchBreakdown,
        items: appendCurrentPage(
          current.branchBreakdown.items,
          page.branchBreakdown.items,
          (item) => item.branchId,
        ),
      },
    };
  if (kind === "attention" && category)
    return {
      ...current,
      needsAttention: {
        ...current.needsAttention,
        [category]: {
          ...page.needsAttention[category as keyof typeof page.needsAttention]!,
          items: appendCurrentPage(
            current.needsAttention[
              category as keyof typeof current.needsAttention
            ]?.items ?? [],
            page.needsAttention[category as keyof typeof page.needsAttention]
              ?.items ?? [],
            (item) => `${item.relationshipId}|${item.checkInId ?? ""}`,
          ),
        },
      },
    };
  if (
    kind === "activity" &&
    category &&
    current.recentActivity &&
    page.recentActivity
  )
    return {
      ...current,
      recentActivity: {
        ...current.recentActivity,
        [category]: {
          ...page.recentActivity[category as keyof typeof page.recentActivity]!,
          items: appendCurrentPage(
            current.recentActivity[
              category as keyof typeof current.recentActivity
            ]?.items ?? [],
            page.recentActivity[category as keyof typeof page.recentActivity]
              ?.items ?? [],
            (item) =>
              `${item.relationshipId}|${item.occurredAt}|${item.summary}`,
          ),
        },
      },
    };
  return current;
}
function replaceGymPage(
  current: GymDashboardDto,
  page: GymDashboardDto,
  kind: "branch" | "attention" | "activity",
  category: string | null,
): GymDashboardDto {
  if (kind === "branch")
    return { ...current, branchBreakdown: page.branchBreakdown };
  if (kind === "attention" && category)
    return {
      ...current,
      needsAttention: {
        ...current.needsAttention,
        [category]:
          page.needsAttention[category as keyof typeof page.needsAttention],
      },
    };
  if (
    kind === "activity" &&
    category &&
    current.recentActivity &&
    page.recentActivity
  )
    return {
      ...current,
      recentActivity: {
        ...current.recentActivity,
        [category]:
          page.recentActivity[category as keyof typeof page.recentActivity],
      },
    };
  return current;
}
