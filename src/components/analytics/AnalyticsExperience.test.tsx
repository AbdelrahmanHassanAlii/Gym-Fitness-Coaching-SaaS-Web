/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthState } from "@/lib/auth";
import type { PermissionKey } from "@/contracts";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import {
  AnalyticsExperience,
  analyticsDataPermissions,
  analyticsRouteAPermissions,
} from "./AnalyticsExperience";
import { currentUserDecisionRequestsForPath } from "@/components/staff-shell/StaffShell";

const mocks = vi.hoisted(() => ({
  auth: {
    apiClient: { request: vi.fn() },
    generation: 1,
    state: {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        emailVerified: true,
        firstName: "A",
        id: "user_a",
        lastName: "User",
        phoneVerified: false,
      },
    } as AuthState,
  },
  staff: null as StaffWorkspaceContextValue | null,
}));
vi.mock("@/lib/auth", () => ({ useAuthSession: () => mocks.auth }));
vi.mock("@/lib/staff-shell", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/staff-shell")>(
      "@/lib/staff-shell",
    );
  return { ...actual, useStaffWorkspaceContext: () => mocks.staff };
});

describe("analytics experience", () => {
  beforeEach(() => {
    mocks.auth.apiClient.request.mockReset();
    mocks.staff = context([]);
  });

  test("freezes Route A at base 10 plus seven analytics additions", () => {
    expect(analyticsRouteAPermissions).toHaveLength(17);
    expect(new Set(analyticsRouteAPermissions)).toHaveLength(17);
    expect(analyticsDataPermissions).toHaveLength(7);
    expect(analyticsRouteAPermissions).toEqual(
      [...analyticsRouteAPermissions].sort(),
    );
    expect(analyticsRouteAPermissions).toContain("metric_definitions.read");
    expect(
      currentUserDecisionRequestsForPath("/app/analytics")
        .map((item) => item.permission)
        .sort(),
    ).toEqual([...analyticsRouteAPermissions]);
  });

  test("support, unresolved, and all-data-denied states fetch nothing", () => {
    mocks.staff = context(analyticsRouteAPermissions, "support");
    const support = renderExperience();
    expect(
      screen.getByText(messages.en.analyticsExperience.support),
    ).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).not.toHaveBeenCalled();
    support.unmount();

    mocks.staff = context(analyticsRouteAPermissions, "user", "unresolved");
    const unresolved = renderExperience();
    expect(mocks.auth.apiClient.request).not.toHaveBeenCalled();
    unresolved.unmount();

    mocks.staff = context(["trainees.read", "metric_definitions.read"]);
    renderExperience();
    expect(
      screen.getByText(messages.en.analyticsExperience.denied),
    ).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).not.toHaveBeenCalled();
  });

  test("relationship and progress AND-gates do not use missing or stale targets", async () => {
    mocks.staff = context([
      "dashboard.relationship.read",
      "analytics.training.read",
    ]);
    const noSelector = renderExperience();
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).not.toHaveBeenCalled(),
    );
    noSelector.unmount();

    mocks.auth.apiClient.request.mockReset();
    mocks.staff = context(["analytics.progress.read", "trainees.read"]);
    mocks.auth.apiClient.request.mockResolvedValueOnce({ data: [] });
    renderExperience();
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1),
    );
    expect(
      String(mocks.auth.apiClient.request.mock.calls[0]?.[0].path),
    ).toContain("/relationships");
    expect(
      JSON.stringify(mocks.auth.apiClient.request.mock.calls),
    ).not.toContain("metric-definitions");
    expect(
      JSON.stringify(mocks.auth.apiClient.request.mock.calls),
    ).not.toContain("analytics/progress");
  });

  test("uses a validated two-phase gym read before activity continuation", async () => {
    mocks.staff = context(["dashboard.gym.read"]);
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({ data: gym(true, "next-activity") })
      .mockResolvedValueOnce({ data: gym(true, null) });
    renderExperience();
    await screen.findByRole("heading", { name: "Gym dashboard" });
    const first = mocks.auth.apiClient.request.mock.calls[0]?.[0];
    expect(first.path).toBe("/workspaces/workspace_a/dashboard/gym");
    expect(first).not.toHaveProperty("body");
    expect(first).not.toHaveProperty("idempotencyKey");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(2),
    );
    expect(mocks.auth.apiClient.request.mock.calls[1]?.[0].path).toContain(
      "activityCategory=WORKOUT_COMPLETED",
    );
    expect(mocks.auth.apiClient.request.mock.calls[1]?.[0].path).toContain(
      "activityCursor=next-activity",
    );
  });

  test("does not expose recent activity when authoritative scope is not pure", async () => {
    mocks.staff = context(["dashboard.gym.read"]);
    mocks.auth.apiClient.request.mockResolvedValueOnce({
      data: gym(false, "cursor"),
    });
    renderExperience();
    await screen.findByRole("heading", { name: "Gym dashboard" });
    expect(
      screen.queryByRole("heading", { name: "Recent activity" }),
    ).not.toBeInTheDocument();
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1);
  });
});

function renderExperience() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsExperience
        labels={messages.en.analyticsExperience}
        locale="en"
      />
    </QueryClientProvider>,
  );
}
function context(
  allowed: readonly PermissionKey[],
  accessContext: "support" | "user" = "user",
  status: "ready" | "unresolved" = "ready",
): StaffWorkspaceContextValue {
  const decisions = analyticsRouteAPermissions.map((permission) => ({
    allowed: allowed.includes(permission),
    effect: allowed.includes(permission)
      ? ("ALLOW" as const)
      : ("DENY" as const),
    permission,
    scope: { type: "WORKSPACE" as const },
    source: "NONE" as const,
  }));
  const workspace = {
    accessVersion: 7,
    membershipId: "membership_a" as never,
    roles: ["TRAINER" as const],
    workspaceId: "workspace_a" as never,
    workspaceName: "Gym",
    workspaceTimezone: "Africa/Cairo",
  };
  return {
    accessFacts: {
      accessContext,
      context: "WORKSPACE",
      decisions,
      membershipId: workspace.membershipId,
      sessionGeneration: 1,
      status,
      workspaceId: workspace.workspaceId,
    },
    shellContext: {
      accessContext,
      branch: { branchId: null, label: "All" },
      portal: "gym-staff",
      sessionGeneration: 1,
      workspace,
    },
    workspace,
  };
}
function gym(pureWorkspaceWide: boolean, nextCursor: string | null) {
  const category = {
    count: null,
    hasMore: nextCursor !== null,
    items: [
      {
        relationshipId: "relationship_a",
        traineeDisplay: null,
        occurredAt: "2026-03-09T03:00:00.000Z",
        summary: "Workout completed",
      },
    ],
    nextCursor,
  };
  return {
    workspaceId: "workspace_a",
    generatedAt: "2026-03-09T04:00:00.000Z",
    window: {
      from: "2026-03-08T05:00:00.000Z",
      to: "2026-03-09T04:00:00.000Z",
      timezone: "America/New_York",
    },
    scope: {
      pureWorkspaceWide,
      assignedTrainees: false,
      self: false,
      includeBranchIds: [],
      excludeBranchIds: [],
      includeRelationshipIds: [],
      excludeRelationshipIds: [],
    },
    summary: { activeTrainees: 1 },
    branchBreakdown: { items: [], hasMore: false, nextCursor: null },
    needsAttention: {},
    recentActivity: { WORKOUT_COMPLETED: category },
  };
}
