/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  BranchDto,
  BranchId,
  MembershipId,
  PermissionDecisionDto,
  SafeAuthUserDto,
  UserId,
  WorkspaceId,
  WorkspaceMembershipStatus,
  WorkspaceMembershipSummaryDto,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import { accessFactsFromDecision } from "@/lib/access";
import type { AuthSessionContextValue, AuthState } from "@/lib/auth";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import { WorkspaceManagement } from "./WorkspaceManagement";

const mocks = vi.hoisted(() => ({
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
  staffContext: {
    accessFacts: null,
    shellContext: {
      accessContext: "user",
      branch: { branchId: null, label: "All permitted branches" },
      portal: "gym-staff",
      sessionGeneration: 1,
      workspace: {
        membershipId: "membership_a" as MembershipId,
        roles: ["GYM_OWNER"],
        workspaceId: "workspace_a" as WorkspaceId,
        workspaceName: "Summit Gym",
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      membershipId: "membership_a" as MembershipId,
      roles: ["GYM_OWNER"],
      workspaceId: "workspace_a" as WorkspaceId,
      workspaceName: "Summit Gym",
      workspaceTimezone: "Africa/Cairo",
    },
  } as StaffWorkspaceContextValue,
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => mocks.authSession as unknown as AuthSessionContextValue,
}));

vi.mock("@/lib/staff-shell", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/staff-shell")>(
      "@/lib/staff-shell",
    );

  return {
    ...actual,
    useStaffWorkspaceContext: () => mocks.staffContext,
  };
});

describe("workspace management UI", () => {
  beforeEach(() => {
    mocks.authSession.generation = 1;
    mocks.authSession.logout.mockClear();
    mocks.authSession.apiClient.request.mockReset();
    mocks.authSession.state = {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: user("Amina", "Owner"),
    } as AuthState;
    mocks.staffContext = context("workspace_a", "Summit Gym", 1);
  });

  test("does not render protected management UI without selected staff workspace", () => {
    mocks.staffContext = {
      accessFacts: null,
      shellContext: null,
      workspace: null,
    };

    renderWorkspaceManagement();

    expect(screen.getByText("No workspace selected")).toBeInTheDocument();
    expect(
      screen.queryByText("Workspace, branch, and staff management"),
    ).not.toBeInTheDocument();
  });

  test("renders verified workspace, branch, and staff data", async () => {
    mockManagementData();

    renderWorkspaceManagement();

    expect(await screen.findByDisplayValue("Summit Gym")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Downtown")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "membership_a" }),
    ).toBeInTheDocument();
  });

  test("workspace update sends exact DTO without expectedVersion or idempotency key", async () => {
    mockManagementData();

    renderWorkspaceManagement();

    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "Summit Plus" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

    await waitFor(() =>
      expect(mocks.authSession.apiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ name: "Summit Plus" }),
          method: "PATCH",
          path: "/workspaces/workspace_a",
        }),
      ),
    );
    const updateCall = mocks.authSession.apiClient.request.mock.calls.find(
      ([request]) => request.path === "/workspaces/workspace_a",
    )?.[0];
    expect(updateCall).not.toHaveProperty("expectedVersion");
    expect(updateCall).not.toHaveProperty("idempotencyKey");
  });

  test("missing access facts fail closed and do not submit protected commands", async () => {
    mockManagementData();
    mocks.staffContext = {
      ...context("workspace_a", "Summit Gym", 1),
      accessFacts: null,
    };

    renderWorkspaceManagement();

    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "Summit Plus" } });
    const saveButton = screen.getAllByRole("button", { name: "Save" })[0];
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);

    expect(
      screen.getAllByText("Access facts are unavailable for this action.")
        .length,
    ).toBeGreaterThan(0);
    expect(
      mocks.authSession.apiClient.request.mock.calls.some(
        ([request]) =>
          request.method === "PATCH" &&
          request.path === "/workspaces/workspace_a",
      ),
    ).toBe(false);
  });

  test("membership lifecycle controls follow Backend-supported status transitions", async () => {
    mockManagementData({
      memberships: [
        membership("workspace_a", "member_active", "ACTIVE"),
        membership("workspace_a", "member_suspended", "SUSPENDED"),
        membership("workspace_a", "member_ended", "ENDED"),
        membership("workspace_a", "member_invited", "INVITED"),
      ],
    });

    renderWorkspaceManagement();

    const activeItem = (
      await screen.findByRole("heading", { name: "member_active" })
    ).closest("article");
    expect(
      withinRequired(activeItem).getByRole("button", { name: "Suspend" }),
    ).toBeInTheDocument();
    expect(
      withinRequired(activeItem).getByRole("button", { name: "End" }),
    ).toBeInTheDocument();
    expect(
      withinRequired(activeItem).queryByRole("button", {
        name: "Reactivate",
      }),
    ).not.toBeInTheDocument();

    const suspendedItem = screen
      .getByRole("heading", { name: "member_suspended" })
      .closest("article");
    expect(
      withinRequired(suspendedItem).getByRole("button", {
        name: "Reactivate",
      }),
    ).toBeInTheDocument();
    expect(
      withinRequired(suspendedItem).getByRole("button", { name: "End" }),
    ).toBeInTheDocument();
    expect(
      withinRequired(suspendedItem).queryByRole("button", {
        name: "Suspend",
      }),
    ).not.toBeInTheDocument();

    const endedItem = screen
      .getByRole("heading", { name: "member_ended" })
      .closest("article");
    expect(
      withinRequired(endedItem).getByRole("button", { name: "Reactivate" }),
    ).toBeInTheDocument();
    expect(
      withinRequired(endedItem).queryByRole("button", { name: "End" }),
    ).not.toBeInTheDocument();

    const invitedItem = screen
      .getByRole("heading", { name: "member_invited" })
      .closest("article");
    expect(
      withinRequired(invitedItem).queryByRole("button", { name: "Suspend" }),
    ).not.toBeInTheDocument();
    expect(
      withinRequired(invitedItem).queryByRole("button", {
        name: "Reactivate",
      }),
    ).not.toBeInTheDocument();
    expect(
      withinRequired(invitedItem).queryByRole("button", { name: "End" }),
    ).not.toBeInTheDocument();
  });

  test("branch archive requires target confirmation and uses the exact route", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    mockManagementData();

    renderWorkspaceManagement();

    const archive = await screen.findByRole("button", { name: "Archive" });
    fireEvent.click(archive);
    expect(confirm).toHaveBeenCalledWith("Archive Downtown?");
    expect(
      mocks.authSession.apiClient.request.mock.calls.some(
        ([request]) =>
          request.method === "POST" &&
          request.path === "/workspaces/workspace_a/branches/branch_a/archive",
      ),
    ).toBe(false);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(archive);

    await waitFor(() =>
      expect(mocks.authSession.apiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "/workspaces/workspace_a/branches/branch_a/archive",
        }),
      ),
    );
  });

  test("rapid workspace saves issue only one command while the first is pending", async () => {
    const update = deferred<unknown>();
    mockManagementData({
      afterInitial: (request) => {
        if (request.path === "/workspaces/workspace_a") {
          return update.promise;
        }

        return envelope(workspaceDetail("workspace_a", "Summit Gym"));
      },
    });

    renderWorkspaceManagement();

    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "Summit Plus" } });
    const save = screen.getAllByRole("button", { name: "Save" })[0];
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() =>
      expect(
        mocks.authSession.apiClient.request.mock.calls.filter(
          ([request]) =>
            request.method === "PATCH" &&
            request.path === "/workspaces/workspace_a",
        ),
      ).toHaveLength(1),
    );

    update.resolve(envelope(workspaceDetail("workspace_a", "Summit Plus")));
  });

  test("staff invitation defensively omits TRAINEE from the command payload", async () => {
    mockManagementData();

    renderWorkspaceManagement();

    await screen.findByLabelText("Email");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "coach@example.com" },
    });
    expect(screen.queryByLabelText("TRAINEE")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("TRAINER"), {
      target: { checked: true, value: "TRAINER" },
    });
    const inviteButton = screen.getByRole("button", { name: "Send invite" });
    const inviteForm = inviteButton.closest("form");
    expect(inviteForm).not.toBeNull();
    fireEvent.submit(inviteForm as HTMLFormElement);

    await waitFor(() =>
      expect(mocks.authSession.apiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            email: "coach@example.com",
            roles: ["TRAINER"],
          }),
          method: "POST",
          path: "/workspaces/workspace_a/staff/invitations",
        }),
      ),
    );
    const inviteCall = mocks.authSession.apiClient.request.mock.calls.find(
      ([request]) =>
        request.method === "POST" &&
        request.path === "/workspaces/workspace_a/staff/invitations",
    )?.[0];
    expect(inviteCall?.body.roles).not.toContain("TRAINEE");
  });

  test("Backend 403 is access denied UX and does not logout", async () => {
    mockManagementData({
      afterInitial: (request) => {
        if (request.path === "/workspaces/workspace_a") {
          throw new ApiError({
            category: "forbidden",
            code: "PERMISSION_DENIED",
            kind: "backend",
            message: "Forbidden",
            status: 403,
          });
        }

        return envelope(workspaceDetail("workspace_a", "Summit Gym"));
      },
    });

    renderWorkspaceManagement();

    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "Forbidden Update" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

    expect(
      await screen.findByText(
        "The Backend rejected this action for the current access.",
      ),
    ).toBeInTheDocument();
    expect(mocks.authSession.logout).not.toHaveBeenCalled();
  });

  test("malformed workspace response fails closed as unavailable", async () => {
    mocks.authSession.apiClient.request.mockImplementation(async (request) => {
      if (request.path === "/workspaces/workspace_a") {
        return envelope({ workspace: { id: "workspace_a" } });
      }

      return envelope([]);
    });

    renderWorkspaceManagement();

    expect(
      await screen.findByText(
        "The Backend returned unexpected data, so the UI failed closed.",
      ),
    ).toBeInTheDocument();
  });

  test("workspace A late result cannot appear under workspace B context", async () => {
    const workspaceA = deferred<unknown>();
    mocks.authSession.apiClient.request.mockImplementation(async (request) => {
      if (request.path === "/workspaces/workspace_a") {
        return workspaceA.promise;
      }

      if (request.path === "/workspaces/workspace_b") {
        return envelope(workspaceDetail("workspace_b", "Pulse Gym"));
      }

      if (request.path === "/workspaces/workspace_b/branches") {
        return envelope([branch("workspace_b", "branch_b", "Uptown")]);
      }

      if (request.path === "/workspaces/workspace_b/memberships") {
        return envelope([membership("workspace_b", "membership_b")]);
      }

      return envelope([]);
    });
    const queryClient = createTestQueryClient();
    const { rerender } = render(workspaceTree(queryClient));

    expect(screen.getByText("Loading management data...")).toBeInTheDocument();

    mocks.authSession.generation = 2;
    mocks.staffContext = context("workspace_b", "Pulse Gym", 2);
    rerender(workspaceTree(queryClient));

    expect(await screen.findByDisplayValue("Pulse Gym")).toBeInTheDocument();
    workspaceA.resolve(envelope(workspaceDetail("workspace_a", "Summit Gym")));

    await waitFor(() =>
      expect(screen.queryByDisplayValue("Summit Gym")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "membership_b" }),
    ).toBeInTheDocument();
  });
});

function renderWorkspaceManagement() {
  return render(workspaceTree());
}

function workspaceTree(queryClient = createTestQueryClient()) {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceManagement labels={messages.en.workspaceManagement} />
    </QueryClientProvider>
  );
}

function mockManagementData(input?: {
  afterInitial?: (request: { method?: string; path: string }) => unknown;
  memberships?: WorkspaceMembershipSummaryDto[];
}) {
  mocks.authSession.apiClient.request.mockImplementation(async (request) => {
    if (input?.afterInitial && request.method !== "GET") {
      return input.afterInitial(request);
    }

    if (request.path === "/workspaces/workspace_a") {
      return envelope(workspaceDetail("workspace_a", "Summit Gym"));
    }

    if (request.path === "/workspaces/workspace_a/branches") {
      return envelope([branch("workspace_a", "branch_a", "Downtown")]);
    }

    if (request.path === "/workspaces/workspace_a/branches/branch_a/archive") {
      return envelope({
        ...branch("workspace_a", "branch_a", "Downtown"),
        status: "ARCHIVED",
      });
    }

    if (request.path === "/workspaces/workspace_a/memberships") {
      return envelope(
        input?.memberships ?? [membership("workspace_a", "membership_a")],
      );
    }

    if (request.path === "/workspaces/workspace_a/staff/invitations") {
      return envelope({
        invitation: {
          branchIds: [],
          email: "coach@example.com",
          expiresAt: "2026-02-01T00:00:00.000Z",
          id: "invitation_a",
          intendedRoles: ["TRAINER"],
          status: "PENDING",
          type: "STAFF_INVITATION",
          workspaceId: "workspace_a",
        },
        token: "test_invitation_token",
      });
    }

    if (
      request.path ===
      "/workspaces/workspace_a/memberships/membership_a/branches"
    ) {
      return envelope([]);
    }

    return envelope(workspaceDetail("workspace_a", "Summit Gym"));
  });
}

function envelope<T>(data: T): { data: T } {
  return { data };
}

function workspaceDetail(workspaceId: string, name: string) {
  return {
    membership: membership(workspaceId, `membership_${workspaceId}`),
    workspace: {
      defaultLanguage: "en",
      id: workspaceId,
      name,
      ownerUserId: "user_owner",
      status: "ACTIVE",
      timezone: "Africa/Cairo",
      type: "GYM",
    },
  };
}

function branch(workspaceId: string, id: string, name: string): BranchDto {
  return {
    id: id as BranchId,
    name,
    status: "ACTIVE",
    timezone: "Africa/Cairo",
    workspaceId: workspaceId as WorkspaceId,
  };
}

function membership(
  workspaceId: string,
  id: string,
  status: WorkspaceMembershipStatus = "ACTIVE",
): WorkspaceMembershipSummaryDto {
  return {
    accessVersion: 1,
    engagementPeriods: [],
    id: id as MembershipId,
    joinedAt: "2026-01-01T00:00:00.000Z",
    permissionProfileIds: [],
    roles: ["TRAINER"],
    status,
    userId: "user_a" as UserId,
    workspaceId: workspaceId as WorkspaceId,
  };
}

function context(
  workspaceId: string,
  workspaceName: string,
  generation: number,
): StaffWorkspaceContextValue {
  return {
    accessFacts: accessFacts(workspaceId, generation),
    shellContext: {
      accessContext: "user",
      branch: { branchId: null, label: "All permitted branches" },
      portal: "gym-staff",
      sessionGeneration: generation,
      workspace: {
        membershipId: `membership_${workspaceId}` as MembershipId,
        roles: ["GYM_OWNER"],
        workspaceId: workspaceId as WorkspaceId,
        workspaceName,
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      membershipId: `membership_${workspaceId}` as MembershipId,
      roles: ["GYM_OWNER"],
      workspaceId: workspaceId as WorkspaceId,
      workspaceName,
      workspaceTimezone: "Africa/Cairo",
    },
  };
}

function accessFacts(workspaceId: string, generation: number) {
  const workspacePermissionKeys = [
    "branches.create",
    "staff.invite",
    "staff.manage",
    "workspace.update",
  ] as const satisfies readonly PermissionDecisionDto["permission"][];
  const workspacePermissions: PermissionDecisionDto[] =
    workspacePermissionKeys.map((permission) => allow(permission));
  const branchPermissionKeys = [
    "branches.archive",
    "branches.update",
    "staff.branches.manage",
  ] as const satisfies readonly PermissionDecisionDto["permission"][];
  const branchPermissions: PermissionDecisionDto[] = branchPermissionKeys.map(
    (permission) =>
      allow(permission, {
        resourceIds: ["branch_a", "branch_b"],
        type: "MULTIPLE_BRANCHES",
      }),
  );

  return accessFactsFromDecision({
    decisions: [...workspacePermissions, ...branchPermissions],
    membershipId: `membership_${workspaceId}` as MembershipId,
    sessionGeneration: generation,
    workspaceId: workspaceId as WorkspaceId,
  });
}

function allow(
  permission: PermissionDecisionDto["permission"],
  scope?: PermissionDecisionDto["scope"],
): PermissionDecisionDto {
  return {
    allowed: true,
    effect: "ALLOW",
    permission,
    scope,
    source: "PROFILE",
  };
}

function withinRequired(element: Element | null) {
  expect(element).not.toBeNull();
  return within(element as HTMLElement);
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
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}
