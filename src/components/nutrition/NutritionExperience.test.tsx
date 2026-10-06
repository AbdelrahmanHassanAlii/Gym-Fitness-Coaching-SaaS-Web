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
  NutritionPlanStatus,
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
import {
  NutritionExperience,
  nutritionActivationCommandRegistryForTests,
  nutritionActivationLogicalId,
} from "./NutritionExperience";

const workspaceId = "workspace_a" as WorkspaceId;
const membershipId = "membership_a" as MembershipId;
const relationshipId = "relationship_a" as RelationshipId;
const planId = "nutrition_plan_a" as NutritionPlanId;
const revisionId = "nutrition_revision_a" as NutritionPlanRevisionId;
const foodId = "food_a" as FoodId;
let currentPlanInput: Record<string, unknown> = {};

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
    nutritionActivationCommandRegistryForTests.reset();
    currentPlanInput = {};
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

  test("does not offer gym or system food create from foods.create alone", async () => {
    renderNutrition();

    await screen.findByText("Rice");
    const scope = screen.getByLabelText("Food scope");

    expect(scope).toHaveTextContent("Private");
    expect(scope).not.toHaveTextContent("Gym");
    expect(scope).not.toHaveTextContent("System");
  });

  test.each([
    ["DRAFT", false, true, true, true],
    ["ACTIVE", true, false, true, false],
    ["REPLACED", true, true, false, true],
    ["COMPLETED", true, true, false, true],
    ["ARCHIVED", true, true, false, false],
  ] satisfies Array<[NutritionPlanStatus, boolean, boolean, boolean, boolean]>)(
    "matches Backend lifecycle controls for %s plans",
    async (
      status,
      activateDisabled,
      completeDisabled,
      revisionVisible,
      archiveEnabled,
    ) => {
      currentPlanInput = { status };

      renderNutrition();
      fireEvent.click(screen.getByRole("tab", { name: "Plans" }));

      expect(await screen.findByText("Cutting plan")).toBeInTheDocument();
      const activate = await screen.findByRole("button", { name: "Activate" });
      expect(activate).toHaveProperty("disabled", activateDisabled);
      expect(screen.getByRole("button", { name: "Complete" })).toHaveProperty(
        "disabled",
        completeDisabled,
      );
      expect(screen.getByRole("button", { name: "Archive" })).toHaveProperty(
        "disabled",
        !archiveEnabled,
      );
      if (revisionVisible) {
        expect(
          screen.getByRole("button", { name: "Save revision" }),
        ).toBeInTheDocument();
      } else {
        expect(
          screen.queryByRole("button", { name: "Save revision" }),
        ).not.toBeInTheDocument();
      }
    },
  );

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

  test("keeps ambiguous activation key across unmount and remount retry", async () => {
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

    const rendered = renderNutrition();
    fireEvent.click(screen.getByRole("tab", { name: "Plans" }));
    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.nutrition.status.unknownOutcome,
    );
    rendered.unmount();

    renderNutrition();
    fireEvent.click(screen.getByRole("tab", { name: "Plans" }));
    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));

    await waitFor(() => expect(activationCalls).toBe(2));
    const activationRequests = mocks.authSession.apiClient.request.mock.calls
      .map((call) => call[0])
      .filter((request) => String(request.path).endsWith("/activate"));
    expect(activationRequests.map((request) => request.idempotencyKey)).toEqual(
      ["activation-key-1", "activation-key-1"],
    );
  });

  test("isolates activation keys by command identity and preserves retry-critical capacity", () => {
    mocks.createIdempotencyKey.mockImplementation(
      () => `activation-key-${mocks.createIdempotencyKey.mock.calls.length}`,
    );
    const base = nutritionActivationLogicalId({
      accessContext: "user",
      generation: 1,
      plan: plan(),
      relationshipId,
      workspaceId,
    });
    const first =
      nutritionActivationCommandRegistryForTests.activationKey(base);
    nutritionActivationCommandRegistryForTests.markActivationAmbiguous(base);

    expect(
      nutritionActivationCommandRegistryForTests.activationKey(
        nutritionActivationLogicalId({
          accessContext: "user",
          generation: 1,
          plan: plan({ version: 2 }),
          relationshipId,
          workspaceId,
        }),
      ),
    ).not.toBe(first);
    expect(
      nutritionActivationCommandRegistryForTests.activationKey(
        nutritionActivationLogicalId({
          accessContext: "user",
          generation: 1,
          plan: plan({ id: "nutrition_plan_b" as NutritionPlanId }),
          relationshipId,
          workspaceId,
        }),
      ),
    ).not.toBe(first);
    expect(
      nutritionActivationCommandRegistryForTests.activationKey(
        nutritionActivationLogicalId({
          accessContext: "user",
          generation: 1,
          plan: plan(),
          relationshipId: "relationship_b" as RelationshipId,
          workspaceId,
        }),
      ),
    ).not.toBe(first);
    expect(
      nutritionActivationCommandRegistryForTests.activationKey(
        nutritionActivationLogicalId({
          accessContext: "user",
          generation: 1,
          plan: plan(),
          relationshipId,
          workspaceId: "workspace_b" as WorkspaceId,
        }),
      ),
    ).not.toBe(first);

    for (let index = 0; index < 80; index += 1) {
      nutritionActivationCommandRegistryForTests.activationKey(
        `other-${index}`,
      );
    }

    expect(nutritionActivationCommandRegistryForTests.activationKey(base)).toBe(
      first,
    );
  });

  test("fails closed instead of evicting retry-critical activation keys when capacity is exhausted", () => {
    for (let index = 0; index < 64; index += 1) {
      const logicalId = `critical-${index}`;
      nutritionActivationCommandRegistryForTests.activationKey(logicalId);
      nutritionActivationCommandRegistryForTests.markActivationAmbiguous(
        logicalId,
      );
    }

    expect(() =>
      nutritionActivationCommandRegistryForTests.activationKey("new-command"),
    ).toThrow(/capacity exhausted/);
    expect(
      nutritionActivationCommandRegistryForTests.activationKey("critical-0"),
    ).toBe("activation-key-1");
  });

  test("retires activation key after definitive completion", () => {
    mocks.createIdempotencyKey
      .mockReturnValueOnce("activation-key-1")
      .mockReturnValueOnce("activation-key-2");
    const logicalId = nutritionActivationLogicalId({
      accessContext: "user",
      generation: 1,
      plan: plan(),
      relationshipId,
      workspaceId,
    });

    expect(
      nutritionActivationCommandRegistryForTests.activationKey(logicalId),
    ).toBe("activation-key-1");
    nutritionActivationCommandRegistryForTests.retireActivationKey(logicalId);
    expect(
      nutritionActivationCommandRegistryForTests.activationKey(logicalId),
    ).toBe("activation-key-2");
  });

  test("does not create a new activation key after idempotency reuse error", async () => {
    mocks.authSession.apiClient.request.mockImplementation(
      (request: { body?: unknown; idempotencyKey?: string; path: string }) => {
        if (request.path.endsWith("/activate")) {
          throw new ApiError({
            code: "IDEMPOTENCY_KEY_REUSED",
            kind: "backend",
            message: "key reused",
            status: 409,
          });
        }
        return nutritionResponse(request.path);
      },
    );

    renderNutrition();
    fireEvent.click(screen.getByRole("tab", { name: "Plans" }));
    const activate = await screen.findByRole("button", { name: "Activate" });
    fireEvent.click(activate);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(activate);

    await waitFor(() =>
      expect(
        mocks.authSession.apiClient.request.mock.calls.filter((call) =>
          String(call[0].path).endsWith("/activate"),
        ),
      ).toHaveLength(2),
    );
    expect(mocks.createIdempotencyKey).toHaveBeenCalledTimes(1);
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
    return Promise.resolve({ data: [plan(currentPlanInput)] });
  }
  if (path.endsWith(`/nutrition-plans/${planId}`)) {
    return Promise.resolve({
      data: { plan: plan(currentPlanInput), revision: revision() },
    });
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
