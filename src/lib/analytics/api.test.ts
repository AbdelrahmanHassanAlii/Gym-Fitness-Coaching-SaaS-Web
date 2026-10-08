import { describe, expect, test, vi } from "vitest";
import type { ApiClient } from "@/lib/api";
import {
  analyticsKeys,
  getAdherenceAnalytics,
  getGymDashboard,
  getNutritionAnalytics,
  getProgressAnalytics,
  getRelationshipDashboard,
  getTrainerDashboard,
  getTrainingAnalytics,
  listAnalyticsMetrics,
  listAnalyticsRelationships,
} from "./api";

const range = {
  from: "2026-03-08T05:00:00.000Z",
  to: "2026-03-09T04:00:00.000Z",
  timezone: "America/New_York",
};

describe("analytics API", () => {
  test("uses only GET routes and exact supported query fields", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: gymDashboard() })
      .mockResolvedValueOnce({ data: trainerDashboard() })
      .mockResolvedValueOnce({ data: relationshipDashboard() })
      .mockResolvedValueOnce({ data: trainingAnalytics() })
      .mockResolvedValueOnce({ data: progressAnalytics() })
      .mockResolvedValueOnce({ data: nutritionAnalytics() })
      .mockResolvedValueOnce({ data: adherenceAnalytics() });
    const api = { request } as unknown as ApiClient;

    await getGymDashboard(api, "workspace_a", {
      attentionCategory: "CHECKIN_OVERDUE",
      attentionCursor: "attention",
      attentionLimit: 20,
      branchLimit: 25,
    });
    await getTrainerDashboard(api, "workspace_a", {
      attentionCategory: "NO_ACTIVE_PROGRAM",
      attentionLimit: 5,
    });
    await getRelationshipDashboard(api, "workspace_a", "relationship_a");
    await getTrainingAnalytics(api, "workspace_a", "relationship_a", {
      from: "2026-03-08",
      granularity: "day",
      to: "2026-03-09",
    });
    await getProgressAnalytics(api, "workspace_a", "relationship_a", {
      cursor: "progress",
      from: "2026-03-08",
      granularity: "day",
      limit: 500,
      metricDefinitionId: "metric_a",
      to: "2026-03-09",
    });
    await getNutritionAnalytics(api, "workspace_a", "relationship_a", {
      from: "2026-03-08",
      granularity: "week",
      to: "2026-03-15",
    });
    await getAdherenceAnalytics(api, "workspace_a", "relationship_a", {
      from: "2026-03-08",
      granularity: "week",
      to: "2026-03-15",
    });

    expect(request.mock.calls.map(([call]) => call)).toEqual([
      {
        method: "GET",
        path: "/workspaces/workspace_a/dashboard/gym?attentionCategory=CHECKIN_OVERDUE&attentionCursor=attention&attentionLimit=20&branchLimit=25",
        signal: undefined,
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/dashboard/trainer?attentionCategory=NO_ACTIVE_PROGRAM&attentionLimit=5",
        signal: undefined,
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/dashboard",
        signal: undefined,
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/analytics/training?from=2026-03-08&granularity=day&to=2026-03-09",
        signal: undefined,
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/analytics/progress?cursor=progress&from=2026-03-08&granularity=day&limit=500&metricDefinitionId=metric_a&to=2026-03-09",
        signal: undefined,
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/analytics/nutrition?from=2026-03-08&granularity=week&to=2026-03-15",
        signal: undefined,
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a/analytics/adherence?from=2026-03-08&granularity=week&to=2026-03-15",
        signal: undefined,
      },
    ]);
    expect(JSON.stringify(request.mock.calls)).not.toMatch(
      /idempotencyKey|expectedVersion/,
    );
    for (const index of [3, 5, 6]) {
      expect(String(request.mock.calls[index]?.[0].path)).not.toContain(
        "metricDefinitionId",
      );
    }
  });

  test("fails closed on a malformed sensitive response", async () => {
    const api = {
      request: vi.fn().mockResolvedValue({
        data: { ...gymDashboard(), window: { ...range, from: "not-a-time" } },
      }),
    } as unknown as ApiClient;

    await expect(getGymDashboard(api, "workspace_a", {})).rejects.toMatchObject(
      { kind: "malformed-response" },
    );

    const mismatched = {
      request: vi.fn().mockResolvedValue({
        data: { ...gymDashboard(), workspaceId: "workspace_b" },
      }),
    } as unknown as ApiClient;
    await expect(
      getGymDashboard(mismatched, "workspace_a", {}),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });

  test("uses the exact read-only selector routes and retains only authorized active targets", async () => {
    const relationship = {
      id: "relationship_a",
      workspaceId: "workspace_a",
      traineeUserId: "trainee_a",
      status: "ACTIVE",
      engagementPeriods: [],
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const metric = {
      id: "metric_a",
      scope: "GYM",
      workspaceId: "workspace_a",
      name: "Weight",
      valueType: "NUMBER",
      unit: "kg",
      category: "BODY",
      status: "ACTIVE",
      version: 1,
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: [relationship] })
      .mockResolvedValueOnce({ data: [metric], nextCursor: "opaque-next" });
    const api = { request } as unknown as ApiClient;

    expect(await listAnalyticsRelationships(api, "workspace_a")).toEqual([
      relationship,
    ]);
    expect(
      await listAnalyticsMetrics(api, "workspace_a", {
        cursor: "opaque",
        limit: 100,
      }),
    ).toEqual({ data: [metric], nextCursor: "opaque-next" });
    expect(request.mock.calls.map(([call]) => call)).toEqual([
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships",
        signal: undefined,
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/metric-definitions?cursor=opaque&limit=100",
        signal: undefined,
      },
    ]);
  });

  test("isolates every access and filter identity dimension", () => {
    const key = analyticsKeys.progress({
      accessContext: "user",
      accessVersion: 4,
      cursor: "opaque",
      from: "2026-03-08",
      granularity: "month",
      limit: 100,
      membershipId: "membership_a",
      metricDefinitionId: "metric_a",
      normalizedRouteA: ["analytics.progress.read", "trainees.read"],
      principalId: "user_a",
      relationshipId: "relationship_a",
      sessionGeneration: 3,
      to: "2026-04-08",
      workspaceId: "workspace_a",
    });
    const serialized = JSON.stringify(key);
    for (const value of [
      "user_a",
      "membership_a",
      "workspace_a",
      "relationship_a",
      "metric_a",
      "opaque",
      "analytics.progress.read",
    ])
      expect(serialized).toContain(value);
    expect(serialized).not.toMatch(
      /authorization|token|cookie|supportSessionId/i,
    );
  });
});

function page(items: unknown[] = []) {
  return { count: null, hasMore: false, items, nextCursor: null };
}

function gymDashboard() {
  return {
    workspaceId: "workspace_a",
    generatedAt: "2026-03-09T04:00:00.000Z",
    window: range,
    scope: {
      pureWorkspaceWide: false,
      assignedTrainees: false,
      self: false,
      includeBranchIds: [],
      excludeBranchIds: [],
      includeRelationshipIds: [],
      excludeRelationshipIds: [],
    },
    summary: {
      activeTrainees: 2,
      needsReassignment: 0,
      activeStaff: 3,
      completedWorkouts: 4,
      overdueCheckIns: 1,
      pendingReviewCheckIns: 1,
    },
    branchBreakdown: { items: [], hasMore: false, nextCursor: null },
    needsAttention: { CHECKIN_OVERDUE: page() },
    recentActivity: null,
  };
}

function trainerDashboard() {
  return {
    ...gymDashboard(),
    summary: {
      assignedActiveTrainees: 2,
      newlyAssignedTrainees: 1,
      completedWorkouts: 4,
      overdueCheckIns: 1,
      pendingReviewCheckIns: 1,
    },
    branchBreakdown: undefined,
  };
}

function relationshipDashboard() {
  return {
    workspaceId: "workspace_a",
    relationshipId: "relationship_a",
    generatedAt: "2026-03-09T04:00:00.000Z",
    relationship: { status: "ACTIVE", homeBranchId: null },
    assignedStaff: [],
    training: null,
    nutrition: null,
    progress: null,
    checkIns: null,
    adherence: null,
    needsAttention: {},
    access: {
      actorKind: "TRAINER",
      sections: {
        training: true,
        nutrition: false,
        progress: true,
        checkIns: true,
      },
    },
  };
}

function trainingAnalytics() {
  return {
    workspaceId: "workspace_a",
    relationshipId: "relationship_a",
    range,
    granularity: "day",
    summary: {
      startedSessions: 1,
      completedSessions: 1,
      abandonedSessions: 0,
      programDaysCompleted: 1,
      programDaysSkipped: 0,
      programDaysDeferred: 0,
      workoutAdherenceRate: 1,
      prCount: 0,
    },
    series: [],
    latestPr: null,
  };
}

function progressAnalytics() {
  return {
    workspaceId: "workspace_a",
    relationshipId: "relationship_a",
    range,
    metricDefinitionId: "metric_a",
    summary: {
      firstInWindow: null,
      latestInWindow: null,
      latest: null,
      delta: null,
      percentChange: null,
    },
    points: [],
    page: { hasMore: false, nextCursor: null },
    buckets: [],
    photoSummary: { count: 0 },
  };
}

function nutritionAnalytics() {
  return {
    workspaceId: "workspace_a",
    relationshipId: "relationship_a",
    range,
    activePlan: null,
    targets: null,
    nutritionTracking: { daysTracked: 0, averageAdherenceRate: null },
    waterTracking: { daysTracked: 0, averageMl: null, targetMl: null },
    series: [],
  };
}

function adherenceAnalytics() {
  return {
    workspaceId: "workspace_a",
    relationshipId: "relationship_a",
    range,
    granularity: "day",
    training: null,
    checkIns: null,
    nutrition: null,
    water: null,
    series: [],
  };
}
