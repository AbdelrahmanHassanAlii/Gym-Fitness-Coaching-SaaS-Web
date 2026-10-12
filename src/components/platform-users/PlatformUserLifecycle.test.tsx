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
import { messages } from "@/i18n/messages";
import { ApiError, createApiClient } from "@/lib/api";
import { platformUserKeys } from "@/lib/platform-users";
import { PlatformUserLifecycle } from "./PlatformUserLifecycle";
import { PlatformUserDetail } from "./PlatformUserDetail";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  expired: vi.fn(),
  refresh: vi.fn(async () => {}),
  manage: true,
  principal: "68e7a9d10d56fd2b98d4a100",
  generation: 1,
  validUntil: null as string | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuthSession: () => ({
    apiClient: { request: mocks.request },
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
    allows: (permission: string) =>
      permission === "platform_users.read" ||
      (permission === "platform_users.manage" && mocks.manage),
    refresh: mocks.refresh,
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(
      "q=member%40example.com&platformMembershipStatus=ACTIVE",
    ),
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
const id = "68e7a9d10d56fd2b98d4a101",
  other = "68e7a9d10d56fd2b98d4a102",
  at = "2026-10-11T10:00:00.000Z";
const labels = messages.en.platformUsers.lifecycle;
function fact(status = "ACTIVE", version = 4, target = id) {
  return {
    data: {
      userId: target,
      platformMembership: {
        id: other,
        status,
        version,
        suspendedAt: status === "SUSPENDED" ? at : null,
        endedAt: status === "ENDED" ? at : null,
      },
    },
  };
}
function read(status = "ACTIVE") {
  return {
    data: {
      id,
      displayName: "Readable member",
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
      platformMembership: { id: other, status, createdAt: at, updatedAt: at },
    },
  };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function backend(code: string, status = 409) {
  return new ApiError({
    code,
    status,
    kind: "backend",
    category: status === 403 ? "forbidden" : "expected-version-conflict",
    message: code,
  });
}
function mount(detail = false, target = id) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  const tree = (userId = target) => (
    <QueryClientProvider client={client}>
      {detail ? (
        <PlatformUserDetail
          labels={messages.en.platformUsers}
          locale="en"
          userId={userId}
        />
      ) : (
        <PlatformUserLifecycle labels={labels} locale="en" userId={userId} />
      )}
    </QueryClientProvider>
  );
  return { ...render(tree()), client, tree };
}
async function confirm(action = "suspend") {
  fireEvent.click(
    await screen.findByRole("button", {
      name: labels.actions[action as keyof typeof labels.actions],
    }),
  );
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: labels.actions[action as keyof typeof labels.actions],
    }),
  );
}
beforeEach(() => {
  mocks.request.mockReset().mockResolvedValue(fact());
  mocks.expired.mockReset();
  mocks.refresh.mockClear();
  mocks.manage = true;
  mocks.principal = "68e7a9d10d56fd2b98d4a100";
  mocks.generation = 1;
  mocks.validUntil = null;
});
test("read ALLOW/manage DENY preserves detail and return filters without management fetch", async () => {
  mocks.manage = false;
  mocks.request.mockResolvedValue(read());
  mount(true);
  expect(await screen.findByText("Readable member")).toBeVisible();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(labels.title)).toBeNull();
  expect(screen.getByRole("link", { name: "Back to users" })).toHaveAttribute(
    "href",
    "/platform/users?q=member%40example.com&platformMembershipStatus=ACTIVE",
  );
});
test.each([
  ["ACTIVE", ["suspend", "end"]],
  ["SUSPENDED", ["reactivate", "end"]],
  ["ENDED", ["reactivate"]],
] as const)(
  "exact %s matrix and private minimized UI",
  async (status, actions) => {
    mocks.request.mockResolvedValue(fact(status));
    const { container } = mount();
    await screen.findByText(labels.statuses[status]);
    for (const command of ["suspend", "reactivate", "end"] as const)
      expect(
        screen.queryByRole("button", { name: labels.actions[command] }) !==
          null,
      ).toBe(actions.includes(command as never));
    expect(container.textContent).not.toMatch(
      /68e7a9|version|accessVersion|profiles|grants|Add user|Invite|Create account|Assign/i,
    );
  },
);
test.each(["suspend", "reactivate", "end"] as const)(
  "%s cancel sends nothing; confirm sends exact intent and safely refreshes",
  async (command) => {
    const source = command === "reactivate" ? "ENDED" : "ACTIVE",
      destination =
        command === "suspend"
          ? "SUSPENDED"
          : command === "end"
            ? "ENDED"
            : "ACTIVE";
    let status = source;
    mocks.request.mockImplementation(async (r) => {
      if (r.method === "POST") {
        status = destination;
        return fact(status, 5);
      }
      return r.path.endsWith("management-state")
        ? fact(status, status === source ? 4 : 5)
        : read(status);
    });
    const { client } = mount(true);
    const invalidation = vi.spyOn(client, "invalidateQueries");
    const action = await screen.findByRole("button", {
      name: labels.actions[command],
    });
    action.focus();
    fireEvent.click(action);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(labels.confirmations[command].copy),
    ).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(action).toHaveFocus());
    fireEvent.click(action);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: labels.cancel,
      }),
    );
    expect(
      mocks.request.mock.calls.filter(([r]) => r.method === "POST"),
    ).toHaveLength(0);
    await confirm(command);
    await screen.findByText(labels.changed);
    if (command !== "end")
      expect(screen.getByRole("heading", { name: labels.title })).toHaveFocus();
    const posts = mocks.request.mock.calls.filter(([r]) => r.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toMatchObject({
      path: `/platform/users/${id}/${command}`,
      body: { expectedVersion: 4 },
      idempotencyKey: expect.any(String),
    });
    expect(Object.keys(posts[0][0].body)).toEqual(["expectedVersion"]);
    expect(
      invalidation.mock.calls.some(
        ([filters]) =>
          JSON.stringify(filters?.queryKey) ===
          JSON.stringify(platformUserKeys.all),
      ),
    ).toBe(true);
    expect(
      mocks.request.mock.calls.filter(([r]) =>
        r.path.endsWith("management-state"),
      ),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        messages.en.platformUsers.statuses[destination as "ACTIVE"],
      ),
    ).toHaveLength(destination === "ACTIVE" ? 3 : 2);
  },
);
test.each(["suspend", "reactivate", "end"] as const)(
  "%s HTTP 200 non-JSON retains exact intent until controlled retry",
  async (command) => {
    const source = command === "reactivate" ? "ENDED" : "ACTIVE";
    const destination =
      command === "suspend"
        ? "SUSPENDED"
        : command === "end"
          ? "ENDED"
          : "ACTIVE";
    let attempts = 0;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, options) => {
        if (options?.method === "POST" && ++attempts === 1)
          return new Response("Command accepted", {
            status: 200,
            headers: { "content-type": "text/plain" },
          });
        return new Response(
          JSON.stringify(
            fact(attempts > 1 ? destination : source, attempts > 1 ? 5 : 4),
          ),
          { headers: { "content-type": "application/json" } },
        );
      });
    const api = createApiClient({
      baseUrl: "https://example.test/api/v1",
      fetch: fetchImpl,
    });
    mocks.request.mockImplementation((request) => api.request(request));
    mount();
    await confirm(command);
    const retry = await screen.findByRole("button", { name: labels.retry });
    expect(await screen.findByText(labels.errors.unavailable)).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    for (const button of screen.getAllByRole("button")) {
      if (button !== retry) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
      }
    }
    const posts = () =>
      fetchImpl.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(posts()).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // GET + POST; no automatic replay/refetch.
    const first = posts()[0];
    expect(first[0].toString()).toBe(
      `https://example.test/api/v1/platform/users/${id}/${command}`,
    );
    expect(first[1]?.body).toBe(JSON.stringify({ expectedVersion: 4 }));
    const originalKey = new Headers(first[1]?.headers).get("Idempotency-Key");
    expect(originalKey).toBeTruthy();
    expect(screen.getByText(labels.statuses[source])).toBeVisible();
    fireEvent.click(retry);
    await screen.findByText(labels.changed);
    expect(posts()).toHaveLength(2);
    const second = posts()[1];
    expect(second[0]).toEqual(first[0]);
    expect(second[1]?.body).toBe(first[1]?.body);
    expect(new Headers(second[1]?.headers).get("Idempotency-Key")).toBe(
      originalKey,
    );
    expect(screen.queryByRole("button", { name: labels.retry })).toBeNull();
    expect(screen.getByText(labels.statuses[destination])).toBeVisible();
  },
);

test("pending blocks double confirm and all competing commands, traps focus", async () => {
  const late = deferred();
  mocks.request.mockImplementation((r) =>
    r.method === "POST" ? late.promise : Promise.resolve(fact()),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: labels.actions.suspend }),
  );
  const dialog = screen.getByRole("dialog"),
    confirmButton = within(dialog).getByRole("button", {
      name: labels.actions.suspend,
    });
  const cancel = within(dialog).getByRole("button", { name: labels.cancel });
  cancel.focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(confirmButton).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(cancel).toHaveFocus();
  fireEvent.click(confirmButton);
  fireEvent.click(confirmButton);
  await waitFor(() => expect(confirmButton).toBeDisabled());
  expect(
    screen.getByRole("button", { name: labels.actions.end }),
  ).toBeDisabled();
  expect(dialog).toHaveAttribute("aria-busy", "true");
  expect(
    mocks.request.mock.calls.filter(([r]) => r.method === "POST"),
  ).toHaveLength(1);
  await act(async () => late.resolve(fact("SUSPENDED", 5)));
});
test.each([
  ["PLATFORM_MEMBERSHIP_VERSION_CONFLICT", "conflict"],
  ["PLATFORM_MEMBERSHIP_TRANSITION_INVALID", "transition"],
  ["PLATFORM_MEMBERSHIP_TARGET_ACCOUNT_INACTIVE", "inactive"],
  ["PLATFORM_LAST_MANAGEMENT_AUTHORITY_REQUIRED", "lockout"],
  ["PLATFORM_AUTHORITY_EVALUATION_LIMIT_EXCEEDED", "evaluation"],
  ["PLATFORM_MEMBERSHIP_SELF_MUTATION_FORBIDDEN", "self"],
  ["IDEMPOTENCY_KEY_REUSED", "keyReused"],
] as const)(
  "%s refreshes without automatic command replay or logout",
  async (code, message) => {
    const status =
      code === "PLATFORM_MEMBERSHIP_TARGET_ACCOUNT_INACTIVE"
        ? "ENDED"
        : "ACTIVE";
    mocks.request.mockImplementation((r) =>
      r.method === "POST"
        ? Promise.reject(backend(code, code.includes("SELF") ? 403 : 409))
        : Promise.resolve(
            r.path.endsWith("management-state") ? fact(status) : read(status),
          ),
    );
    mount(true);
    await confirm(status === "ENDED" ? "reactivate" : "suspend");
    expect(await screen.findByText(labels.errors[message])).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.expired).not.toHaveBeenCalled();
    expect(
      mocks.request.mock.calls.filter(([r]) => r.method === "POST"),
    ).toHaveLength(1);
    expect(
      mocks.request.mock.calls.filter(([r]) => r.method === "GET").length,
    ).toBeGreaterThan(1);
    expect(screen.getByText("Readable member")).toBeVisible();
    expect(
      screen.getAllByText(status === "ENDED" ? "Ended" : "Active", {
        exact: true,
      }).length,
    ).toBeGreaterThanOrEqual(2);
  },
);
test.each(["network", "abort", "IDEMPOTENCY_REQUEST_IN_PROGRESS"])(
  "%s retains one scoped key on controlled retry; new intent gets new key",
  async (failure) => {
    let attempt = 0,
      status = "ACTIVE";
    const local = vi.spyOn(Storage.prototype, "setItem");
    mocks.request.mockImplementation((r) => {
      if (r.method === "POST") {
        if (++attempt === 1)
          return Promise.reject(
            failure === "network" || failure === "abort"
              ? new ApiError({
                  kind: failure,
                  category: "unknown",
                  message: "uncertain",
                })
              : backend(failure),
          );
        status = r.path.endsWith("suspend") ? "SUSPENDED" : "ACTIVE";
        return Promise.resolve(fact(status, attempt + 3));
      }
      return Promise.resolve(fact(status, attempt + 4));
    });
    mount();
    await confirm();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByText(labels.changed);
    await confirm("reactivate");
    await waitFor(() =>
      expect(
        mocks.request.mock.calls.filter(([r]) => r.method === "POST"),
      ).toHaveLength(3),
    );
    const posts = mocks.request.mock.calls
      .filter(([r]) => r.method === "POST")
      .map(([r]) => r);
    expect(posts[0].idempotencyKey).toBe(posts[1].idempotencyKey);
    expect(posts[0].body).toEqual(posts[1].body);
    expect(posts[2].idempotencyKey).not.toBe(posts[0].idempotencyKey);
    expect(local).not.toHaveBeenCalled();
    local.mockRestore();
  },
);
test("403 after rendered management retires only controls and refreshes authority", async () => {
  mocks.request.mockImplementation((r) =>
    r.method === "POST"
      ? Promise.reject(backend("SUPPORT_ACCESS_FORBIDDEN", 403))
      : Promise.resolve(r.path.endsWith("management-state") ? fact() : read()),
  );
  mount(true);
  await confirm();
  await waitFor(() => expect(screen.queryByText(labels.title)).toBeNull());
  expect(mocks.refresh).toHaveBeenCalled();
  expect(mocks.expired).not.toHaveBeenCalled();
  expect(screen.getByText("Readable member")).toBeVisible();
});
test("management GET 403 retires prior snapshot without losing independent READ", async () => {
  let forbidden = false;
  mocks.request.mockImplementation((r) =>
    r.path.endsWith("management-state")
      ? forbidden
        ? Promise.reject(backend("PERMISSION_DENIED", 403))
        : Promise.resolve(fact())
      : Promise.resolve(read()),
  );
  const { client } = mount(true);
  await screen.findByRole("button", { name: labels.actions.suspend });
  forbidden = true;
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ["hassan-web", "platform-user-lifecycle"],
    });
  });
  await waitFor(() => expect(screen.queryByText(labels.title)).toBeNull());
  expect(screen.getByText("Readable member")).toBeVisible();
  expect(mocks.refresh).toHaveBeenCalled();
  expect(mocks.expired).not.toHaveBeenCalled();
});
test("404 exposes no management controls or global account distinction", async () => {
  mocks.request.mockRejectedValue(backend("USER_NOT_FOUND", 404));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    labels.errors.unavailable,
  );
  expect(screen.queryByRole("button")).toBeNull();
});
test("real actor self controls are absent", async () => {
  mocks.principal = id;
  mount();
  expect(await screen.findByText(labels.errors.self)).toBeVisible();
  expect(screen.queryByRole("button")).toBeNull();
});
test.each(["target", "actor", "generation", "authority", "expiry"])(
  "late mutation cannot update after %s changes",
  async (reason) => {
    const late = deferred();
    mocks.request.mockImplementation((r) =>
      r.method === "POST"
        ? late.promise
        : Promise.resolve(
            fact("ACTIVE", 4, r.path.includes(other) ? other : id),
          ),
    );
    const { rerender, tree } = mount();
    await confirm();
    if (reason === "actor") mocks.principal = other;
    if (reason === "generation") mocks.generation++;
    if (reason === "authority") mocks.manage = false;
    if (reason === "expiry")
      mocks.validUntil = new Date(Date.now() - 1000).toISOString();
    rerender(tree(reason === "target" ? other : id));
    await act(async () => late.resolve(fact("ENDED", 5)));
    expect(screen.queryByText(labels.changed)).toBeNull();
    expect(screen.queryByText("Ended", { exact: true })).toBeNull();
  },
);
test("cancelled old GET cannot overwrite mutation snapshot or subsequent refetch", async () => {
  const old = deferred();
  let reads = 0;
  mocks.request.mockImplementation((r) =>
    r.method === "POST"
      ? Promise.resolve(fact("SUSPENDED", 5))
      : ++reads === 2
        ? old.promise
        : Promise.resolve(
            fact(reads >= 3 ? "SUSPENDED" : "ACTIVE", reads >= 3 ? 5 : 4),
          ),
  );
  const { client } = mount();
  await screen.findByRole("button", { name: labels.actions.suspend });
  void client.invalidateQueries({
    queryKey: ["hassan-web", "platform-user-lifecycle"],
  });
  await waitFor(() => expect(reads).toBe(2));
  await confirm();
  await screen.findByText(labels.changed);
  await act(async () => old.resolve(fact("ACTIVE", 4)));
  expect(screen.getByText("Suspended", { exact: true })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: labels.actions.suspend }),
  ).toBeNull();
});
test("version conflict requires a new confirmed intent using the refetched revision", async () => {
  let version = 4,
    posts = 0;
  mocks.request.mockImplementation((r) => {
    if (r.method === "POST") {
      if (++posts === 1) {
        version = 8;
        return Promise.reject(backend("PLATFORM_MEMBERSHIP_VERSION_CONFLICT"));
      }
      return Promise.resolve(fact("SUSPENDED", 9));
    }
    return Promise.resolve(fact(posts > 1 ? "SUSPENDED" : "ACTIVE", version));
  });
  mount();
  await confirm();
  await screen.findByText(labels.errors.conflict);
  expect(posts).toBe(1);
  await confirm();
  await screen.findByText(labels.changed);
  const calls = mocks.request.mock.calls
    .filter(([r]) => r.method === "POST")
    .map(([r]) => r);
  expect(calls[0].body).toEqual({ expectedVersion: 4 });
  expect(calls[1].body).toEqual({ expectedVersion: 8 });
  expect(calls[0].idempotencyKey).not.toBe(calls[1].idempotencyKey);
});
test.each(["target", "actor"])(
  "late initial GET cannot render after %s changes",
  async (reason) => {
    const old = deferred();
    let reads = 0;
    mocks.request.mockImplementation(() =>
      ++reads === 1
        ? old.promise
        : Promise.resolve(fact("ENDED", 9, reason === "target" ? other : id)),
    );
    const { rerender, tree } = mount();
    await waitFor(() => expect(reads).toBe(1));
    if (reason === "actor") mocks.principal = other;
    rerender(tree(reason === "target" ? other : id));
    await screen.findByText("Ended", { exact: true });
    await act(async () => old.resolve(fact("ACTIVE", 4)));
    expect(
      screen.queryByRole("button", { name: labels.actions.suspend }),
    ).toBeNull();
  },
);
