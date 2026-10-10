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
import { beforeEach, describe, expect, test, vi } from "vitest";
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
}));

vi.mock("@/lib/platform-access", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/platform-access")>();
  return {
    ...original,
    usePlatformAuthority: () => mocks.authority as PlatformAuthority,
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
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.markSessionExpired.mockReset();
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

  test("loads the exact opaque cursor, appends rows, and stops at the terminal page", async () => {
    const cursor = "68e7a9d10d56fd2b98d4a100";
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
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
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

  test("retires rows on a 403 and revalidates Platform authority without logout", async () => {
    mocks.request.mockRejectedValue(backendError("PERMISSION_DENIED", 403));
    renderDirectory();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "no longer authorized",
      ),
    );
    expect(mocks.authority.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.markSessionExpired).not.toHaveBeenCalled();
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

  test("a late page from an old authority identity cannot replace current data", async () => {
    const oldPage = deferred<unknown>();
    mocks.request.mockReturnValueOnce(oldPage.promise);
    const queryClient = testQueryClient();
    const view = renderDirectory(queryClient);

    mocks.authority.principalId = "user-b";
    mocks.authority.sessionGeneration = 5;
    mocks.authority.membershipId = "platform-membership-b";
    mocks.authority.accessVersion = 8;
    mocks.request.mockResolvedValueOnce(
      page([row("102", "Current", "ACTIVE")], null, false),
    );
    view.rerender(tree(queryClient));

    expect(await screen.findByText("Current")).toBeInTheDocument();
    oldPage.resolve(page([row("101", "Stale", "ACTIVE")], null, false));
    await act(async () => undefined);
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
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

    expect(await screen.findByText("بانتظار التفعيل")).toBeInTheDocument();
    expect(screen.getByText("نشطة")).toBeInTheDocument();
    expect(screen.getByText("مقيدة")).toBeInTheDocument();
    expect(screen.getByText("معلقة")).toBeInTheDocument();
    expect(screen.getByText("مؤرشفة")).toBeInTheDocument();
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
  loading: "Loading workspaces...",
  errors: {
    denied: "Workspace directory is not available.",
    forbidden: "You are no longer authorized to view workspaces.",
    malformed: "The Backend returned unexpected workspace data.",
    unavailable: "Workspaces could not be loaded.",
    loadMore: "Additional workspaces could not be loaded.",
    cursor: "The directory position is no longer valid.",
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
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
