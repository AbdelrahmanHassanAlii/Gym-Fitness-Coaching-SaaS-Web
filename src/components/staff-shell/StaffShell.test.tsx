/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  ApiDataEnvelope,
  MyWorkspaceDto,
  SafeAuthUserDto,
  UserId,
  WorkspaceId,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import type { AuthSessionContextValue, AuthState } from "@/lib/auth";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { messages } from "@/i18n/messages";
import { StaffShell } from "./StaffShell";

const mocks = vi.hoisted(() => ({
  pathname: "/app",
  authSession: {
    apiClient: {
      request: vi.fn(),
    },
    bootstrap: vi.fn(),
    generation: 1,
    getAccessToken: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    markSessionExpired: vi.fn(),
    state: {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        email: "owner@example.test",
        emailVerified: true,
        firstName: "Amina",
        id: "user_a",
        lastName: "Owner",
        phoneVerified: false,
      },
    } as AuthState,
    subscribe: vi.fn(),
    verifyMfaLogin: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => mocks.authSession as unknown as AuthSessionContextValue,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

const staffWorkspace = workspace({
  roles: ["GYM_OWNER"],
  workspaceId: "workspace_a" as WorkspaceId,
  workspaceName: "Summit Gym",
});
const workspaceB = workspace({
  roles: ["GYM_MANAGER"],
  workspaceId: "workspace_b" as WorkspaceId,
  workspaceName: "Pulse Gym",
});
const traineeWorkspace = workspace({
  roles: ["TRAINEE"],
  workspaceId: "workspace_t" as WorkspaceId,
  workspaceName: "Trainee Gym",
});

describe("staff shell", () => {
  beforeEach(() => {
    mocks.pathname = "/app";
    mocks.authSession.generation = 1;
    mocks.authSession.logout.mockClear();
    mocks.authSession.markSessionExpired.mockClear();
    mocks.authSession.apiClient.request.mockReset();
    mocks.authSession.state = {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: user("Amina", "Owner"),
    } as AuthState;
  });

  test("does not render protected shell content while auth is unresolved", () => {
    mocks.authSession.state = {
      accessToken: null,
      restrictedUntilVerified: false,
      status: "initializing",
      user: null,
    } as AuthState;

    renderStaffShell();

    expect(screen.getByText("Loading staff shell...")).toBeInTheDocument();
    expect(screen.queryByText("Gym staff shell")).not.toBeInTheDocument();
  });

  test("renders valid staff context and current navigation accessibly", async () => {
    mockWorkspaces([staffWorkspace]);

    renderStaffShell();

    expect(await screen.findByText("Summit Gym")).toBeInTheDocument();
    expect(screen.getByText("Gym staff shell")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Overview/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.queryByRole("link", { name: /Staff/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Amina Owner")).toBeInTheDocument();
  });

  test("trainee-only context does not become staff shell", async () => {
    mockWorkspaces([traineeWorkspace]);

    renderStaffShell();

    expect(
      await screen.findByText("No staff workspace available"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Trainee Gym")).not.toBeInTheDocument();
  });

  test("unresolved workspace query does not flash protected shell page", async () => {
    const pending = deferred<ApiDataEnvelope<readonly MyWorkspaceDto[]>>();
    mocks.authSession.apiClient.request.mockReturnValue(pending.promise);

    renderStaffShell();

    expect(screen.getByText("Loading workspaces...")).toBeInTheDocument();
    expect(screen.queryByText("Gym staff shell")).not.toBeInTheDocument();

    pending.resolve({ data: [staffWorkspace] });

    expect(await screen.findByText("Gym staff shell")).toBeInTheDocument();
  });

  test("unavailable workspace data is not treated as access denied or allowed", async () => {
    mocks.authSession.apiClient.request.mockRejectedValue(
      new ApiError({
        category: "forbidden",
        code: "PERMISSION_DENIED",
        kind: "backend",
        message: "Forbidden",
        status: 403,
      }),
    );

    renderStaffShell();

    expect(
      await screen.findByText("Shell data could not be loaded"),
    ).toBeInTheDocument();
    expect(mocks.authSession.logout).not.toHaveBeenCalled();
    expect(screen.queryByText("Gym staff shell")).not.toBeInTheDocument();
  });

  test("session replacement removes previous workspace shell state", async () => {
    mockWorkspaces([staffWorkspace]);
    const { rerender } = renderStaffShell();

    expect(await screen.findByText("Summit Gym")).toBeInTheDocument();

    mocks.authSession.generation = 2;
    mocks.authSession.state = {
      accessToken: "token-b",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: user("Badr", "Manager"),
    } as AuthState;
    mockWorkspaces([workspaceB]);
    rerender(staffShellTree());

    expect(await screen.findByText("Pulse Gym")).toBeInTheDocument();
    expect(screen.queryByText("Summit Gym")).not.toBeInTheDocument();
    expect(screen.getByText("Badr Manager")).toBeInTheDocument();
  });

  test("workspace switch removes previous workspace-specific state", async () => {
    mockWorkspaces([staffWorkspace, workspaceB]);

    renderStaffShell();

    const selector = await screen.findByLabelText("Workspace");
    await waitFor(() => expect(selector).toHaveValue("workspace_a"));

    fireEvent.change(selector, { target: { value: "workspace_b" } });

    await waitFor(() => expect(selector).toHaveValue("workspace_b"));
    expect(screen.getByText("Pulse Gym")).toBeInTheDocument();
  });

  test("late workspace response cannot restore stale workspace shell state", async () => {
    const workspaceARequest =
      deferred<ApiDataEnvelope<readonly MyWorkspaceDto[]>>();
    mocks.authSession.apiClient.request.mockReturnValueOnce(
      workspaceARequest.promise,
    );
    const queryClient = createTestQueryClient();
    const { rerender } = render(staffShellTree("en", queryClient));

    expect(screen.getByText("Loading workspaces...")).toBeInTheDocument();

    mocks.authSession.generation = 2;
    mocks.authSession.state = {
      accessToken: "token-b",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: user("Badr", "Manager"),
    } as AuthState;
    mocks.authSession.apiClient.request.mockResolvedValueOnce({
      data: [workspaceB],
    });
    rerender(staffShellTree("en", queryClient));

    expect(await screen.findByText("Pulse Gym")).toBeInTheDocument();
    workspaceARequest.resolve({ data: [staffWorkspace] });

    await waitFor(() =>
      expect(screen.queryByText("Summit Gym")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Badr Manager")).toBeInTheDocument();
  });

  test("logout state removes protected shell immediately", async () => {
    mockWorkspaces([staffWorkspace]);
    const queryClient = createTestQueryClient();
    const { rerender } = render(staffShellTree("en", queryClient));

    expect(await screen.findByText("Summit Gym")).toBeInTheDocument();

    mocks.authSession.state = {
      accessToken: null,
      restrictedUntilVerified: false,
      status: "unauthenticated",
      user: null,
    } as AuthState;
    rerender(staffShellTree("en", queryClient));

    expect(screen.getByText("Loading staff shell...")).toBeInTheDocument();
    expect(screen.queryByText("Summit Gym")).not.toBeInTheDocument();
    expect(screen.queryByText("Gym staff shell")).not.toBeInTheDocument();
  });

  test("malformed workspace rows and unknown roles fail closed", async () => {
    mockWorkspaceData([
      {
        membership: {
          ...staffWorkspace.membership,
          roles: ["GYM_OWNER", "UNKNOWN_ROLE"],
        },
        workspace: staffWorkspace.workspace,
      },
      {
        membership: {
          ...workspaceB.membership,
          id: undefined,
        },
        workspace: workspaceB.workspace,
      },
    ]);

    renderStaffShell();

    expect(
      await screen.findByText("No staff workspace available"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Gym staff shell")).not.toBeInTheDocument();
  });

  test("workspace management navigation is actionable while later product navigation remains inactive", async () => {
    mockWorkspaces([staffWorkspace]);

    renderStaffShell();

    expect(await screen.findByText("Summit Gym")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Overview/i })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(
      screen.getByRole("link", {
        name: /Workspace & branchesManage workspace settings and branches/i,
      }),
    ).toHaveAttribute("href", "/app/workspace");
    for (const label of [
      "Staff",
      "Leads",
      "Relationships",
      "Training",
      "Nutrition",
      "Progress",
      "Documents",
      "Notifications",
      "Analytics",
    ]) {
      expect(
        screen.queryByRole("link", { name: new RegExp(`^${label}\\b`, "i") }),
      ).not.toBeInTheDocument();
    }
  });

  test("responsive menu toggles accessibly and keyboard activation works", async () => {
    mockWorkspaces([staffWorkspace]);

    renderStaffShell();

    await screen.findByText("Summit Gym");
    const toggle = screen.getByRole("button", { name: "Open navigation" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(toggle, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("Arabic RTL shell renders with localized controls", async () => {
    mockWorkspaces([staffWorkspace]);

    renderStaffShell("ar");

    expect(await screen.findByText("Summit Gym")).toBeInTheDocument();
    expect(
      screen.getByText("بوابة طاقم الجيم").closest("[dir='rtl']"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "فتح التنقل" }),
    ).toBeInTheDocument();
  });

  test("LTR shell remains isolated after Arabic RTL render", async () => {
    mockWorkspaces([staffWorkspace]);
    const { unmount } = renderStaffShell("ar");

    expect(await screen.findByText("Summit Gym")).toBeInTheDocument();
    expect(
      screen.getByText("بوابة طاقم الجيم").closest("[dir='rtl']"),
    ).toBeInTheDocument();

    unmount();
    mockWorkspaces([staffWorkspace]);
    renderStaffShell("en");

    expect(await screen.findByText("Summit Gym")).toBeInTheDocument();
    expect(
      screen.getByText("Gym Staff Portal").closest("[dir='ltr']"),
    ).toBeInTheDocument();
  });
});

function renderStaffShell(locale: "ar" | "en" = "en") {
  return render(staffShellTree(locale));
}

function staffShellTree(
  locale: "ar" | "en" = "en",
  queryClient = createTestQueryClient(),
) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <StaffShell
          labels={{
            ...messages[locale].staffShell,
            themeControls: messages[locale].themeControls,
          }}
          locale={locale}
        >
          <h1>{messages[locale].staffShell.overview.title}</h1>
        </StaffShell>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function mockWorkspaces(items: readonly MyWorkspaceDto[]) {
  mockWorkspaceData(items);
}

function mockWorkspaceData(items: unknown) {
  mocks.authSession.apiClient.request.mockResolvedValue({ data: items });
}

function user(firstName: string, lastName: string): SafeAuthUserDto {
  return {
    emailVerified: true,
    firstName,
    id: `user_${firstName.toLowerCase()}` as UserId,
    lastName,
    phoneVerified: false,
  };
}

function workspace(input: {
  roles: MyWorkspaceDto["membership"]["roles"];
  workspaceId: WorkspaceId;
  workspaceName: string;
}): MyWorkspaceDto {
  return {
    membership: {
      accessVersion: 1,
      engagementPeriods: [],
      id: `membership_${input.workspaceId}` as MyWorkspaceDto["membership"]["id"],
      joinedAt: "2026-01-01T00:00:00.000Z",
      permissionProfileIds: [],
      roles: input.roles,
      status: "ACTIVE",
      userId: "user_a" as UserId,
      workspaceId: input.workspaceId,
    },
    workspace: {
      defaultLanguage: "en",
      id: input.workspaceId,
      name: input.workspaceName,
      ownerUserId: "user_owner" as UserId,
      status: "ACTIVE",
      timezone: "Africa/Cairo",
      type: "GYM",
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}
