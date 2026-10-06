import { describe, expect, test } from "vitest";
import type {
  FoodId,
  MembershipId,
  NutritionPlanId,
  NutritionPlanRevisionId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts";
import { isNutritionPlanDto } from "@/contracts";
import type { ApiClient, ApiRequestOptions } from "@/lib/api";
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
} from ".";

const workspaceId = "workspace_a" as WorkspaceId;
const membershipId = "membership_a" as MembershipId;
const relationshipId = "relationship_a" as RelationshipId;
const planId = "nutrition_plan_a" as NutritionPlanId;
const revisionId = "nutrition_revision_a" as NutritionPlanRevisionId;
const foodId = "food_a" as FoodId;

describe("nutrition API", () => {
  test("accepts every Backend nutrition plan status including replaced", () => {
    for (const status of [
      "DRAFT",
      "ACTIVE",
      "REPLACED",
      "COMPLETED",
      "ARCHIVED",
    ]) {
      expect(isNutritionPlanDto(plan({ status }))).toBe(true);
    }
  });

  test("uses exact workspace food command contracts without invented idempotency", async () => {
    const api = fakeApiClient([
      { data: [food()] },
      { data: { food: food({ scope: "PRIVATE" }) } },
      { data: { food: food({ version: 2 }) } },
      { data: { food: food({ status: "ARCHIVED", version: 2 }) } },
    ]);

    await listNutritionFoods(api, workspaceId);
    await createNutritionFood(api, workspaceId, {
      baseAmount: 100,
      baseUnit: "GRAM",
      calories: 120,
      carbsG: 10,
      fatG: 2,
      names: { en: "Rice" },
      proteinG: 4,
      scope: "PRIVATE",
    });
    await updateNutritionFood(api, workspaceId, foodId, {
      calories: 121,
      expectedVersion: 1,
    });
    await archiveNutritionFood(api, workspaceId, foodId, {
      expectedVersion: 2,
    });

    expect(api.calls).toEqual([
      {
        method: "GET",
        path: "/workspaces/workspace_a/foods?limit=25",
      },
      {
        body: {
          baseAmount: 100,
          baseUnit: "GRAM",
          calories: 120,
          carbsG: 10,
          fatG: 2,
          names: { en: "Rice" },
          proteinG: 4,
          scope: "PRIVATE",
        },
        method: "POST",
        path: "/workspaces/workspace_a/foods",
      },
      {
        body: { calories: 121, expectedVersion: 1 },
        method: "PATCH",
        path: "/workspaces/workspace_a/foods/food_a",
      },
      {
        body: { expectedVersion: 2 },
        method: "POST",
        path: "/workspaces/workspace_a/foods/food_a/archive",
      },
    ]);
  });

  test("uses exact relationship nutrition plan contracts and only activation idempotency", async () => {
    const api = fakeApiClient([
      { data: [plan()] },
      { data: { plan: plan(), revision: revision() } },
      { data: { plan: plan(), revision: revision() } },
      { data: { plan: plan({ status: "ACTIVE", version: 2 }) } },
      { data: { plan: plan({ status: "COMPLETED", version: 3 }) } },
      { data: { plan: plan({ status: "ARCHIVED", version: 4 }) } },
    ]);
    const body = planBody();
    await listNutritionPlans(api, workspaceId, relationshipId);
    await createNutritionPlan(api, workspaceId, relationshipId, {
      ...body,
      name: "Cutting plan",
    });
    await createNutritionPlanRevision(
      api,
      workspaceId,
      relationshipId,
      planId,
      {
        ...body,
        expectedVersion: 1,
      },
    );
    await activateNutritionPlan(
      api,
      workspaceId,
      relationshipId,
      planId,
      { expectedVersion: 2 },
      "activation-key",
    );
    await completeNutritionPlan(api, workspaceId, relationshipId, planId, {
      expectedVersion: 3,
    });
    await archiveNutritionPlan(api, workspaceId, relationshipId, planId, {
      expectedVersion: 4,
    });

    expect(api.calls).toMatchObject([
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/nutrition-plans?limit=25",
      },
      {
        body: { ...body, name: "Cutting plan" },
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/nutrition-plans",
      },
      {
        body: { ...body, expectedVersion: 1 },
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/nutrition-plans/nutrition_plan_a/revisions",
      },
      {
        body: { expectedVersion: 2 },
        idempotencyKey: "activation-key",
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/nutrition-plans/nutrition_plan_a/activate",
      },
      {
        body: { expectedVersion: 3 },
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/nutrition-plans/nutrition_plan_a/complete",
      },
      {
        body: { expectedVersion: 4 },
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/nutrition-plans/nutrition_plan_a/archive",
      },
    ]);
  });

  test("read responses fail closed on mismatched identity", async () => {
    await expect(
      listNutritionFoods(
        fakeApiClient([{ data: [food({ workspaceId: "workspace_b" })] }]),
        workspaceId,
      ),
    ).rejects.toMatchObject({ kind: "malformed-response" });
    await expect(
      getNutritionPlan(
        fakeApiClient([
          {
            data: {
              plan: plan({ relationshipId: "relationship_b" }),
              revision: revision(),
            },
          },
        ]),
        workspaceId,
        relationshipId,
        planId,
      ),
    ).rejects.toMatchObject({ kind: "malformed-response" });
    await expect(
      getDailyNutritionTracking(
        fakeApiClient([
          {
            data: {
              dailyTrackingEntry: dailyTracking({ localDate: "2026-10-05" }),
            },
          },
        ]),
        workspaceId,
        relationshipId,
        "2026-10-06",
      ),
    ).rejects.toMatchObject({ kind: "malformed-response" });
    await expect(
      getNutritionAnalytics(
        fakeApiClient([
          {
            data: analytics({ relationshipId: "relationship_b" }),
          },
        ]),
        workspaceId,
        relationshipId,
        { from: "2026-09-01", granularity: "day", to: "2026-10-01" },
      ),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });

  test("query keys isolate membership, context, relationship, date, and range", () => {
    expect(
      nutritionKeys.foods(workspaceId, membershipId, 1, {}, "user"),
    ).not.toEqual(
      nutritionKeys.foods(
        workspaceId,
        "membership_b" as MembershipId,
        1,
        {},
        "user",
      ),
    );
    expect(
      nutritionKeys.dailyTracking(
        workspaceId,
        membershipId,
        relationshipId,
        "2026-10-06",
        1,
        "user",
      ),
    ).not.toEqual(
      nutritionKeys.dailyTracking(
        workspaceId,
        membershipId,
        relationshipId,
        "2026-10-07",
        1,
        "user",
      ),
    );
    expect(
      nutritionKeys.analytics(
        workspaceId,
        membershipId,
        relationshipId,
        1,
        { from: "2026-09-01", granularity: "day", to: "2026-10-01" },
        "user",
      ),
    ).not.toEqual(
      nutritionKeys.analytics(
        workspaceId,
        membershipId,
        relationshipId,
        1,
        { from: "2026-09-01", granularity: "week", to: "2026-10-01" },
        "support",
      ),
    );
  });
});

function fakeApiClient(
  responses: unknown[],
): ApiClient & { calls: ApiRequestOptions[] } {
  const calls: ApiRequestOptions[] = [];
  return {
    calls,
    request: async <T>(options: ApiRequestOptions) => {
      calls.push(simplify(options));
      const next = responses.shift();
      if (next === undefined) throw new Error("No fake response queued");
      return next as T;
    },
  };
}

function simplify(options: ApiRequestOptions): ApiRequestOptions {
  return {
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(options.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: options.idempotencyKey }),
    method: options.method,
    path: options.path,
  };
}

function food(input: Record<string, unknown> = {}) {
  return {
    baseAmount: 100,
    baseUnit: "GRAM",
    calories: 100,
    carbsG: 10,
    fatG: 2,
    id: foodId,
    names: { en: "Rice" },
    proteinG: 3,
    scope: "GYM",
    status: "ACTIVE",
    version: 1,
    workspaceId,
    ...input,
  };
}

function plan(input: Record<string, unknown> = {}) {
  return {
    currentRevisionId: revisionId,
    id: planId,
    name: "Cutting plan",
    relationshipId,
    responsibleMembershipId: membershipId,
    status: "DRAFT",
    version: 1,
    workspaceId,
    ...input,
  };
}

function revision() {
  return {
    calculatedCalories: 100,
    calculatedCarbsG: 10,
    calculatedFatG: 2,
    calculatedProteinG: 3,
    id: revisionId,
    meals: [
      {
        alternativeGroups: [],
        items: [
          {
            foodId,
            selectedAmount: 100,
            selectedUnit: "GRAM",
          },
        ],
        name: "Breakfast",
        order: 1,
      },
    ],
    nutritionPlanId: planId,
    revision: 1,
    supplements: [],
  };
}

function planBody() {
  return {
    meals: [
      {
        items: [
          {
            foodId,
            selectedAmount: 100,
            selectedUnit: "GRAM" as const,
          },
        ],
        name: "Breakfast",
        order: 1,
      },
    ],
  };
}

function dailyTracking(input: Record<string, unknown> = {}) {
  return {
    id: "daily_tracking_a",
    localDate: "2026-10-06",
    timezoneAtEntry: "Africa/Cairo",
    values: { NUTRITION: { adherencePercent: 85 }, WATER: { ml: 1900 } },
    version: 1,
    ...input,
  };
}

function analytics(input: Record<string, unknown> = {}) {
  return {
    activePlan: { id: planId, name: "Cutting plan" },
    nutritionTracking: { averageAdherenceRate: 0.8, daysTracked: 2 },
    range: { from: "2026-09-01", timezone: "Africa/Cairo", to: "2026-10-01" },
    relationshipId,
    series: [
      {
        averageWaterMl: 1800,
        from: "2026-09-01T00:00:00.000Z",
        key: "2026-09-01",
        nutritionAdherenceRate: 0.8,
        to: "2026-09-02T00:00:00.000Z",
        waterAdherenceRate: 0.9,
      },
    ],
    targets: {
      targetCalories: 2200,
      targetCarbsG: 200,
      targetFatG: 70,
      targetProteinG: 160,
      waterTargetMl: 2000,
    },
    waterTracking: { averageMl: 1800, daysTracked: 2, targetMl: 2000 },
    workspaceId,
    ...input,
  };
}
