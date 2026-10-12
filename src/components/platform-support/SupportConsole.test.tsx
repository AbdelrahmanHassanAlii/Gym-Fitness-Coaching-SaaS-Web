import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "@/lib/api";
import { unsafeApiId } from "@/contracts/common/ids";
import {
  PlatformAuthorityProvider,
  type PlatformAuthority,
} from "@/lib/platform-access";
import { SupportContextProvider } from "@/lib/platform-support/support-context";
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
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
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
