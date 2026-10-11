import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { ApiError } from "@/lib/api";
import type { PlatformAuthority } from "@/lib/platform-access";
import { PlatformUserDirectory } from "./PlatformUserDirectory";
import { PlatformUserDetail } from "./PlatformUserDetail";

const mocks = vi.hoisted(() => ({
  authority: {
    principalId: "principal",
    sessionGeneration: 4,
    membershipId: "membership",
    accessVersion: 7,
    validUntil: null as string | null,
    allows: vi.fn(() => true),
    refresh: vi.fn(async () => {}),
  },
  request: vi.fn(),
  expired: vi.fn(),
  pathname: "/platform/users",
  params: new URLSearchParams(),
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.params,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/auth", () => ({
  useAuthSession: () => ({
    apiClient: { request: mocks.request },
    markSessionExpired: mocks.expired,
  }),
}));
vi.mock("@/lib/platform-access", async (original) => ({
  ...(await original<typeof import("@/lib/platform-access")>()),
  usePlatformAuthority: () => mocks.authority as unknown as PlatformAuthority,
}));
const id = "68e7a9d10d56fd2b98d4a101",
  other = "68e7a9d10d56fd2b98d4a102",
  at = "2026-10-11T10:00:00.000Z";
const member = (name = "Member", userId = id) => ({
  id: userId,
  displayName: name,
  email: "member@example.com",
  status: "LOCKED",
  createdAt: at,
  platformMembership: { status: "SUSPENDED" },
});
const page = (name = "Member", cursor: string | null = null, userId = id) => ({
  data: [member(name, userId)],
  meta: { nextCursor: cursor, hasMore: cursor !== null },
});
const detail = (name = "Member", userId = id) => ({
  data: {
    ...member(name, userId),
    updatedAt: at,
    platformMembership: {
      id,
      status: "ENDED",
      createdAt: at,
      updatedAt: at,
      suspendedAt: at,
      endedAt: at,
    },
  },
});
const error = (status: number, code: string) =>
  new ApiError({
    category: status === 403 ? "forbidden" : "validation",
    kind: "backend",
    message: code,
    status,
    code,
  });
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function client() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
}
function tree(
  c: QueryClient,
  kind: "directory" | "detail" = "directory",
  userId = id,
  locale: "en" | "ar" = "en",
) {
  const router = {
    push: mocks.push,
    prefetch: vi.fn(async () => {}),
    beforePopState: vi.fn(),
    isReady: true,
    isLocaleDomain: false,
    isFallback: false,
    isPreview: false,
    basePath: "",
    route: mocks.pathname,
    pathname: mocks.pathname,
    asPath: mocks.pathname,
    query: {},
    back: vi.fn(),
    forward: vi.fn(),
    reload: vi.fn(),
    replace: vi.fn(),
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  } as NextRouter;
  return (
    <RouterContext.Provider value={router}>
      <QueryClientProvider client={c}>
        {kind === "directory" ? (
          <PlatformUserDirectory
            labels={messages[locale].platformUsers}
            locale={locale}
          />
        ) : (
          <PlatformUserDetail
            labels={messages[locale].platformUsers}
            locale={locale}
            userId={userId}
          />
        )}
      </QueryClientProvider>
    </RouterContext.Provider>
  );
}
beforeEach(() => {
  mocks.request.mockReset();
  mocks.expired.mockReset();
  mocks.authority.allows.mockReset().mockReturnValue(true);
  mocks.authority.refresh.mockClear();
  mocks.authority.principalId = "principal";
  mocks.authority.sessionGeneration = 4;
  mocks.authority.accessVersion = 7;
  mocks.authority.membershipId = "membership";
  mocks.authority.validUntil = null;
  mocks.params = new URLSearchParams();
  mocks.pathname = "/platform/users";
  mocks.replace.mockReset().mockImplementation((url: string) => {
    mocks.params = new URL(url, "http://test").searchParams;
  });
  mocks.push.mockReset().mockImplementation(async (url: string) => {
    const next = new URL(url, "http://test");
    mocks.pathname = next.pathname;
    mocks.params = next.searchParams;
    return true;
  });
});
describe("Platform member directory", () => {
  test("submits an exact user ID and sends the committed ID unchanged", async () => {
    mocks.request.mockResolvedValue(page());
    const c = client(),
      view = render(tree(c));
    await screen.findByText("Member");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: id } });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    view.rerender(tree(c));
    await screen.findByText("Member");
    expect(mocks.params.get("q")).toBe(id);
    expect(mocks.request.mock.lastCall?.[0].query).toEqual({
      limit: 50,
      q: id,
    });
  });
  test("fetches only GET directory and displays independent statuses and no management", async () => {
    mocks.request.mockResolvedValue(page());
    render(tree(client()));
    await screen.findByText("Member");
    expect(mocks.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/platform/users",
      query: { limit: 50 },
      signal: expect.any(AbortSignal),
    });
    expect(mocks.authority.allows).toHaveBeenCalledWith("platform_users.read");
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getAllByText("Suspended")[1]).toBeInTheDocument();
    expect(
      screen.getByText(messages.en.platformUsers.scope),
    ).toBeInTheDocument();
    for (const text of [
      /invite/i,
      /reset password/i,
      /manage grants/i,
      /reactivate/i,
      /end access/i,
      /add platform/i,
    ])
      expect(
        screen.queryByRole("button", { name: text }),
      ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /normalizedEmail|passwordHash|accessVersion|permissionProfileIds|workspace_memberships/,
    );
  });
  test("explicit email search commits URL, preserves filter, and Clear resets pages without live queries", async () => {
    mocks.request.mockResolvedValue(page());
    const c = client(),
      view = render(tree(c));
    await screen.findByText("Member");
    const input = screen.getByLabelText(messages.en.platformUsers.search.label);
    fireEvent.change(input, { target: { value: "Member@example.com" } });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    fireEvent.submit(
      screen.getByRole("button", { name: "Search" }).closest("form")!,
    );
    expect(mocks.params.get("q")).toBe("Member@example.com");
    view.rerender(tree(c));
    await waitFor(() =>
      expect(mocks.request.mock.lastCall?.[0].query.q).toBe(
        "Member@example.com",
      ),
    );
    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: "ACTIVE" },
    });
    view.rerender(tree(c));
    await waitFor(() =>
      expect(
        mocks.request.mock.lastCall?.[0].query.platformMembershipStatus,
      ).toBe("ACTIVE"),
    );
    expect(mocks.params.get("q")).toBe("Member@example.com");
    fireEvent.click(await screen.findByRole("button", { name: "Clear" }));
    view.rerender(tree(c));
    await waitFor(() =>
      expect(mocks.request.mock.lastCall?.[0].query).toEqual({
        limit: 50,
        platformMembershipStatus: "ACTIVE",
      }),
    );
    expect(mocks.params.has("q")).toBe(false);
    expect(mocks.params.has("cursor")).toBe(false);
  });
  test.each(["ACTIVE", "SUSPENDED", "ENDED", ""])(
    "filter %s is exact URL/API state",
    async (status) => {
      mocks.request.mockResolvedValue(page());
      const c = client(),
        view = render(tree(c));
      await screen.findByText("Member");
      fireEvent.change(await screen.findByRole("combobox"), {
        target: { value: status },
      });
      view.rerender(tree(c));
      await waitFor(() =>
        expect(mocks.request.mock.lastCall?.[0].query).toEqual({
          limit: 50,
          ...(status ? { platformMembershipStatus: status } : {}),
        }),
      );
      expect(mocks.params.get("platformMembershipStatus")).toBe(status || null);
    },
  );
  test("opaque next page appends without URL cursor; filter/search retire old pages", async () => {
    mocks.request
      .mockResolvedValueOnce(page("First", "opaque-cursor"))
      .mockResolvedValueOnce(page("Second", null, other))
      .mockResolvedValue(page("New"));
    const c = client(),
      view = render(tree(c));
    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Second");
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(mocks.request.mock.calls[1][0].query.cursor).toBe("opaque-cursor");
    expect(mocks.params.has("cursor")).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: "ENDED" },
    });
    view.rerender(tree(c));
    await screen.findByText("New");
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.queryByText("Second")).not.toBeInTheDocument();
  });
  test("duplicate continuation fails closed", async () => {
    mocks.request
      .mockResolvedValueOnce(page("First", "opaque"))
      .mockResolvedValueOnce(page("Duplicate"));
    render(tree(client()));
    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(messages.en.platformUsers.errors.malformed);
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
  test("empty/no-match differs from network errors and invalid search stays correctable", async () => {
    mocks.request.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });
    const c = client(),
      view = render(tree(c));
    await screen.findByText(messages.en.platformUsers.empty);
    mocks.params = new URLSearchParams("q=bad");
    mocks.request.mockRejectedValue(error(422, "PLATFORM_USER_SEARCH_INVALID"));
    view.rerender(tree(c));
    await screen.findByText(messages.en.platformUsers.errors.validation);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(
      screen.queryByText(messages.en.platformUsers.filteredEmpty),
    ).not.toBeInTheDocument();
    mocks.params = new URLSearchParams("q=none@example.com");
    mocks.request.mockResolvedValue({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });
    view.rerender(tree(c));
    await screen.findByText(messages.en.platformUsers.filteredEmpty);
    mocks.params = new URLSearchParams("q=network@example.com");
    mocks.request.mockRejectedValue(new Error("offline"));
    view.rerender(tree(c));
    await screen.findByText(messages.en.platformUsers.errors.unavailable);
    expect(
      screen.queryByText(messages.en.platformUsers.filteredEmpty),
    ).not.toBeInTheDocument();
  });
  test("cursor rejection retires pagination and safely restarts", async () => {
    mocks.request
      .mockResolvedValueOnce(page("First", "opaque"))
      .mockRejectedValueOnce(error(422, "CURSOR_INVALID"))
      .mockResolvedValueOnce(page("Restarted"));
    render(tree(client()));
    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(messages.en.platformUsers.errors.cursor);
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Restarted");
    expect(mocks.request.mock.lastCall?.[0].query).toEqual({ limit: 50 });
    expect(mocks.expired).not.toHaveBeenCalled();
  });
  test.each(["q", "platformMembershipStatus"])(
    "late old %s cannot overwrite committed query",
    async (field) => {
      const late = deferred();
      mocks.params = new URLSearchParams(
        `${field}=${field === "q" ? "old@example.com" : "ACTIVE"}`,
      );
      mocks.request
        .mockReturnValueOnce(late.promise)
        .mockResolvedValue(page("Current"));
      const c = client(),
        view = render(tree(c));
      await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
      mocks.params = new URLSearchParams(
        `${field}=${field === "q" ? id : "ENDED"}`,
      );
      view.rerender(tree(c));
      await screen.findByText("Current");
      await act(async () => late.resolve(page("Stale")));
      expect(screen.queryByText("Stale")).not.toBeInTheDocument();
    },
  );
  test("Arabic separates localized statuses, provides optional fallbacks and locale dates", async () => {
    mocks.request.mockResolvedValue({
      data: [
        {
          ...member(),
          displayName: undefined,
          email: undefined,
          status: "PENDING_ACTIVATION",
        },
      ],
      meta: { nextCursor: null, hasMore: false },
    });
    // Optional fields are absent on the wire, not explicit undefined.
    mocks.request.mockResolvedValue({
      data: [
        {
          id,
          status: "PENDING_ACTIVATION",
          createdAt: at,
          platformMembership: { status: "ENDED" },
        },
      ],
      meta: { nextCursor: null, hasMore: false },
    });
    render(tree(client(), "directory", id, "ar"));
    await screen.findByText(messages.ar.platformUsers.nameUnavailable);
    expect(
      screen.getByText(messages.ar.platformUsers.emailUnavailable),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", { name: messages.ar.platformUsers.title })
        .closest("section"),
    ).toHaveAttribute("dir", "rtl");
    expect(
      screen.getByText(
        messages.ar.platformUsers.accountStatuses.PENDING_ACTIVATION,
      ),
    ).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute("datetime", at);
  });
});
describe.each(["directory", "detail"] as const)("%s authority", (kind) => {
  test("DENY has no fetch or role inference", () => {
    mocks.authority.allows.mockReturnValue(false);
    render(tree(client(), kind));
    expect(screen.getByRole("alert")).toHaveTextContent(
      messages.en.platformUsers.errors.denied,
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });
  test("rendered data retires on subsequent 403 without logout", async () => {
    mocks.request
      .mockResolvedValueOnce(kind === "directory" ? page() : detail())
      .mockRejectedValue(error(403, "PERMISSION_DENIED"));
    const c = client();
    render(tree(c, kind));
    await screen.findByText("Member");
    await act(async () => {
      await c.refetchQueries({ queryKey: ["hassan-web", "platform-users"] });
    });
    await screen.findByText(messages.en.platformUsers.errors.forbidden);
    expect(screen.queryByText("Member")).not.toBeInTheDocument();
    expect(mocks.authority.refresh).toHaveBeenCalled();
    expect(mocks.expired).not.toHaveBeenCalled();
  });
  test("late response after authority retirement cannot repopulate", async () => {
    const late = deferred();
    mocks.request.mockReturnValue(late.promise);
    const c = client(),
      view = render(tree(c, kind));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    mocks.authority.allows.mockReturnValue(false);
    view.rerender(tree(c, kind));
    await act(async () =>
      late.resolve(kind === "directory" ? page("Secret") : detail("Secret")),
    );
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      messages.en.platformUsers.errors.denied,
    );
  });
  test("authority identity changes clear previous protected data", async () => {
    mocks.request
      .mockResolvedValueOnce(kind === "directory" ? page("Old") : detail("Old"))
      .mockResolvedValue(kind === "directory" ? page("New") : detail("New"));
    const c = client(),
      view = render(tree(c, kind));
    await screen.findByText("Old");
    mocks.authority.accessVersion++;
    mocks.authority.sessionGeneration++;
    view.rerender(tree(c, kind));
    await screen.findByText("New");
    expect(screen.queryByText("Old")).not.toBeInTheDocument();
  });
});
describe("Platform member detail", () => {
  test("minimized read-only detail, safe 404, and activated return preserves q/status", async () => {
    mocks.params = new URLSearchParams(
      "q=member@example.com&platformMembershipStatus=ENDED&cursor=hidden",
    );
    mocks.request.mockResolvedValue(detail());
    render(tree(client(), "detail"));
    await screen.findByText("Member");
    expect(screen.queryByText(id)).not.toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.getByText("Suspended at")).toBeInTheDocument();
    expect(document.querySelectorAll("dl")).toHaveLength(2);
    fireEvent.click(screen.getByRole("link", { name: "Back to users" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.pathname).toBe("/platform/users");
    expect(mocks.params.get("q")).toBe("member@example.com");
    expect(mocks.params.get("platformMembershipStatus")).toBe("ENDED");
    expect(mocks.params.has("cursor")).toBe(false);
    expect(mocks.request.mock.calls.every(([r]) => r.method === "GET")).toBe(
      true,
    );
    expect(document.body.textContent).not.toMatch(
      /accessVersion|password|grants|normalizedEmail|phone|permissions/i,
    );
  });
  test.each([400, 404])(
    "%s renders same generic member-not-found message",
    async (status) => {
      mocks.request.mockRejectedValue(
        error(status, status === 404 ? "USER_NOT_FOUND" : "VALIDATION_FAILED"),
      );
      render(tree(client(), "detail"));
      await screen.findByText(messages.en.platformUsers.errors.notFound);
      expect(document.body.textContent).not.toMatch(
        /account exists|membership missing/i,
      );
    },
  );
  test("old user detail cannot overwrite new target", async () => {
    const late = deferred();
    mocks.request
      .mockReturnValueOnce(late.promise)
      .mockResolvedValue(detail("New", other));
    const c = client(),
      view = render(tree(c, "detail"));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    view.rerender(tree(c, "detail", other));
    await screen.findByText("New");
    await act(async () => late.resolve(detail("Old")));
    expect(screen.queryByText("Old")).not.toBeInTheDocument();
  });
});
