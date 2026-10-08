import type {
  ActivityCategory,
  AnalyticsQueryDto,
  AttentionCategory,
  CoachingRelationshipDto,
  MetricDefinitionDto,
  ProgressAnalyticsQueryDto,
} from "@/contracts";
import {
  isAdherenceAnalyticsDto,
  isGymDashboardDto,
  isNutritionAnalyticsDto,
  isCoachingRelationshipDto,
  isMetricDefinitionDto,
  isProgressAnalyticsDto,
  isRelationshipDashboardDto,
  isTrainerDashboardDto,
  isTrainingAnalyticsDto,
} from "@/contracts";
import { ApiError, serializeQueryParams, type ApiClient } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";

export interface AnalyticsAccessIdentity {
  accessContext: AuthorizationCacheContext;
  accessVersion: number | null;
  membershipId: string;
  normalizedRouteA: readonly string[];
  principalId: string;
  sessionGeneration: number;
  workspaceId: string;
}
export type DashboardQuery = {
  branchId?: string;
  branchCursor?: string;
  branchLimit?: number;
  attentionCategory?: AttentionCategory;
  attentionCursor?: string;
  attentionLimit?: number;
  activityCategory?: ActivityCategory;
  activityCursor?: string;
  activityLimit?: number;
};
export type TrainerDashboardQuery = Pick<
  DashboardQuery,
  "attentionCategory" | "attentionCursor" | "attentionLimit"
>;
export interface AnalyticsPage<T> {
  data: T[];
  nextCursor: string | null;
}

export const analyticsKeys = {
  gym: (identity: AnalyticsAccessIdentity & DashboardQuery) =>
    detail(identity, "analytics-gym", filters(identity)),
  trainer: (identity: AnalyticsAccessIdentity & TrainerDashboardQuery) =>
    detail(identity, "analytics-trainer", filters(identity)),
  relationshipDashboard: (
    identity: AnalyticsAccessIdentity & { relationshipId: string },
  ) => detail(identity, "analytics-relationship-dashboard", filters(identity)),
  training: (
    identity: AnalyticsAccessIdentity &
      AnalyticsQueryDto & { relationshipId: string },
  ) => detail(identity, "analytics-training", filters(identity)),
  progress: (
    identity: AnalyticsAccessIdentity &
      ProgressAnalyticsQueryDto & { relationshipId: string },
  ) => detail(identity, "analytics-progress", filters(identity)),
  nutrition: (
    identity: AnalyticsAccessIdentity &
      AnalyticsQueryDto & { relationshipId: string },
  ) => detail(identity, "analytics-nutrition", filters(identity)),
  adherence: (
    identity: AnalyticsAccessIdentity &
      AnalyticsQueryDto & { relationshipId: string },
  ) => detail(identity, "analytics-adherence", filters(identity)),
  relationships: (identity: AnalyticsAccessIdentity & { status?: string }) =>
    detail(identity, "analytics-relationships", filters(identity)),
  metrics: (
    identity: AnalyticsAccessIdentity & { cursor?: string; limit: number },
  ) => detail(identity, "analytics-metrics", filters(identity)),
};

export async function getGymDashboard(
  api: ApiClient,
  workspaceId: string,
  query: DashboardQuery,
  signal?: AbortSignal,
) {
  return get(
    api,
    `/workspaces/${workspaceId}/dashboard/gym`,
    query,
    isGymDashboardDto,
    "gym dashboard",
    signal,
  );
}
export async function getTrainerDashboard(
  api: ApiClient,
  workspaceId: string,
  query: TrainerDashboardQuery,
  signal?: AbortSignal,
) {
  return get(
    api,
    `/workspaces/${workspaceId}/dashboard/trainer`,
    query,
    isTrainerDashboardDto,
    "trainer dashboard",
    signal,
  );
}
export async function getRelationshipDashboard(
  api: ApiClient,
  workspaceId: string,
  relationshipId: string,
  signal?: AbortSignal,
) {
  return get(
    api,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/dashboard`,
    {},
    isRelationshipDashboardDto,
    "relationship dashboard",
    signal,
  );
}
export async function getTrainingAnalytics(
  api: ApiClient,
  workspaceId: string,
  relationshipId: string,
  query: AnalyticsQueryDto,
  signal?: AbortSignal,
) {
  return get(
    api,
    relationshipPath(workspaceId, relationshipId, "training"),
    query,
    isTrainingAnalyticsDto,
    "training analytics",
    signal,
  );
}
export async function getProgressAnalytics(
  api: ApiClient,
  workspaceId: string,
  relationshipId: string,
  query: ProgressAnalyticsQueryDto,
  signal?: AbortSignal,
) {
  return get(
    api,
    relationshipPath(workspaceId, relationshipId, "progress"),
    query,
    isProgressAnalyticsDto,
    "progress analytics",
    signal,
  );
}
export async function getNutritionAnalytics(
  api: ApiClient,
  workspaceId: string,
  relationshipId: string,
  query: AnalyticsQueryDto,
  signal?: AbortSignal,
) {
  return get(
    api,
    relationshipPath(workspaceId, relationshipId, "nutrition"),
    query,
    isNutritionAnalyticsDto,
    "nutrition analytics",
    signal,
  );
}
export async function getAdherenceAnalytics(
  api: ApiClient,
  workspaceId: string,
  relationshipId: string,
  query: AnalyticsQueryDto,
  signal?: AbortSignal,
) {
  return get(
    api,
    relationshipPath(workspaceId, relationshipId, "adherence"),
    query,
    isAdherenceAnalyticsDto,
    "adherence analytics",
    signal,
  );
}
export async function listAnalyticsRelationships(
  api: ApiClient,
  workspaceId: string,
  signal?: AbortSignal,
): Promise<CoachingRelationshipDto[]> {
  const envelope = await api.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships`,
    signal,
  });
  if (
    !Array.isArray(envelope.data) ||
    !envelope.data.every(isCoachingRelationshipDto)
  )
    throw new ApiError({
      kind: "malformed-response",
      message: "Malformed analytics relationships response.",
    });
  return envelope.data.filter(
    (item) => item.status === "ACTIVE" || item.status === "NEEDS_REASSIGNMENT",
  );
}
export async function listAnalyticsMetrics(
  api: ApiClient,
  workspaceId: string,
  query: { cursor?: string; limit: number },
  signal?: AbortSignal,
): Promise<AnalyticsPage<MetricDefinitionDto>> {
  const queryString = serializeQueryParams(query);
  const page = await api.request<{ data: unknown; nextCursor?: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/metric-definitions?${queryString}`,
    signal,
  });
  if (
    !Array.isArray(page.data) ||
    !page.data.every(isMetricDefinitionDto) ||
    (page.nextCursor !== undefined && typeof page.nextCursor !== "string")
  )
    throw new ApiError({
      kind: "malformed-response",
      message: "Malformed analytics metrics response.",
    });
  return {
    data: page.data.filter((item) => item.status === "ACTIVE"),
    nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null,
  };
}
function relationshipPath(
  workspaceId: string,
  relationshipId: string,
  resource: string,
) {
  return `/workspaces/${workspaceId}/relationships/${relationshipId}/analytics/${resource}`;
}
async function get<T>(
  api: ApiClient,
  path: string,
  query: object,
  guard: (value: unknown) => value is T,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  const queryString = serializeQueryParams(query as never);
  const envelope = await api.request<{ data: unknown }>({
    method: "GET",
    path: `${path}${queryString ? `?${queryString}` : ""}`,
    signal,
  });
  if (!guard(envelope.data))
    throw new ApiError({
      kind: "malformed-response",
      message: `Malformed ${label} response.`,
    });
  return envelope.data;
}
function detail(
  identity: AnalyticsAccessIdentity,
  resource: string,
  value: Record<string, unknown>,
) {
  return appQueryKeys.workspaceDetail(
    identity.workspaceId,
    resource,
    {
      accessVersion: identity.accessVersion,
      membershipId: identity.membershipId,
      normalizedRouteA: [...identity.normalizedRouteA].sort(),
      principalId: identity.principalId,
      sessionGeneration: identity.sessionGeneration,
      ...value,
    } as never,
    identity.accessContext,
  );
}
function filters(value: object): Record<string, unknown> {
  const omitted = new Set([
    "accessContext",
    "accessVersion",
    "membershipId",
    "normalizedRouteA",
    "principalId",
    "sessionGeneration",
    "workspaceId",
  ]);
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) => !omitted.has(key) && item !== undefined,
    ),
  );
}
