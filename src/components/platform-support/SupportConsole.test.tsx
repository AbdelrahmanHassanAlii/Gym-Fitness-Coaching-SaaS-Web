import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "@/lib/api";
import { unsafeApiId } from "@/contracts/common/ids";
import {
  PlatformAuthorityProvider,
  type PlatformAuthority,
} from "@/lib/platform-access";
import {
  SupportContextProvider,
  useSupportRuntime,
  useSupportSnapshot,
} from "@/lib/platform-support/support-context";
import type { SupportRuntime } from "@/lib/platform-support/runtime";
import { SupportWorkspaceView } from "./SupportWorkspaceView";
import { SupportConsole } from "./SupportConsole";
import { SupportSessionDetail } from "./SupportSessionDetail";
import { SupportBanner } from "./SupportBanner";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/platform/support",
}));
vi.mock("@/lib/auth", () => ({ useAuthSession: () => mocks.auth() }));
const id = "68e7a9d10d56fd2b98d4a100",
  workspace = "68e7a9d10d56fd2b98d4a101";
function session(status = "ACTIVE", version = 2) {
  return {
    id,
    requestId: id,
    policyId: id,
    realActorPlatformMembershipId: id,
    targetWorkspaceId: workspace,
    targetType: "GYM",
    contextType: "WORKSPACE_SUPPORT",
    sessionType: "READ_ONLY",
    status,
    version,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}
function context() {
  const s = session();
  return {
    data: {
      supportSession: {
        id,
        status: "ACTIVE",
        version: s.version,
        contextType: s.contextType,
        sessionType: s.sessionType,
        startedAt: s.startedAt,
        expiresAt: s.expiresAt,
        policyRevision: 5,
      },
      workspace: {
        id: workspace,
        name: "Known Gym",
        type: "GYM",
        status: "ACTIVE",
        timezone: "Africa/Cairo",
        defaultLanguage: "en",
      },
    },
  };
}
let request: ReturnType<typeof vi.fn>;
function authority(permissions: string[]): PlatformAuthority {
  return {
    principalId: unsafeApiId<"user">(id),
    membershipId: unsafeApiId<"membership">(id),
    accessVersion: 7,
    sessionGeneration: 1,
    validUntil: null,
    supportStartDecision: {
      allowed: permissions.includes("support.sessions.start"),
      validUntil: null,
    },
    allows: (p) => permissions.includes(p),
    refresh: vi.fn(async () => {}),
  };
}
function tree(
  permissions: string[],
  detail = false,
  locale: "en" | "ar" = "en",
  detailId = id,
) {
  return (
    <PlatformAuthorityProvider authority={authority(permissions)}>
      <SupportContextProvider>
        <SupportBanner locale={locale} />
        {detail ? (
          <SupportSessionDetail sessionId={detailId} locale={locale} />
        ) : (
          <SupportConsole locale={locale} />
        )}
      </SupportContextProvider>
    </PlatformAuthorityProvider>
  );
}
async function confirmStart() {
  fireEvent.change(screen.getByLabelText("Workspace ID"), {
    target: { value: workspace },
  });
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "Investigate view" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start Support" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Read Only");
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
}
const dialogDescriptors = {
  showModal: Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal",
  ),
  close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close"),
};
beforeEach(() => {
  mocks.push.mockReset();
  mocks.replace.mockReset();
  request = vi.fn(async (options: { path: string; method?: string }) => {
    if (options.path === "/platform/support/access-requests")
      return { data: { decision: "APPROVED", supportSession: session() } };
    if (options.path === "/me/support-context") return context();
    if (options.path.endsWith("/end")) return { data: session("ENDED", 3) };
    if (options.path.endsWith("/revoke"))
      return { data: session("REVOKED", 3) };
    return { data: session() };
  });
  const apiClient = { request } as ApiClient;
  mocks.auth.mockImplementation(() => ({
    apiClient,
    generation: 1,
    state: {
      status: "authenticated",
      accessToken: "token",
      restrictedUntilVerified: false,
      user: { id },
    },
    getAccessToken: () => "token",
  }));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of ["showModal", "close"] as const) {
    const descriptor = dialogDescriptors[key];
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});
describe("Independent runtime authority refresh", () => {
  it.each(["ar", "en"] as const)(
    "localizes administrative context/session types in %s",
    async (locale) => {
      render(tree(["support.sessions.read"], true, locale));
      await screen.findByText(
        locale === "ar" ? "دعم مساحة العمل" : "Workspace Support",
      );
      expect(
        screen.getByText(locale === "ar" ? "للقراءة فقط" : "Read Only"),
      ).toBeInTheDocument();
      expect(screen.queryByText("WORKSPACE_SUPPORT")).not.toBeInTheDocument();
      expect(screen.queryByText("READ_ONLY")).not.toBeInTheDocument();
    },
  );
  const all = [
    "support.sessions.start",
    "support.sessions.read",
    "support.sessions.end_own",
    "support.sessions.revoke",
  ];
  let runtime: SupportRuntime;
  function Probe() {
    runtime = useSupportRuntime();
    const snapshot = useSupportSnapshot();
    return (
      <div data-testid="landing">
        <SupportWorkspaceView locale="en" />
        <output>{snapshot.authority?.permissions.join(",")}</output>
      </div>
    );
  }
  function activeTree(permissions = all) {
    return (
      <PlatformAuthorityProvider authority={authority(permissions)}>
        <SupportContextProvider>
          <SupportBanner locale="en" />
          <SupportConsole locale="en" />
          <Probe />
        </SupportContextProvider>
      </PlatformAuthorityProvider>
    );
  }
  function refreshReplies(
    permissions: string[],
    managementDeadline: string | null = null,
    startDeadline: string | null = null,
  ) {
    const original = request.getMockImplementation()! as (options: {
      path: string;
    }) => Promise<unknown>;
    request.mockImplementation(
      async (options: {
        path: string;
        body?: { requests: { permission: string }[] };
      }) => {
        if (options.path === "/me/platform-context")
          return {
            data: {
              context: "PLATFORM",
              accessContext: "USER",
              membership: {
                id,
                status: "ACTIVE",
                accessVersion: 7,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        if (options.path === "/platform/me/effective-access/decisions") {
          const requested = options.body!.requests;
          return {
            data: {
              context: "PLATFORM",
              accessContext: "USER",
              membershipId: id,
              membershipStatus: "ACTIVE",
              accessVersion: 7,
              validUntil:
                requested.length === 1 ? startDeadline : managementDeadline,
              decisions: requested.map(({ permission }) => ({
                permission,
                allowed: permissions.includes(permission),
                effect: permissions.includes(permission) ? "ALLOW" : "DENY",
              })),
            },
          };
        }
        return original(options);
      },
    );
  }
  it.each([
    "support.sessions.read",
    "support.sessions.end_own",
    "support.sessions.revoke",
    "all",
  ])("keeps banner and landing after controlled %s loss", async (lost) => {
    const view = render(activeTree());
    await confirmStart();
    await waitFor(() => expect(runtime.getSnapshot().context).not.toBeNull());
    const epoch = runtime.getSnapshot().epoch;
    const next = all.filter(
      (p) => p === "support.sessions.start" || (lost !== "all" && p !== lost),
    );
    refreshReplies(next);
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(
        [...(runtime.getSnapshot().authority?.permissions ?? [])].sort(),
      ).toEqual([...next].sort()),
    );
    view.rerender(activeTree(next));
    expect(runtime.getSnapshot().epoch).toBe(epoch);
    expect(runtime.isSelected(id)).toBe(true);
    expect(screen.getByLabelText("Support Access")).toHaveTextContent(
      "Known Gym",
    );
    expect(screen.getByTestId("landing")).toHaveTextContent("Known Gym");
    if (!next.includes("support.sessions.read")) {
      const detailCalls = request.mock.calls.filter(
        ([o]) => o.path === `/platform/support/sessions/${id}`,
      ).length;
      expect(
        screen.queryByText("Administrative session detail"),
      ).not.toBeInTheDocument();
      fireEvent(window, new Event("focus"));
      await waitFor(() =>
        expect(
          request.mock.calls.filter(([o]) => o.path === "/me/platform-context")
            .length,
        ).toBeGreaterThan(1),
      );
      expect(
        request.mock.calls.filter(
          ([o]) => o.path === `/platform/support/sessions/${id}`,
        ),
      ).toHaveLength(detailCalls);
    }
    if (!next.includes("support.sessions.end_own"))
      expect(
        screen.queryByRole("button", { name: "End Support" }),
      ).not.toBeInTheDocument();
    if (!next.includes("support.sessions.revoke"))
      expect(
        screen.queryByRole("button", { name: "Revoke Support Access" }),
      ).not.toBeInTheDocument();
  });
  it("start loss purges banner, selected ID and landing", async () => {
    render(activeTree());
    await confirmStart();
    await waitFor(() => expect(runtime.getSnapshot().context).not.toBeNull());
    refreshReplies(all.filter((p) => p !== "support.sessions.start"));
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(runtime.getSnapshot().context).toBeNull());
    expect(runtime.isSelected(id)).toBe(false);
    expect(screen.queryByLabelText("Support Access")).not.toBeInTheDocument();
    expect(screen.getByTestId("landing")).not.toHaveTextContent("Known Gym");
  });
  it("management deadline hides actions without ejecting runtime", async () => {
    render(activeTree());
    await confirmStart();
    await waitFor(() => expect(runtime.getSnapshot().context).not.toBeNull());
    vi.useFakeTimers();
    refreshReplies(all, new Date(Date.now() + 1000).toISOString());
    await act(async () => {
      fireEvent(window, new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(runtime.getSnapshot().context).not.toBeNull();
    expect(screen.getByLabelText("Support Access")).toHaveTextContent(
      "Known Gym",
    );
    expect(
      within(screen.getByLabelText("Support Access")).queryByRole("button", {
        name: "End Support",
      }),
    ).not.toBeInTheDocument();
  });
  it.each(["management", "start"])(
    "late old %s authority cannot restore or retire a newer selected context",
    async (kind) => {
      render(activeTree());
      await confirmStart();
      await waitFor(() => expect(runtime.getSnapshot().context).not.toBeNull());
      let resolve!: (value: unknown) => void;
      let pendingPermissions: { permission: string }[] = [];
      refreshReplies([]);
      const original = request.getMockImplementation()! as (options: {
        path: string;
      }) => Promise<unknown>;
      request.mockImplementation((options) =>
        options.path === "/platform/me/effective-access/decisions" &&
        (kind === "management" || options.body.requests.length === 1)
          ? new Promise((r) => {
              pendingPermissions = options.body.requests;
              resolve = r;
            })
          : original(options),
      );
      fireEvent(window, new Event("focus"));
      await waitFor(() => expect(resolve).toBeDefined());
      await act(async () => {
        await runtime.select(mocks.auth().apiClient, id, workspace, {
          principalId: unsafeApiId<"user">(id),
          membershipId: unsafeApiId<"membership">(id),
          sessionGeneration: 1,
          accessVersion: 7,
          validUntil: null,
          startValidUntil: null,
          permissions: all,
        });
      });
      const fresh = runtime.getSnapshot();
      await act(async () => {
        resolve({
          data: {
            context: "PLATFORM",
            accessContext: "USER",
            membershipId: id,
            membershipStatus: "ACTIVE",
            accessVersion: 7,
            validUntil: null,
            decisions: pendingPermissions.map(({ permission }) => ({
              permission,
              allowed: false,
              effect: "DENY",
            })),
          },
        });
      });
      expect(runtime.getSnapshot()).toBe(fresh);
      expect(runtime.isSelected(id)).toBe(true);
    },
  );
});
describe("Support start and bootstrap", () => {
  it("denied start has no form, workspace discovery, detail or API request", () => {
    render(tree([]));
    expect(screen.queryByRole("button", { name: "Start Support" })).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it("validates fields accessibly before confirmation and never renders sensitive/write controls", () => {
    render(tree(["support.sessions.start"]));
    fireEvent.click(screen.getByRole("button", { name: "Start Support" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Reason")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByText("WRITE_SUPPORT")).toBeNull();
    expect(screen.queryByLabelText(/sensitive/i)).toBeNull();
  });
  it("requires current-context validation and keeps selection out of storage/URL", async () => {
    render(tree(["support.sessions.start"]));
    await confirmStart();
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/app/support"),
    );
    expect(request.mock.calls.map(([o]) => o.path)).toEqual([
      "/platform/support/access-requests",
      "/me/support-context",
    ]);
    expect(request.mock.calls[0][0].supportSessionId).toBeUndefined();
    expect(request.mock.calls[1][0].supportSessionId).toBe(id);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(location.href).not.toContain(id);
  });
  it("retains exact frozen intent on uncertainty and retries only after a click", async () => {
    request.mockRejectedValueOnce(
      new ApiError({ kind: "network", message: "Network" }),
    );
    render(tree(["support.sessions.start"]));
    await confirmStart();
    const retry = await screen.findByRole("button", {
      name: "Retry the same start request",
    });
    expect(request).toHaveBeenCalledTimes(1);
    const first = request.mock.calls[0][0];
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(request.mock.calls[1][0]).toMatchObject({
      body: first.body,
      idempotencyKey: first.idempotencyKey,
    });
  });
  it.each([
    "SUPPORT_SESSION_NOT_ACTIVE",
    "SUPPORT_SESSION_EXPIRED",
    "POLICY_DISABLED",
    "SUPPORT_SESSION_IP_MISMATCH",
  ])("historical ack cannot enter after runtime %s", async (code) => {
    request.mockImplementation(async ({ path }) => {
      if (path === "/me/support-context")
        throw new ApiError({
          kind: "backend",
          code,
          status: 403,
          message: "Private",
        });
      return { data: { decision: "APPROVED", supportSession: session() } };
    });
    render(tree(["support.sessions.start"]));
    await confirmStart();
    await screen.findByText(
      "Support access could not be validated. Review the current state before trying again.",
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Support Access")).toBeNull();
  });
  it("ignores a late start acknowledgement after target route is unmounted", async () => {
    let resolve!: (value: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = render(tree(["support.sessions.start"]));
    await confirmStart();
    view.unmount();
    await act(async () =>
      resolve({ data: { decision: "APPROVED", supportSession: session() } }),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("ignores pending context after principal/token change", async () => {
    let resolve!: (value: unknown) => void;
    request.mockImplementation(async ({ path }) =>
      path === "/me/support-context"
        ? new Promise((r) => {
            resolve = r;
          })
        : { data: { decision: "APPROVED", supportSession: session() } },
    );
    const view = render(tree(["support.sessions.start"]));
    await confirmStart();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    const apiClient = { request };
    mocks.auth.mockImplementation(() => ({
      apiClient,
      generation: 2,
      state: {
        status: "authenticated",
        accessToken: "replacement",
        restrictedUntilVerified: false,
        user: { id: workspace },
      },
    }));
    view.rerender(tree(["support.sessions.start"]));
    await act(async () => resolve(context()));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Support Access")).toBeNull();
  });
});
describe("Independent admin detail, end and revoke", () => {
  it("current session revoke purges selected context and banner", async () => {
    render(
      tree([
        "support.sessions.start",
        "support.sessions.read",
        "support.sessions.revoke",
      ]),
    );
    await confirmStart();
    fireEvent.click(
      await screen.findByRole("button", { name: "Revoke Support Access" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Revoke Support Access" }).at(-1)!,
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Support Access")).toBeNull(),
    );
    expect(screen.queryByText("Known Gym")).toBeNull();
  });
  it.each(["end", "revoke"] as const)(
    "ignores late %s response after viewed target switch",
    async (action) => {
      let resolve!: (value: unknown) => void;
      request.mockImplementation(async ({ path }) =>
        path.endsWith(`/${action}`)
          ? new Promise((r) => {
              resolve = r;
            })
          : {
              data: {
                ...session(),
                id: path.endsWith(workspace) ? workspace : id,
              },
            },
      );
      const view = render(
        tree(
          [
            "support.sessions.read",
            "support.sessions.end_own",
            "support.sessions.revoke",
          ],
          true,
        ),
      );
      if (action === "end")
        fireEvent.click(
          await screen.findByRole("button", { name: "End Support" }),
        );
      else {
        fireEvent.click(
          await screen.findByRole("button", { name: "Revoke Support Access" }),
        );
        fireEvent.click(
          screen
            .getAllByRole("button", { name: "Revoke Support Access" })
            .at(-1)!,
        );
      }
      view.rerender(
        tree(
          [
            "support.sessions.read",
            "support.sessions.end_own",
            "support.sessions.revoke",
          ],
          true,
          "en",
          workspace,
        ),
      );
      await act(async () =>
        resolve({ data: session(action === "end" ? "ENDED" : "REVOKED", 3) }),
      );
      await screen.findByText("Active");
      expect(
        screen.queryByText(action === "end" ? "Ended" : "Revoked"),
      ).toBeNull();
    },
  );
  it("read denial does not fetch", () => {
    render(tree(["support.sessions.start"], true));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText(/requires separate session-read/)).toBeVisible();
  });
  it("read alone does not imply end or revoke", async () => {
    render(tree(["support.sessions.read"], true));
    await screen.findByText("Active");
    expect(screen.queryByRole("button", { name: "End Support" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Revoke Support Access" }),
    ).toBeNull();
  });
  it("end own uses the session version without idempotency/selector", async () => {
    render(tree(["support.sessions.read", "support.sessions.end_own"], true));
    fireEvent.click(await screen.findByRole("button", { name: "End Support" }));
    await screen.findByText("Ended");
    const options = request.mock.calls.find(([o]) =>
      o.path.endsWith("/end"),
    )![0];
    expect(options.body).toEqual({ expectedVersion: 2 });
    expect(options.supportSessionId).toBeUndefined();
    expect(options.idempotencyKey).toBeUndefined();
  });
  it("revoke confirms and conflict refetches without silent mutation replay", async () => {
    let version = 2;
    request.mockImplementation(async ({ path }) => {
      if (path.endsWith("/revoke")) {
        version = 5;
        throw new ApiError({
          kind: "backend",
          code: "SUPPORT_SESSION_VERSION_CONFLICT",
          status: 409,
          message: "private",
        });
      }
      return { data: session("ACTIVE", version) };
    });
    render(tree(["support.sessions.read", "support.sessions.revoke"], true));
    fireEvent.click(
      await screen.findByRole("button", { name: "Revoke Support Access" }),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Revoke Support Access" }).at(-1)!,
    );
    await screen.findByText("5");
    expect(
      request.mock.calls.filter(([o]) => o.path.endsWith("/revoke")),
    ).toHaveLength(1);
    expect(screen.getByText(/session changed/)).toBeVisible();
  });
  it("ownership failure hides end after reconciliation", async () => {
    request.mockImplementation(async ({ path }) => {
      if (path.endsWith("/end"))
        throw new ApiError({
          kind: "backend",
          code: "SUPPORT_SESSION_OWNERSHIP_REQUIRED",
          status: 403,
          message: "private",
        });
      return { data: session() };
    });
    render(tree(["support.sessions.read", "support.sessions.end_own"], true));
    fireEvent.click(await screen.findByRole("button", { name: "End Support" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "End Support" })).toBeNull(),
    );
    expect(
      request.mock.calls.filter(([o]) => o.method === "POST"),
    ).toHaveLength(1);
  });
  it("late detail after target change cannot populate the new view", async () => {
    let resolve!: (v: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = render(tree(["support.sessions.read"], true));
    view.rerender(tree(["support.sessions.read"], true, "en", workspace));
    await act(async () => resolve({ data: session() }));
    expect(screen.queryByText("Active")).toBeNull();
  });
  it("Arabic reason, fixed read-only confirmation and status labels", async () => {
    render(tree(["support.sessions.start"], false, "ar"));
    fireEvent.change(screen.getByLabelText("معرّف مساحة العمل"), {
      target: { value: workspace },
    });
    fireEvent.change(screen.getByLabelText("سبب الوصول"), {
      target: { value: "التحقق من العرض" },
    });
    fireEvent.click(screen.getByRole("button", { name: "بدء جلسة دعم" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("للقراءة فقط");
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(screen.getByLabelText("وصول الدعم")).toHaveTextContent("ينتهي في");
  });
});
