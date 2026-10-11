/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { PlatformAuthority } from "@/lib/platform-access";
import { messages } from "@/i18n/messages";
import { PlatformWorkspaceSummaries } from "./PlatformWorkspaceSummaries";
const id = "68e7a9d10d56fd2b98d4a101";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  expired: vi.fn(),
  authority: {
    accessVersion: 7,
    allows: vi.fn<(permission: string) => boolean>(() => true),
    membershipId: "membership-a",
    principalId: "user-a",
    refresh: vi.fn().mockResolvedValue(undefined),
    sessionGeneration: 4,
    validUntil: null as string | null,
  },
}));
vi.mock("@/lib/platform-access", async (original) => ({
  ...(await original<typeof import("@/lib/platform-access")>()),
  usePlatformAuthority: () => mocks.authority as unknown as PlatformAuthority,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("q=Alpha&status=ARCHIVED"),
}));
vi.mock("@/lib/auth", () => ({
  useAuthSession: () => ({
    apiClient: { request: mocks.request },
    markSessionExpired: mocks.expired,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authority.allows.mockReturnValue(true);
  mocks.authority.accessVersion = 7;
  mocks.authority.principalId = "user-a";
  mocks.authority.sessionGeneration = 4;
  mocks.authority.membershipId = "membership-a";
  mocks.authority.validUntil = null;
  mocks.request.mockImplementation(({ path }: { path: string }) =>
    Promise.resolve(
      path.endsWith("counts")
        ? {
            data: {
              workspaceId: id,
              counts: {
                branches: { active: 0 },
                trainees: { active: 0, needsReassignment: 0 },
                staff: { activeIncludingOwners: 0 },
              },
            },
          }
        : { data: { workspaceId: id, subscription: null } },
    ),
  );
});
function tree(client: QueryClient, onNotFound = vi.fn()) {
  return (
    <QueryClientProvider client={client}>
      <PlatformWorkspaceSummaries
        labels={messages.en.platformWorkspaceSummaries}
        locale="en"
        workspaceId={id}
        onNotFound={onNotFound}
      />
    </QueryClientProvider>
  );
}
function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}
test("loads cards independently: absence is an empty state and zero counts remain numeric", async () => {
  render(tree(client()));
  expect(await screen.findByText("No subscription")).toBeInTheDocument();
  expect(await screen.findAllByText("0")).toHaveLength(4);
  expect(screen.getByText("Needs reassignment")).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledTimes(2);
});

test.each(["counts", "subscription-summary"])(
  "%s 404 retires the whole workspace detail and preserves return filters",
  async (suffix) => {
    const { PlatformWorkspaceDetail } =
      await import("./PlatformWorkspaceDetail");
    const { ApiError } = await import("@/lib/api");
    mocks.request.mockImplementation(({ path }: { path: string }) =>
      path.endsWith(suffix)
        ? Promise.reject(
            new ApiError({
              kind: "backend",
              category: "not-found",
              status: 404,
              code: "WORKSPACE_NOT_FOUND",
              message: "internal",
            }),
          )
        : Promise.resolve(
            path.endsWith("subscription-summary")
              ? { data: { workspaceId: id, subscription: null } }
              : {
                  id,
                  name: "Archived Gym",
                  type: "GYM",
                  status: "ARCHIVED",
                  timezone: "UTC",
                  defaultLanguage: "en",
                  createdAt: "2026-10-09T08:30:00.000Z",
                },
          ),
    );
    render(
      <QueryClientProvider client={client()}>
        <PlatformWorkspaceDetail
          labels={{
            ...messages.en.platformWorkspaceDetail,
            statuses: messages.en.platformWorkspaces.statuses,
          }}
          locale="en"
          workspaceId={id}
          summaryLabels={messages.en.platformWorkspaceSummaries}
        />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText(
        messages.en.platformWorkspaceDetail.errors.notFound,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Archived Gym" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No subscription")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: messages.en.platformWorkspaceDetail.actions.back,
      }),
    ).toHaveAttribute("href", "/platform/workspaces?q=Alpha&status=ARCHIVED");
    expect(mocks.expired).not.toHaveBeenCalled();
  },
);

test.each(["subscription-summary", "counts"] as const)(
  "%s failure remains unavailable while the other card survives",
  async (suffix) => {
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((r: { path: string }) =>
      r.path.endsWith(suffix)
        ? Promise.reject(new Error("private server text"))
        : original(r),
    );
    render(tree(client()));
    expect(
      await screen.findByText(
        suffix === "counts" ? "Counts unavailable" : "Subscription unavailable",
      ),
    ).toBeInTheDocument();
    if (suffix === "counts") {
      expect(await screen.findByText("No subscription")).toBeInTheDocument();
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    } else {
      expect(await screen.findAllByText("0")).toHaveLength(4);
      expect(screen.queryByText("No subscription")).not.toBeInTheDocument();
    }
    expect(screen.queryByText("private server text")).not.toBeInTheDocument();
  },
);
test.each(["subscriptions.read", "platform_workspaces.manage"])(
  "only %s does not fetch the other authority's data",
  async (permission) => {
    mocks.authority.allows.mockImplementation((p) => p === permission);
    render(tree(client()));
    if (permission === "subscriptions.read")
      await screen.findByText("No subscription");
    else await screen.findAllByText("0");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][0].path).toBe(
      `/platform/workspaces/${id}/${permission === "subscriptions.read" ? "subscription-summary" : "counts"}`,
    );
    expect(screen.getByText("Restricted")).toBeInTheDocument();
  },
);
test("commercial authority does not weaken the locked parent management gate", async () => {
  mocks.authority.allows.mockImplementation((p) => p === "subscriptions.read");
  const { PlatformWorkspaceDetail } = await import("./PlatformWorkspaceDetail");
  render(
    <QueryClientProvider client={client()}>
      <PlatformWorkspaceDetail
        labels={{
          ...messages.en.platformWorkspaceDetail,
          statuses: messages.en.platformWorkspaces.statuses,
        }}
        locale="en"
        workspaceId={id}
        summaryLabels={messages.en.platformWorkspaceSummaries}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    messages.en.platformWorkspaceDetail.errors.denied,
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
test("pending subscription shows status and no current plan, without fabricated dates or identifiers", async () => {
  mocks.request.mockResolvedValue({
    data: {
      workspaceId: id,
      subscription: {
        lifecycleStatus: "PENDING_ACTIVATION",
        startedAt: null,
        expiresAt: null,
        graceEndsAt: null,
        frozenAt: null,
        expiredAt: null,
        cancelledAt: null,
        currentTerms: null,
      },
    },
  });
  render(tree(client()));
  expect(await screen.findByText("No current plan yet")).toBeInTheDocument();
  expect(screen.getByText("Pending activation")).toBeInTheDocument();
  expect(screen.queryByText("No subscription")).not.toBeInTheDocument();
  expect(screen.queryByText("Term starts")).not.toBeInTheDocument();
});
test.each(["subscription-summary", "counts"] as const)(
  "%s 403 retires prior data and refreshes authority without logout",
  async (suffix) => {
    const c = client();
    render(tree(c));
    await screen.findByText("No subscription");
    await screen.findAllByText("0");
    const { ApiError } = await import("@/lib/api");
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((r: { path: string }) =>
      r.path.endsWith(suffix)
        ? Promise.reject(
            new ApiError({
              kind: "backend",
              category: "forbidden",
              status: 403,
              code: "PERMISSION_DENIED",
              message: "private",
            }),
          )
        : original(r),
    );
    await act(async () => {
      await c.refetchQueries({ predicate: (q) => q.queryKey.includes(suffix) });
    });
    await waitFor(() => expect(mocks.authority.refresh).toHaveBeenCalled());
    expect(mocks.expired).not.toHaveBeenCalled();
    if (suffix === "counts")
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    else expect(screen.queryByText("No subscription")).not.toBeInTheDocument();
    expect(screen.getByText("Restricted")).toBeInTheDocument();
  },
);
test.each(["subscription-summary", "counts"] as const)(
  "late %s response cannot repopulate data after authority retirement",
  async (suffix) => {
    let resolve: (v: unknown) => void = () => {};
    const late = new Promise((r) => {
      resolve = r;
    });
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((r: { path: string }) =>
      r.path.endsWith(suffix) ? late : original(r),
    );
    const c = client();
    const view = render(tree(c));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    if (suffix === "counts") await screen.findByText("No subscription");
    else await screen.findAllByText("0");
    expect(screen.getByText("Loading summary…")).toBeInTheDocument();
    mocks.authority.accessVersion = 8;
    mocks.authority.allows.mockReturnValue(false);
    view.rerender(tree(c));
    await act(async () => {
      resolve(
        suffix === "counts"
          ? {
              data: {
                workspaceId: id,
                counts: {
                  branches: { active: 777 },
                  trainees: { active: 777, needsReassignment: 777 },
                  staff: { activeIncludingOwners: 777 },
                },
              },
            }
          : { data: { workspaceId: id, subscription: null } },
      );
    });
    expect(screen.queryByText("777")).not.toBeInTheDocument();
    expect(screen.queryByText("No subscription")).not.toBeInTheDocument();
    expect(screen.getAllByText("Restricted")).toHaveLength(2);
    expect(
      c
        .getQueriesData({
          predicate: (q) =>
            JSON.stringify(q.queryKey).includes('"accessVersion":7'),
        })
        .every(([, data]) => data === undefined),
    ).toBe(true);
  },
);

test.each(["en", "ar"] as const)(
  "renders every subscription status and billing period in %s with term validity dates",
  async (locale) => {
    const { subscriptionLifecycleStatuses, billingPeriods } =
      await import("@/contracts");
    const c = client();
    const labels = messages[locale].platformWorkspaceSummaries;
    let status: string = "ACTIVE",
      period: string = "MONTHLY";
    mocks.request.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(
        path.endsWith("counts")
          ? {
              data: {
                workspaceId: id,
                counts: {
                  branches: { active: 2 },
                  trainees: { active: 3, needsReassignment: 1 },
                  staff: { activeIncludingOwners: 4 },
                },
              },
            }
          : {
              data: {
                workspaceId: id,
                subscription: {
                  lifecycleStatus: status,
                  startedAt: "2026-10-09T08:30:00.000Z",
                  expiresAt: null,
                  graceEndsAt: null,
                  frozenAt: null,
                  expiredAt: null,
                  cancelledAt: null,
                  currentTerms: {
                    planId: "68e7a9d10d56fd2b98d4a102",
                    planName: "Very long current plan name",
                    planVersionId: "68e7a9d10d56fd2b98d4a103",
                    billingPeriod: period,
                    effectiveFrom: "2026-10-09T08:30:00.000Z",
                    effectiveTo: "2026-12-09T08:30:00.000Z",
                  },
                },
              },
            },
      ),
    );
    render(
      <QueryClientProvider client={c}>
        <PlatformWorkspaceSummaries
          labels={labels}
          locale={locale}
          workspaceId={id}
          onNotFound={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByText("Very long current plan name");
    for (const value of subscriptionLifecycleStatuses) {
      status = value;
      await act(async () => {
        await c.refetchQueries({
          predicate: (q) => q.queryKey.includes("subscription-summary"),
        });
      });
      await screen.findByText(labels.statuses[value]);
    }
    for (const value of billingPeriods) {
      period = value;
      await act(async () => {
        await c.refetchQueries({
          predicate: (q) => q.queryKey.includes("subscription-summary"),
        });
      });
      await screen.findByText(labels.billingPeriods[value]);
    }
    expect(screen.getByText(labels.termStarts)).toBeInTheDocument();
    expect(screen.getByText(labels.termEnds)).toBeInTheDocument();
    expect(
      document.querySelectorAll('time[datetime="2026-10-09T08:30:00.000Z"]'),
    ).toHaveLength(2);
    expect(
      screen.queryByText("68e7a9d10d56fd2b98d4a102"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("68e7a9d10d56fd2b98d4a103"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(labels.expiresAt)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  },
);
test.each(["subscription-summary", "counts"] as const)(
  "%s identity changes retire cached data across each authority dimension",
  async (suffix) => {
    const c = client();
    const view = render(tree(c));
    await screen.findByText("No subscription");
    await screen.findAllByText("0");
    const oldKeys = c
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    mocks.authority.principalId = "user-b";
    mocks.authority.sessionGeneration = 5;
    mocks.authority.membershipId = "membership-b";
    mocks.authority.accessVersion = 8;
    mocks.authority.validUntil = "2035-01-01T00:00:00.000Z";
    view.rerender(tree(c));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(4));
    const key = c
      .getQueryCache()
      .getAll()
      .find((q) => q.queryKey.includes(suffix))!.queryKey;
    expect(key).toContainEqual({
      accessVersion: 8,
      authorityValidUntil: "2035-01-01T00:00:00.000Z",
      membershipId: "membership-b",
      principalId: "user-b",
      sessionGeneration: 5,
      workspaceId: id,
      permission:
        suffix === "counts"
          ? "platform_workspaces.manage"
          : "subscriptions.read",
      allowed: true,
    });
    oldKeys.forEach((key) => expect(c.getQueryData(key)).toBeUndefined());
  },
);

test("archived detail renders both eligible cards in Arabic RTL without an ACTIVE gate", async () => {
  const { PlatformWorkspaceDetail } = await import("./PlatformWorkspaceDetail");
  const original = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation((r: { path: string }) =>
    r.path.endsWith("counts") || r.path.endsWith("subscription-summary")
      ? original(r)
      : Promise.resolve({
          id,
          name: "Archived Gym",
          type: "GYM",
          status: "ARCHIVED",
          timezone: "UTC",
          defaultLanguage: "ar",
          createdAt: "2026-10-09T08:30:00.000Z",
        }),
  );
  render(
    <QueryClientProvider client={client()}>
      <PlatformWorkspaceDetail
        labels={{
          ...messages.ar.platformWorkspaceDetail,
          statuses: messages.ar.platformWorkspaces.statuses,
        }}
        locale="ar"
        workspaceId={id}
        summaryLabels={messages.ar.platformWorkspaceSummaries}
      />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText(
      messages.ar.platformWorkspaceSummaries.noSubscription,
    ),
  ).toBeInTheDocument();
  expect(await screen.findAllByText((0).toLocaleString("ar"))).toHaveLength(4);
  expect(
    screen.getByRole("heading", { name: "Archived Gym" }).closest("article"),
  ).toHaveAttribute("dir", "rtl");
});
