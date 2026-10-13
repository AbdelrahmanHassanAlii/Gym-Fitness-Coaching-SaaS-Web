import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppQueryProvider } from "@/lib/server-state/query-provider";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { PlatformShell } from "@/components/platform-shell/PlatformShell";
import { messages } from "@/i18n/messages";
import { ApiError } from "@/lib/api";
import { usePlatformAuthority } from "@/lib/platform-access";
import {
  SupportContextProvider,
  useSupportSnapshot,
} from "@/lib/platform-support/support-context";
import { SupportBanner } from "./SupportBanner";
import { SupportConsole } from "./SupportConsole";
import { SupportWorkspaceView } from "./SupportWorkspaceView";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuthSession: () => mocks.auth() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/platform/support",
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: vi.fn(),
  }),
}));
const actor = "68e7a9d10d56fd2b98d4a100",
  workspace = "68e7a9d10d56fd2b98d4a101",
  sessionId = "68e7a9d10d56fd2b98d4a102";
const all = [
  "support.sessions.start",
  "support.sessions.read",
  "support.sessions.end_own",
  "support.sessions.revoke",
] as const;
let permissions: string[],
  accessVersion: number,
  managementDeadline: string | null,
  startDeadline: string | null;
let contextFailure: string, mismatch: boolean;
let request: ReturnType<typeof vi.fn>;
function session() {
  return {
    id: sessionId,
    requestId: sessionId,
    policyId: sessionId,
    realActorPlatformMembershipId: actor,
    targetWorkspaceId: workspace,
    targetType: "GYM",
    contextType: "WORKSPACE_SUPPORT",
    sessionType: "READ_ONLY",
    status: "ACTIVE",
    version: 2,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
}
function Probe() {
  const authority = usePlatformAuthority(),
    snapshot = useSupportSnapshot();
  return (
    <>
      <output data-testid="capabilities">
        {all.map((p) => `${p}:${authority.allows(p)}`).join(",")}
      </output>
      <output data-testid="runtime">
        {snapshot.pending
          ? "pending"
          : snapshot.context
            ? "active"
            : "inactive"}
      </output>
      <output data-testid="authority-version">{authority.accessVersion}</output>
      <button type="button" onClick={() => void authority.refresh()}>
        Refresh Platform authority
      </button>
      <div data-testid="landing">
        <SupportWorkspaceView locale="en" />
      </div>
    </>
  );
}
function tree() {
  return (
    <ThemeProvider>
      <AppQueryProvider>
        <SupportContextProvider>
          <SupportBanner locale="en" />
          <PlatformShell
            locale="en"
            labels={{
              ...messages.en.platformPortal,
              themeControls: messages.en.themeControls,
            }}
          >
            <SupportConsole locale="en" />
            <Probe />
          </PlatformShell>
        </SupportContextProvider>
      </AppQueryProvider>
    </ThemeProvider>
  );
}
const descriptors = Object.fromEntries(
  ["showModal", "close"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key),
  ]),
);
beforeEach(() => {
  permissions = [...all];
  accessVersion = 7;
  managementDeadline = null;
  startDeadline = null;
  contextFailure = "";
  mismatch = false;
  mocks.push.mockReset();
  mocks.replace.mockReset();
  for (const key of ["showModal", "close"] as const)
    Object.defineProperty(HTMLDialogElement.prototype, key, {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        if (key === "showModal") this.setAttribute("open", "");
        else this.removeAttribute("open");
      },
    });
  request = vi.fn(
    async (o: {
      path: string;
      body?: {
        expectedAccessVersion: number;
        requests: { permission: string }[];
      };
      supportSessionId?: string;
    }) => {
      if (o.path === "/me/platform-context")
        return {
          data: {
            context: "PLATFORM",
            accessContext: "USER",
            membership: {
              id: actor,
              status: "ACTIVE",
              accessVersion,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      if (o.path === "/platform/me/effective-access/decisions")
        return {
          data: {
            context: "PLATFORM",
            accessContext: "USER",
            membershipId: actor,
            membershipStatus: "ACTIVE",
            accessVersion: o.body!.expectedAccessVersion,
            validUntil:
              o.body!.requests.length === 1
                ? startDeadline
                : o.body!.requests.length === 3
                  ? managementDeadline
                  : null,
            decisions: o.body!.requests.map(({ permission }) => ({
              permission,
              allowed:
                permissions.includes(permission) ||
                permission === "platform_users.read",
              effect:
                permissions.includes(permission) ||
                permission === "platform_users.read"
                  ? "ALLOW"
                  : "DENY",
            })),
          },
        };
      if (o.path === "/platform/support/access-requests")
        return { data: { decision: "APPROVED", supportSession: session() } };
      if (o.path === "/me/support-context") {
        if (contextFailure)
          throw new ApiError({
            kind: "backend",
            category: "forbidden",
            code: contextFailure,
            status: 403,
            message: "private",
          });
        const s = session();
        return {
          data: {
            supportSession: {
              id: sessionId,
              status: "ACTIVE",
              version: 2,
              contextType: s.contextType,
              sessionType: s.sessionType,
              startedAt: s.startedAt,
              expiresAt: s.expiresAt,
              policyRevision: 4,
            },
            workspace: {
              id: mismatch ? actor : workspace,
              name: "Integration Gym",
              type: "GYM",
              status: "ACTIVE",
              timezone: "Africa/Cairo",
              defaultLanguage: "en",
            },
          },
        };
      }
      if (o.path === `/platform/support/sessions/${sessionId}`)
        return { data: session() };
      throw new Error(`Unexpected test API ${o.path}`);
    },
  );
  mocks.auth.mockReturnValue({
    apiClient: { request },
    generation: 1,
    state: {
      status: "authenticated",
      accessToken: "token",
      restrictedUntilVerified: false,
      user: { id: actor, firstName: "Support", lastName: "Operator" },
    },
    logout: vi.fn(),
    markSessionExpired: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of ["showModal", "close"]) {
    if (descriptors[key])
      Object.defineProperty(
        HTMLDialogElement.prototype,
        key,
        descriptors[key]!,
      );
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});
async function start() {
  await screen.findByRole("button", { name: "Start Support" });
  fireEvent.change(screen.getByLabelText("Workspace ID"), {
    target: { value: workspace },
  });
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "Investigate display" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start Support" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(screen.getByTestId("runtime")).toHaveTextContent("active"),
  );
  await screen.findByRole("heading", { name: "Administrative session detail" });
}
it("real provider read denial hides detail and prevents any Retry GET without replacing authority", async () => {
  render(tree());
  await start();
  permissions = all.filter((p) => p !== "support.sessions.read");
  const before = request.mock.calls.filter(
    ([o]) => o.path === `/platform/support/sessions/${sessionId}`,
  ).length;
  fireEvent(window, new Event("focus"));
  await waitFor(() =>
    expect(screen.getByTestId("capabilities")).toHaveTextContent(
      "support.sessions.read:false",
    ),
  );
  expect(screen.getByTestId("runtime")).toHaveTextContent("active");
  expect(screen.getByLabelText("Support Access")).toHaveTextContent(
    "Integration Gym",
  );
  expect(
    screen.queryByRole("button", { name: "Retry" }),
  ).not.toBeInTheDocument();
  fireEvent(window, new Event("focus"));
  await act(async () => {});
  expect(
    request.mock.calls.filter(
      ([o]) => o.path === `/platform/support/sessions/${sessionId}`,
    ),
  ).toHaveLength(before);
  expect(screen.getByRole("link", { name: /Users/ })).toBeInTheDocument();
});
it("preserves the existing session only after new-version start and current-context validation", async () => {
  render(tree());
  await start();
  const before = request.mock.calls.filter(
    ([o]) => o.path === "/me/support-context",
  ).length;
  accessVersion = 8;
  permissions = ["support.sessions.start"];
  fireEvent(window, new Event("focus"));
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([o]) => o.path === "/me/support-context")
        .length,
    ).toBeGreaterThan(before),
  );
  await waitFor(() =>
    expect(screen.getByTestId("runtime")).toHaveTextContent("active"),
  );
  expect(screen.getByLabelText("Support Access")).toHaveTextContent(
    "Integration Gym",
  );
  await waitFor(() =>
    expect(screen.getByTestId("capabilities")).toHaveTextContent(
      "support.sessions.read:false",
    ),
  );
  expect(
    screen.queryByRole("button", { name: "Revoke Support Access" }),
  ).not.toBeInTheDocument();
  expect(
    request.mock.calls.filter(
      ([o]) => o.path === "/platform/support/access-requests",
    ),
  ).toHaveLength(1);
  const reads = request.mock.calls.filter(
    ([o]) => o.path === "/me/support-context",
  );
  expect(reads.at(-1)?.[0].supportSessionId).toBe(sessionId);
  expect(
    request.mock.calls.some(
      ([o]) =>
        o.path === "/platform/me/effective-access/decisions" &&
        o.body.expectedAccessVersion === 8 &&
        o.body.requests.length === 1,
    ),
  ).toBe(true);
});
it.each(["support.sessions.end_own", "support.sessions.revoke", "all"])(
  "real provider removes %s management actions without ejecting support",
  async (lost) => {
    render(tree());
    await start();
    permissions = all.filter(
      (p) => p === "support.sessions.start" || (lost !== "all" && p !== lost),
    );
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(screen.getByTestId("capabilities")).toHaveTextContent(
        `${lost === "all" ? "support.sessions.read" : lost}:false`,
      ),
    );
    expect(screen.getByTestId("runtime")).toHaveTextContent("active");
    expect(screen.getByTestId("landing")).toHaveTextContent("Integration Gym");
    if (lost === "all" || lost === "support.sessions.end_own")
      expect(
        screen.queryByRole("button", { name: "End Support" }),
      ).not.toBeInTheDocument();
    if (lost === "all" || lost === "support.sessions.revoke")
      expect(
        screen.queryByRole("button", { name: "Revoke Support Access" }),
      ).not.toBeInTheDocument();
  },
);
it.each(["denied", "expired", "context-failed", "mismatched"])(
  "new-version %s authority fails closed without new start",
  async (outcome) => {
    render(tree());
    await start();
    const before = request.mock.calls.filter(
      ([o]) => o.path === "/me/support-context",
    ).length;
    accessVersion = 8;
    if (outcome === "denied")
      permissions = all.filter((p) => p !== "support.sessions.start");
    if (outcome === "expired")
      startDeadline = new Date(Date.now() - 1000).toISOString();
    if (outcome === "context-failed")
      contextFailure = "SUPPORT_SESSION_NOT_ACTIVE";
    if (outcome === "mismatched") mismatch = true;
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(screen.getByTestId("runtime")).toHaveTextContent("inactive"),
    );
    expect(screen.queryByLabelText("Support Access")).not.toBeInTheDocument();
    expect(screen.getByTestId("landing")).not.toHaveTextContent(
      "Integration Gym",
    );
    expect(
      request.mock.calls.filter(
        ([o]) => o.path === "/platform/support/access-requests",
      ),
    ).toHaveLength(1);
    if (outcome === "denied" || outcome === "expired")
      expect(
        request.mock.calls.filter(([o]) => o.path === "/me/support-context"),
      ).toHaveLength(before);
  },
);
it("management expiry updates real administrative authority while support stays active", async () => {
  render(tree());
  await start();
  vi.useFakeTimers();
  managementDeadline = new Date(Date.now() + 1000).toISOString();
  await act(async () => {
    fireEvent(window, new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
  });
  permissions = ["support.sessions.start"];
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByTestId("capabilities")).toHaveTextContent(
    "support.sessions.read:false",
  );
  expect(screen.getByTestId("runtime")).toHaveTextContent("active");
  expect(
    screen.queryByRole("button", { name: "Retry" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "End Support" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Revoke Support Access" }),
  ).not.toBeInTheDocument();
});
it.each(["decision", "context"])(
  "pending v8 %s responses cannot restore support after auth changes",
  async (stage) => {
    const view = render(tree());
    await start();
    accessVersion = 8;
    const original = request.getMockImplementation()! as (o: {
      path: string;
      body?: { expectedAccessVersion: number; requests: unknown[] };
    }) => Promise<unknown>;
    let release!: () => void;
    request.mockImplementation((o) => {
      if (
        (stage === "decision" &&
          o.path === "/platform/me/effective-access/decisions" &&
          o.body.expectedAccessVersion === 8 &&
          o.body.requests.length === 1) ||
        (stage === "context" && o.path === "/me/support-context")
      ) {
        const response = original(o);
        return new Promise((resolve) => {
          release = () => {
            void response.then(resolve);
          };
        });
      }
      return original(o);
    });
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(release).toBeDefined());
    expect(screen.getByTestId("runtime")).toHaveTextContent("pending");
    expect(screen.queryByLabelText("Support Access")).not.toBeInTheDocument();
    expect(screen.getByTestId("landing")).not.toHaveTextContent(
      "Integration Gym",
    );
    expect(
      screen.queryByRole("button", { name: "End Support" }),
    ).not.toBeInTheDocument();
    const auth = mocks.auth();
    permissions = ["support.sessions.start"];
    mocks.auth.mockReturnValue({
      ...auth,
      generation: 2,
      state: {
        ...auth.state,
        accessToken: "new-token",
        user: { ...auth.state.user, id: workspace },
      },
    });
    view.rerender(tree());
    await waitFor(() =>
      expect(screen.getByTestId("capabilities")).toHaveTextContent(
        "support.sessions.read:false",
      ),
    );
    await act(async () => {
      release();
    });
    expect(screen.getByTestId("runtime")).toHaveTextContent("inactive");
    expect(screen.queryByLabelText("Support Access")).not.toBeInTheDocument();
    expect(screen.getByTestId("capabilities")).toHaveTextContent(
      "support.sessions.read:false",
    );
  },
);
it("late v8 rediscovery cannot overwrite a newer v9 authority and selected context", async () => {
  render(tree());
  await start();
  accessVersion = 8;
  const original = request.getMockImplementation()! as (o: {
    path: string;
  }) => Promise<unknown>;
  let release!: () => void;
  request.mockImplementation((o) => {
    if (
      o.path === "/platform/me/effective-access/decisions" &&
      o.body.expectedAccessVersion === 8 &&
      o.body.requests.length === 1
    ) {
      const response = original(o);
      return new Promise((resolve) => {
        release = () => {
          void response.then(resolve);
        };
      });
    }
    return original(o);
  });
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(release).toBeDefined());
  accessVersion = 9;
  permissions = ["support.sessions.start"];
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh Platform authority" }),
  );
  await waitFor(() =>
    expect(screen.getByTestId("authority-version")).toHaveTextContent("9"),
  );
  await act(async () => {
    release();
  });
  await waitFor(() =>
    expect(screen.getByTestId("runtime")).toHaveTextContent("active"),
  );
  expect(screen.getByTestId("capabilities")).toHaveTextContent(
    "support.sessions.read:false",
  );
  expect(screen.getByTestId("authority-version")).toHaveTextContent("9");
  expect(screen.getByLabelText("Support Access")).toHaveTextContent(
    "Integration Gym",
  );
  expect(
    request.mock.calls.filter(
      ([o]) => o.path === "/platform/support/access-requests",
    ),
  ).toHaveLength(1);
});
