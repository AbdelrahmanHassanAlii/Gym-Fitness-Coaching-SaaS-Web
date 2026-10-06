"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateNutritionPlanDto,
  CreateNutritionPlanRevisionDto,
  FoodId,
  MembershipId,
  NutritionFoodBodyDto,
  NutritionFoodPatchDto,
  NutritionPlanDto,
  NutritionPlanId,
  PermissionKey,
  RelationshipId,
  WorkspaceId,
} from "@/contracts";
import { createIdempotencyKey, isApiError } from "@/lib/api";
import { evaluateAccess, type AccessDecision } from "@/lib/access";
import { useAuthSession } from "@/lib/auth";
import { listRelationships, relationshipKeys } from "@/lib/relationships";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import {
  activateNutritionPlan,
  archiveNutritionFood,
  archiveNutritionPlan,
  completeNutritionPlan,
  createNutritionFood,
  createNutritionPlan,
  createNutritionPlanRevision,
  getDailyNutritionTracking,
  getNutritionAnalytics,
  getNutritionPlan,
  listNutritionFoods,
  listNutritionPlans,
  nutritionKeys,
  updateNutritionFood,
  type NutritionAnalyticsRange,
} from "@/lib/nutrition";
import type { AuthorizationCacheContext } from "@/lib/server-state";
import { NutritionAnalyticsPanel } from "./NutritionAnalyticsPanel";
import { NutritionFoodLibrary } from "./NutritionFoodLibrary";
import { NutritionPlanPanel } from "./NutritionPlanPanel";
import { NutritionTrackingPanel } from "./NutritionTrackingPanel";
import styles from "./nutrition.module.css";

export type NutritionLabels = {
  actions: Record<
    | "activate"
    | "archive"
    | "complete"
    | "create"
    | "edit"
    | "loadMore"
    | "save"
    | "select"
    | "submitRevision",
    string
  >;
  analytics: {
    activePlan: string;
    averageWater: string;
    empty: string;
    range: string;
    title: string;
    trackedDays: string;
  };
  capped: string;
  confirm: {
    activate: string;
    archiveFood: string;
    archivePlan: string;
    completePlan: string;
  };
  empty: {
    foods: string;
    plans: string;
    relationships: string;
    tracking: string;
  };
  errors: Record<
    | "accessUnavailable"
    | "ambiguous"
    | "conflict"
    | "denied"
    | "malformed"
    | "rateLimited"
    | "unavailable"
    | "validation",
    string
  >;
  fields: Record<
    | "amount"
    | "analyticsFrom"
    | "analyticsGranularity"
    | "analyticsTo"
    | "calories"
    | "carbs"
    | "date"
    | "expectedVersion"
    | "fat"
    | "food"
    | "foodScope"
    | "meal"
    | "nameAr"
    | "nameEn"
    | "notes"
    | "protein"
    | "responsibleMembership"
    | "targetCalories"
    | "unit"
    | "water"
    | "waterMl",
    string
  >;
  foods: {
    conservativeGym: string;
    createScopeHelp: string;
    systemReadOnly: string;
    title: string;
  };
  loading: string;
  noWorkspace: {
    copy: string;
    title: string;
  };
  panels: {
    analytics: string;
    foods: string;
    plans: string;
    tracking: string;
  };
  plans: {
    detail: string;
    editor: string;
    revision: string;
    title: string;
  };
  status: {
    conflict: string;
    saved: string;
    unknownOutcome: string;
  };
  title: string;
  tracking: {
    nutrition: string;
    title: string;
    water: string;
  };
  values: Record<string, string>;
};

type NutritionTab = "analytics" | "foods" | "plans" | "tracking";

type ActivationCommand = {
  key: string;
  logicalId: string;
};

const activationKeysByOwner = new Map<string, Map<string, ActivationCommand>>();

export function NutritionExperience({ labels }: { labels: NutritionLabels }) {
  const { generation } = useAuthSession();
  const { shellContext, workspace } = useStaffWorkspaceContext();
  return (
    <NutritionContent
      key={JSON.stringify([
        generation,
        workspace?.workspaceId,
        workspace?.membershipId,
        shellContext?.accessContext,
      ])}
      labels={labels}
    />
  );
}

function NutritionContent({ labels }: { labels: NutritionLabels }) {
  const queryClient = useQueryClient();
  const { apiClient, generation, state } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  const commandOwner = useId();
  const [selectedTab, setSelectedTab] = useState<NutritionTab>("foods");
  const [selectedRelationshipId, setSelectedRelationshipId] =
    useState<RelationshipId | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<NutritionPlanId | null>(
    null,
  );
  const [includeArchivedFoods, setIncludeArchivedFoods] = useState(false);
  const [foodCursor, setFoodCursor] = useState<string | undefined>();
  const [planCursor, setPlanCursor] = useState<string | undefined>();
  const [localDate, setLocalDate] = useState(todayLocalDate());
  const [analyticsRange, setAnalyticsRange] = useState<NutritionAnalyticsRange>(
    defaultAnalyticsRange(),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workspaceId = workspace?.workspaceId ?? null;
  const membershipId = workspace?.membershipId;
  const accessContext = shellContext?.accessContext ?? "user";
  const canQuery = state.status === "authenticated" && workspaceId !== null;
  const accessInput = {
    accessContext,
    accessFacts,
    generation,
    membershipId,
    workspaceId,
  };
  const readDecisions = {
    analytics: actionDecision({
      ...accessInput,
      permission: "analytics.nutrition.read",
    }),
    foods: actionDecision({ ...accessInput, permission: "foods.read" }),
    plans: actionDecision({
      ...accessInput,
      permission: "nutrition.plans.read",
    }),
    tracking: actionDecision({ ...accessInput, permission: "adherence.read" }),
    relationships: actionDecision({
      ...accessInput,
      permission: "trainees.read",
    }),
  };
  const actionDecisions = {
    activatePlan: actionDecision({
      ...accessInput,
      permission: "nutrition.plans.activate",
    }),
    archiveFood: actionDecision({
      ...accessInput,
      permission: "foods.archive",
    }),
    archivePlan: actionDecision({
      ...accessInput,
      permission: "nutrition.plans.archive",
    }),
    completePlan: actionDecision({
      ...accessInput,
      permission: "nutrition.plans.complete",
    }),
    createFood: actionDecision({ ...accessInput, permission: "foods.create" }),
    createPlan: actionDecision({
      ...accessInput,
      permission: "nutrition.plans.create",
    }),
    updateFood: actionDecision({ ...accessInput, permission: "foods.update" }),
    updatePlan: actionDecision({
      ...accessInput,
      permission: "nutrition.plans.update",
    }),
  };

  useEffect(() => {
    return () => {
      activationKeysByOwner.delete(commandOwner);
    };
  }, [commandOwner]);

  const relationshipsQuery = useQuery({
    enabled: canQuery && readDecisions.relationships.allowed,
    queryFn: ({ signal }) =>
      listRelationships(apiClient, workspaceId!, { status: "ACTIVE" }, signal),
    queryKey:
      workspaceId === null
        ? ["nutrition", "relationships", "none"]
        : relationshipKeys.list(
            workspaceId,
            generation,
            "ACTIVE",
            accessContext,
          ),
    retry: false,
  });

  const relationships = useMemo(
    () => relationshipsQuery.data ?? [],
    [relationshipsQuery.data],
  );
  const activeRelationship =
    relationships.find((item) => item.id === selectedRelationshipId) ??
    relationships[0] ??
    null;
  const activeRelationshipId = activeRelationship?.id ?? null;

  const foodsQuery = useQuery({
    enabled:
      canQuery && membershipId !== undefined && readDecisions.foods.allowed,
    queryFn: ({ signal }) =>
      listNutritionFoods(
        apiClient,
        workspaceId!,
        { cursor: foodCursor, includeArchived: includeArchivedFoods },
        signal,
      ),
    queryKey:
      workspaceId === null || membershipId === undefined
        ? ["nutrition", "foods", "none"]
        : nutritionKeys.foods(
            workspaceId,
            membershipId,
            generation,
            { cursor: foodCursor, includeArchived: includeArchivedFoods },
            accessContext,
          ),
    retry: false,
  });

  const plansQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      activeRelationshipId !== null &&
      readDecisions.plans.allowed,
    queryFn: ({ signal }) =>
      listNutritionPlans(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        planCursor,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      activeRelationshipId === null
        ? ["nutrition", "plans", "none"]
        : nutritionKeys.plans(
            workspaceId,
            membershipId,
            activeRelationshipId,
            generation,
            planCursor,
            accessContext,
          ),
    retry: false,
  });

  const plans = useMemo(() => plansQuery.data?.data ?? [], [plansQuery.data]);
  const activePlan =
    plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] ?? null;
  const activePlanId = activePlan?.id ?? null;

  const selectedPlanQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      activeRelationshipId !== null &&
      activePlanId !== null &&
      readDecisions.plans.allowed,
    queryFn: ({ signal }) =>
      getNutritionPlan(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        activePlanId!,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      activeRelationshipId === null ||
      activePlanId === null
        ? ["nutrition", "plan", "none"]
        : nutritionKeys.plan(
            workspaceId,
            membershipId,
            activeRelationshipId,
            activePlanId,
            generation,
            accessContext,
          ),
    retry: false,
  });

  const trackingQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      activeRelationshipId !== null &&
      readDecisions.tracking.allowed,
    queryFn: ({ signal }) =>
      getDailyNutritionTracking(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        localDate,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      activeRelationshipId === null
        ? ["nutrition", "tracking", "none"]
        : nutritionKeys.dailyTracking(
            workspaceId,
            membershipId,
            activeRelationshipId,
            localDate,
            generation,
            accessContext,
          ),
    retry: false,
  });

  const analyticsQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      activeRelationshipId !== null &&
      readDecisions.analytics.allowed,
    queryFn: ({ signal }) =>
      getNutritionAnalytics(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        analyticsRange,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      activeRelationshipId === null
        ? ["nutrition", "analytics", "none"]
        : nutritionKeys.analytics(
            workspaceId,
            membershipId,
            activeRelationshipId,
            generation,
            analyticsRange,
            accessContext,
          ),
    retry: false,
  });

  const foodListKey = () =>
    workspaceId && membershipId
      ? nutritionKeys.foods(
          workspaceId,
          membershipId,
          generation,
          { cursor: foodCursor, includeArchived: includeArchivedFoods },
          accessContext,
        )
      : undefined;
  const plansListKey = () =>
    workspaceId && membershipId && activeRelationshipId
      ? nutritionKeys.plans(
          workspaceId,
          membershipId,
          activeRelationshipId,
          generation,
          planCursor,
          accessContext,
        )
      : undefined;
  const selectedPlanKey = (planId: NutritionPlanId | null = selectedPlanId) =>
    workspaceId && membershipId && activeRelationshipId && planId
      ? nutritionKeys.plan(
          workspaceId,
          membershipId,
          activeRelationshipId,
          planId,
          generation,
          accessContext,
        )
      : undefined;

  const createFoodMutation = useMutation({
    mutationFn: (body: NutritionFoodBodyDto) =>
      createNutritionFood(apiClient, workspaceId!, body),
    onError: (mutationError) => setError(errorMessage(mutationError, labels)),
    onSuccess: async () => {
      await invalidate(foodListKey());
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const updateFoodMutation = useMutation({
    mutationFn: (input: { body: NutritionFoodPatchDto; foodId: FoodId }) =>
      updateNutritionFood(apiClient, workspaceId!, input.foodId, input.body),
    onError: (mutationError) => setError(errorMessage(mutationError, labels)),
    onSuccess: async () => {
      await invalidate(foodListKey());
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const archiveFoodMutation = useMutation({
    mutationFn: (input: { expectedVersion: number; foodId: FoodId }) =>
      archiveNutritionFood(apiClient, workspaceId!, input.foodId, {
        expectedVersion: input.expectedVersion,
      }),
    onError: (mutationError) => setError(errorMessage(mutationError, labels)),
    onSuccess: async () => {
      await invalidate(foodListKey());
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const createPlanMutation = useMutation({
    mutationFn: (body: CreateNutritionPlanDto) =>
      createNutritionPlan(apiClient, workspaceId!, activeRelationshipId!, body),
    onError: async (mutationError) => {
      if (isAmbiguous(mutationError)) await invalidate(plansListKey());
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async (result) => {
      await invalidate(plansListKey());
      setSelectedPlanId(result.plan.id);
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const revisionMutation = useMutation({
    mutationFn: (input: {
      body: CreateNutritionPlanRevisionDto;
      planId: NutritionPlanId;
    }) =>
      createNutritionPlanRevision(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        input.planId,
        input.body,
      ),
    onError: async (mutationError) => {
      if (isAmbiguous(mutationError)) await invalidate(selectedPlanKey());
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async (result) => {
      await invalidate(plansListKey());
      await invalidate(selectedPlanKey(result.plan.id));
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const activateMutation = useMutation({
    mutationFn: (plan: NutritionPlanDto) => {
      const logicalId = [
        workspaceId,
        activeRelationshipId,
        plan.id,
        plan.version,
      ].join("|");
      const idempotencyKey = activationKey(commandOwner, logicalId);
      return activateNutritionPlan(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        plan.id,
        { expectedVersion: plan.version },
        idempotencyKey,
      ).then((result) => ({ planId: plan.id, result }));
    },
    onError: async (mutationError) => {
      if (!isAmbiguous(mutationError)) clearActivationKeys(commandOwner);
      await invalidate(plansListKey());
      await invalidate(selectedPlanKey());
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async ({ planId }) => {
      clearActivationKeys(commandOwner);
      await invalidate(plansListKey());
      await invalidate(selectedPlanKey(planId));
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const completeMutation = useMutation({
    mutationFn: (plan: NutritionPlanDto) =>
      completeNutritionPlan(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        plan.id,
        {
          expectedVersion: plan.version,
        },
      ).then((result) => ({ planId: plan.id, result })),
    onError: async (mutationError) => {
      await invalidate(plansListKey());
      await invalidate(selectedPlanKey());
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async ({ planId }) => {
      await invalidate(plansListKey());
      await invalidate(selectedPlanKey(planId));
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  const archivePlanMutation = useMutation({
    mutationFn: (plan: NutritionPlanDto) =>
      archiveNutritionPlan(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        plan.id,
        {
          expectedVersion: plan.version,
        },
      ).then((result) => ({ planId: plan.id, result })),
    onError: async (mutationError) => {
      await invalidate(plansListKey());
      await invalidate(selectedPlanKey());
      setError(errorMessage(mutationError, labels));
    },
    onSuccess: async ({ planId }) => {
      await invalidate(plansListKey());
      await invalidate(selectedPlanKey(planId));
      setStatusMessage(labels.status.saved);
      setError(null);
    },
    retry: false,
  });

  async function invalidate(queryKey: readonly unknown[] | undefined) {
    if (queryKey) {
      await queryClient.invalidateQueries({ queryKey });
    }
  }

  const currentError = useMemo(
    () =>
      error ??
      firstQueryError(
        [
          foodsQuery.error,
          relationshipsQuery.error,
          plansQuery.error,
          selectedPlanQuery.error,
          trackingQuery.error,
          analyticsQuery.error,
        ],
        labels,
      ),
    [
      analyticsQuery.error,
      error,
      foodsQuery.error,
      labels,
      plansQuery.error,
      relationshipsQuery.error,
      selectedPlanQuery.error,
      trackingQuery.error,
    ],
  );

  if (
    workspace === null ||
    workspaceId === null ||
    membershipId === undefined
  ) {
    return (
      <section className={styles.statePanel}>
        <h1>{labels.noWorkspace.title}</h1>
        <p>{labels.noWorkspace.copy}</p>
      </section>
    );
  }

  return (
    <section className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>{labels.capped}</span>
        <h1>{labels.title}</h1>
        <div className={styles.toolbar}>
          <label>
            <span>{labels.panels.plans}</span>
            <select
              disabled={
                !readDecisions.relationships.allowed ||
                relationships.length === 0
              }
              onChange={(event) => {
                setSelectedRelationshipId(event.target.value as RelationshipId);
                setSelectedPlanId(null);
                setPlanCursor(undefined);
                setError(null);
              }}
              value={activeRelationshipId ?? ""}
            >
              {relationships.length === 0 ? (
                <option value="">{labels.empty.relationships}</option>
              ) : null}
              {relationships.map((relationship) => (
                <option key={relationship.id} value={relationship.id}>
                  {relationship.id} - {relationship.status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {currentError ? (
        <p className={styles.danger} role="alert">
          {currentError}
        </p>
      ) : null}
      {statusMessage ? (
        <p className={styles.success} role="status">
          {statusMessage}
        </p>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label={labels.title}>
        {(["foods", "plans", "tracking", "analytics"] as const).map((tab) => (
          <button
            aria-selected={selectedTab === tab}
            className={`${styles.tab} ${
              selectedTab === tab ? styles.tabActive : ""
            }`}
            key={tab}
            onClick={() => setSelectedTab(tab)}
            role="tab"
            type="button"
          >
            {labels.panels[tab]}
          </button>
        ))}
      </div>

      {selectedTab === "foods" ? (
        <NutritionFoodLibrary
          actions={{
            archive: (food) =>
              archiveFoodMutation.mutate({
                expectedVersion: food.version,
                foodId: food.id,
              }),
            create: (body) => createFoodMutation.mutate(body),
            update: (food, body) =>
              updateFoodMutation.mutate({ body, foodId: food.id }),
          }}
          decisions={{
            archive: actionDecisions.archiveFood,
            create: actionDecisions.createFood,
            read: readDecisions.foods,
            update: actionDecisions.updateFood,
          }}
          foods={foodsQuery.data?.data ?? []}
          includeArchived={includeArchivedFoods}
          isLoading={foodsQuery.isLoading || foodsQuery.isFetching}
          labels={labels}
          nextCursor={foodsQuery.data?.nextCursor}
          onIncludeArchivedChange={(value) => {
            setFoodCursor(undefined);
            setIncludeArchivedFoods(value);
          }}
          onLoadMore={() => setFoodCursor(foodsQuery.data?.nextCursor)}
          pending={
            createFoodMutation.isPending ||
            updateFoodMutation.isPending ||
            archiveFoodMutation.isPending
          }
        />
      ) : null}

      {selectedTab === "plans" ? (
        <NutritionPlanPanel
          actions={{
            activate: (plan) => {
              if (confirm(labels.confirm.activate))
                activateMutation.mutate(plan);
            },
            archive: (plan) => {
              if (confirm(labels.confirm.archivePlan))
                archivePlanMutation.mutate(plan);
            },
            complete: (plan) => {
              if (confirm(labels.confirm.completePlan))
                completeMutation.mutate(plan);
            },
            create: (body) => createPlanMutation.mutate(body),
            revision: (plan, body) =>
              revisionMutation.mutate({ body, planId: plan.id }),
          }}
          decisions={{
            activate: actionDecisions.activatePlan,
            archive: actionDecisions.archivePlan,
            complete: actionDecisions.completePlan,
            create: actionDecisions.createPlan,
            read: readDecisions.plans,
            update: actionDecisions.updatePlan,
          }}
          foods={foodsQuery.data?.data ?? []}
          isLoading={plansQuery.isLoading || selectedPlanQuery.isLoading}
          labels={labels}
          nextCursor={plansQuery.data?.nextCursor}
          onLoadMore={() => setPlanCursor(plansQuery.data?.nextCursor)}
          onSelectPlan={setSelectedPlanId}
          pending={
            createPlanMutation.isPending ||
            revisionMutation.isPending ||
            activateMutation.isPending ||
            completeMutation.isPending ||
            archivePlanMutation.isPending
          }
          planDetail={selectedPlanQuery.data}
          plans={plans}
          selectedPlanId={activePlanId}
        />
      ) : null}

      {selectedTab === "tracking" ? (
        <NutritionTrackingPanel
          decision={readDecisions.tracking}
          entry={trackingQuery.data?.dailyTrackingEntry ?? null}
          isLoading={trackingQuery.isLoading || trackingQuery.isFetching}
          labels={labels}
          localDate={localDate}
          onLocalDateChange={setLocalDate}
        />
      ) : null}

      {selectedTab === "analytics" ? (
        <NutritionAnalyticsPanel
          analytics={analyticsQuery.data}
          decision={readDecisions.analytics}
          isLoading={analyticsQuery.isLoading || analyticsQuery.isFetching}
          labels={labels}
          onRangeChange={setAnalyticsRange}
          range={analyticsRange}
        />
      ) : null}
    </section>
  );
}

function actionDecision(input: {
  accessContext: AuthorizationCacheContext;
  accessFacts: ReturnType<typeof useStaffWorkspaceContext>["accessFacts"];
  generation: number;
  membershipId?: MembershipId;
  permission: PermissionKey;
  workspaceId: WorkspaceId | null;
}): AccessDecision {
  return evaluateAccess(input.accessFacts, {
    accessContext: input.accessContext,
    context: "WORKSPACE",
    membershipId: input.membershipId,
    permission: input.permission,
    scope: "workspace",
    sessionGeneration: input.generation,
    workspaceId: input.workspaceId ?? undefined,
  });
}

function activationKey(owner: string, logicalId: string): string {
  const commands =
    activationKeysByOwner.get(owner) ?? new Map<string, ActivationCommand>();
  activationKeysByOwner.set(owner, commands);
  const existing = commands.get(logicalId);
  if (existing) return existing.key;
  const created = { key: createIdempotencyKey(), logicalId };
  commands.set(logicalId, created);
  return created.key;
}

function clearActivationKeys(owner: string) {
  activationKeysByOwner.get(owner)?.clear();
}

function errorMessage(error: unknown, labels: NutritionLabels): string {
  if (!isApiError(error)) return labels.errors.unavailable;
  if (error.kind === "malformed-response") return labels.errors.malformed;
  if (error.kind === "network") return labels.status.unknownOutcome;
  if (error.kind === "backend") {
    if (error.status === 403) return labels.errors.denied;
    if (error.status === 409) return labels.errors.conflict;
    if (error.status === 422 || error.category === "validation") {
      return labels.errors.validation;
    }
    if (error.status === 429) return labels.errors.rateLimited;
    if ((error.status ?? 0) >= 500) return labels.status.unknownOutcome;
  }
  return labels.errors.unavailable;
}

function firstQueryError(
  errors: readonly unknown[],
  labels: NutritionLabels,
): string | null {
  const error = errors.find((item) => item !== null);
  return error === undefined ? null : errorMessage(error, labels);
}

function isAmbiguous(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.kind === "network" ||
      (error.kind === "backend" && (error.status ?? 0) >= 500))
  );
}

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultAnalyticsRange(): NutritionAnalyticsRange {
  const to = todayLocalDate();
  const from = new Date(Date.now() - 1000 * 60 * 60 * 24 * 27)
    .toISOString()
    .slice(0, 10);
  return { from, granularity: "day", to };
}
