import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError, createApiClient, type ApiClient } from "@/lib/api";
import { messages } from "@/i18n/messages";
import { getProfileAssignmentMessages } from "@/i18n/profile-assignment";
import { PlatformProfileAssignment } from "./PlatformProfileAssignment";
import { PlatformUserDetail } from "./PlatformUserDetail";
const mocks = vi.hoisted(() => ({
  realClient: undefined as ApiClient | undefined,
  request: vi.fn(),
  refresh: vi.fn(async () => {}),
  expired: vi.fn(),
  read: true,
  manage: true,
  lifecycle: false,
  principal: "68e7a9d10d56fd2b98d4a100",
  generation: 1,
  validUntil: null as string | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuthSession: () => ({
    apiClient: mocks.realClient ?? { request: mocks.request },
    markSessionExpired: mocks.expired,
  }),
}));
vi.mock("@/lib/platform-access", async (original) => ({
  ...(await original<typeof import("@/lib/platform-access")>()),
  usePlatformAuthority: () => ({
    principalId: mocks.principal,
    sessionGeneration: mocks.generation,
    membershipId: "68e7a9d10d56fd2b98d4a199",
    accessVersion: 7,
    validUntil: mocks.validUntil,
    allows: (p: string) =>
      p === "platform_users.read"
        ? mocks.read
        : p === "platform_permissions.manage"
          ? mocks.manage
          : p === "platform_users.manage" && mocks.lifecycle,
    refresh: mocks.refresh,
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
const target = "68e7a9d10d56fd2b98d4a101",
  other = "68e7a9d10d56fd2b98d4a102",
  a = "68e7a9d10d56fd2b98d4a110",
  b = "68e7a9d10d56fd2b98d4a111";
const labels = getProfileAssignmentMessages("en");
let version = 4,
  status = "ACTIVE",
  profiles = [{ id: a, name: "Alpha", status: "ACTIVE" }],
  selector = [
    { id: a, name: "Alpha" },
    { id: b, name: "Beta" },
  ];
function fact(userId = target) {
  return {
    data: {
      userId,
      platformMembership: { id: other, status, version },
      permissionProfiles: profiles,
    },
  };
}
function backend(code: string, http = 409) {
  return new ApiError({
    code,
    status: http,
    kind: "backend",
    category: http === 403 ? "forbidden" : "expected-version-conflict",
    message: "PRIVATE server detail",
  });
}
function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.realClient = undefined;
  mocks.read = true;
  mocks.manage = true;
  mocks.lifecycle = false;
  mocks.principal = "68e7a9d10d56fd2b98d4a100";
  mocks.generation = 1;
  mocks.validUntil = null;
  version = 4;
  status = "ACTIVE";
  profiles = [{ id: a, name: "Alpha", status: "ACTIVE" }];
  selector = [
    { id: a, name: "Alpha" },
    { id: b, name: "Beta" },
  ];
  mocks.request.mockImplementation(async (request) => {
    if (request.path.endsWith("/permission-profile-assignment")) {
      if (request.method === "PUT") {
        version++;
        profiles = request.body.profileIds.map((id: string) => ({
          id,
          name: selector.find((p) => p.id === id)!.name,
          status: "ACTIVE",
        }));
      }
      return fact(request.path.split("/")[3]);
    }
    if (request.path.endsWith("permission-profile-selector"))
      return { data: { permissionProfiles: selector, nextCursor: null } };
    if (
      request.path.endsWith("management-state") ||
      /\/(suspend|reactivate|end)$/.test(request.path)
    ) {
      if (request.method === "POST") {
        version++;
        status = "SUSPENDED";
      }
      return {
        data: {
          userId: target,
          platformMembership: {
            id: other,
            status,
            version,
            suspendedAt:
              status === "SUSPENDED" ? "2026-10-11T10:00:00.000Z" : null,
            endedAt: null,
          },
        },
      };
    }
    return {
      data: {
        id: target,
        displayName: "Readable member",
        status: "ACTIVE",
        createdAt: "2026-10-11T10:00:00.000Z",
        updatedAt: "2026-10-11T10:00:00.000Z",
        platformMembership: {
          id: other,
          status,
          createdAt: "2026-10-11T10:00:00.000Z",
          updatedAt: "2026-10-11T10:00:00.000Z",
        },
      },
    };
  });
});
test("membership rejection recovers after lifecycle reactivation without remount; next save uses fresh version and new key", async () => {
  mocks.lifecycle = true;
  const original = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (r) => {
    if (r.method === "PUT" && puts().length === 1) {
      status = "SUSPENDED";
      version = 5;
      throw backend("PLATFORM_PERMISSION_TARGET_MEMBERSHIP_INACTIVE");
    }
    if (r.method === "POST" && r.path.endsWith("/reactivate")) {
      status = "ACTIVE";
      version = 6;
      return {
        data: {
          userId: target,
          platformMembership: {
            id: other,
            status,
            version,
            suspendedAt: null,
            endedAt: null,
          },
        },
      };
    }
    return original(r);
  });
  mount(true);
  await edit();
  const cardHeading = screen.getByRole("heading", { name: labels.title });
  await confirm();
  await screen.findAllByText(labels.inactive);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByRole("button", { name: labels.retryIntent })).toBeNull();
  const reactivate = messages.en.platformUsers.lifecycle.actions.reactivate;
  fireEvent.click(await screen.findByRole("button", { name: reactivate }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: reactivate,
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: labels.edit })).toBeEnabled(),
  );
  expect(screen.getByRole("heading", { name: labels.title })).toBe(cardHeading);
  await edit();
  await confirm();
  await screen.findByText(labels.changed);
  expect(puts()).toHaveLength(2);
  expect(puts()[0].body.expectedVersion).toBe(4);
  expect(puts()[1].body.expectedVersion).toBe(6);
  expect(puts()[1].idempotencyKey).not.toBe(puts()[0].idempotencyKey);
});
test("account block survives ACTIVE assignment and manual READ patches; only fresh account ACTIVE GET restores editing", async () => {
  const original = mocks.request.getMockImplementation()!,
    freshRead = deferred();
  let readCount = 0,
    accountStatus = "SUSPENDED";
  mocks.request.mockImplementation(async (r) => {
    if (r.method === "PUT")
      throw backend("PLATFORM_MEMBERSHIP_TARGET_ACCOUNT_INACTIVE");
    if (r.path === `/platform/users/${target}`) {
      const value = await original(r);
      if (++readCount === 2) return freshRead.promise;
      return readCount > 2
        ? { data: { ...value.data, status: accountStatus } }
        : value;
    }
    return original(r);
  });
  const mounted = mount(true);
  await edit();
  const heading = screen.getByRole("heading", { name: labels.title });
  await confirm();
  await waitFor(() => expect(readCount).toBe(2));
  expect(screen.queryByRole("button", { name: labels.edit })).toBeNull();
  expect(
    mounted.client.getQueryCache().findAll({
      queryKey: ["hassan-web", "platform-profile-assignment", "state"],
    })[0].state.data,
  ).toMatchObject({ platformMembership: { status: "ACTIVE" } });
  const readKey = mounted.client.getQueryCache().findAll({
    queryKey: ["hassan-web", "platform-users", "detail"],
  })[0].queryKey;
  const value = await original({
    method: "GET",
    path: `/platform/users/${target}`,
  });
  await act(async () =>
    freshRead.resolve({ data: { ...value.data, status: "SUSPENDED" } }),
  );
  await waitFor(() =>
    expect(screen.getAllByText(labels.inactive).length).toBeGreaterThan(0),
  );
  await act(async () => mounted.client.setQueryData(readKey, value.data));
  expect(screen.queryByRole("button", { name: labels.edit })).toBeNull();
  accountStatus = "ACTIVE";
  await act(async () => {
    await mounted.client.refetchQueries({ queryKey: readKey, exact: true });
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: labels.edit })).toBeEnabled(),
  );
  expect(screen.getByRole("heading", { name: labels.title })).toBe(heading);
  expect(screen.queryByRole("button", { name: labels.retryIntent })).toBeNull();
});
test("late old-principal account recovery cannot clear the current principal's block", async () => {
  const original = mocks.request.getMockImplementation()!,
    oldRead = deferred(),
    newRead = deferred();
  let readCount = 0;
  mocks.request.mockImplementation(async (r) => {
    if (r.method === "PUT")
      throw backend("PLATFORM_MEMBERSHIP_TARGET_ACCOUNT_INACTIVE");
    if (r.path === `/platform/users/${target}`) {
      readCount++;
      if (readCount === 2) return oldRead.promise;
      if (readCount === 4) return newRead.promise;
    }
    return original(r);
  });
  const mounted = mount(true);
  await edit();
  await confirm();
  await waitFor(() => expect(readCount).toBe(2));
  mocks.principal = other;
  mocks.generation++;
  mounted.rerender(mounted.tree());
  await edit();
  await confirm();
  await waitFor(() => expect(readCount).toBe(4));
  const value = await original({
    method: "GET",
    path: `/platform/users/${target}`,
  });
  await act(async () => oldRead.resolve(value));
  expect(screen.queryByRole("button", { name: labels.edit })).toBeNull();
  await act(async () => newRead.resolve(value));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: labels.edit })).toBeEnabled(),
  );
});
test("real createApiClient TypeError is uncertain; explicit retry reuses exact wire intent then clears it", async () => {
  const original = mocks.request.getMockImplementation()!;
  const writes: {
    target: string;
    body: string;
    key: string | null;
    method: string;
  }[] = [];
  const fetcher = Object.assign(
    vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(input.toString()),
        path = url.pathname.replace("/api/v1", "");
      if (options?.method === "PUT") {
        writes.push({
          target: url.toString(),
          body: String(options.body),
          key: new Headers(options.headers).get("Idempotency-Key"),
          method: options.method,
        });
        if (writes.length === 1)
          throw new TypeError("network disconnected after send");
      }
      const value = await original({
        method: options?.method ?? "GET",
        path,
        body: options?.body ? JSON.parse(String(options.body)) : undefined,
      });
      return Response.json(value);
    }),
    { preconnect: () => {} },
  );
  mocks.realClient = createApiClient({
    baseUrl: "https://example.test/api/v1",
    fetch: fetcher,
  });
  mount();
  await edit();
  await confirm();
  await screen.findByText(labels.uncertain);
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0].body)).toEqual({
    expectedVersion: 4,
    profileIds: [a, b],
  });
  expect(writes[0].target).toBe(
    `https://example.test/api/v1/platform/users/${target}/permission-profile-assignment`,
  );
  expect(writes[0].key).toBeTruthy();
  expect(screen.getByRole("button", { name: labels.edit })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: labels.retryIntent }));
  await screen.findByText(labels.changed);
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(screen.queryByRole("button", { name: labels.retryIntent })).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
});
test.each(["fresh", "deny", "expiry"])(
  "membership recovery waits for fresh GET and preserves %s authority precedence",
  async (outcome) => {
    const fresh = deferred(),
      original = mocks.request.getMockImplementation()!;
    let reads = 0;
    mocks.request.mockImplementation(async (r) => {
      if (r.method === "PUT")
        throw backend("PLATFORM_PERMISSION_TARGET_MEMBERSHIP_INACTIVE");
      if (r.path.endsWith("permission-profile-assignment") && ++reads === 2)
        return fresh.promise;
      return original(r);
    });
    const mounted = mount();
    await edit();
    await confirm();
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.queryByRole("button", { name: labels.edit })).toBeNull();
    if (outcome === "deny") mocks.manage = false;
    if (outcome === "expiry") mocks.validUntil = "2000-01-01T00:00:00.000Z";
    if (outcome !== "fresh") mounted.rerender(mounted.tree());
    await act(async () => fresh.resolve(fact()));
    if (outcome === "fresh")
      await waitFor(() =>
        expect(screen.getByRole("button", { name: labels.edit })).toBeEnabled(),
      );
    else expect(screen.queryByRole("button", { name: labels.edit })).toBeNull();
    expect(puts()).toHaveLength(1);
  },
);
function mount(
  detail = false,
  locale: "en" | "ar" = "en",
  accountActive = true,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const tree = (userId = target) => (
    <QueryClientProvider client={client}>
      {detail ? (
        <PlatformUserDetail
          labels={messages[locale].platformUsers}
          locale={locale}
          userId={userId}
        />
      ) : (
        <PlatformProfileAssignment
          userId={userId}
          locale={locale}
          targetName="Readable member"
          accountActive={accountActive}
        />
      )}
    </QueryClientProvider>
  );
  return { ...render(tree()), tree, client };
}
async function edit() {
  fireEvent.click(await screen.findByRole("button", { name: labels.edit }));
  await screen.findByRole("checkbox", { name: "Beta" });
}
async function confirm() {
  fireEvent.click(screen.getByRole("checkbox", { name: "Beta" }));
  fireEvent.click(screen.getByRole("button", { name: labels.save }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: labels.save }));
}
const puts = () =>
  mocks.request.mock.calls.map((c) => c[0]).filter((r) => r.method === "PUT");
test.each([
  [true, false],
  [false, true],
])(
  "READ=%s manage=%s never fetches assignment when either gate denied",
  async (read, manage) => {
    mocks.read = read;
    mocks.manage = manage;
    mount(true);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: messages.en.platformUsers.detailTitle,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      mocks.request.mock.calls.some((c) =>
        c[0].path.includes("permission-profile"),
      ),
    ).toBe(false);
  },
);
test("lazy selector, confirmation, exact management version, no-op, success", async () => {
  mount();
  await screen.findByText("Alpha");
  expect(mocks.request).toHaveBeenCalledTimes(1);
  await edit();
  expect(screen.getByRole("button", { name: labels.save })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Beta" }));
  fireEvent.click(screen.getByRole("button", { name: labels.save }));
  expect(puts()).toHaveLength(0);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Beta")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: labels.cancel }));
  expect(puts()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: labels.save }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: labels.save,
    }),
  );
  await screen.findByText(labels.changed);
  expect(screen.getByRole("heading", { name: labels.title })).toHaveFocus();
  expect(puts()[0].body).toEqual({ expectedVersion: 4, profileIds: [a, b] });
  expect(puts()[0].idempotencyKey).toBeTruthy();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
test.each(["SUSPENDED", "ENDED"])(
  "inactive %s renders profiles without selector",
  async (memberStatus) => {
    status = memberStatus;
    mount();
    await screen.findByText("Alpha");
    expect(screen.getByText(labels.inactive)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: labels.edit })).toBeNull();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  },
);
test("self and inactive account cannot enter editor", async () => {
  mocks.principal = target;
  mount(false, "en", false);
  await screen.findByText(labels.self);
  expect(screen.queryByRole("button", { name: labels.edit })).toBeNull();
  expect(puts()).toHaveLength(0);
});
test("archived/unavailable are displayed and removed explicitly; empty confirmation", async () => {
  profiles = [
    { id: a, name: "Archived Alpha", status: "ARCHIVED" },
    { id: b, name: null as unknown as string, status: "UNAVAILABLE" },
  ];
  selector = [{ id: other, name: "Beta" }];
  mount();
  await screen.findByText(labels.statuses.ARCHIVED);
  await edit();
  expect(screen.getByText(labels.willRemove)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Archived Alpha" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: labels.save }));
  expect(
    within(screen.getByRole("dialog")).getByText(labels.removeAll),
  ).toBeInTheDocument();
});
test("20 permitted and the 21st checkbox blocked with accessible limit", async () => {
  selector = Array.from({ length: 21 }, (_, i) => ({
    id: (100 + i).toString(16).padStart(24, "0"),
    name: `Profile ${i}`,
  }));
  profiles = [];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: labels.edit }));
  await screen.findByRole("checkbox", { name: "Profile 0" });
  for (let i = 0; i < 20; i++)
    fireEvent.click(screen.getByRole("checkbox", { name: `Profile ${i}` }));
  expect(screen.getByRole("checkbox", { name: "Profile 20" })).toBeDisabled();
  expect(screen.getByText(labels.limit)).toHaveAttribute("role", "status");
  expect(screen.getByRole("button", { name: labels.save })).toBeEnabled();
});
test.each(["network", "non-json-response", "malformed-response"] as const)(
  "uncertain %s retains exact intent, no auto replay, competing selection blocked",
  async (kind) => {
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (r) => {
      if (r.method === "PUT" && puts().length === 1)
        throw new ApiError({ category: "unknown", kind, message: "private" });
      return original(r);
    });
    mount();
    await edit();
    await confirm();
    await screen.findByText(labels.uncertain);
    expect(puts()).toHaveLength(1);
    expect(screen.getByRole("button", { name: labels.edit })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: labels.retryIntent }));
    await screen.findByText(labels.changed);
    expect(puts()[1]).toEqual(puts()[0]);
  },
);
test("conflict retires draft, refetches, requires new intent/key", async () => {
  const original = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (r) => {
    if (r.method === "PUT" && puts().length === 1) {
      version = 10;
      throw backend("PLATFORM_MEMBERSHIP_VERSION_CONFLICT");
    }
    return original(r);
  });
  mount();
  await edit();
  await confirm();
  await screen.findByText(labels.conflict);
  expect(screen.queryByRole("button", { name: labels.retryIntent })).toBeNull();
  await edit();
  await confirm();
  await screen.findByText(labels.changed);
  expect(puts()[1].body.expectedVersion).toBe(10);
  expect(puts()[1].idempotencyKey).not.toBe(puts()[0].idempotencyKey);
});
test.each([
  ["DELEGATION_DENIED", "delegation", 403],
  ["PLATFORM_LAST_MANAGEMENT_AUTHORITY_REQUIRED", "lockout", 409],
  ["PLATFORM_AUTHORITY_EVALUATION_LIMIT_EXCEEDED", "evaluation", 409],
  ["PLATFORM_PERMISSION_SELF_MUTATION_FORBIDDEN", "self", 403],
  ["PLATFORM_PERMISSION_TARGET_MEMBERSHIP_INACTIVE", "inactive", 409],
  ["PLATFORM_MEMBERSHIP_TARGET_ACCOUNT_INACTIVE", "inactive", 409],
  ["VALIDATION_FAILED", "validation", 400],
] as const)(
  "terminal %s safe copy without replay",
  async (code, label, http) => {
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (r) => {
      if (r.method === "PUT") {
        if (code === "PLATFORM_PERMISSION_TARGET_MEMBERSHIP_INACTIVE")
          status = "SUSPENDED";
        throw backend(code, http);
      }
      return original(r);
    });
    mount();
    await edit();
    await confirm();
    await screen.findAllByText(labels[label]);
    expect(screen.queryByText("PRIVATE server detail")).toBeNull();
    expect(
      screen.queryByRole("button", { name: labels.retryIntent }),
    ).toBeNull();
    expect(puts()).toHaveLength(1);
  },
);
test.each(["GET", "PUT", "selector"])(
  "management %s 403 retires assignment only, READ survives, no logout",
  async (mode) => {
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (r) => {
      if (
        (mode === "PUT" && r.method === "PUT") ||
        (mode === "GET" && r.path.endsWith("permission-profile-assignment")) ||
        (mode === "selector" && r.path.endsWith("permission-profile-selector"))
      )
        throw backend("PERMISSION_DENIED", 403);
      return original(r);
    });
    mount(true);
    await screen.findByText("Readable member");
    if (mode === "PUT") {
      await edit();
      await confirm();
    }
    if (mode === "selector")
      fireEvent.click(await screen.findByRole("button", { name: labels.edit }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: labels.title })).toBeNull(),
    );
    expect(screen.getByText("Readable member")).toBeInTheDocument();
    expect(mocks.expired).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
  },
);
test.each(["target", "principal", "generation", "expiry", "deny"])(
  "stale %s clears editor and discards late completion",
  async (dimension) => {
    const d = deferred(),
      original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (r) =>
      r.method === "PUT" ? d.promise : original(r),
    );
    const mounted = mount();
    await edit();
    await confirm();
    if (dimension === "principal") mocks.principal = other;
    if (dimension === "generation") mocks.generation++;
    if (dimension === "expiry") mocks.validUntil = "2000-01-01T00:00:00.000Z";
    if (dimension === "deny") mocks.manage = false;
    mounted.rerender(mounted.tree(dimension === "target" ? other : target));
    await act(async () => d.resolve(fact()));
    expect(screen.queryByText(labels.changed)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);
test("assignment success refreshes lifecycle; next command uses latest version", async () => {
  mocks.lifecycle = true;
  mount(true);
  await screen.findByRole("button", {
    name: messages.en.platformUsers.lifecycle.actions.suspend,
  });
  await edit();
  await confirm();
  await screen.findByText(labels.changed);
  fireEvent.click(
    screen.getByRole("button", {
      name: messages.en.platformUsers.lifecycle.actions.suspend,
    }),
  );
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: messages.en.platformUsers.lifecycle.actions.suspend,
    }),
  );
  await waitFor(() =>
    expect(mocks.request.mock.calls.some((c) => c[0].method === "POST")).toBe(
      true,
    ),
  );
  const command = mocks.request.mock.calls.find(
    (c) => c[0].method === "POST",
  )![0];
  expect(command.body).toEqual({ expectedVersion: 5 });
  await waitFor(() =>
    expect(screen.getByText(labels.inactive)).toBeInTheDocument(),
  );
});
test("Arabic RTL dialog labels, Escape and focus restoration", async () => {
  const ar = getProfileAssignmentMessages("ar");
  mount(false, "ar");
  const heading = await screen.findByRole("heading", { name: ar.title });
  expect(heading.closest("section")).toHaveAttribute("dir", "rtl");
  fireEvent.click(await screen.findByRole("button", { name: ar.edit }));
  fireEvent.click(await screen.findByRole("checkbox", { name: "Beta" }));
  const save = screen.getByRole("button", { name: ar.save });
  fireEvent.click(save);
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: ar.confirm,
      }),
    ).toHaveFocus(),
  );
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(save).toHaveFocus());
  expect(puts()).toHaveLength(0);
});
test.each([false, true])(
  "selector cursor pages fail closed on duplicate=%s",
  async (duplicate) => {
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (r) => {
      if (!r.path.endsWith("permission-profile-selector")) return original(r);
      if (!r.query.cursor)
        return {
          data: {
            permissionProfiles: [{ id: b, name: "Beta" }],
            nextCursor: "opaque+/==",
          },
        };
      expect(r.query.cursor).toBe("opaque+/==");
      return {
        data: {
          permissionProfiles: duplicate ? [{ id: b, name: "Duplicate" }] : [],
          nextCursor: "opaque+/==",
        },
      };
    });
    mount();
    await edit();
    fireEvent.click(screen.getByRole("checkbox", { name: "Beta" }));
    fireEvent.click(screen.getByRole("button", { name: labels.more }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: labels.save })).toBeDisabled();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(puts()).toHaveLength(0);
  },
);
test.each(["target", "principal"])(
  "late assignment GET discarded after %s changes",
  async (dimension) => {
    const late = deferred(),
      original = mocks.request.getMockImplementation()!;
    let calls = 0;
    mocks.request.mockImplementation(async (r) =>
      r.path.endsWith("permission-profile-assignment") && ++calls === 1
        ? late.promise
        : original(r),
    );
    const mounted = mount();
    await waitFor(() => expect(calls).toBe(1));
    if (dimension === "principal") mocks.principal = other;
    mounted.rerender(mounted.tree(dimension === "target" ? other : target));
    await screen.findByText("Alpha");
    await act(async () =>
      late.resolve({
        data: {
          ...fact().data,
          permissionProfiles: [
            { id: a, name: "Stale secret", status: "ACTIVE" },
          ],
        },
      }),
    );
    expect(screen.queryByText("Stale secret")).toBeNull();
  },
);
test("uncertain assignment blocks lifecycle until explicit settlement", async () => {
  mocks.lifecycle = true;
  const original = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (r) => {
    if (r.method === "PUT")
      throw new ApiError({
        category: "unknown",
        kind: "network",
        message: "private",
      });
    return original(r);
  });
  mount(true);
  await edit();
  await confirm();
  await screen.findByText(labels.uncertain);
  expect(
    screen.getByRole("button", {
      name: messages.en.platformUsers.lifecycle.actions.suspend,
    }),
  ).toBeDisabled();
});
test("assignment success cancels an initial stale lifecycle GET before refreshing", async () => {
  mocks.lifecycle = true;
  const late = deferred(),
    original = mocks.request.getMockImplementation()!;
  let reads = 0;
  mocks.request.mockImplementation(async (r) =>
    r.path.endsWith("management-state") && ++reads === 1
      ? late.promise
      : original(r),
  );
  mount(true);
  await edit();
  await confirm();
  await screen.findByText(labels.changed);
  await act(async () =>
    late.resolve({
      data: {
        userId: target,
        platformMembership: {
          id: other,
          status: "ACTIVE",
          version: 1,
          suspendedAt: null,
          endedAt: null,
        },
      },
    }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: messages.en.platformUsers.lifecycle.actions.suspend,
    }),
  );
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: messages.en.platformUsers.lifecycle.actions.suspend,
    }),
  );
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.find((c) => c[0].method === "POST")?.[0].body,
    ).toEqual({ expectedVersion: 5 }),
  );
});
