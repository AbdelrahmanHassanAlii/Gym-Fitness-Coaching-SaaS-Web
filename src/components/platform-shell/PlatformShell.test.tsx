/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthSessionContextValue, AuthState } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { messages } from "@/i18n/messages";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { PlatformShell } from "./PlatformShell";

const mocks = vi.hoisted(() => ({
  authSession: {
    apiClient: { request: vi.fn() },
    bootstrap: vi.fn(),
    generation: 4,
    getAccessToken: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    markSessionExpired: vi.fn(),
    state: {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        email: "admin@example.test",
        emailVerified: true,
        firstName: "Platform",
        id: "user_a",
        lastName: "Admin",
        phoneVerified: false,
      },
    } as AuthState,
    subscribe: vi.fn(),
    verifyMfaLogin: vi.fn(),
  },
  pathname: "/platform",
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => mocks.authSession as unknown as AuthSessionContextValue,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh }),
}));

describe("Platform shell", () => {
  beforeEach(() => {
    mocks.authSession.apiClient.request.mockReset();
    mocks.authSession.logout.mockReset();
    mocks.authSession.markSessionExpired.mockReset();
    mocks.authSession.generation = 4;
    mocks.authSession.state = authenticatedState();
  });

  test("loads the exact Platform contracts and shows only allowed navigation placeholders", async () => {
    mockActiveContext(7);
    mockDecisions({
      "audit.platform.read": true,
      "platform_users.read": false,
      "platform_workspaces.manage": true,
    });

    renderShell();

    expect(await screen.findByText("Platform Portal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Workspaces")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/me/platform-context",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.authSession.apiClient.request).toHaveBeenNthCalledWith(2, {
      body: {
        expectedAccessVersion: 7,
        requests: [
          { permission: "audit.platform.read" },
          { permission: "platform_users.read" },
          { permission: "platform_workspaces.manage" },
        ],
      },
      method: "POST",
      path: "/platform/me/effective-access/decisions",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["SUSPENDED", "Platform membership suspended"],
    ["ENDED", "Platform membership ended"],
  ] as const)(
    "%s membership fails closed without requesting decisions",
    async (status, message) => {
      mockContext(status, 8);

      renderShell();

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    },
  );

  test("does not fetch while auth is unresolved or the session is restricted", async () => {
    mocks.authSession.state = {
      accessToken: null,
      restrictedUntilVerified: false,
      status: "initializing",
      user: null,
    };
    const queryClient = testQueryClient();
    const { rerender } = render(shellTree(queryClient));

    expect(screen.getByText("Loading Platform access...")).toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).not.toHaveBeenCalled();

    mocks.authSession.state = authenticatedState({
      restrictedUntilVerified: true,
    });
    rerender(shellTree(queryClient));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session verification required",
    );
    expect(mocks.authSession.apiClient.request).not.toHaveBeenCalled();
  });

  test.each([
    ["TWO_FACTOR_REQUIRED", "Multi-factor authentication required"],
    ["PLATFORM_MEMBERSHIP_REQUIRED", "No Platform membership"],
    ["SUPPORT_ACCESS_FORBIDDEN", "Unavailable in support context"],
  ])("maps %s without logging out", async (code, message) => {
    mocks.authSession.apiClient.request.mockRejectedValue(
      backendError(code, 403),
    );

    renderShell();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(mocks.authSession.logout).not.toHaveBeenCalled();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(1);
  });

  test("recovers an access-version conflict through fresh context before new decisions", async () => {
    mockActiveContext(7);
    mocks.authSession.apiClient.request.mockRejectedValueOnce(
      backendError("PLATFORM_MEMBERSHIP_ACCESS_VERSION_CONFLICT", 409),
    );
    mockActiveContext(8);
    mockDecisions(
      {
        "audit.platform.read": false,
        "platform_users.read": true,
        "platform_workspaces.manage": false,
      },
      8,
    );

    renderShell();

    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    const decisionBodies = mocks.authSession.apiClient.request.mock.calls
      .map(([request]) => request.body)
      .filter(Boolean);
    expect(decisionBodies).toEqual([
      expect.objectContaining({ expectedAccessVersion: 7 }),
      expect.objectContaining({ expectedAccessVersion: 8 }),
    ]);
  });

  test("discards a late context response after principal generation changes", async () => {
    const firstContext = deferred<unknown>();
    mocks.authSession.apiClient.request.mockReturnValueOnce(
      firstContext.promise,
    );
    const queryClient = testQueryClient();
    const { rerender } = render(shellTree(queryClient));

    mocks.authSession.generation = 5;
    mocks.authSession.state = authenticatedState({ userId: "user_b" });
    mockContext("SUSPENDED", 9, "platform_membership_b");
    rerender(shellTree(queryClient));

    expect(
      await screen.findByText("Platform membership suspended"),
    ).toBeInTheDocument();
    firstContext.resolve(contextEnvelope("ACTIVE", 7));

    await waitFor(() =>
      expect(screen.queryByText("Workspaces")).not.toBeInTheDocument(),
    );
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2);
  });

  test.each(["resolve", "reject"] as const)(
    "discards a late decision %s after principal generation changes",
    async (outcome) => {
      mockActiveContext(7);
      const firstDecisions = deferred<unknown>();
      mocks.authSession.apiClient.request.mockReturnValueOnce(
        firstDecisions.promise,
      );
      const queryClient = testQueryClient();
      const { rerender } = render(shellTree(queryClient));
      await waitFor(() =>
        expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(2),
      );

      mocks.authSession.generation = 5;
      mocks.authSession.state = authenticatedState({ userId: "user_b" });
      mockContext("ENDED", 9, "platform_membership_b");
      rerender(shellTree(queryClient));
      expect(
        await screen.findByText("Platform membership ended"),
      ).toBeInTheDocument();

      if (outcome === "resolve") {
        firstDecisions.resolve(
          decisionEnvelope({
            "audit.platform.read": true,
            "platform_users.read": true,
            "platform_workspaces.manage": true,
          }),
        );
      } else {
        firstDecisions.reject(backendError("PERMISSION_SCOPE_INVALID", 422));
      }

      await waitFor(() =>
        expect(screen.queryByText("Workspaces")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Platform membership ended")).toBeInTheDocument();
    },
  );

  test("retires decisions at validUntil and refetches without rendering expired navigation", async () => {
    mockActiveContext(7);
    mockDecisions(
      {
        "audit.platform.read": false,
        "platform_users.read": false,
        "platform_workspaces.manage": true,
      },
      7,
      new Date(Date.now() + 500).toISOString(),
    );
    mockDecisions({
      "audit.platform.read": false,
      "platform_users.read": false,
      "platform_workspaces.manage": false,
    });

    renderShell();

    expect(await screen.findByText("Workspaces")).toBeInTheDocument();
    await waitFor(
      () => expect(screen.queryByText("Workspaces")).not.toBeInTheDocument(),
      { timeout: 2_000 },
    );
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(3);
    expect(
      screen.getByText("No Platform sections are available."),
    ).toHaveAttribute("role", "status");
  });

  test("never treats an already-expired decision response as current authority", async () => {
    mockActiveContext(7);
    mockDecisions(
      {
        "audit.platform.read": false,
        "platform_users.read": false,
        "platform_workspaces.manage": true,
      },
      7,
      new Date(Date.now() - 1_000).toISOString(),
    );
    mockDecisions({
      "audit.platform.read": false,
      "platform_users.read": true,
      "platform_workspaces.manage": false,
    });

    renderShell();

    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledTimes(3);
  });

  test("malformed decision data fails closed and exposes no placeholder", async () => {
    mockActiveContext(7);
    mocks.authSession.apiClient.request.mockResolvedValueOnce({
      data: {
        accessContext: "USER",
        accessVersion: 7,
        context: "PLATFORM",
        decisions: [],
        membershipId: "platform_membership_a",
        membershipStatus: "ACTIVE",
        validUntil: null,
      },
    });

    renderShell();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Platform access could not be verified.",
    );
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
  });

  test("terminal authentication failure uses existing session expiry behavior", async () => {
    mocks.authSession.apiClient.request.mockRejectedValue(
      new ApiError({
        category: "unauthenticated",
        code: "AUTH_REQUIRED",
        kind: "backend",
        message: "Authentication required",
        status: 401,
      }),
    );

    renderShell();

    await waitFor(() =>
      expect(mocks.authSession.markSessionExpired).toHaveBeenCalledWith(
        expect.objectContaining({ code: "AUTH_REQUIRED" }),
      ),
    );
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
  });

  test("renders the separate shell in Arabic RTL with localized accessible navigation", async () => {
    mockActiveContext(7);
    mockDecisions({
      "audit.platform.read": true,
      "platform_users.read": false,
      "platform_workspaces.manage": false,
    });

    render(
      <ThemeProvider>
        <QueryClientProvider client={testQueryClient()}>
          <PlatformShell
            labels={{
              ...messages.ar.platformPortal,
              themeControls: messages.ar.themeControls,
            }}
            locale="ar"
          >
            <h1>{messages.ar.platformPortal.home.title}</h1>
          </PlatformShell>
        </QueryClientProvider>
      </ThemeProvider>,
    );

    const navigation = await screen.findByRole("navigation", {
      name: "بوابة المنصة",
    });
    expect(navigation.closest("div[dir]")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("link", { name: /الرئيسية/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("العمليات")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });
});

const labels = {
  account: { logout: "Log out", restricted: "Restricted" },
  errors: {
    accessDenied: "No Platform sections are available.",
    failed: "Platform access could not be verified.",
    malformed: "Platform access could not be verified.",
    membershipEnded: "Platform membership ended",
    membershipRequired: "No Platform membership",
    membershipSuspended: "Platform membership suspended",
    mfaRequired: "Multi-factor authentication required",
    restricted: "Session verification required",
    supportForbidden: "Unavailable in support context",
  },
  home: {
    availableSections: "Available sections",
    noSections: "No Platform sections are available.",
  },
  loading: {
    access: "Loading Platform access...",
    context: "Loading Platform context...",
  },
  localeLabel: "Interface language",
  mobile: { close: "Close navigation", open: "Open navigation" },
  nav: {
    home: { description: "Platform foundation", title: "Home" },
    operations: {
      description: "Coming in a later milestone",
      title: "Operations",
    },
    users: {
      description: "Coming in a later milestone",
      title: "Users",
    },
    workspaces: {
      description: "Coming in a later milestone",
      title: "Workspaces",
    },
  },
  portalLabel: "Platform Portal",
  retry: "Retry",
  themeControls: {
    appearanceLabel: "Appearance",
    resolvedPrefix: "Resolved",
    themeLabel: "Theme",
  },
};

function renderShell(queryClient = testQueryClient()) {
  return render(shellTree(queryClient));
}

function shellTree(queryClient: QueryClient) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <PlatformShell labels={labels} locale="en">
          <h1>Platform foundation</h1>
        </PlatformShell>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
}

function authenticatedState(
  overrides: { restrictedUntilVerified?: boolean; userId?: string } = {},
): AuthState {
  return {
    accessToken: "token",
    restrictedUntilVerified: overrides.restrictedUntilVerified ?? false,
    status: "authenticated",
    user: {
      email: "admin@example.test",
      emailVerified: true,
      firstName: "Platform",
      id: overrides.userId ?? "user_a",
      lastName: "Admin",
      phoneVerified: false,
    },
  } as AuthState;
}

function mockActiveContext(accessVersion: number) {
  mockContext("ACTIVE", accessVersion);
}

function mockContext(
  status: "ACTIVE" | "SUSPENDED" | "ENDED",
  accessVersion: number,
  membershipId = "platform_membership_a",
) {
  mocks.authSession.apiClient.request.mockResolvedValueOnce(
    contextEnvelope(status, accessVersion, membershipId),
  );
}

function contextEnvelope(
  status: "ACTIVE" | "SUSPENDED" | "ENDED",
  accessVersion: number,
  membershipId = "platform_membership_a",
) {
  return {
    data: {
      accessContext: "USER",
      context: "PLATFORM",
      membership: {
        accessVersion,
        id: membershipId,
        status,
        updatedAt: "2026-10-09T08:30:00.000Z",
      },
    },
  };
}

function mockDecisions(
  access: Record<
    | "audit.platform.read"
    | "platform_users.read"
    | "platform_workspaces.manage",
    boolean
  >,
  accessVersion = 7,
  validUntil: string | null = null,
) {
  mocks.authSession.apiClient.request.mockResolvedValueOnce(
    decisionEnvelope(access, accessVersion, validUntil),
  );
}

function decisionEnvelope(
  access: Record<
    | "audit.platform.read"
    | "platform_users.read"
    | "platform_workspaces.manage",
    boolean
  >,
  accessVersion = 7,
  validUntil: string | null = null,
) {
  return {
    data: {
      accessContext: "USER",
      accessVersion,
      context: "PLATFORM",
      decisions: Object.entries(access)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([permission, allowed]) => ({
          allowed,
          effect: allowed ? "ALLOW" : "DENY",
          permission,
        })),
      membershipId: "platform_membership_a",
      membershipStatus: "ACTIVE",
      validUntil,
    },
  };
}

function backendError(code: string, status: number) {
  return new ApiError({
    category: status === 403 ? "forbidden" : "expected-version-conflict",
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
