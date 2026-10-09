/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthState } from "@/lib/auth";
import { isRelationshipDashboardDto, type PermissionKey } from "@/contracts";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import {
  AnalyticsExperience,
  analyticsDataPermissions,
  analyticsRouteAPermissions,
} from "./AnalyticsExperience";
import { currentUserDecisionRequestsForPath } from "@/components/staff-shell/StaffShell";
import { ApiError } from "@/lib/api";

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
    mocks.auth.apiClient.request.mockResolvedValueOnce({
      data: { data: [], meta: { hasMore: false, nextCursor: null } },
    });
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
    fireEvent.click(screen.getAllByRole("button", { name: "Load more" })[0]!);
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

  test("preserves branch scope through attention continuation and cursor recovery", async () => {
    mocks.staff = context(["dashboard.gym.read"], "user", "ready", "branch_b");
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: gym(false, null, {
          CHECKIN_OVERDUE: attentionPage(
            "relationship_a",
            "cursor-a",
            "CHECKIN_OVERDUE",
          ),
          NO_ACTIVE_PROGRAM: attentionPage("relationship_b", "cursor-b"),
        }),
      })
      .mockRejectedValueOnce(
        new ApiError({
          code: "ATTENTION_CURSOR_INVALID",
          kind: "backend",
          message: "invalid cursor",
          status: 422,
        }),
      )
      .mockResolvedValueOnce({
        data: gym(false, null, {
          CHECKIN_OVERDUE: attentionPage(
            "relationship_reset",
            null,
            "CHECKIN_OVERDUE",
          ),
        }),
      })
      .mockResolvedValueOnce({
        data: gym(false, null, {
          NO_ACTIVE_PROGRAM: attentionPage("relationship_b2", null),
        }),
      });

    renderExperience();
    await screen.findByRole("heading", { name: "Gym dashboard" });
    fireEvent.click(screen.getAllByRole("button", { name: "Load more" })[0]!);
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(3),
    );
    const paths = mocks.auth.apiClient.request.mock.calls.map(([call]) =>
      String(call.path),
    );
    expect(paths[0]).toBe(
      "/workspaces/workspace_a/dashboard/gym?branchId=branch_b",
    );
    expect(paths[1]).toContain("attentionCategory=CHECKIN_OVERDUE");
    expect(paths[1]).toContain("attentionCursor=cursor-a");
    expect(paths[2]).toContain("attentionCategory=CHECKIN_OVERDUE");
    expect(paths[2]).not.toContain("attentionCursor=");
    expect(paths.every((path) => path.includes("branchId=branch_b"))).toBe(
      true,
    );
    expect(screen.getByText(/relationship_b/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(/relationship_b2/);
    const siblingPath = String(
      mocks.auth.apiClient.request.mock.calls.at(-1)?.[0].path,
    );
    expect(siblingPath).toContain("attentionCategory=NO_ACTIVE_PROGRAM");
    expect(siblingPath).toContain("attentionCursor=cursor-b");
    expect(siblingPath).toContain("branchId=branch_b");
  });

  test("discards a stale attention reset error after refresh", async () => {
    mocks.staff = context(["dashboard.gym.read"]);
    const staleReset = deferred<{ data: ReturnType<typeof gym> }>();
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: gym(false, null, {
          CHECKIN_OVERDUE: attentionPage(
            "relationship_old",
            "cursor-old",
            "CHECKIN_OVERDUE",
          ),
          NO_ACTIVE_PROGRAM: attentionPage("relationship_sibling", null),
        }),
      })
      .mockRejectedValueOnce(
        new ApiError({
          code: "ATTENTION_CURSOR_INVALID",
          kind: "backend",
          message: "invalid cursor",
          status: 422,
        }),
      )
      .mockImplementationOnce(() => staleReset.promise)
      .mockResolvedValueOnce({
        data: gym(false, null, {
          CHECKIN_OVERDUE: attentionPage(
            "relationship_fresh",
            null,
            "CHECKIN_OVERDUE",
          ),
          NO_ACTIVE_PROGRAM: attentionPage("relationship_sibling", null),
        }),
      });

    renderExperience();
    await screen.findByText(/relationship_old/);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(3),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/relationship_fresh/);
    await act(async () => {
      staleReset.reject(
        new ApiError({ kind: "network", message: "stale reset failed" }),
      );
      await staleReset.promise.catch(() => undefined);
    });
    expect(screen.getByText(/relationship_fresh/)).toBeInTheDocument();
    expect(screen.getByText(/relationship_sibling/)).toBeInTheDocument();
    expect(
      screen.queryByText("Analytics are unavailable."),
    ).not.toBeInTheDocument();
  });

  test("keeps parallel attention category completions atomically", async () => {
    mocks.staff = context(["dashboard.gym.read"]);
    const first = deferred<{ data: ReturnType<typeof gym> }>();
    const second = deferred<{ data: ReturnType<typeof gym> }>();
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      if (!String(path).includes("attentionCategory="))
        return Promise.resolve({
          data: gym(false, null, {
            CHECKIN_OVERDUE: attentionPage(
              "relationship_a",
              "cursor-a",
              "CHECKIN_OVERDUE",
            ),
            NO_ACTIVE_PROGRAM: attentionPage("relationship_b", "cursor-b"),
          }),
        });
      return String(path).includes("CHECKIN_OVERDUE")
        ? first.promise
        : second.promise;
    });

    renderExperience();
    await screen.findByRole("heading", { name: "Gym dashboard" });
    const buttons = screen.getAllByRole("button", { name: "Load more" });
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    expect(screen.getByText("Loading more analytics...")).toHaveAttribute(
      "role",
      "status",
    );
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(3),
    );
    const continuationPaths = mocks.auth.apiClient.request.mock.calls
      .map(([call]) => String(call.path))
      .filter((path) => path.includes("attentionCursor="));
    expect(continuationPaths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "attentionCategory=CHECKIN_OVERDUE&attentionCursor=cursor-a",
        ),
        expect.stringContaining(
          "attentionCategory=NO_ACTIVE_PROGRAM&attentionCursor=cursor-b",
        ),
      ]),
    );
    await act(async () => {
      first.resolve({
        data: gym(false, null, {
          CHECKIN_OVERDUE: attentionPage(
            "relationship_a2",
            null,
            "CHECKIN_OVERDUE",
          ),
        }),
      });
      await first.promise;
    });
    await act(async () => {
      second.resolve({
        data: gym(false, null, {
          NO_ACTIVE_PROGRAM: attentionPage("relationship_b2", null),
        }),
      });
      await second.promise;
    });
    expect(screen.getByText(/relationship_a2/)).toBeInTheDocument();
    expect(screen.getByText(/relationship_b2/)).toBeInTheDocument();
  });

  test("makes WORKSPACE_INACTIVE a whole-page unavailable state", async () => {
    mocks.staff = context(["dashboard.gym.read"]);
    mocks.auth.apiClient.request.mockRejectedValue(
      new ApiError({
        code: "WORKSPACE_INACTIVE",
        kind: "backend",
        message: "inactive",
        status: 409,
      }),
    );
    renderExperience();
    expect(
      await screen.findByRole("heading", {
        name: messages.en.analyticsExperience.workspaceInactive,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Gym dashboard" }),
    ).not.toBeInTheDocument();
  });

  test("loads and renders Backend-authorized relationship sections", async () => {
    mocks.staff = context([
      "trainees.read",
      "dashboard.relationship.read",
      "analytics.training.read",
      "analytics.nutrition.read",
      "analytics.adherence.read",
    ]);
    expect(isRelationshipDashboardDto(relationshipDashboard())).toBe(true);
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (value.endsWith("/relationships"))
        return Promise.resolve(relationshipsEnvelope());
      if (value.endsWith("/dashboard"))
        return Promise.resolve({ data: relationshipDashboard() });
      if (value.includes("/analytics/training"))
        return Promise.resolve({ data: trainingAnalytics() });
      if (value.includes("/analytics/nutrition"))
        return Promise.resolve({ data: nutritionAnalytics() });
      if (value.includes("/analytics/adherence"))
        return Promise.resolve({ data: adherenceAnalytics() });
      throw new Error(`unexpected request ${value}`);
    });
    renderExperience();
    await screen.findByRole("option", { name: "relationship_a · Active" });
    fireEvent.change(
      screen.getByLabelText(messages.en.analyticsExperience.relationship),
      { target: { value: "relationship_a" } },
    );
    await waitFor(() =>
      expect(
        mocks.auth.apiClient.request.mock.calls.some(([call]) =>
          String(call.path).endsWith("/dashboard"),
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByRole("heading", { name: "Relationship dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { name: "Training analytics" }),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole("heading", { name: "Check-ins" }),
    ).not.toHaveLength(0);
    expect(
      screen.getByText(/PRIMARY_TRAINER|Primary trainer/),
    ).toBeInTheDocument();
  });

  test("does not render relationship sections hidden by Backend visibility", async () => {
    mocks.staff = context(["trainees.read", "dashboard.relationship.read"]);
    mocks.auth.apiClient.request.mockImplementation(({ path }) =>
      String(path).endsWith("/relationships")
        ? Promise.resolve(relationshipsEnvelope())
        : Promise.resolve({
            data: {
              ...relationshipDashboard(),
              nutrition: nutritionAnalytics(),
            },
          }),
    );
    renderExperience();
    await selectRelationship();
    await screen.findByRole("heading", { name: "Relationship dashboard" });
    expect(
      screen.queryByRole("heading", { name: "Nutrition analytics" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Training analytics" }),
    ).toBeInTheDocument();
  });

  test("QA-019 loads more than 500 progress points through the experience seam", async () => {
    mocks.staff = context([
      "trainees.read",
      "metric_definitions.read",
      "analytics.progress.read",
    ]);
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (value.endsWith("/relationships"))
        return Promise.resolve(relationshipsEnvelope());
      if (value.includes("/metric-definitions"))
        return Promise.resolve(metricsEnvelope([metric("metric_a")]));
      if (value.includes("/analytics/progress")) {
        const cursorMatch = /cursor=([^&]+)/.exec(value);
        const pageIndex = cursorMatch
          ? Number(cursorMatch[1]!.replace("opaque-page-", ""))
          : 0;
        const start =
          pageIndex === 0 ? 0 : pageIndex === 1 ? 99 : pageIndex * 100 - 1;
        const count = pageIndex === 5 ? 2 : 100;
        return Promise.resolve({
          data: progressAnalytics(
            "metric_a",
            progressPoints(start, count, "metric_a"),
            pageIndex < 5 ? `opaque-page-${pageIndex + 1}` : null,
          ),
        });
      }
      throw new Error(`unexpected request ${value}`);
    });
    renderExperience();
    await selectRelationship();
    await screen.findByRole("option", { name: "Weight" });
    fireEvent.change(screen.getByLabelText("Progress metric"), {
      target: { value: "metric_a" },
    });
    expect(
      await screen.findByRole("heading", { name: "Progress analytics" }),
    ).toBeInTheDocument();

    for (let pageIndex = 1; pageIndex <= 5; pageIndex += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await waitFor(() =>
        expect(
          mocks.auth.apiClient.request.mock.calls.filter(([call]) =>
            String(call.path).includes("/analytics/progress"),
          ),
        ).toHaveLength(pageIndex + 1),
      );
    }
    const table = screen.getByRole("region", {
      name: "Progress analytics: Time series",
    });
    await waitFor(() =>
      expect(table.querySelectorAll("tbody tr")).toHaveLength(501),
    );
    const rowHeaders = within(table).getAllByRole("rowheader");
    expect(rowHeaders[0]).toHaveTextContent("2026-01-01T00:00:00.000Z");
    expect(rowHeaders.at(-1)).toHaveTextContent("2026-01-01T08:20:00.000Z");
    const pointIds = [...table.querySelectorAll("tbody tr")].map((row) =>
      row.getAttribute("data-analytics-row-id"),
    );
    expect(pointIds).toEqual(
      Array.from({ length: 501 }, (_, index) => `point-${index}`),
    );
    expect(new Set(pointIds)).toHaveLength(501);
    const progressPaths = mocks.auth.apiClient.request.mock.calls
      .map(([call]) => String(call.path))
      .filter((path) => path.includes("/analytics/progress"));
    expect(
      progressPaths.slice(1).every((path) => /cursor=opaque-page-/.test(path)),
    ).toBe(true);
  });

  test("QA-020 isolates activity category cursor recovery", async () => {
    mocks.staff = context(["dashboard.gym.read"]);
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: gym(
          true,
          null,
          {},
          {
            WORKOUT_COMPLETED: activityPage("workout-base", "activity-a"),
            PR_ACHIEVED: activityPage("pr-sibling", null),
          },
        ),
      })
      .mockRejectedValueOnce(
        new ApiError({
          code: "ACTIVITY_CURSOR_INVALID",
          kind: "backend",
          message: "invalid cursor",
          status: 422,
        }),
      )
      .mockResolvedValueOnce({
        data: gym(
          true,
          null,
          {},
          {
            WORKOUT_COMPLETED: activityPage("workout-reset", null),
          },
        ),
      });
    renderExperience();
    await screen.findByText(/workout-base/);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(/workout-reset/);
    expect(screen.getByText(/pr-sibling/)).toBeInTheDocument();
    const paths = mocks.auth.apiClient.request.mock.calls.map(([call]) =>
      String(call.path),
    );
    expect(paths[1]).toContain("activityCategory=WORKOUT_COMPLETED");
    expect(paths[1]).toContain("activityCursor=activity-a");
    expect(paths[2]).toContain("activityCategory=WORKOUT_COMPLETED");
    expect(paths[2]).not.toContain("activityCursor=");
    expect(paths.join("|")).not.toContain("activityCategory=PR_ACHIEVED");
  });

  test("keeps parallel activity category completions atomically", async () => {
    mocks.staff = context(["dashboard.gym.read"]);
    const workout = deferred<{ data: ReturnType<typeof gym> }>();
    const pr = deferred<{ data: ReturnType<typeof gym> }>();
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (!value.includes("activityCategory="))
        return Promise.resolve({
          data: gym(
            true,
            null,
            {},
            {
              WORKOUT_COMPLETED: activityPage("workout-base", "activity-a"),
              PR_ACHIEVED: activityPage("pr-base", "activity-b"),
            },
          ),
        });
      return value.includes("WORKOUT_COMPLETED") ? workout.promise : pr.promise;
    });
    renderExperience();
    await screen.findByText(/workout-base/);
    const buttons = screen.getAllByRole("button", { name: "Load more" });
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    await act(async () => {
      workout.resolve({
        data: gym(
          true,
          null,
          {},
          {
            WORKOUT_COMPLETED: activityPage("workout-next", null),
          },
        ),
      });
      await workout.promise;
    });
    await act(async () => {
      pr.resolve({
        data: gym(
          true,
          null,
          {},
          {
            PR_ACHIEVED: activityPage("pr-next", null),
          },
        ),
      });
      await pr.promise;
    });
    expect(screen.getByText(/workout-next/)).toBeInTheDocument();
    expect(screen.getByText(/pr-next/)).toBeInTheDocument();
    const paths = mocks.auth.apiClient.request.mock.calls.map(([call]) =>
      String(call.path),
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "activityCategory=WORKOUT_COMPLETED&activityCursor=activity-a",
        ),
        expect.stringContaining(
          "activityCategory=PR_ACHIEVED&activityCursor=activity-b",
        ),
      ]),
    );
  });

  test("discards a stale progress response after switching metrics", async () => {
    mocks.staff = context([
      "trainees.read",
      "metric_definitions.read",
      "analytics.progress.read",
    ]);
    const metricAResponse = deferred<{
      data: ReturnType<typeof progressAnalytics>;
    }>();
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (value.endsWith("/relationships"))
        return Promise.resolve(relationshipsEnvelope());
      if (value.includes("/metric-definitions"))
        return Promise.resolve(
          metricsEnvelope([metric("metric_a"), metric("metric_b")]),
        );
      if (value.includes("metricDefinitionId=metric_a"))
        return metricAResponse.promise;
      if (value.includes("metricDefinitionId=metric_b"))
        return Promise.resolve({
          data: progressAnalytics(
            "metric_b",
            [
              {
                ...progressPoints(0, 1, "metric_b")[0]!,
                metricKey: "body-fat",
                metricName: "Body fat",
                unit: "%",
                value: 22,
              },
            ],
            null,
          ),
        });
      throw new Error(`unexpected request ${value}`);
    });
    renderExperience();
    await selectRelationship();
    await screen.findByRole("option", { name: "Weight" });
    fireEvent.change(screen.getByLabelText("Progress metric"), {
      target: { value: "metric_a" },
    });
    await waitFor(() => expect(lastProgressPath()).toContain("metric_a"));
    fireEvent.change(screen.getByLabelText("Progress metric"), {
      target: { value: "metric_b" },
    });
    expect(await screen.findByText(/Value: 22/)).toBeInTheDocument();
    await act(async () => {
      metricAResponse.resolve({
        data: progressAnalytics(
          "metric_a",
          progressPoints(0, 1, "metric_a"),
          null,
        ),
      });
      await metricAResponse.promise;
    });
    expect(screen.getByText(/Value: 22/)).toBeInTheDocument();
    expect(screen.queryByText(/Value: 0 · Unit: kg/)).not.toBeInTheDocument();
  });

  test("clears a selected metric only after a current successful selector omission", async () => {
    mocks.staff = context([
      "trainees.read",
      "metric_definitions.read",
      "analytics.progress.read",
    ]);
    let metricRequests = 0;
    let progressRequests = 0;
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (value.endsWith("/relationships"))
        return Promise.resolve(relationshipsEnvelope());
      if (value.includes("/metric-definitions")) {
        metricRequests += 1;
        return Promise.resolve(
          metricRequests === 2
            ? metricsEnvelope([])
            : metricsEnvelope([metric("metric_a")]),
        );
      }
      if (value.includes("/analytics/progress")) {
        progressRequests += 1;
        return Promise.resolve({
          data: progressAnalytics(
            "metric_a",
            progressPoints(0, 1, "metric_a"),
            null,
          ),
        });
      }
      throw new Error(`unexpected request ${value}`);
    });

    renderExperience();
    await selectRelationship();
    await screen.findByRole("option", { name: "Weight" });
    const selector = screen.getByLabelText("Progress metric");
    fireEvent.change(selector, { target: { value: "metric_a" } });
    await screen.findByRole("heading", { name: "Progress analytics" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(selector).toHaveValue(""));
    expect(
      screen.queryByRole("option", { name: "Weight" }),
    ).not.toBeInTheDocument();
    const afterRemoval = progressRequests;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(metricRequests).toBeGreaterThanOrEqual(3));
    expect(progressRequests).toBe(afterRemoval);
    expect(selector).toHaveValue("");
  });

  test("does not clear a current metric for stale or failed selector refreshes", async () => {
    mocks.staff = context([
      "trainees.read",
      "metric_definitions.read",
      "analytics.progress.read",
    ]);
    const staleOmission = deferred<ReturnType<typeof metricsEnvelope>>();
    let metricRequests = 0;
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (value.endsWith("/relationships"))
        return Promise.resolve(relationshipsEnvelope());
      if (value.includes("/metric-definitions")) {
        metricRequests += 1;
        if (metricRequests === 1)
          return Promise.resolve(metricsEnvelope([metric("metric_a")]));
        if (metricRequests === 2) return staleOmission.promise;
        if (metricRequests === 3)
          return Promise.resolve(metricsEnvelope([metric("metric_a")]));
        return Promise.reject(
          new ApiError({ kind: "network", message: "offline" }),
        );
      }
      if (value.includes("/analytics/progress"))
        return Promise.resolve({
          data: progressAnalytics(
            "metric_a",
            progressPoints(0, 1, "metric_a"),
            null,
          ),
        });
      throw new Error(`unexpected request ${value}`);
    });

    renderExperience();
    await selectRelationship();
    await screen.findByRole("option", { name: "Weight" });
    const selector = screen.getByLabelText("Progress metric");
    fireEvent.change(selector, { target: { value: "metric_a" } });
    await screen.findByRole("heading", { name: "Progress analytics" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(metricRequests).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(metricRequests).toBe(3));
    expect(selector).toHaveValue("metric_a");
    await act(async () => {
      staleOmission.resolve(metricsEnvelope([]));
      await staleOmission.promise;
    });
    expect(selector).toHaveValue("metric_a");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("button", { name: "Retry" });
    expect(selector).toHaveValue("metric_a");
  });

  test("localizes nested Arabic analytics fields without translating Backend summaries", async () => {
    mocks.staff = context([
      "dashboard.gym.read",
      "trainees.read",
      "dashboard.relationship.read",
    ]);
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (value.endsWith("/relationships"))
        return Promise.resolve(relationshipsEnvelope());
      if (value.endsWith("/dashboard/gym"))
        return Promise.resolve({ data: gym(true, null) });
      if (value.endsWith("/dashboard"))
        return Promise.resolve({
          data: {
            ...relationshipDashboard(),
            progress: progressAnalytics(
              "metric_a",
              progressPoints(0, 1, "metric_a"),
              null,
            ),
            adherence: {
              ...adherenceAnalytics(),
              water: {
                daysTracked: 1,
                averageMl: 1_500,
                targetMl: 2_000,
              },
            },
          },
        });
      throw new Error(`unexpected request ${value}`);
    });

    renderExperience("ar");
    await waitFor(() =>
      expect(document.body).toHaveTextContent("Workout completed"),
    );
    await screen.findByRole("option", {
      name: `relationship_a · ${messages.ar.analyticsExperience.value_ACTIVE}`,
    });
    fireEvent.change(
      screen.getByLabelText(messages.ar.analyticsExperience.relationship),
      { target: { value: "relationship_a" } },
    );
    await screen.findByRole("heading", {
      name: messages.ar.analyticsExperience.relationshipDashboard,
    });
    expect(document.body).toHaveTextContent("متوسط كمية الماء");
    expect(document.body).toHaveTextContent("وقت القياس");
    expect(document.body).not.toHaveTextContent("averageMl");
    expect(document.body).not.toHaveTextContent("measuredAt");
    expect(document.body).toHaveTextContent("Workout completed");
  });

  test("explicit refresh retires an older dashboard continuation", async () => {
    mocks.staff = context(["dashboard.gym.read"]);
    const oldContinuation = deferred<{ data: ReturnType<typeof gym> }>();
    let calls = 0;
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      calls += 1;
      if (String(path).includes("attentionCursor="))
        return oldContinuation.promise;
      return Promise.resolve({
        data: gym(false, null, {
          CHECKIN_OVERDUE: attentionPage(
            calls === 1 ? "base-before-refresh" : "fresh-after-refresh",
            calls === 1 ? "old-cursor" : null,
            "CHECKIN_OVERDUE",
          ),
        }),
      });
    });
    renderExperience();
    await screen.findByText(/base-before-refresh/);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/fresh-after-refresh/);
    await act(async () => {
      oldContinuation.resolve({
        data: gym(false, null, {
          CHECKIN_OVERDUE: attentionPage(
            "stale-after-refresh",
            null,
            "CHECKIN_OVERDUE",
          ),
        }),
      });
      await oldContinuation.promise;
    });
    expect(screen.queryByText(/stale-after-refresh/)).not.toBeInTheDocument();
    expect(screen.getByText(/fresh-after-refresh/)).toBeInTheDocument();
  });

  test("explicit refresh retires an older progress continuation", async () => {
    mocks.staff = context([
      "trainees.read",
      "metric_definitions.read",
      "analytics.progress.read",
    ]);
    const oldContinuation = deferred<{
      data: ReturnType<typeof progressAnalytics>;
    }>();
    let baseRequests = 0;
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (value.endsWith("/relationships"))
        return Promise.resolve(relationshipsEnvelope());
      if (value.includes("/metric-definitions"))
        return Promise.resolve(metricsEnvelope([metric("metric_a")]));
      if (value.includes("cursor=progress-old")) return oldContinuation.promise;
      if (value.includes("/analytics/progress")) {
        baseRequests += 1;
        return Promise.resolve({
          data: progressAnalytics(
            "metric_a",
            [
              {
                ...progressPoints(0, 1, "metric_a")[0]!,
                value: baseRequests === 1 ? 10 : 999,
              },
            ],
            baseRequests === 1 ? "progress-old" : null,
          ),
        });
      }
      throw new Error(`unexpected request ${value}`);
    });
    renderExperience();
    await selectRelationship();
    await screen.findByRole("option", { name: "Weight" });
    fireEvent.change(screen.getByLabelText("Progress metric"), {
      target: { value: "metric_a" },
    });
    await screen.findByText(/Value: 10/);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/Value: 999/);
    await act(async () => {
      oldContinuation.resolve({
        data: progressAnalytics(
          "metric_a",
          [
            {
              ...progressPoints(1, 1, "metric_a")[0]!,
              value: 111,
            },
          ],
          null,
        ),
      });
      await oldContinuation.promise;
    });
    expect(screen.queryByText(/Value: 111/)).not.toBeInTheDocument();
    expect(screen.getByText(/Value: 999/)).toBeInTheDocument();
  });

  test("surfaces targeted errors without converting 403 into logout", async () => {
    mocks.staff = context(["trainees.read", "analytics.training.read"]);
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (value.endsWith("/relationships"))
        return Promise.resolve(relationshipsEnvelope());
      return Promise.reject(
        new ApiError({
          code: "PERMISSION_DENIED",
          kind: "backend",
          message: "denied",
          status: 403,
        }),
      );
    });
    renderExperience();
    await selectRelationship();
    expect(
      await screen.findByRole("alert", {
        name: "",
      }),
    ).toHaveTextContent("Training analytics: You do not have access");
    expect(mocks.auth.state.status).toBe("authenticated");
  });

  test("retains valid data and exposes retry after a network refresh failure", async () => {
    mocks.staff = context(["dashboard.gym.read"]);
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({ data: gym(false, null) })
      .mockRejectedValueOnce(
        new ApiError({ kind: "network", message: "offline" }),
      );
    renderExperience();
    await screen.findByRole("heading", { name: "Gym dashboard" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Gym dashboard" }),
    ).toBeInTheDocument();
  });

  test("QA-027 sends calendar dates and renders authoritative DST ranges", async () => {
    mocks.staff = context(["trainees.read", "analytics.training.read"]);
    const longRange = {
      from: "2026-11-01T04:00:00.000Z",
      to: "2026-11-02T05:00:00.000Z",
      timezone: "America/New_York",
    };
    mocks.auth.apiClient.request.mockImplementation(({ path }) => {
      const value = String(path);
      if (value.endsWith("/relationships"))
        return Promise.resolve(relationshipsEnvelope());
      return Promise.resolve({
        data: {
          ...trainingAnalytics(),
          range: value.includes("from=2026-11-01")
            ? longRange
            : authoritativeRange,
        },
      });
    });
    renderExperience();
    await selectRelationship();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-03-08" },
    });
    fireEvent.change(screen.getByLabelText("To (exclusive)"), {
      target: { value: "2026-03-09" },
    });
    await waitFor(() =>
      expect(lastTrainingPath()).toContain(
        "from=2026-03-08&granularity=day&to=2026-03-09",
      ),
    );
    expect(
      await screen.findByText(
        /2026-03-08T05:00:00.000Z.*2026-03-09T04:00:00.000Z/,
      ),
    ).toHaveTextContent("America/New_York");

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("To (exclusive)"), {
      target: { value: "2026-11-02" },
    });
    await waitFor(() =>
      expect(lastTrainingPath()).toContain(
        "from=2026-11-01&granularity=day&to=2026-11-02",
      ),
    );
    expect(
      await screen.findByText(
        /2026-11-01T04:00:00.000Z.*2026-11-02T05:00:00.000Z/,
      ),
    ).toHaveTextContent("America/New_York");
    expect(screen.getByText(/end date is exclusive/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("To (exclusive)"), {
      target: { value: "2027-01-01" },
    });
    await waitFor(() =>
      expect(lastTrainingPath()).toContain(
        "from=2026-01-01&granularity=day&to=2027-01-01",
      ),
    );
    fireEvent.change(screen.getByLabelText("To (exclusive)"), {
      target: { value: "2027-01-02" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.analyticsExperience.invalidRange,
    );
    expect(
      mocks.auth.apiClient.request.mock.calls
        .map(([call]) => String(call.path))
        .some((path) =>
          path.includes("from=2026-01-01&granularity=day&to=2027-01-02"),
        ),
    ).toBe(false);
  });
});

function renderExperience(locale: "ar" | "en" = "en") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsExperience
        labels={messages[locale].analyticsExperience}
        locale={locale}
      />
    </QueryClientProvider>,
  );
}
async function selectRelationship() {
  await screen.findByRole("option", { name: "relationship_a · Active" });
  fireEvent.change(screen.getByLabelText("Trainee relationship"), {
    target: { value: "relationship_a" },
  });
}
function lastTrainingPath() {
  return String(
    mocks.auth.apiClient.request.mock.calls
      .map(([call]) => call)
      .filter((call) => String(call.path).includes("/analytics/training"))
      .at(-1)?.path ?? "",
  );
}
function lastProgressPath() {
  return String(
    mocks.auth.apiClient.request.mock.calls
      .map(([call]) => call)
      .filter((call) => String(call.path).includes("/analytics/progress"))
      .at(-1)?.path ?? "",
  );
}
function context(
  allowed: readonly PermissionKey[],
  accessContext: "support" | "user" = "user",
  status: "ready" | "unresolved" = "ready",
  branchId: string | null = null,
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
      branch: { branchId: branchId as never, label: branchId ?? "All" },
      portal: "gym-staff",
      sessionGeneration: 1,
      workspace,
    },
    workspace,
  };
}
function gym(
  pureWorkspaceWide: boolean,
  nextCursor: string | null,
  needsAttention: Record<string, ReturnType<typeof attentionPage>> = {},
  recentActivity?: Record<string, ReturnType<typeof activityPage>> | null,
) {
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
    summary: {
      activeTrainees: 1,
      needsReassignment: 0,
      activeStaff: 1,
      completedWorkouts: 1,
      overdueCheckIns: 0,
      pendingReviewCheckIns: 0,
    },
    branchBreakdown: { items: [], hasMore: false, nextCursor: null },
    needsAttention,
    recentActivity:
      recentActivity === undefined
        ? { WORKOUT_COMPLETED: category }
        : recentActivity,
  };
}

function attentionPage(
  relationshipId: string,
  nextCursor: string | null,
  category = "NO_ACTIVE_PROGRAM",
) {
  return {
    count: null,
    hasMore: nextCursor !== null,
    items: [
      category === "CHECKIN_OVERDUE"
        ? {
            relationshipId,
            checkInId: `checkin-${relationshipId}`,
            dueAt: "2026-03-09T03:00:00.000Z",
            severity: "high" as const,
          }
        : { relationshipId, severity: "medium" as const },
    ],
    nextCursor,
  };
}

function activityPage(summary: string, nextCursor: string | null) {
  return {
    count: null,
    hasMore: nextCursor !== null,
    items: [
      {
        relationshipId: "relationship_a",
        traineeDisplay: null,
        occurredAt: "2026-03-09T03:00:00.000Z",
        summary,
      },
    ],
    nextCursor,
  };
}

function relationshipsEnvelope() {
  return {
    data: {
      data: [
        {
          id: "relationship_a",
          workspaceId: "workspace_a",
          traineeUserId: "trainee_a",
          status: "ACTIVE",
          engagementPeriods: [],
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      meta: { hasMore: false, nextCursor: null },
    },
  };
}

function metric(id: string) {
  return {
    id,
    scope: "SYSTEM",
    name: id === "metric_a" ? "Weight" : "Body fat",
    valueType: "NUMBER",
    unit: id === "metric_a" ? "kg" : "%",
    category: "BODY",
    status: "ACTIVE",
    version: 1,
  };
}

function metricsEnvelope(items: ReturnType<typeof metric>[]) {
  return { data: items, nextCursor: undefined };
}

function progressPoints(
  start: number,
  count: number,
  metricDefinitionId: string,
) {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: `point-${index}`,
      value: index,
      unit: "kg",
      metricDefinitionId,
      metricKey: "weight",
      metricName: "Weight",
      measuredAt: new Date(base + index * 60_000).toISOString(),
    };
  });
}

function progressAnalytics(
  metricDefinitionId: string,
  points: ReturnType<typeof progressPoints>,
  nextCursor: string | null,
) {
  return {
    workspaceId: "workspace_a",
    relationshipId: "relationship_a",
    range: authoritativeRange,
    metricDefinitionId,
    summary: {
      firstInWindow: points[0] ?? null,
      latestInWindow: points.at(-1) ?? null,
      latest: points.at(-1) ?? null,
      delta: null,
      percentChange: null,
    },
    points,
    page: { hasMore: nextCursor !== null, nextCursor },
    buckets: [],
    photoSummary: { count: 0 },
  };
}

const authoritativeRange = {
  from: "2026-03-08T05:00:00.000Z",
  to: "2026-03-09T04:00:00.000Z",
  timezone: "America/New_York",
};

function trainingAnalytics() {
  return {
    workspaceId: "workspace_a",
    relationshipId: "relationship_a",
    range: authoritativeRange,
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

function nutritionAnalytics() {
  return {
    workspaceId: "workspace_a",
    relationshipId: "relationship_a",
    range: authoritativeRange,
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
    range: authoritativeRange,
    granularity: "day",
    training: trainingAnalytics().summary,
    checkIns: {
      dueCount: 1,
      submittedOrReviewedCount: 1,
      complianceRate: 1,
    },
    nutrition: null,
    water: null,
    series: [],
  };
}

function relationshipDashboard() {
  return {
    workspaceId: "workspace_a",
    relationshipId: "relationship_a",
    generatedAt: "2026-03-09T04:00:00.000Z",
    relationship: { status: "ACTIVE", homeBranchId: null },
    assignedStaff: [
      {
        assignmentType: "PRIMARY_TRAINER",
        startedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    training: trainingAnalytics(),
    nutrition: null,
    progress: null,
    checkIns: {
      dueCount: 1,
      submittedOrReviewedCount: 1,
      complianceRate: 1,
    },
    adherence: adherenceAnalytics(),
    needsAttention: {
      NO_ACTIVE_PROGRAM: attentionPage("relationship_a", null),
    },
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
