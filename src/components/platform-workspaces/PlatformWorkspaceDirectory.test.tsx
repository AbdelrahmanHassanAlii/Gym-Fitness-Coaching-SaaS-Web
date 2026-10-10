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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthSessionContextValue } from "@/lib/auth";
import type { PlatformAuthority } from "@/lib/platform-access";
import { ApiError } from "@/lib/api";
import { PlatformWorkspaceDirectory } from "./PlatformWorkspaceDirectory";

const mocks = vi.hoisted(() => ({
  authority: {
    accessVersion: 7,
    allows: vi.fn(() => true),
    membershipId: "platform-membership-a",
    principalId: "user-a",
    refresh: vi.fn().mockResolvedValue(undefined),
    sessionGeneration: 4,
    validUntil: "2030-10-10T08:00:00.000Z",
  },
  request: vi.fn(),
  markSessionExpired: vi.fn(),
  pathname: "/platform/workspaces",
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/platform-access", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/platform-access")>();
  return {
    ...original,
    usePlatformAuthority: () => mocks.authority as unknown as PlatformAuthority,
  };
});

vi.mock("@/lib/auth", () => ({
  useAuthSession: () =>
    ({
      apiClient: { request: mocks.request },
      generation: mocks.authority.sessionGeneration,
      markSessionExpired: mocks.markSessionExpired,
      state: {
        accessToken: "token",
        restrictedUntilVerified: false,
        status: "authenticated",
        user: { id: mocks.authority.principalId },
      },
    }) as unknown as AuthSessionContextValue,
}));

describe("Platform workspace directory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    mocks.request.mockReset();
    mocks.markSessionExpired.mockReset();
    mocks.replace.mockReset();
    mocks.searchParams = new URLSearchParams();
    mocks.authority.allows.mockReset();
    mocks.authority.allows.mockReturnValue(true);
    mocks.authority.refresh.mockReset();
    mocks.authority.refresh.mockResolvedValue(undefined);
    mocks.authority.principalId = "user-a";
    mocks.authority.sessionGeneration = 4;
    mocks.authority.membershipId = "platform-membership-a";
    mocks.authority.accessVersion = 7;
    mocks.authority.validUntil = "2030-10-10T08:00:00.000Z";
  });

  test("does not fetch without the exact permission", async () => {
    mocks.authority.allows.mockReturnValue(false);
    renderDirectory();

    expect(screen.getByRole("alert")).toHaveTextContent("not available");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  test("renders an empty first page and sends only explicit limit 50", async () => {
    mocks.request.mockResolvedValue(page([], null, false));
    renderDirectory();

    expect(
      await screen.findByText("No workspaces are available."),
    ).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/platform/workspaces",
      query: { limit: 50 },
      signal: expect.any(AbortSignal),
    });
  });

  test("commits q and status through URL state and starts a fresh query", async () => {
    mocks.request
      .mockResolvedValueOnce(page([row("101", "All", "ACTIVE")], null, false))
      .mockResolvedValueOnce(page([row("102", "Alpha", "ACTIVE")], null, false))
      .mockResolvedValueOnce(
        page([row("102", "Alpha", "ACTIVE")], null, false),
      );
    const queryClient = testQueryClient();
    const view = renderDirectory(queryClient);
    expect(await screen.findByText("All")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search by workspace name"), {
      target: { value: "Alpha" },
    });
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "ACTIVE" },
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      "/platform/workspaces?status=ACTIVE",
    );

    mocks.searchParams = new URLSearchParams("status=ACTIVE");
    view.rerender(tree(queryClient));
    await screen.findByText("Alpha");
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/platform/workspaces?status=ACTIVE&q=Alpha",
    );

    mocks.searchParams = new URLSearchParams("q=Alpha&status=ACTIVE");
    view.rerender(tree(queryClient));
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("All")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alpha/ })).toHaveAttribute(
      "href",
      "/platform/workspaces/68e7a9d10d56fd2b98d4a102?q=Alpha&status=ACTIVE",
    );
    expect(mocks.request).toHaveBeenLastCalledWith({
      method: "GET",
      path: "/platform/workspaces",
      query: { limit: 50, q: "Alpha", status: "ACTIVE" },
      signal: expect.any(AbortSignal),
    });
  });

  test("clears blank q, rejects more than 64 code points, and preserves emoji", async () => {
    mocks.request.mockResolvedValue(page([], null, false));
    const queryClient = testQueryClient();
    const view = renderDirectory(queryClient);
    await screen.findByText("No workspaces are available.");
    const input = screen.getByLabelText("Search by workspace name");

    fireEvent.change(input, { target: { value: "😀".repeat(64) } });
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    expect(mocks.replace).toHaveBeenLastCalledWith(
      `/platform/workspaces?q=${encodeURIComponent("😀".repeat(64))}`,
    );

    const accepted = new URLSearchParams();
    accepted.set("q", "😀".repeat(64));
    mocks.searchParams = accepted;
    view.rerender(tree(queryClient));
    await screen.findByText(
      "No workspaces match the current search or filter.",
    );
    expect(mocks.request).toHaveBeenLastCalledWith({
      method: "GET",
      path: "/platform/workspaces",
      query: { limit: 50, q: "😀".repeat(64) },
      signal: expect.any(AbortSignal),
    });

    fireEvent.change(screen.getByLabelText("Search by workspace name"), {
      target: { value: "😀".repeat(65) },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("64 characters");

    mocks.searchParams = new URLSearchParams("q=Alpha");
    view.rerender(tree(queryClient));
    await screen.findByText(
      "No workspaces match the current search or filter.",
    );
    fireEvent.change(screen.getByLabelText("Search by workspace name"), {
      target: { value: "   " },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    expect(mocks.replace).toHaveBeenLastCalledWith("/platform/workspaces");
  });

  test.each([
    "PENDING_ACTIVATION",
    "ACTIVE",
    "RESTRICTED",
    "SUSPENDED",
    "ARCHIVED",
  ] as const)("sends the exact singular %s status", async (status) => {
    mocks.searchParams = new URLSearchParams(`status=${status}`);
    mocks.request.mockResolvedValue(page([], null, false));
    renderDirectory();

    await screen.findByText(
      "No workspaces match the current search or filter.",
    );
    expect(mocks.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/platform/workspaces",
      query: { limit: 50, status },
      signal: expect.any(AbortSignal),
    });
  });

  test("removes an invalid URL status without sending it to Backend", async () => {
    mocks.searchParams = new URLSearchParams("status=UNKNOWN");
    mocks.request.mockResolvedValue(page([], null, false));
    renderDirectory();

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/platform/workspaces"),
    );
    expect(mocks.request.mock.calls[0]?.[0].query).toEqual({ limit: 50 });
  });

  test("All statuses removes status and every filter commit drops cursor URL state", async () => {
    mocks.searchParams = new URLSearchParams(
      "q=Alpha&status=ACTIVE&cursor=must-not-survive",
    );
    mocks.request.mockResolvedValue(page([], null, false));
    renderDirectory();
    await screen.findByText(
      "No workspaces match the current search or filter.",
    );

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "" },
    });
    expect(mocks.replace).toHaveBeenCalledWith("/platform/workspaces?q=Alpha");
  });

  test("replays an opaque cursor unchanged for a filtered continuation", async () => {
    const cursor = "opaque:filtered:AZ_+/=";
    mocks.searchParams = new URLSearchParams("q=Alpha&status=ACTIVE");
    mocks.request
      .mockResolvedValueOnce(
        page([row("101", "Alpha", "ACTIVE")], cursor, true),
      )
      .mockResolvedValueOnce(page([], null, false));
    renderDirectory();

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(mocks.request.mock.calls[1]?.[0].query).toEqual({
      cursor,
      limit: 50,
      q: "Alpha",
      status: "ACTIVE",
    });
  });

  test("loads the exact opaque cursor, appends rows, and stops at the terminal page", async () => {
    const cursor = "opaque:workspace-page:AZ_+/=";
    mocks.request
      .mockResolvedValueOnce(
        page([row("101", "Alpha", "ACTIVE")], cursor, true),
      )
      .mockResolvedValueOnce(
        page([row("100", "Beta", "ARCHIVED")], null, false),
      );
    renderDirectory();

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(mocks.request).toHaveBeenNthCalledWith(2, {
      method: "GET",
      path: "/platform/workspaces",
      query: { cursor, limit: 50 },
      signal: expect.any(AbortSignal),
    });
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Active")).toHaveLength(2);
    expect(screen.getAllByText("Archived")).toHaveLength(2);
  });

  test("prevents concurrent load-more requests", async () => {
    const continuation = deferred<unknown>();
    mocks.request
      .mockResolvedValueOnce(
        page([row("101", "Alpha", "ACTIVE")], "68e7a9d10d56fd2b98d4a100", true),
      )
      .mockReturnValueOnce(continuation.promise);
    renderDirectory();

    const loadMore = await screen.findByRole("button", { name: "Load more" });
    fireEvent.click(loadMore);
    fireEvent.click(loadMore);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole("button", { name: "Loading more..." }),
    ).toBeDisabled();
    continuation.resolve(page([row("100", "Beta", "ACTIVE")], null, false));
    expect(await screen.findByText("Beta")).toBeInTheDocument();
  });

  test("fails closed when a continuation duplicates a previously loaded row", async () => {
    const first = row("101", "Alpha", "ACTIVE");
    mocks.request
      .mockResolvedValueOnce(page([first], "68e7a9d10d56fd2b98d4a100", true))
      .mockResolvedValueOnce(page([first], null, false));
    renderDirectory();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "unexpected workspace data",
    );
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  test("keeps page one on a continuation failure and retries the same cursor", async () => {
    const cursor = "68e7a9d10d56fd2b98d4a100";
    mocks.request
      .mockResolvedValueOnce(
        page([row("101", "Alpha", "ACTIVE")], cursor, true),
      )
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        page([row("100", "Beta", "RESTRICTED")], null, false),
      );
    renderDirectory();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Additional workspaces",
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading more" }));
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(mocks.request.mock.calls[1]?.[0].query.cursor).toBe(cursor);
    expect(mocks.request.mock.calls[2]?.[0].query.cursor).toBe(cursor);
  });

  test("offers a first-page restart for CURSOR_INVALID", async () => {
    mocks.request
      .mockResolvedValueOnce(
        page([row("101", "Alpha", "ACTIVE")], "68e7a9d10d56fd2b98d4a100", true),
      )
      .mockRejectedValueOnce(backendError("CURSOR_INVALID", 422))
      .mockResolvedValueOnce(
        page([row("102", "New first page", "ACTIVE")], null, false),
      );
    renderDirectory();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Restart directory" }),
    );
    expect(await screen.findByText("New first page")).toBeInTheDocument();
    expect(mocks.request.mock.calls[2]?.[0].query).toEqual({ limit: 50 });
  });

  test("retires already-loaded rows after a continuation 403 without logout", async () => {
    mocks.searchParams = new URLSearchParams("q=Previously");
    mocks.request
      .mockResolvedValueOnce(
        page(
          [row("101", "Previously authorized", "ACTIVE")],
          "opaque-next-page",
          true,
        ),
      )
      .mockRejectedValueOnce(backendError("PERMISSION_DENIED", 403));
    renderDirectory();

    expect(
      await screen.findByText("Previously authorized"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "no longer authorized",
      ),
    );
    expect(screen.queryByText("Previously authorized")).not.toBeInTheDocument();
    expect(mocks.authority.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.markSessionExpired).not.toHaveBeenCalled();
  });

  test("renders a filtered validation error without expiring the session", async () => {
    mocks.searchParams = new URLSearchParams("q=Alpha");
    mocks.request.mockRejectedValue(
      new ApiError({
        category: "validation",
        code: "VALIDATION_FAILED",
        kind: "backend",
        message: "invalid q",
        status: 400,
      }),
    );
    renderDirectory();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "search or filter request is invalid",
    );
    expect(mocks.markSessionExpired).not.toHaveBeenCalled();
    expect(mocks.authority.refresh).not.toHaveBeenCalled();
  });

  test("suppresses a late filtered response after authority identity changes", async () => {
    mocks.searchParams = new URLSearchParams("q=Old");
    const oldPage = deferred<unknown>();
    mocks.request.mockReturnValueOnce(oldPage.promise);
    const queryClient = testQueryClient();
    const view = renderDirectory(queryClient);

    mocks.authority.accessVersion = 8;
    mocks.searchParams = new URLSearchParams("q=Current");
    mocks.request.mockResolvedValueOnce(
      page([row("102", "Current result", "ACTIVE")], null, false),
    );
    view.rerender(tree(queryClient));
    expect(await screen.findByText("Current result")).toBeInTheDocument();

    await act(async () => {
      oldPage.resolve(page([row("101", "Old result", "ACTIVE")], null, false));
      await Promise.resolve();
    });
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
    expect(screen.getByText("Current result")).toBeInTheDocument();
  });

  test("uses existing session-expiry handling for a 401", async () => {
    const error = backendError("AUTH_REQUIRED", 401);
    mocks.request.mockRejectedValue(error);
    renderDirectory();

    await waitFor(() =>
      expect(mocks.markSessionExpired).toHaveBeenCalledWith(error),
    );
  });

  test("shows a retryable initial error without fabricating an empty page", async () => {
    mocks.request
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        page([row("101", "Recovered", "ACTIVE")], null, false),
      );
    renderDirectory();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be loaded",
    );
    expect(
      screen.queryByText("No workspaces are available."),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Recovered")).toBeInTheDocument();
  });

  test.each([
    ["principal", (): void => void (mocks.authority.principalId = "user-b")],
    [
      "auth generation",
      (): void => void (mocks.authority.sessionGeneration = 5),
    ],
    [
      "membership",
      (): void => void (mocks.authority.membershipId = "platform-membership-b"),
    ],
    ["access version", (): void => void (mocks.authority.accessVersion = 8)],
  ] as const)(
    "late success from an old %s cannot replace current directory state",
    async (_dimension, changeIdentity) => {
      await proveLateAuthorityResultSafe(changeIdentity, "success");
    },
  );

  test.each([
    ["principal", (): void => void (mocks.authority.principalId = "user-b")],
    [
      "auth generation",
      (): void => void (mocks.authority.sessionGeneration = 5),
    ],
    [
      "membership",
      (): void => void (mocks.authority.membershipId = "platform-membership-b"),
    ],
    ["access version", (): void => void (mocks.authority.accessVersion = 8)],
  ] as const)(
    "late error from an old %s cannot corrupt current directory state",
    async (_dimension, changeIdentity) => {
      await proveLateAuthorityResultSafe(changeIdentity, "error");
    },
  );

  test("renders createdAt in explicit UTC instead of the browser timezone", async () => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
    mocks.request.mockResolvedValue(
      page(
        [
          {
            ...row("101", "Boundary workspace", "ACTIVE"),
            createdAt: "2026-10-09T23:30:00.000Z",
          },
        ],
        null,
        false,
      ),
    );
    renderDirectory();

    const timestamp = await screen.findByText("Oct 9, 2026, 11:30 PM");
    expect(timestamp).toHaveAttribute("datetime", "2026-10-09T23:30:00.000Z");
  });

  test("localizes every status and uses RTL without leaking raw enums", async () => {
    mocks.request.mockResolvedValue(
      page(
        [
          "PENDING_ACTIVATION",
          "ACTIVE",
          "RESTRICTED",
          "SUSPENDED",
          "ARCHIVED",
        ].map((status, index) => row(`10${index}`, `مساحة ${index}`, status)),
        null,
        false,
      ),
    );
    renderDirectory(testQueryClient(), "ar");

    expect(await screen.findAllByText("بانتظار التفعيل")).toHaveLength(2);
    expect(screen.getAllByText("نشطة")).toHaveLength(2);
    expect(screen.getAllByText("مقيدة")).toHaveLength(2);
    expect(screen.getAllByText("معلقة")).toHaveLength(2);
    expect(screen.getAllByText("مؤرشفة")).toHaveLength(2);
    expect(screen.queryByText("PENDING_ACTIVATION")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "مساحات العمل" }).closest("section"),
    ).toHaveAttribute("dir", "rtl");
  });
});

const labels = {
  title: "Workspaces",
  columns: { name: "Workspace name", status: "Status", createdAt: "Created" },
  actions: {
    loadMore: "Load more",
    loadingMore: "Loading more...",
    refresh: "Refresh",
    retry: "Retry",
    retryMore: "Retry loading more",
    restart: "Restart directory",
  },
  empty: "No workspaces are available.",
  filteredEmpty: "No workspaces match the current search or filter.",
  loading: "Loading workspaces...",
  search: {
    label: "Search by workspace name",
    placeholder: "For example, Atlas",
    apply: "Search",
    clear: "Clear search",
    statusLabel: "Filter by status",
    allStatuses: "All statuses",
    tooLong: "Search must be no more than 64 characters.",
    viewDetails: "View details",
  },
  errors: {
    denied: "Workspace directory is not available.",
    forbidden: "You are no longer authorized to view workspaces.",
    malformed: "The Backend returned unexpected workspace data.",
    unavailable: "Workspaces could not be loaded.",
    loadMore: "Additional workspaces could not be loaded.",
    cursor: "The directory position is no longer valid.",
    validation: "The search or filter request is invalid.",
  },
  statuses: {
    PENDING_ACTIVATION: "Pending activation",
    ACTIVE: "Active",
    RESTRICTED: "Restricted",
    SUSPENDED: "Suspended",
    ARCHIVED: "Archived",
  },
};

const arLabels = {
  ...labels,
  title: "مساحات العمل",
  statuses: {
    PENDING_ACTIVATION: "بانتظار التفعيل",
    ACTIVE: "نشطة",
    RESTRICTED: "مقيدة",
    SUSPENDED: "معلقة",
    ARCHIVED: "مؤرشفة",
  },
};

function renderDirectory(
  queryClient = testQueryClient(),
  locale: "ar" | "en" = "en",
) {
  return render(tree(queryClient, locale));
}

function tree(queryClient: QueryClient, locale: "ar" | "en" = "en") {
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformWorkspaceDirectory
        labels={locale === "ar" ? arLabels : labels}
        locale={locale}
      />
    </QueryClientProvider>
  );
}

function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
}

function row(suffix: string, name: string, status: string) {
  return {
    id: `68e7a9d10d56fd2b98d4a${suffix}`,
    name,
    status,
    createdAt: "2026-10-09T08:30:00.000Z",
  };
}

function page(data: unknown[], nextCursor: string | null, hasMore: boolean) {
  return { data, meta: { nextCursor, hasMore } };
}

function backendError(code: string, status: number) {
  return new ApiError({
    category: status === 401 ? "unauthenticated" : "forbidden",
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

async function proveLateAuthorityResultSafe(
  changeIdentity: () => unknown,
  outcome: "error" | "success",
) {
  const oldPage = deferred<unknown>();
  mocks.request.mockReturnValueOnce(oldPage.promise);
  const queryClient = testQueryClient();
  const view = renderDirectory(queryClient);

  changeIdentity();
  mocks.request.mockResolvedValueOnce(
    page([row("102", "Current", "ACTIVE")], null, false),
  );
  view.rerender(tree(queryClient));

  expect(await screen.findByText("Current")).toBeInTheDocument();
  await act(async () => {
    if (outcome === "success") {
      oldPage.resolve(page([row("101", "Stale", "ACTIVE")], null, false));
    } else {
      oldPage.reject(new TypeError("late failure"));
    }
    await Promise.resolve();
  });
  expect(screen.getByText("Current")).toBeInTheDocument();
  expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
}
