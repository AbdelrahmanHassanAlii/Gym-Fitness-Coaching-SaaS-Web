/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  FoodId,
  MembershipId,
  NutritionPlanId,
  NutritionPlanRevisionId,
  PermissionDecisionDto,
  RelationshipId,
  SafeAuthUserDto,
  UserId,
  WorkspaceId,
} from "@/contracts";
import { accessFactsFromDecision } from "@/lib/access";
import { ApiError } from "@/lib/api";
import type { AuthSessionContextValue, AuthState } from "@/lib/auth";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import { NutritionExperience } from "./NutritionExperience";

const workspaceId = "workspace_a" as WorkspaceId;
const membershipId = "membership_a" as MembershipId;
const relationshipId = "relationship_a" as RelationshipId;
const planId = "nutrition_plan_a" as NutritionPlanId;
const revisionId = "nutrition_revision_a" as NutritionPlanRevisionId;
const foodId = "food_a" as FoodId;

const mocks = vi.hoisted(() => ({
  authSession: {
    apiClient: {
      request: vi.fn(),
    },
    bootstrap: vi.fn(),
    generation: 1,
    getAccessToken: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    markSessionExpired: vi.fn(),
    state: {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        emailVerified: true,
        firstName: "Amina",
        id: "user_a",
        lastName: "Owner",
        phoneVerified: false,
      },
    } as AuthState,
    subscribe: vi.fn(),
    verifyMfaLogin: vi.fn(),
  },
  createIdempotencyKey: vi.fn(),
  staffContext: {} as StaffWorkspaceContextValue,
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => mocks.authSession as unknown as AuthSessionContextValue,
}));

vi.mock("@/lib/staff-shell", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/staff-shell")>(
      "@/lib/staff-shell",
    );
  return {
    ...actual,
    useStaffWorkspaceContext: () => mocks.staffContext,
  };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    createIdempotencyKey: mocks.createIdempotencyKey,
  };
});

describe("nutrition experience", () => {
  beforeEach(() => {
    mocks.authSession.apiClient.request.mockReset();
    mocks.authSession.generation = 1;
    mocks.authSession.state = {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: user(),
    } as AuthState;
    mocks.createIdempotencyKey.mockReset();
    mocks.createIdempotencyKey.mockReturnValue("activation-key-1");
    mocks.staffContext = context([
      "trainees.read",
      "foods.read",
      "foods.create",
      "foods.update",
      "foods.archive",
      "nutrition.plans.read",
      "nutrition.plans.create",
      "nutrition.plans.update",
      "nutrition.plans.activate",
      "nutrition.plans.complete",
      "nutrition.plans.archive",
      "adherence.read",
      "analytics.nutrition.read",
    ]);
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    mockNutritionData();
  });

  test("does not render protected nutrition UI without selected workspace", () => {
    mocks.staffContext = {
      accessFacts: null,
      shellContext: null,
      workspace: null,
    };

    renderNutrition();

    expect(screen.getByText("No workspace selected")).toBeInTheDocument();
    expect(screen.queryByText("Food library")).not.toBeInTheDocument();
  });

  test("fails closed when food read is denied", () => {
    mocks.staffContext = context(["trainees.read"]);

    renderNutrition();

    expect(screen.getByText("Food library")).toBeInTheDocument();
    expect(
      screen.getByText(messages.en.nutrition.errors.denied),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("English name")).not.toBeInTheDocument();
  });

  test("renders food scopes conservatively without system or gym row mutation", async () => {
    renderNutrition();

    expect(await screen.findByText("Rice")).toBeInTheDocument();
    expect(screen.getByText("System food")).toBeInTheDocument();
    expect(
      screen.getByText(messages.en.nutrition.foods.systemReadOnly),
    ).toBeInTheDocument();
    expect(
      screen.getByText(messages.en.nutrition.foods.conservativeGym),
    ).toBeInTheDocument();
    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    expect(editButtons[1]).toBeDisabled();
    expect(archiveButtons[1]).toBeDisabled();
  });

  test("keeps plan activation idempotency key stable across ambiguous retry", async () => {
    let activationCalls = 0;
    mocks.authSession.apiClient.request.mockImplementation(
      (request: { body?: unknown; idempotencyKey?: string; path: string }) => {
        if (request.path.endsWith("/activate")) {
          activationCalls += 1;
          if (activationCalls === 1) {
            throw new ApiError({
              kind: "network",
              message: "network dropped after submit",
            });
          }
          return Promise.resolve({
            data: { plan: plan({ status: "ACTIVE", version: 2 }) },
          });
        }
        return nutritionResponse(request.path);
      },
    );

    renderNutrition();
    fireEvent.click(screen.getByRole("tab", { name: "Plans" }));
    const activate = await screen.findByRole("button", { name: "Activate" });

    fireEvent.click(activate);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.nutrition.status.unknownOutcome,
    );
    fireEvent.click(activate);

    await waitFor(() => expect(activationCalls).toBe(2));
    expect(mocks.createIdempotencyKey).toHaveBeenCalledTimes(1);
    const activationRequests = mocks.authSession.apiClient.request.mock.calls
      .map((call) => call[0])
      .filter((request) => String(request.path).endsWith("/activate"));
    expect(activationRequests.map((request) => request.idempotencyKey)).toEqual(
      ["activation-key-1", "activation-key-1"],
    );
  });

  test("tracking panel is read only and analytics use server fields", async () => {
    renderNutrition();

    fireEvent.click(screen.getByRole("tab", { name: "Tracking" }));
    expect(await screen.findByText(/85/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }));
    expect(
      await screen.findByText("Active plan: Cutting plan"),
    ).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });
});

function renderNutrition() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NutritionExperience labels={messages.en.nutrition} />
    </QueryClientProvider>,
  );
}

function context(
  permissions: readonly PermissionDecisionDto["permission"][],
): StaffWorkspaceContextValue {
  return {
    accessFacts: accessFactsFromDecision({
      decisions: permissions.map((permission) => decision(permission)),
      membershipId,
      sessionGeneration: 1,
      workspaceId,
    }),
    shellContext: {
      accessContext: "user",
      branch: { branchId: null, label: "All permitted branches" },
      portal: "gym-staff",
      sessionGeneration: 1,
      workspace: {
        membershipId,
        roles: ["NUTRITIONIST"],
        workspaceId,
        workspaceName: "Summit Gym",
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      membershipId,
      roles: ["NUTRITIONIST"],
      workspaceId,
      workspaceName: "Summit Gym",
      workspaceTimezone: "Africa/Cairo",
    },
  };
}

function decision(
  permission: PermissionDecisionDto["permission"],
): PermissionDecisionDto {
  return {
    allowed: true,
    effect: "ALLOW",
    permission,
    source: "PROFILE",
  };
}

function mockNutritionData() {
  mocks.authSession.apiClient.request.mockImplementation(
    (request: { path: string }) => nutritionResponse(request.path),
  );
}

function nutritionResponse(path: string) {
  if (path.startsWith("/workspaces/workspace_a/relationships?")) {
    return Promise.resolve({ data: [relationship()] });
  }
  if (path.startsWith("/workspaces/workspace_a/foods?")) {
    return Promise.resolve({
      data: [
        food({ id: "food_private", names: { en: "Rice" }, scope: "PRIVATE" }),
        food({ id: "food_gym", names: { en: "Gym oats" }, scope: "GYM" }),
        {
          ...food({
            id: "food_system",
            names: { en: "System food" },
            scope: "SYSTEM",
          }),
          workspaceId: undefined,
        },
      ],
    });
  }
  if (path.includes("/nutrition-plans?")) {
    return Promise.resolve({ data: [plan()] });
  }
  if (path.endsWith(`/nutrition-plans/${planId}`)) {
    return Promise.resolve({ data: { plan: plan(), revision: revision() } });
  }
  if (path.includes("/daily-tracking/")) {
    return Promise.resolve({
      data: {
        dailyTrackingEntry: {
          id: "daily_tracking_a",
          localDate: new Date().toISOString().slice(0, 10),
          timezoneAtEntry: "Africa/Cairo",
          values: { NUTRITION: { adherencePercent: 85 }, WATER: { ml: 1900 } },
          version: 1,
        },
      },
    });
  }
  if (path.includes("/analytics/nutrition")) {
    return Promise.resolve({
      data: {
        activePlan: { id: planId, name: "Cutting plan" },
        nutritionTracking: { averageAdherenceRate: 0.8, daysTracked: 1 },
        range: {
          from: "2026-09-01",
          timezone: "Africa/Cairo",
          to: "2026-10-01",
        },
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
        targets: null,
        waterTracking: { averageMl: 1800, daysTracked: 1, targetMl: null },
        workspaceId,
      },
    });
  }
  return Promise.reject(new Error(`Unexpected request ${path}`));
}

function user(): SafeAuthUserDto {
  return {
    emailVerified: true,
    firstName: "Amina",
    id: "user_a" as UserId,
    lastName: "Owner",
    phoneVerified: false,
  };
}

function relationship() {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    engagementPeriods: [],
    id: relationshipId,
    status: "ACTIVE",
    traineeUserId: "user_trainee",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    workspaceId,
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
    scope: "PRIVATE",
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
