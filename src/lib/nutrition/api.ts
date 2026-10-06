import type {
  ApiDataEnvelope,
  CreateNutritionPlanDto,
  CreateNutritionPlanRevisionDto,
  ExpectedVersionDto,
  FoodId,
  NutritionAnalyticsDto,
  NutritionAnalyticsGranularity,
  NutritionFoodBodyDto,
  NutritionFoodCommandResponseDto,
  NutritionFoodDto,
  NutritionFoodPatchDto,
  NutritionPlanCommandResponseDto,
  NutritionPlanDetailDto,
  NutritionPlanDto,
  NutritionPlanId,
  NutritionPlanRevisionCommandResponseDto,
  RelationshipId,
  WorkspaceId,
} from "@/contracts";
import {
  isDailyTrackingEnvelopeDto,
  isNutritionAnalyticsDto,
  isNutritionFoodCommandResponseDto,
  isNutritionFoodDto,
  isNutritionPlanCommandResponseDto,
  isNutritionPlanDetailDto,
  isNutritionPlanDto,
  isNutritionPlanRevisionCommandResponseDto,
} from "@/contracts";
import type { ApiClient } from "@/lib/api";
import { ApiError, serializeQueryParams } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";
import type { MembershipId } from "@/contracts/common/ids";

export const nutritionPageLimit = 25;

export const nutritionKeys = {
  analytics: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    range: NutritionAnalyticsRange,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "nutrition-analytics",
      {
        from: range.from ?? null,
        generation,
        granularity: range.granularity ?? null,
        membershipId,
        relationshipId,
        to: range.to ?? null,
      },
      accessContext,
    ),
  dailyTracking: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    localDate: string,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "nutrition-daily-tracking",
      { generation, localDate, membershipId, relationshipId },
      accessContext,
    ),
  foods: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    generation: number,
    filters: NutritionFoodListFilters = {},
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "nutrition-foods",
      { generation, limit: nutritionPageLimit, membershipId, ...filters },
      accessContext,
    ),
  plan: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    planId: NutritionPlanId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "nutrition-plan",
      { generation, membershipId, planId, relationshipId },
      accessContext,
    ),
  plans: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    cursor?: string,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "nutrition-plans",
      {
        cursor: cursor ?? null,
        generation,
        limit: nutritionPageLimit,
        membershipId,
        relationshipId,
      },
      accessContext,
    ),
};

export interface NutritionPage<T> {
  data: T[];
  nextCursor?: string;
}

export interface NutritionFoodListFilters {
  cursor?: string;
  includeArchived?: boolean;
}

export interface NutritionAnalyticsRange {
  from?: string;
  granularity?: NutritionAnalyticsGranularity;
  to?: string;
}

export async function listNutritionFoods(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  filters: NutritionFoodListFilters = {},
  signal?: AbortSignal,
): Promise<NutritionPage<NutritionFoodDto>> {
  const query = serializeQueryParams({
    cursor: filters.cursor,
    includeArchived: filters.includeArchived,
    limit: nutritionPageLimit,
  });
  const page = await apiClient.request<{ data: unknown; nextCursor?: unknown }>(
    {
      method: "GET",
      path: `/workspaces/${workspaceId}/foods?${query}`,
      signal,
    },
  );
  const foods = requireArray(page.data, isNutritionFoodDto, "foods");
  if (
    foods.some(
      (food) =>
        food.scope !== "SYSTEM" &&
        food.workspaceId !== undefined &&
        food.workspaceId !== workspaceId,
    )
  ) {
    throw malformed("food workspace");
  }

  return {
    data: foods,
    ...(typeof page.nextCursor === "string"
      ? { nextCursor: page.nextCursor }
      : {}),
  };
}

export async function createNutritionFood(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  body: NutritionFoodBodyDto,
): Promise<NutritionFoodCommandResponseDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    method: "POST",
    path: `/workspaces/${workspaceId}/foods`,
  });
  const data = requireShape(
    envelope.data,
    isNutritionFoodCommandResponseDto,
    "food command",
  );
  guardFoodIdentity(data.food, workspaceId);
  return data;
}

export async function updateNutritionFood(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  foodId: FoodId,
  body: NutritionFoodPatchDto,
): Promise<NutritionFoodCommandResponseDto> {
  return foodCommand(
    apiClient,
    "PATCH",
    `/workspaces/${workspaceId}/foods/${foodId}`,
    workspaceId,
    foodId,
    body,
  );
}

export async function archiveNutritionFood(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  foodId: FoodId,
  body: ExpectedVersionDto,
): Promise<NutritionFoodCommandResponseDto> {
  return foodCommand(
    apiClient,
    "POST",
    `/workspaces/${workspaceId}/foods/${foodId}/archive`,
    workspaceId,
    foodId,
    body,
  );
}

export async function listNutritionPlans(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  cursor?: string,
  signal?: AbortSignal,
): Promise<NutritionPage<NutritionPlanDto>> {
  const query = serializeQueryParams({ cursor, limit: nutritionPageLimit });
  const page = await apiClient.request<{ data: unknown; nextCursor?: unknown }>(
    {
      method: "GET",
      path: `/workspaces/${workspaceId}/relationships/${relationshipId}/nutrition-plans?${query}`,
      signal,
    },
  );
  const plans = requireArray(page.data, isNutritionPlanDto, "nutrition plans");
  if (
    plans.some(
      (plan) =>
        plan.workspaceId !== workspaceId ||
        plan.relationshipId !== relationshipId,
    )
  ) {
    throw malformed("nutrition plan identity");
  }

  return {
    data: plans,
    ...(typeof page.nextCursor === "string"
      ? { nextCursor: page.nextCursor }
      : {}),
  };
}

export async function createNutritionPlan(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: CreateNutritionPlanDto,
): Promise<NutritionPlanRevisionCommandResponseDto> {
  return writeNutritionRevision(
    apiClient,
    workspaceId,
    relationshipId,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/nutrition-plans`,
    body,
  );
}

export async function getNutritionPlan(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  planId: NutritionPlanId,
  signal?: AbortSignal,
): Promise<NutritionPlanDetailDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/nutrition-plans/${planId}`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isNutritionPlanDetailDto,
    "nutrition plan detail",
  );
  guardPlanDetailIdentity(data, workspaceId, relationshipId, planId);
  return data;
}

export async function createNutritionPlanRevision(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  planId: NutritionPlanId,
  body: CreateNutritionPlanRevisionDto,
): Promise<NutritionPlanRevisionCommandResponseDto> {
  return writeNutritionRevision(
    apiClient,
    workspaceId,
    relationshipId,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/nutrition-plans/${planId}/revisions`,
    body,
    planId,
  );
}

export async function activateNutritionPlan(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  planId: NutritionPlanId,
  body: ExpectedVersionDto,
  idempotencyKey: string,
): Promise<NutritionPlanCommandResponseDto> {
  return planCommand(
    apiClient,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/nutrition-plans/${planId}/activate`,
    workspaceId,
    relationshipId,
    planId,
    body,
    idempotencyKey,
  );
}

export async function completeNutritionPlan(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  planId: NutritionPlanId,
  body: ExpectedVersionDto,
): Promise<NutritionPlanCommandResponseDto> {
  return planCommand(
    apiClient,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/nutrition-plans/${planId}/complete`,
    workspaceId,
    relationshipId,
    planId,
    body,
  );
}

export async function archiveNutritionPlan(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  planId: NutritionPlanId,
  body: ExpectedVersionDto,
): Promise<NutritionPlanCommandResponseDto> {
  return planCommand(
    apiClient,
    `/workspaces/${workspaceId}/relationships/${relationshipId}/nutrition-plans/${planId}/archive`,
    workspaceId,
    relationshipId,
    planId,
    body,
  );
}

export async function getDailyNutritionTracking(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  localDate: string,
  signal?: AbortSignal,
) {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/daily-tracking/${localDate}`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isDailyTrackingEnvelopeDto,
    "daily tracking",
  );
  if (
    data.dailyTrackingEntry !== null &&
    data.dailyTrackingEntry.localDate !== localDate
  ) {
    throw malformed("daily tracking date");
  }
  return data;
}

export async function getNutritionAnalytics(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  range: NutritionAnalyticsRange,
  signal?: AbortSignal,
): Promise<NutritionAnalyticsDto> {
  const query = serializeQueryParams({
    from: range.from,
    granularity: range.granularity,
    to: range.to,
  });
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/analytics/nutrition?${query}`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isNutritionAnalyticsDto,
    "nutrition analytics",
  );
  if (
    data.workspaceId !== workspaceId ||
    data.relationshipId !== relationshipId
  ) {
    throw malformed("nutrition analytics identity");
  }
  return data;
}

async function foodCommand(
  apiClient: ApiClient,
  method: "PATCH" | "POST",
  path: string,
  workspaceId: WorkspaceId,
  foodId: FoodId,
  body: ExpectedVersionDto | NutritionFoodPatchDto,
) {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    method,
    path,
  });
  const data = requireShape(
    envelope.data,
    isNutritionFoodCommandResponseDto,
    "food command",
  );
  guardFoodIdentity(data.food, workspaceId, foodId);
  return data;
}

async function writeNutritionRevision(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  path: string,
  body: CreateNutritionPlanDto | CreateNutritionPlanRevisionDto,
  planId?: NutritionPlanId,
) {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    method: "POST",
    path,
  });
  const data = requireShape(
    envelope.data,
    isNutritionPlanRevisionCommandResponseDto,
    "nutrition plan revision",
  );
  if (
    data.plan.workspaceId !== workspaceId ||
    data.plan.relationshipId !== relationshipId ||
    (planId !== undefined && data.plan.id !== planId) ||
    data.plan.currentRevisionId !== data.revision.id ||
    data.revision.nutritionPlanId !== data.plan.id
  ) {
    throw malformed("nutrition revision identity");
  }
  return data;
}

async function planCommand(
  apiClient: ApiClient,
  path: string,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  planId: NutritionPlanId,
  body: ExpectedVersionDto,
  idempotencyKey?: string,
) {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method: "POST",
    path,
  });
  const data = requireShape(
    envelope.data,
    isNutritionPlanCommandResponseDto,
    "nutrition plan command",
  );
  if (
    data.plan.workspaceId !== workspaceId ||
    data.plan.relationshipId !== relationshipId ||
    data.plan.id !== planId
  ) {
    throw malformed("nutrition plan command identity");
  }
  return data;
}

function guardFoodIdentity(
  food: NutritionFoodDto,
  workspaceId: WorkspaceId,
  foodId?: FoodId,
) {
  if (
    (food.scope !== "SYSTEM" && food.workspaceId !== workspaceId) ||
    (foodId !== undefined && food.id !== foodId)
  ) {
    throw malformed("food identity");
  }
}

function guardPlanDetailIdentity(
  data: NutritionPlanDetailDto,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  planId: NutritionPlanId,
) {
  if (
    data.plan.workspaceId !== workspaceId ||
    data.plan.relationshipId !== relationshipId ||
    data.plan.id !== planId ||
    (data.revision !== null &&
      (data.revision.nutritionPlanId !== planId ||
        data.plan.currentRevisionId !== data.revision.id))
  ) {
    throw malformed("nutrition plan detail identity");
  }
}

function requireArray<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): T[] {
  if (!Array.isArray(value) || !value.every(guard)) {
    throw malformed(label);
  }

  return value;
}

function requireShape<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): T {
  if (!guard(value)) {
    throw malformed(label);
  }

  return value;
}

function malformed(label: string): ApiError {
  return new ApiError({
    code: "WEB_MALFORMED_RESPONSE",
    kind: "malformed-response",
    message: `Malformed ${label} response.`,
  });
}
