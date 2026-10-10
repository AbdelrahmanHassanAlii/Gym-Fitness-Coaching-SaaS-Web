/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthSessionContextValue } from "@/lib/auth";
import type { PlatformAuthority } from "@/lib/platform-access";
import { ApiError } from "@/lib/api";
import { PlatformWorkspaceDetail } from "./PlatformWorkspaceDetail";

const workspaceId = "68e7a9d10d56fd2b98d4a101";
const mocks = vi.hoisted(() => ({
  authority: {
    accessVersion: 7,
    allows: vi.fn(() => true),
    membershipId: "platform-membership-a",
    principalId: "user-a",
    refresh: vi.fn().mockResolvedValue(undefined),
    sessionGeneration: 4,
    validUntil: "2030-10-10T08:00:00.000Z" as string | null,
  },
  markSessionExpired: vi.fn(),
  request: vi.fn(),
  searchParams: new URLSearchParams("q=Alpha&status=ACTIVE"),
}));

vi.mock("next/navigation", () => ({
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

describe("Platform workspace detail", () => {
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
    mocks.searchParams = new URLSearchParams("q=Alpha&status=ACTIVE");
  });

  test("renders the minimized localized detail with optional locations and UTC date", async () => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
    mocks.request.mockResolvedValue(detail());
    renderDetail();

    expect(
      await screen.findByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Gym")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Africa/Cairo")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Egypt")).toBeInTheDocument();
    expect(screen.getByText("Cairo")).toBeInTheDocument();
    expect(screen.getByText("Nasr City")).toBeInTheDocument();
    expect(screen.getByText("Oct 9, 2026, 11:30 PM")).toHaveAttribute(
      "datetime",
      "2026-10-09T23:30:00.000Z",
    );
    expect(
      screen.getByRole("link", { name: "Back to workspaces" }),
    ).toHaveAttribute("href", "/platform/workspaces?q=Alpha&status=ACTIVE");
    expect(mocks.request).toHaveBeenCalledWith({
      method: "GET",
      path: `/platform/workspaces/${workspaceId}`,
      signal: expect.any(AbortSignal),
    });
  });

  test("omits the location section when every optional field is absent", async () => {
    const required: Record<string, unknown> = detail();
    delete required.country;
    delete required.city;
    delete required.governorate;
    mocks.request.mockResolvedValue(required);
    renderDetail();

    await screen.findByRole("heading", { name: "Alpha" });
    expect(
      screen.queryByRole("heading", { name: "Location" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  test("renders a localized 404 without logout or authority retirement", async () => {
    mocks.request.mockRejectedValue(backendError("WORKSPACE_NOT_FOUND", 404));
    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Workspace not found",
    );
    expect(mocks.markSessionExpired).not.toHaveBeenCalled();
    expect(mocks.authority.refresh).not.toHaveBeenCalled();
  });

  test("does not request an obviously malformed workspace id", () => {
    renderDetail(testQueryClient(), "not-an-id");
    expect(screen.getByRole("alert")).toHaveTextContent("Workspace not found");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  test("retires rendered detail and refreshes authority after a subsequent 403", async () => {
    mocks.request
      .mockResolvedValueOnce(detail())
      .mockRejectedValueOnce(backendError("PERMISSION_DENIED", 403));
    const queryClient = testQueryClient();
    renderDetail(queryClient);
    expect(
      await screen.findByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["hassan-web", "platform-workspaces", "detail"],
      });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "no longer authorized",
      ),
    );
    expect(
      screen.queryByRole("heading", { name: "Alpha" }),
    ).not.toBeInTheDocument();
    expect(mocks.authority.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.markSessionExpired).not.toHaveBeenCalled();
  });

  test("suppresses a late detail response after principal authority changes", async () => {
    const stale = deferred<unknown>();
    mocks.request.mockReturnValueOnce(stale.promise);
    const queryClient = testQueryClient();
    const view = renderDetail(queryClient);

    mocks.authority.principalId = "user-b";
    mocks.request.mockResolvedValueOnce(detail({ name: "Current" }));
    view.rerender(tree(queryClient, workspaceId));
    expect(
      await screen.findByRole("heading", { name: "Current" }),
    ).toBeInTheDocument();

    await act(async () => {
      stale.resolve(detail({ name: "Stale" }));
      await Promise.resolve();
    });
    expect(
      screen.getByRole("heading", { name: "Current" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });

  test("retires cached detail when the authority lifetime changes", async () => {
    mocks.request
      .mockResolvedValueOnce(detail())
      .mockReturnValueOnce(new Promise(() => {}));
    const queryClient = testQueryClient();
    const view = renderDetail(queryClient);
    expect(
      await screen.findByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();

    mocks.authority.validUntil = "2030-10-10T09:00:00.000Z";
    view.rerender(tree(queryClient, workspaceId));
    expect(
      screen.queryByRole("heading", { name: "Alpha" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Loading workspace detail...")).toBeInTheDocument();
  });
});

const labels = {
  title: "Workspace detail",
  loading: "Loading workspace detail...",
  actions: { back: "Back to workspaces", retry: "Retry" },
  errors: {
    denied: "Workspace detail is unavailable.",
    forbidden: "You are no longer authorized to view workspace detail.",
    malformed: "Unexpected detail data.",
    notFound: "Workspace not found.",
    unavailable: "Workspace detail could not be loaded.",
  },
  sections: {
    workspace: "Workspace",
    configuration: "Configuration",
    location: "Location",
    metadata: "Metadata",
  },
  fields: {
    name: "Name",
    type: "Workspace type",
    status: "Status",
    timezone: "Timezone",
    defaultLanguage: "Default language",
    country: "Country",
    governorate: "Governorate",
    city: "City",
    createdAt: "Created at",
  },
  statuses: {
    PENDING_ACTIVATION: "Pending activation",
    ACTIVE: "Active",
    RESTRICTED: "Restricted",
    SUSPENDED: "Suspended",
    ARCHIVED: "Archived",
  },
  types: { GYM: "Gym", INDEPENDENT_TRAINER: "Independent trainer" },
  languages: { ar: "Arabic", en: "English" },
};

function renderDetail(queryClient = testQueryClient(), id = workspaceId) {
  return render(tree(queryClient, id));
}

function tree(queryClient: QueryClient, id: string) {
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformWorkspaceDetail labels={labels} locale="en" workspaceId={id} />
    </QueryClientProvider>
  );
}

function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: workspaceId,
    name: "Alpha",
    type: "GYM",
    status: "ACTIVE",
    timezone: "Africa/Cairo",
    defaultLanguage: "en",
    createdAt: "2026-10-09T23:30:00.000Z",
    country: "Egypt",
    governorate: "Cairo",
    city: "Nasr City",
    ...overrides,
  };
}

function backendError(code: string, status: number) {
  return new ApiError({
    category: status === 404 ? "not-found" : "forbidden",
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
