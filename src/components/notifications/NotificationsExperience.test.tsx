import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthState } from "@/lib/auth";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import { notificationCommandRegistry } from "@/lib/notifications";
import { NotificationsExperience } from "./NotificationsExperience";

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

const firstPage = {
  data: [
    notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
    notification("older", "2026-01-02T00:00:00Z", null, "DOCUMENT_UPLOADED"),
  ],
  page: { nextCursor: "next" },
};

describe("notification center", () => {
  beforeEach(() => {
    notificationCommandRegistry.resetForTests();
    mocks.auth.generation = 1;
    mocks.auth.apiClient.request.mockReset();
    mocks.staff = staffContext("user", "ready");
  });

  test("does not fetch unresolved or support identities, but fetches when every base decision is denied and current", async () => {
    mocks.staff = staffContext("support", "ready");
    const support = renderExperience();
    expect(
      screen.getByText(messages.en.notifications.errors.support),
    ).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).not.toHaveBeenCalled();
    support.unmount();

    mocks.staff = staffContext("user", "unresolved");
    const unresolved = renderExperience();
    expect(mocks.auth.apiClient.request).not.toHaveBeenCalled();
    unresolved.unmount();

    mocks.staff = staffContext("user", "ready");
    mocks.auth.apiClient.request.mockResolvedValueOnce({
      data: [],
      page: { nextCursor: null },
    });
    renderExperience();
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1),
    );
  });

  test("merges a refreshed first page with older pages without duplicates", async () => {
    mocks.auth.apiClient.request
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({
        data: [
          notification(
            "older",
            "2026-01-02T00:00:00Z",
            null,
            "DOCUMENT_UPLOADED",
          ),
          notification("oldest", "2026-01-01T00:00:00Z", null, "UNKNOWN"),
        ],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({
        data: [
          notification("latest", "2026-01-04T00:00:00Z", null, "CHECK_IN_DUE"),
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: "next" },
      });
    renderExperience();
    await screen.findByText("new title");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("oldest title");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("latest title");
    expect(screen.getAllByText("older title")).toHaveLength(1);
    expect(screen.getByText("oldest title")).toBeInTheDocument();
  });

  test("shows only safe existing top-level links for allowed matching-workspace notifications", async () => {
    mocks.staff = staffContext("user", "ready", true);
    mocks.auth.apiClient.request.mockResolvedValueOnce({
      data: [
        notification(
          "training",
          "2026-01-03T00:00:00Z",
          null,
          "PROGRAM_ACTIVATED",
        ),
        {
          ...notification(
            "cross",
            "2026-01-02T00:00:00Z",
            null,
            "DOCUMENT_UPLOADED",
          ),
          workspaceId: "workspace_b",
        },
        notification("unknown", "2026-01-01T00:00:00Z", null, "UNKNOWN"),
      ],
      page: { nextCursor: null },
    });
    renderExperience();
    expect(
      await screen.findByRole("link", { name: "Open destination" }),
    ).toHaveAttribute("href", "/app/training");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(document.body.innerHTML).not.toContain("relationshipId=");
  });

  test("mark-one has no fake success or automatic replay after ambiguity", async () => {
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      })
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      });
    renderExperience();
    fireEvent.click(await screen.findByRole("button", { name: "Mark read" }));
    expect(
      await screen.findByText(
        messages.en.notifications.errors.markOneAmbiguous,
      ),
    ).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Check-in · Unread/)).toBeInTheDocument();
  });

  test("mark-all requires confirmation and ambiguity never automatically establishes a second cutoff", async () => {
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      })
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      });
    renderExperience();
    await screen.findByText("new title");
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm mark all" }));
    expect(
      await screen.findByText(
        messages.en.notifications.errors.markAllAmbiguous,
      ),
    ).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(3);
  });

  test("never exposes delivery retry, provider, or cancellation details", async () => {
    mocks.auth.apiClient.request.mockResolvedValueOnce({
      data: [
        {
          ...notification(
            "failed_retryable",
            "2026-01-03T00:00:00Z",
            null,
            "CHECK_IN_DUE",
          ),
          body: "A check-in needs attention.",
          title: "First fixture notification",
        },
        {
          ...notification(
            "cancelled",
            "2026-01-02T00:00:00Z",
            null,
            "CHECK_IN_DUE",
          ),
          body: "Another check-in needs attention.",
          title: "Second fixture notification",
        },
      ],
      page: { nextCursor: null },
    });
    renderExperience();
    await screen.findByText("First fixture notification");
    expect(screen.getByText("Second fixture notification")).toBeInTheDocument();
    expect(
      screen.getByText(messages.en.notifications.deliveryExplanation),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /RETRYING|CANCELLED|provider error|attempt count/i,
    );
  });

  test("refreshes page one on visible resume but pauses while hidden", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility,
    );
    mocks.auth.apiClient.request.mockResolvedValue({
      data: [],
      page: { nextCursor: null },
    });
    renderExperience();
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1),
    );

    now.mockReturnValue(61_000);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1);

    visibility = "visible";
    window.dispatchEvent(new Event("focus"));
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(2),
    );
    expect(mocks.auth.apiClient.request.mock.calls[1][0].path).toBe(
      "/me/notifications?limit=50",
    );
  });

  test("uses authoritative post-cutoff data after confirmed mark-all and guards double submit", async () => {
    let resolveMarkAll!: (value: unknown) => void;
    const pendingMarkAll = new Promise((resolve) => {
      resolveMarkAll = resolve;
    });
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("old", "2026-01-01T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      })
      .mockReturnValueOnce(pendingMarkAll)
      .mockResolvedValueOnce({
        data: [
          notification(
            "old",
            "2026-01-01T00:00:00Z",
            "2026-01-02T00:00:00Z",
            "CHECK_IN_DUE",
          ),
          notification("newer", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      });
    renderExperience();
    await screen.findByText("old title");
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    const confirm = screen.getByRole("button", { name: "Confirm mark all" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(2);
    resolveMarkAll({
      data: { affectedCount: 1, cutoffAt: "2026-01-02T00:00:00Z" },
    });
    expect(await screen.findByText("newer title")).toBeInTheDocument();
    expect(
      screen.getByText("Unread among loaded notifications: 1"),
    ).toBeInTheDocument();
  });

  test("discards a late mark-one callback after auth identity changes", async () => {
    let resolveMarkOne!: (value: unknown) => void;
    const pendingMarkOne = new Promise((resolve) => {
      resolveMarkOne = resolve;
    });
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      })
      .mockReturnValueOnce(pendingMarkOne)
      .mockResolvedValueOnce({ data: [], page: { nextCursor: null } });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = renderExperience(queryClient);
    fireEvent.click(await screen.findByRole("button", { name: "Mark read" }));

    mocks.auth.generation = 2;
    mocks.staff = staffContext("user", "ready", false, 2);
    view.rerender(experienceTree(queryClient));
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(3),
    );
    resolveMarkOne({
      data: notification(
        "new",
        "2026-01-03T00:00:00Z",
        "2026-01-04T00:00:00Z",
        "CHECK_IN_DUE",
      ),
    });
    await Promise.resolve();
    expect(
      screen.queryByText(messages.en.notifications.success.markedOne),
    ).not.toBeInTheDocument();
  });
});

function renderExperience(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  return render(experienceTree(queryClient));
}

function experienceTree(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationsExperience labels={messages.en.notifications} locale="en" />
    </QueryClientProvider>
  );
}

function staffContext(
  accessContext: "support" | "user",
  status: "ready" | "unresolved",
  allowTraining = false,
  generation = 1,
): StaffWorkspaceContextValue {
  const decisions = [
    "billing.subscription.read",
    "adherence.read",
    "analytics.nutrition.read",
    "documents.read",
    "foods.read",
    "nutrition.plans.read",
    "programs.read",
    "staff.read",
    "trainees.read",
    "workspace.read",
  ].map((permission) => ({
    allowed: allowTraining && permission === "programs.read",
    effect:
      allowTraining && permission === "programs.read"
        ? ("ALLOW" as const)
        : ("DENY" as const),
    permission: permission as never,
    scope: { type: "WORKSPACE" as const },
    source: "NONE" as const,
  }));
  return {
    accessFacts: {
      accessContext,
      context: "WORKSPACE",
      decisions,
      membershipId: "membership_a" as never,
      sessionGeneration: generation,
      status,
      workspaceId: "workspace_a" as never,
    },
    shellContext: {
      accessContext,
      branch: { branchId: null, label: "All" },
      portal: "gym-staff",
      sessionGeneration: generation,
      workspace: {
        accessVersion: 7,
        membershipId: "membership_a" as never,
        roles: ["TRAINER"],
        workspaceId: "workspace_a" as never,
        workspaceName: "Gym",
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      accessVersion: 7,
      membershipId: "membership_a" as never,
      roles: ["TRAINER"],
      workspaceId: "workspace_a" as never,
      workspaceName: "Gym",
      workspaceTimezone: "Africa/Cairo",
    },
  };
}

function notification(
  id: string,
  createdAt: string,
  readAt: string | null,
  notificationType: string,
) {
  return {
    id,
    workspaceId: "workspace_a",
    eventType: notificationType,
    notificationType,
    category: notificationType.includes("DOCUMENT") ? "DOCUMENT" : "CHECK_IN",
    title: `${id} title`,
    body: `${id} body`,
    payload: {},
    readAt,
    createdAt,
  };
}
