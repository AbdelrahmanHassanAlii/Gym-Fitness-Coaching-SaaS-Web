/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MembershipId, UserId } from "@/contracts";
import type { AuthSessionContextValue, AuthState } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { messages } from "@/i18n/messages";
import {
  platformAccessKeys,
  platformDecisionRequests,
  usePlatformAuthority,
} from "@/lib/platform-access";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { PlatformWorkspaceDetail } from "@/components/platform-workspaces/PlatformWorkspaceDetail";
import { PlatformWorkspaceManagement } from "@/components/platform-workspaces/PlatformWorkspaceManagement";
import { PlatformWorkspaceSummaries } from "@/components/platform-workspaces/PlatformWorkspaceSummaries";
import { PlatformUserDirectory } from "@/components/platform-users/PlatformUserDirectory";
import { PlatformUserDetail } from "@/components/platform-users/PlatformUserDetail";
import { PlatformShell } from "./PlatformShell";

const workspaceId = "68e7a9d10d56fd2b98d4a101";
const mocks = vi.hoisted(() => ({
  authSession: {
    apiClient: { request: vi.fn() },
    bootstrap: vi.fn(),
    generation: 4,
    getAccessToken: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    markSessionExpired: vi.fn(),
    state: {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        email: "admin@example.test",
        emailVerified: true,
        firstName: "Platform",
        id: "user_a",
        lastName: "Admin",
        phoneVerified: false,
      },
    } as AuthState,
    subscribe: vi.fn(),
    verifyMfaLogin: vi.fn(),
  },
  pathname: "/platform",
  push: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => mocks.authSession as unknown as AuthSessionContextValue,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => mocks.searchParams,
}));

const maxSafeTimerDelay = 2_147_483_647;

describe("Platform shell", () => {
  test.each(["GET", "mutation"])(
    "actual shell expiry retires lifecycle and ignores late %s while READ is renewed",
    async (kind) => {
      const timer = installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
      mocks.pathname = `/platform/users/${workspaceId}`;
      const late = deferred<unknown>();
      let decisions = 0,
        managementReads = 0;
      const at = "2026-10-09T08:00:00.000Z";
      const detail = {
        data: {
          id: workspaceId,
          displayName: "Independent readable member",
          status: "ACTIVE",
          createdAt: at,
          updatedAt: at,
          platformMembership: {
            id: workspaceId,
            status: "ACTIVE",
            createdAt: at,
            updatedAt: at,
          },
        },
      };
      const management = {
        data: {
          userId: workspaceId,
          platformMembership: {
            id: workspaceId,
            status: "ACTIVE",
            version: 4,
            suspendedAt: null,
            endedAt: null,
          },
        },
      };
      mocks.authSession.apiClient.request.mockImplementation((r) => {
        if (r.path === "/me/platform-context")
          return Promise.resolve(contextEnvelope("ACTIVE", 7));
        if (r.path === "/platform/me/effective-access/decisions")
          return Promise.resolve(
            decisionEnvelope(
              {
                "audit.platform.read": false,
                "platform_users.read": true,
                "platform_users.manage": ++decisions === 1,
                "platform_workspaces.manage": false,
              },
              7,
              decisions === 1 ? "2026-10-09T08:01:00.000Z" : null,
            ),
          );
        if (r.method === "POST") return late.promise;
        if (r.path.endsWith("management-state"))
          return ++managementReads === 1
            ? Promise.resolve(management)
            : late.promise;
        return Promise.resolve(detail);
      });
      const client = testQueryClient();
      renderShell(
        client,
        <PlatformUserDetail
          userId={workspaceId}
          locale="en"
          labels={messages.en.platformUsers}
        />,
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "Suspend access" }),
      );
      if (kind === "mutation")
        fireEvent.click(screen.getByRole("dialog").querySelector("button")!);
      else {
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        void client.invalidateQueries({
          queryKey: ["hassan-web", "platform-user-lifecycle"],
        });
        await settleAsyncQueries();
      }
      await timer.advanceBy(60_001);
      await settleAsyncQueries();
      expect(
        screen.queryByRole("button", { name: "Suspend access" }),
      ).toBeNull();
      expect(
        await screen.findByText("Independent readable member"),
      ).toBeVisible();
      await act(async () =>
        late.resolve({
          data: {
            ...management.data,
            platformMembership: {
              ...management.data.platformMembership,
              status: "ENDED",
              version: 5,
            },
          },
        }),
      );
      await settleAsyncQueries();
      expect(screen.queryByText("Access changed.")).toBeNull();
      expect(screen.queryByText("Ended", { exact: true })).toBeNull();
      expect(mocks.authSession.logout).not.toHaveBeenCalled();
    },
  );
  test("management 403 refresh preserves READ while authority rediscovery is pending", async () => {
    mocks.pathname = `/platform/users/${workspaceId}`;
    const lateDecisions = deferred<unknown>();
    let decisions = 0;
    const at = "2026-10-09T08:00:00.000Z";
    mocks.authSession.apiClient.request.mockImplementation((r) => {
      if (r.path === "/me/platform-context")
        return Promise.resolve(contextEnvelope("ACTIVE", 7));
      if (r.path === "/platform/me/effective-access/decisions")
        return ++decisions === 1
          ? Promise.resolve(
              decisionEnvelope({
                "audit.platform.read": false,
                "platform_users.read": true,
                "platform_users.manage": true,
                "platform_workspaces.manage": false,
              }),
            )
          : lateDecisions.promise;
      if (r.method === "POST")
        return Promise.reject(backendError("SUPPORT_ACCESS_FORBIDDEN", 403));
      if (r.path.endsWith("management-state"))
        return Promise.resolve({
          data: {
            userId: workspaceId,
            platformMembership: {
              id: workspaceId,
              status: "ACTIVE",
              version: 4,
              suspendedAt: null,
              endedAt: null,
            },
          },
        });
      return Promise.resolve({
        data: {
          id: workspaceId,
          displayName: "Readable during refresh",
          status: "ACTIVE",
          createdAt: at,
          updatedAt: at,
          platformMembership: {
            id: workspaceId,
            status: "ACTIVE",
            createdAt: at,
            updatedAt: at,
          },
        },
      });
    });
    renderShell(
      testQueryClient(),
      <PlatformUserDetail
        userId={workspaceId}
        locale="en"
        labels={messages.en.platformUsers}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Suspend access" }),
    );
    fireEvent.click(screen.getByRole("dialog").querySelector("button")!);
    await waitFor(() => expect(decisions).toBe(2));
    expect(screen.getByText("Readable during refresh")).toBeVisible();
    expect(screen.queryByText("Lifecycle management")).toBeNull();
    await act(async () =>
      lateDecisions.resolve(
        decisionEnvelope({
          "audit.platform.read": false,
          "platform_users.read": true,
          "platform_users.manage": false,
          "platform_workspaces.manage": false,
        }),
      ),
    );
    expect(screen.getByText("Readable during refresh")).toBeVisible();
    expect(mocks.authSession.logout).not.toHaveBeenCalled();
    expect(mocks.authSession.markSessionExpired).not.toHaveBeenCalled();
  });
  test.each(["directory", "detail"] as const)(
    "actual shell validUntil retires Users %s and suppresses late results",
    async (kind) => {
      const timer = installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
      mocks.pathname =
        kind === "directory"
          ? "/platform/users"
          : `/platform/users/${workspaceId}`;
      const late = deferred<unknown>();
      let decisions = 0,
        reads = 0;
      const at = "2026-10-09T08:00:00.000Z";
      const account = {
        id: workspaceId,
        displayName: "Protected member",
        status: "ACTIVE",
        createdAt: at,
        platformMembership: { status: "ACTIVE" },
      };
      const envelope =
        kind === "directory"
          ? { data: [account], meta: { hasMore: false, nextCursor: null } }
          : {
              data: {
                ...account,
                updatedAt: at,
                platformMembership: {
                  id: workspaceId,
                  status: "ACTIVE",
                  createdAt: at,
                  updatedAt: at,
                },
              },
            };
      mocks.authSession.apiClient.request.mockImplementation(
        (r: { path: string }) => {
          if (r.path === "/me/platform-context")
            return Promise.resolve(contextEnvelope("ACTIVE", 7));
          if (r.path === "/platform/me/effective-access/decisions") {
            decisions++;
            return Promise.resolve(
              decisionEnvelope(
                {
                  "audit.platform.read": false,
                  "platform_users.read": decisions === 1,
                  "platform_workspaces.manage": false,
                },
                7,
                decisions === 1 ? "2026-10-09T08:01:00.000Z" : null,
              ),
            );
          }
          if (r.path.startsWith("/platform/users")) {
            reads++;
            return reads === 1 ? Promise.resolve(envelope) : late.promise;
          }
          throw new Error(`Unexpected Users request: ${r.path}`);
        },
      );
      const c = testQueryClient();
      renderShell(
        c,
        kind === "directory" ? (
          <PlatformUserDirectory
            labels={messages.en.platformUsers}
            locale="en"
          />
        ) : (
          <PlatformUserDetail
            labels={messages.en.platformUsers}
            locale="en"
            userId={workspaceId}
          />
        ),
      );
      await screen.findByText("Protected member");
      void c.refetchQueries({
        predicate: (q) => q.queryKey.includes("platform-users"),
      });
      await waitFor(() => expect(reads).toBe(2));
      await timer.advanceBy(60_000);
      await settleAsyncQueries();
      expect(screen.queryByText("Protected member")).not.toBeInTheDocument();
      await act(async () => late.resolve(envelope));
      await settleAsyncQueries();
      expect(screen.queryByText("Protected member")).not.toBeInTheDocument();
      expect(
        c
          .getQueriesData({
            predicate: (q) => q.queryKey.includes("platform-users"),
          })
          .every(([, data]) => data === undefined),
      ).toBe(true);
      expect(mocks.authSession.logout).not.toHaveBeenCalled();
      expect(mocks.authSession.markSessionExpired).not.toHaveBeenCalled();
    },
  );

  beforeEach(() => {
    mocks.authSession.apiClient.request.mockReset();
    mocks.authSession.logout.mockReset();
    mocks.authSession.markSessionExpired.mockReset();
    mocks.authSession.generation = 4;
    mocks.authSession.state = authenticatedState();
    mocks.pathname = "/platform";
    mocks.push.mockReset();
    mocks.searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("detail decisions include commercial permission without adding it to navigation requests", async () => {
    mocks.pathname = `/platform/workspaces/${workspaceId}`;
    mocks.authSession.apiClient.request.mockImplementation(
      (r: {
        path: string;
        body?: { requests: readonly { permission: string }[] };
      }) => {
        if (r.path === "/me/platform-context")
          return Promise.resolve(contextEnvelope("ACTIVE", 7));
        if (r.path === "/platform/me/effective-access/decisions") {
          expect(r.body?.requests.map((v) => v.permission)).toContain(
            "subscriptions.read",
          );
          return Promise.resolve(
            decisionEnvelope({
              "audit.platform.read": false,
              "platform_users.read": false,
              "platform_workspaces.manage": true,
              "subscriptions.read": false,
            }),
          );
        }
        if (r.path.endsWith("/counts"))
          return Promise.resolve({
            data: {
              workspaceId,
              counts: {
                branches: { active: 0 },
                trainees: { active: 0, needsReassignment: 0 },
                staff: { activeIncludingOwners: 0 },
              },
            },
          });
        throw new Error(`Unexpected commercial fetch: ${r.path}`);
      },
    );
    renderShell(
      testQueryClient(),
      <PlatformWorkspaceSummaries
        labels={messages.en.platformWorkspaceSummaries}
        locale="en"
        workspaceId={workspaceId}
        onNotFound={vi.fn()}
      />,
    );
    await screen.findAllByText("0");
    expect(screen.getByText("Restricted")).toBeInTheDocument();
    expect(
      mocks.authSession.apiClient.request.mock.calls.some(([r]) =>
        r.path.endsWith("/subscription-summary"),
      ),
    ).toBe(false);
  });

  test("actual shell validUntil retires both summaries and rejects both late responses", async () => {
    const timer = installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
    mocks.pathname = `/platform/workspaces/${workspaceId}`;
    const lateSubscription = deferred<unknown>(),
      lateCounts = deferred<unknown>();
    let decisions = 0,
      subscriptionReads = 0,
      countReads = 0;
    mocks.authSession.apiClient.request.mockImplementation(
      (r: { path: string }) => {
        if (r.path === "/me/platform-context")
          return Promise.resolve(contextEnvelope("ACTIVE", 7));
        if (r.path === "/platform/me/effective-access/decisions") {
          decisions++;
          return Promise.resolve(
            decisionEnvelope(
              {
                "audit.platform.read": false,
                "platform_users.read": false,
                "platform_workspaces.manage": decisions === 1,
                "subscriptions.read": decisions === 1,
              },
              7,
              decisions === 1 ? "2026-10-09T08:01:00.000Z" : null,
            ),
          );
        }
        if (r.path.endsWith("/subscription-summary")) {
          subscriptionReads++;
          return subscriptionReads === 1
            ? Promise.resolve({ data: { workspaceId, subscription: null } })
            : lateSubscription.promise;
        }
        if (r.path.endsWith("/counts")) {
          countReads++;
          return countReads === 1
            ? Promise.resolve({
                data: {
                  workspaceId,
                  counts: {
                    branches: { active: 2 },
                    trainees: { active: 3, needsReassignment: 1 },
                    staff: { activeIncludingOwners: 4 },
                  },
                },
              })
            : lateCounts.promise;
        }
        throw new Error(`Unexpected request: ${r.path}`);
      },
    );
    const c = testQueryClient();
    renderShell(
      c,
      <PlatformWorkspaceSummaries
        labels={messages.en.platformWorkspaceSummaries}
        locale="en"
        workspaceId={workspaceId}
        onNotFound={vi.fn()}
      />,
    );
    await screen.findByText("No subscription");
    await screen.findByText("3");
    void c.refetchQueries({
      predicate: (q) =>
        q.queryKey.includes("subscription-summary") ||
        q.queryKey.includes("counts"),
    });
    await waitFor(() => expect(subscriptionReads + countReads).toBe(4));
    await timer.advanceBy(60_000);
    await settleAsyncQueries();
    expect(screen.queryByText("No subscription")).not.toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    await act(async () => {
      lateSubscription.resolve({ data: { workspaceId, subscription: null } });
      lateCounts.resolve({
        data: {
          workspaceId,
          counts: {
            branches: { active: 777 },
            trainees: { active: 777, needsReassignment: 777 },
            staff: { activeIncludingOwners: 777 },
          },
        },
      });
    });
    await settleAsyncQueries();
    expect(screen.queryByText("No subscription")).not.toBeInTheDocument();
    expect(screen.queryByText("777")).not.toBeInTheDocument();
    expect(
      c
        .getQueriesData({
          predicate: (q) =>
            JSON.stringify(q.queryKey).includes("2026-10-09T08:01:00.000Z"),
        })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    expect(mocks.authSession.markSessionExpired).not.toHaveBeenCalled();
    expect(mocks.authSession.logout).not.toHaveBeenCalled();
  });

  test("loads the exact Platform contracts and shows only allowed navigation placeholders", async () => {
    mockActiveContext(7);
    mockDecisions({
      "audit.platform.read": true,
      "platform_users.read": false,
      "platform_workspaces.manage": true,
    });

    renderShell();

    expect(await screen.findByText("Platform Portal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Workspaces/ })).toHaveAttribute(
      "href",
      "/platform/workspaces",
    );
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/me/platform-context",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.authSession.apiClient.request).toHaveBeenNthCalledWith(2, {
      body: {
        expectedAccessVersion: 7,
        requests: [
          { permission: "audit.platform.read" },
          { permission: "platform_users.read" },
          { permission: "platform_workspaces.manage" },
        ],
      },
      method: "POST",
      path: "/platform/me/effective-access/decisions",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2);
  });

  test("marks only the workspace route current and exposes its resolved authority identity", async () => {
    mocks.pathname = "/platform/workspaces/68e7a9d10d56fd2b98d4a101";
    mockActiveContext(7);
    mockDecisions(
      {
        "audit.platform.read": false,
        "platform_users.read": false,
        "platform_workspaces.manage": true,
      },
      7,
      "2030-10-10T08:00:00.000Z",
    );

    renderShell(testQueryClient(), <AuthorityProbe />);

    expect(await screen.findByTestId("authority")).toHaveTextContent(
      "user_a|4|platform_membership_a|7|2030-10-10T08:00:00.000Z|true",
    );
    expect(screen.getByRole("link", { name: /Workspaces/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Home/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test.each([
    ["SUSPENDED", "Platform membership suspended"],
    ["ENDED", "Platform membership ended"],
  ] as const)(
    "%s membership fails closed without requesting decisions",
    async (status, message) => {
      mockContext(status, 8);

      renderShell();

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    },
  );

  test("does not fetch while auth is unresolved or the session is restricted", async () => {
    mocks.authSession.state = {
      accessToken: null,
      restrictedUntilVerified: false,
      status: "initializing",
      user: null,
    };
    const queryClient = testQueryClient();
    const { rerender } = render(shellTree(queryClient));

    expect(screen.getByText("Loading Platform access...")).toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).not.toHaveBeenCalled();

    mocks.authSession.state = authenticatedState({
      restrictedUntilVerified: true,
    });
    rerender(shellTree(queryClient));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session verification required",
    );
    expect(mocks.authSession.apiClient.request).not.toHaveBeenCalled();
  });

  test.each([
    ["TWO_FACTOR_REQUIRED", "Multi-factor authentication required"],
    ["PLATFORM_MEMBERSHIP_REQUIRED", "No Platform membership"],
    ["SUPPORT_ACCESS_FORBIDDEN", "Unavailable in support context"],
  ])("maps %s without logging out", async (code, message) => {
    mocks.authSession.apiClient.request.mockRejectedValue(
      backendError(code, 403),
    );

    renderShell();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(mocks.authSession.logout).not.toHaveBeenCalled();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(1);
  });

  test("hides existing authority throughout deferred access-version conflict recovery", async () => {
    mockActiveContext(7);
    mockDecisions({
      "audit.platform.read": false,
      "platform_users.read": false,
      "platform_workspaces.manage": true,
    });
    const refreshedContext = deferred<unknown>();
    const refreshedDecisions = deferred<unknown>();
    const queryClient = testQueryClient();

    renderShell(queryClient);

    expect(await screen.findByText("Workspaces")).toBeInTheDocument();
    mocks.authSession.apiClient.request.mockRejectedValueOnce(
      backendError("PLATFORM_MEMBERSHIP_ACCESS_VERSION_CONFLICT", 409),
    );
    mocks.authSession.apiClient.request.mockReturnValueOnce(
      refreshedContext.promise,
    );
    mocks.authSession.apiClient.request.mockReturnValueOnce(
      refreshedDecisions.promise,
    );

    void queryClient.invalidateQueries({
      exact: true,
      queryKey: platformAccessKeys.decisions({
        accessVersion: 7,
        membershipId: "platform_membership_a" as MembershipId,
        membershipStatus: "ACTIVE",
        principalId: "user_a" as UserId,
        requests: platformDecisionRequests,
        sessionGeneration: 4,
      }),
    });

    await waitFor(() =>
      expect(screen.queryByText("Workspaces")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Loading Platform context...")).toBeInTheDocument();

    refreshedContext.resolve(contextEnvelope("ACTIVE", 8));
    await waitFor(() =>
      expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(5),
    );
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();

    refreshedDecisions.resolve(
      decisionEnvelope(
        {
          "audit.platform.read": false,
          "platform_users.read": true,
          "platform_workspaces.manage": false,
        },
        8,
      ),
    );

    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    const decisionBodies = mocks.authSession.apiClient.request.mock.calls
      .map(([request]) => request.body)
      .filter(Boolean);
    expect(decisionBodies).toEqual([
      expect.objectContaining({ expectedAccessVersion: 7 }),
      expect.objectContaining({ expectedAccessVersion: 7 }),
      expect.objectContaining({ expectedAccessVersion: 8 }),
    ]);
  });

  test("discards a late context response after principal generation changes", async () => {
    const firstContext = deferred<unknown>();
    mocks.authSession.apiClient.request.mockReturnValueOnce(
      firstContext.promise,
    );
    const queryClient = testQueryClient();
    const { rerender } = render(shellTree(queryClient));

    mocks.authSession.generation = 5;
    mocks.authSession.state = authenticatedState({ userId: "user_b" });
    mockContext("SUSPENDED", 9, "platform_membership_b");
    rerender(shellTree(queryClient));

    expect(
      await screen.findByText("Platform membership suspended"),
    ).toBeInTheDocument();
    firstContext.resolve(contextEnvelope("ACTIVE", 7));

    await waitFor(() =>
      expect(screen.queryByText("Workspaces")).not.toBeInTheDocument(),
    );
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2);
  });

  test.each(["resolve", "reject"] as const)(
    "discards a late decision %s after principal generation changes",
    async (outcome) => {
      mockActiveContext(7);
      const firstDecisions = deferred<unknown>();
      mocks.authSession.apiClient.request.mockReturnValueOnce(
        firstDecisions.promise,
      );
      const queryClient = testQueryClient();
      const { rerender } = render(shellTree(queryClient));
      await waitFor(() =>
        expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2),
      );

      mocks.authSession.generation = 5;
      mocks.authSession.state = authenticatedState({ userId: "user_b" });
      mockContext("ENDED", 9, "platform_membership_b");
      rerender(shellTree(queryClient));
      expect(
        await screen.findByText("Platform membership ended"),
      ).toBeInTheDocument();

      if (outcome === "resolve") {
        firstDecisions.resolve(
          decisionEnvelope({
            "audit.platform.read": true,
            "platform_users.read": true,
            "platform_workspaces.manage": true,
          }),
        );
      } else {
        firstDecisions.reject(backendError("PERMISSION_SCOPE_INVALID", 422));
      }

      await waitFor(() =>
        expect(screen.queryByText("Workspaces")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Platform membership ended")).toBeInTheDocument();
    },
  );

  test("retires decisions exactly at validUntil and refetches without rendering expired navigation", async () => {
    const timer = installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
    mockActiveContext(7);
    mockDecisions(
      {
        "audit.platform.read": false,
        "platform_users.read": false,
        "platform_workspaces.manage": true,
      },
      7,
      "2026-10-09T08:01:00.000Z",
    );
    mockDecisions({
      "audit.platform.read": false,
      "platform_users.read": false,
      "platform_workspaces.manage": false,
    });

    renderShell(testQueryClient(), <WorkspaceAuthorityProbe />);

    expect(await screen.findByText("Workspaces")).toBeInTheDocument();
    expect(
      screen.getByText("Authorized workspace content"),
    ).toBeInTheDocument();

    await timer.advanceBy(59_999);
    expect(screen.getByText("Workspaces")).toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2);

    await timer.advanceBy(1);
    await settleAsyncQueries();
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Authorized workspace content"),
    ).not.toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(3);
    expect(
      await screen.findByText("No Platform sections are available."),
    ).toHaveAttribute("role", "status");
  });

  test("activates the safe workspace-directory return after a management-state 404", async () => {
    mocks.pathname = `/platform/workspaces/${workspaceId}`;
    mocks.searchParams = new URLSearchParams("q=Alpha&status=ACTIVE");
    let decisions = 0;
    mocks.authSession.apiClient.request.mockImplementation(
      (request: { path: string }) => {
        if (request.path === "/me/platform-context")
          return Promise.resolve(contextEnvelope("ACTIVE", 7));
        if (request.path === "/platform/me/effective-access/decisions") {
          decisions += 1;
          return Promise.resolve(
            decisionEnvelope({
              "audit.platform.read": false,
              "platform_users.read": false,
              "platform_workspaces.manage": true,
            }),
          );
        }
        if (request.path.endsWith("/management-state"))
          return Promise.reject(
            new ApiError({
              category: "not-found",
              code: "WORKSPACE_NOT_FOUND",
              kind: "backend",
              message: "missing",
              status: 404,
            }),
          );
        return Promise.resolve(workspaceDetail());
      },
    );

    renderShell(
      testQueryClient(),
      <PlatformWorkspaceDetail
        labels={{
          ...messages.en.platformWorkspaceDetail,
          statuses: messages.en.platformWorkspaces.statuses,
        }}
        locale="en"
        managementLabels={messages.en.platformWorkspaceManagement}
        workspaceId={workspaceId}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.platformWorkspaceManagement.errors.notFound,
    );
    expect(
      screen.queryByRole("button", { name: "Change owner" }),
    ).not.toBeInTheDocument();
    const back = screen.getByRole("link", { name: "Back to workspaces" });
    expect(back).toHaveAttribute(
      "href",
      "/platform/workspaces?q=Alpha&status=ACTIVE",
    );
    fireEvent.click(back);
    const destination = mocks.push.mock.calls.at(-1)?.[0];
    expect(destination).toBe("/platform/workspaces?q=Alpha&status=ACTIVE");
    const destinationUrl = new URL(destination, "https://hassan.test");
    expect(destinationUrl.pathname).toBe("/platform/workspaces");
    expect(destinationUrl.searchParams.get("q")).toBe("Alpha");
    expect(destinationUrl.searchParams.get("status")).toBe("ACTIVE");
    expect([...destinationUrl.searchParams.keys()]).toEqual(["q", "status"]);
    expect(decisions).toBe(1);
    expect(mocks.authSession.markSessionExpired).not.toHaveBeenCalled();
  });

  test("unmounts management at actual validUntil and suppresses a late owner result", async () => {
    const timer = installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
    const ownerMutation = deferred<unknown>();
    let decisions = 0;
    let managementReads = 0;
    mocks.authSession.apiClient.request.mockImplementation(
      (request: { method: string; path: string }) => {
        if (request.path === "/me/platform-context")
          return Promise.resolve(contextEnvelope("ACTIVE", 7));
        if (request.path === "/platform/me/effective-access/decisions") {
          decisions += 1;
          return Promise.resolve(
            decisionEnvelope(
              {
                "audit.platform.read": false,
                "platform_users.read": false,
                "platform_workspaces.manage": decisions === 1,
              },
              7,
              decisions === 1 ? "2026-10-09T08:01:00.000Z" : null,
            ),
          );
        }
        if (request.path.endsWith("/management-state")) {
          managementReads += 1;
          return Promise.resolve(workspaceManagementState());
        }
        if (request.path === "/platform/workspace-owner-candidates")
          return Promise.resolve(ownerCandidates());
        if (request.method === "POST" && request.path.endsWith("/owner"))
          return ownerMutation.promise;
        throw new Error(
          `Unexpected request: ${request.method} ${request.path}`,
        );
      },
    );
    const queryClient = testQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderShell(
      queryClient,
      <PlatformWorkspaceManagement
        labels={messages.en.platformWorkspaceManagement}
        workspaceId={workspaceId}
      />,
    );

    expect(await screen.findByText(/owner@example\.com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change owner" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /New Owner.*Select/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(
        mocks.authSession.apiClient.request.mock.calls.some(
          ([request]) =>
            request.method === "POST" && request.path.endsWith("/owner"),
        ),
      ).toBe(true),
    );

    await timer.advanceBy(60_000);
    await settleAsyncQueries();
    expect(screen.queryByText(/owner@example\.com/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change owner" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("New Owner")).not.toBeInTheDocument();

    const readsAtExpiry = managementReads;
    invalidate.mockClear();
    await act(async () =>
      ownerMutation.resolve({
        data: { workspace: workspaceManagementState().data.workspace },
      }),
    );
    await settleAsyncQueries();

    expect(managementReads).toBe(readsAtExpiry);
    expect(invalidate).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        messages.en.platformWorkspaceManagement.success.ownerChanged,
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/owner@example\.com/)).not.toBeInTheDocument();
  });

  test("keeps far-future authority through capped timer segments until the actual deadline", async () => {
    const timer = installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
    mockActiveContext(7);
    mockDecisions(
      {
        "audit.platform.read": false,
        "platform_users.read": false,
        "platform_workspaces.manage": true,
      },
      7,
      "2026-11-18T08:00:00.000Z",
    );
    mockDecisions({
      "audit.platform.read": false,
      "platform_users.read": true,
      "platform_workspaces.manage": false,
    });

    renderShell();
    expect(await screen.findByText("Workspaces")).toBeInTheDocument();

    await timer.advanceBy(maxSafeTimerDelay);
    expect(screen.getByText("Workspaces")).toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2);

    await timer.advanceBy(40 * 24 * 60 * 60 * 1_000 - maxSafeTimerDelay);
    await settleAsyncQueries();
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(3);
  });

  test("an old authority timer cannot invalidate replacement decisions", async () => {
    const timer = installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
    mockActiveContext(7);
    mockDecisions(
      {
        "audit.platform.read": false,
        "platform_users.read": false,
        "platform_workspaces.manage": true,
      },
      7,
      "2026-10-10T08:00:00.000Z",
    );
    const queryClient = testQueryClient();
    const { rerender } = render(shellTree(queryClient));
    expect(await screen.findByText("Workspaces")).toBeInTheDocument();

    mocks.authSession.generation = 5;
    mocks.authSession.state = authenticatedState({ userId: "user_b" });
    mockContext("ACTIVE", 9, "platform_membership_b");
    mocks.authSession.apiClient.request.mockResolvedValueOnce(
      decisionEnvelope(
        {
          "audit.platform.read": false,
          "platform_users.read": true,
          "platform_workspaces.manage": false,
        },
        9,
        "2026-11-18T08:00:00.000Z",
        "platform_membership_b",
      ),
    );
    rerender(shellTree(queryClient));
    expect(await screen.findByText("Users")).toBeInTheDocument();

    await timer.advanceBy(24 * 60 * 60 * 1_000);
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(4);
  });

  test("null validUntil does not create an expiry refetch", async () => {
    const timer = installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
    mockActiveContext(7);
    mockDecisions({
      "audit.platform.read": false,
      "platform_users.read": false,
      "platform_workspaces.manage": true,
    });

    renderShell();
    expect(await screen.findByText("Workspaces")).toBeInTheDocument();

    await timer.advanceBy(40 * 24 * 60 * 60 * 1_000);
    expect(screen.getByText("Workspaces")).toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2);
  });

  test("cleans up the expiry timer when the shell unmounts", async () => {
    const timer = installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
    mockActiveContext(7);
    mockDecisions(
      {
        "audit.platform.read": false,
        "platform_users.read": false,
        "platform_workspaces.manage": true,
      },
      7,
      "2026-10-10T08:00:00.000Z",
    );

    const { unmount } = renderShell();
    expect(await screen.findByText("Workspaces")).toBeInTheDocument();
    unmount();

    await timer.advanceBy(24 * 60 * 60 * 1_000);
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2);
  });

  test("never treats an already-expired decision response as current authority", async () => {
    installPlatformTimerHarness("2026-10-09T08:00:00.000Z");
    mockActiveContext(7);
    mockDecisions(
      {
        "audit.platform.read": false,
        "platform_users.read": false,
        "platform_workspaces.manage": true,
      },
      7,
      "2026-10-09T07:59:59.000Z",
    );
    mockDecisions({
      "audit.platform.read": false,
      "platform_users.read": true,
      "platform_workspaces.manage": false,
    });

    renderShell();

    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(3);
  });

  test("malformed decision data fails closed and exposes no placeholder", async () => {
    mockActiveContext(7);
    mocks.authSession.apiClient.request.mockResolvedValueOnce({
      data: {
        accessContext: "USER",
        accessVersion: 7,
        context: "PLATFORM",
        decisions: [],
        membershipId: "platform_membership_a",
        membershipStatus: "ACTIVE",
        validUntil: null,
      },
    });

    renderShell();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Platform access could not be verified.",
    );
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
  });

  test("terminal authentication failure uses existing session expiry behavior", async () => {
    mocks.authSession.apiClient.request.mockRejectedValue(
      new ApiError({
        category: "unauthenticated",
        code: "AUTH_REQUIRED",
        kind: "backend",
        message: "Authentication required",
        status: 401,
      }),
    );

    renderShell();

    await waitFor(() =>
      expect(mocks.authSession.markSessionExpired).toHaveBeenCalledWith(
        expect.objectContaining({ code: "AUTH_REQUIRED" }),
      ),
    );
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
  });

  test("renders the separate shell in Arabic RTL with localized accessible navigation", async () => {
    mockActiveContext(7);
    mockDecisions({
      "audit.platform.read": true,
      "platform_users.read": false,
      "platform_workspaces.manage": false,
    });

    render(
      <ThemeProvider>
        <QueryClientProvider client={testQueryClient()}>
          <PlatformShell
            labels={{
              ...messages.ar.platformPortal,
              themeControls: messages.ar.themeControls,
            }}
            locale="ar"
          >
            <h1>{messages.ar.platformPortal.home.title}</h1>
          </PlatformShell>
        </QueryClientProvider>
      </ThemeProvider>,
    );

    const navigation = await screen.findByRole("navigation", {
      name: "بوابة المنصة",
    });
    expect(navigation.closest("div[dir]")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("link", { name: /الرئيسية/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("العمليات")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });
});

const labels = {
  account: { logout: "Log out", restricted: "Restricted" },
  errors: {
    accessDenied: "No Platform sections are available.",
    failed: "Platform access could not be verified.",
    malformed: "Platform access could not be verified.",
    membershipEnded: "Platform membership ended",
    membershipRequired: "No Platform membership",
    membershipSuspended: "Platform membership suspended",
    mfaRequired: "Multi-factor authentication required",
    restricted: "Session verification required",
    supportForbidden: "Unavailable in support context",
  },
  home: {
    availableSections: "Available sections",
    noSections: "No Platform sections are available.",
  },
  loading: {
    access: "Loading Platform access...",
    context: "Loading Platform context...",
  },
  localeLabel: "Interface language",
  mobile: { close: "Close navigation", open: "Open navigation" },
  nav: {
    home: { description: "Platform foundation", title: "Home" },
    operations: {
      description: "Coming in a later milestone",
      title: "Operations",
    },
    users: {
      description: "Coming in a later milestone",
      title: "Users",
    },
    workspaces: {
      description: "Coming in a later milestone",
      title: "Workspaces",
    },
  },
  portalLabel: "Platform Portal",
  retry: "Retry",
  themeControls: {
    appearanceLabel: "Appearance",
    resolvedPrefix: "Resolved",
    themeLabel: "Theme",
  },
};

function renderShell(
  queryClient = testQueryClient(),
  children = <h1>Platform foundation</h1>,
) {
  return render(shellTree(queryClient, children));
}

function shellTree(
  queryClient: QueryClient,
  children = <h1>Platform foundation</h1>,
) {
  return (
    <RouterContext.Provider value={testRouter()}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <PlatformShell labels={labels} locale="en">
            {children}
          </PlatformShell>
        </QueryClientProvider>
      </ThemeProvider>
    </RouterContext.Provider>
  );
}

function testRouter(): NextRouter {
  return {
    asPath: mocks.pathname,
    back: vi.fn(),
    basePath: "",
    beforePopState: vi.fn(),
    events: { emit: vi.fn(), off: vi.fn(), on: vi.fn() },
    forward: vi.fn(),
    isFallback: false,
    isLocaleDomain: false,
    isPreview: false,
    isReady: true,
    pathname: mocks.pathname,
    prefetch: vi.fn(),
    push: mocks.push,
    query: {},
    reload: vi.fn(),
    replace: vi.fn(),
    route: mocks.pathname,
  };
}

function AuthorityProbe() {
  const authority = usePlatformAuthority();
  return (
    <p data-testid="authority">
      {[
        authority.principalId,
        authority.sessionGeneration,
        authority.membershipId,
        authority.accessVersion,
        authority.validUntil,
        authority.allows("platform_workspaces.manage"),
      ].join("|")}
    </p>
  );
}

function WorkspaceAuthorityProbe() {
  const authority = usePlatformAuthority();
  return authority.allows("platform_workspaces.manage") ? (
    <p>Authorized workspace content</p>
  ) : null;
}

function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

function authenticatedState(
  overrides: { restrictedUntilVerified?: boolean; userId?: string } = {},
): AuthState {
  return {
    accessToken: "token",
    restrictedUntilVerified: overrides.restrictedUntilVerified ?? false,
    status: "authenticated",
    user: {
      email: "admin@example.test",
      emailVerified: true,
      firstName: "Platform",
      id: overrides.userId ?? "user_a",
      lastName: "Admin",
      phoneVerified: false,
    },
  } as AuthState;
}

function mockActiveContext(accessVersion: number) {
  mockContext("ACTIVE", accessVersion);
}

function mockContext(
  status: "ACTIVE" | "SUSPENDED" | "ENDED",
  accessVersion: number,
  membershipId = "platform_membership_a",
) {
  mocks.authSession.apiClient.request.mockResolvedValueOnce(
    contextEnvelope(status, accessVersion, membershipId),
  );
}

function contextEnvelope(
  status: "ACTIVE" | "SUSPENDED" | "ENDED",
  accessVersion: number,
  membershipId = "platform_membership_a",
) {
  return {
    data: {
      accessContext: "USER",
      context: "PLATFORM",
      membership: {
        accessVersion,
        id: membershipId,
        status,
        updatedAt: "2026-10-09T08:30:00.000Z",
      },
    },
  };
}

function mockDecisions(
  access: Record<
    | "audit.platform.read"
    | "platform_users.read"
    | "platform_workspaces.manage",
    boolean
  > & { "subscriptions.read"?: boolean; "platform_users.manage"?: boolean },
  accessVersion = 7,
  validUntil: string | null = null,
) {
  mocks.authSession.apiClient.request.mockResolvedValueOnce(
    decisionEnvelope(access, accessVersion, validUntil),
  );
}

function decisionEnvelope(
  access: Record<
    | "audit.platform.read"
    | "platform_users.read"
    | "platform_workspaces.manage",
    boolean
  > & { "subscriptions.read"?: boolean; "platform_users.manage"?: boolean },
  accessVersion = 7,
  validUntil: string | null = null,
  membershipId = "platform_membership_a",
) {
  return {
    data: {
      accessContext: "USER",
      accessVersion,
      context: "PLATFORM",
      decisions: Object.entries({
        ...(/^\/platform\/users\/[0-9a-f]{24}$/.test(mocks.pathname)
          ? { "platform_users.manage": false }
          : {}),
        ...(/^\/platform\/workspaces\/[0-9a-f]{24}$/.test(mocks.pathname)
          ? { "subscriptions.read": false }
          : {}),
        ...access,
      })
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([permission, allowed]) => ({
          allowed,
          effect: allowed ? "ALLOW" : "DENY",
          permission,
        })),
      membershipId,
      membershipStatus: "ACTIVE",
      validUntil,
    },
  };
}

function workspaceDetail() {
  return {
    id: workspaceId,
    name: "Alpha",
    type: "GYM",
    status: "ACTIVE",
    timezone: "Africa/Cairo",
    defaultLanguage: "en",
    createdAt: "2026-10-09T23:30:00.000Z",
  };
}

function workspaceManagementState() {
  return {
    data: {
      workspace: {
        id: workspaceId,
        name: "Alpha",
        type: "GYM",
        status: "ACTIVE",
        timezone: "Africa/Cairo",
        defaultLanguage: "en",
        createdAt: "2026-10-09T23:30:00.000Z",
        version: 3,
      },
      owner: {
        id: "68e7a9d10d56fd2b98d4a199",
        displayName: "Owner",
        email: "owner@example.com",
      },
    },
  };
}

function ownerCandidates() {
  return {
    data: [
      {
        id: "68e7a9d10d56fd2b98d4a188",
        displayName: "New Owner",
        email: "new-owner@example.com",
      },
    ],
    meta: { hasMore: false, nextCursor: null },
  };
}

function backendError(code: string, status: number) {
  return new ApiError({
    category: status === 403 ? "forbidden" : "expected-version-conflict",
    code,
    kind: "backend",
    message: code,
    status,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolver, rejecter) => {
    resolve = resolver;
    reject = rejecter;
  });
  return { promise, reject, resolve };
}

async function settleAsyncQueries() {
  for (let iteration = 0; iteration < 4; iteration += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  }
}

function installPlatformTimerHarness(initialNow: string) {
  let now = Date.parse(initialNow);
  const timers = new Map<
    Parameters<typeof window.clearTimeout>[0],
    { callback: () => void; dueAt: number }
  >();
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
  const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);

  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(window, "setTimeout").mockImplementation(
    (handler, timeout?: number) => {
      const delay = timeout ?? 0;
      if (delay < 10_000) {
        return nativeSetTimeout(handler, delay);
      }

      const timerId = nativeSetTimeout(() => undefined, maxSafeTimerDelay);
      nativeClearTimeout(timerId);
      timers.set(timerId, {
        callback: () => handler(undefined),
        dueAt: now + delay,
      });
      return timerId;
    },
  );
  vi.spyOn(window, "clearTimeout").mockImplementation((timerId) => {
    if (!timers.delete(timerId)) {
      nativeClearTimeout(timerId);
    }
  });

  return {
    async advanceBy(milliseconds: number) {
      now += milliseconds;
      let dueTimers = [...timers.entries()]
        .filter(([, timer]) => timer.dueAt <= now)
        .sort(([, left], [, right]) => left.dueAt - right.dueAt);

      while (dueTimers.length > 0) {
        for (const [timerId, timer] of dueTimers) {
          timers.delete(timerId);
          await act(async () => timer.callback());
        }
        dueTimers = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= now)
          .sort(([, left], [, right]) => left.dueAt - right.dueAt);
      }
    },
  };
}
