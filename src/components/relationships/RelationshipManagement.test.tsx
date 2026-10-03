/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  BranchDto,
  BranchId,
  CoachingRelationshipDto,
  MembershipId,
  PermissionDecisionDto,
  SafeAuthUserDto,
  UserId,
  WorkspaceId,
  WorkspaceMembershipSummaryDto,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import { accessFactsFromDecision } from "@/lib/access";
import type { AuthSessionContextValue, AuthState } from "@/lib/auth";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import { RelationshipManagement } from "./RelationshipManagement";

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
  createIdempotencyKey: vi.fn(),
  staffContext: {
    accessFacts: null,
    shellContext: {
      accessContext: "user",
      branch: { branchId: null, label: "All permitted branches" },
      portal: "gym-staff",
      sessionGeneration: 1,
      workspace: {
        membershipId: "membership_a" as MembershipId,
        roles: ["TRAINER"],
        workspaceId: "workspace_a" as WorkspaceId,
        workspaceName: "Summit Gym",
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      membershipId: "membership_a" as MembershipId,
      roles: ["TRAINER"],
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

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    createIdempotencyKey: mocks.createIdempotencyKey,
  };
});

describe("relationship management UI", () => {
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
    mocks.createIdempotencyKey.mockReset();
    mocks.createIdempotencyKey.mockReturnValue("relationship-key-1");
    mocks.staffContext = context("workspace_a", "Summit Gym", 1);
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
  });

  test("does not render protected relationship UI without selected staff workspace", () => {
    mocks.staffContext = {
      accessFacts: null,
      shellContext: null,
      workspace: null,
    };

    renderRelationships();

    expect(screen.getByText("No workspace selected")).toBeInTheDocument();
    expect(screen.queryByText("Trainee relationships")).not.toBeInTheDocument();
  });

  test("renders verified relationship data and keeps relationshipId distinct from trainee user id", async () => {
    mockRelationshipData();

    renderRelationships();

    expect(
      await screen.findByRole("heading", { name: "Trainee relationships" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("relationship_workspace_a").length).toBe(2);
    expect(screen.getByText("trainee_workspace_a")).toBeInTheDocument();
    expect(screen.getByDisplayValue("7")).toBeInTheDocument();
  });

  test("role alone does not authorize assignment commands", async () => {
    mockRelationshipData();
    mocks.staffContext = {
      ...context("workspace_a", "Summit Gym", 1),
      accessFacts: null,
      workspace: {
        ...context("workspace_a", "Summit Gym", 1).workspace!,
        roles: ["GYM_OWNER"],
      },
    };

    renderRelationships();

    const staff = await screen.findByLabelText("Staff membership");
    fireEvent.change(staff, { target: { value: "membership_workspace_a" } });
    const button = screen.getByRole("button", { name: "Set primary" });
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(relationshipCommandCalls()).toHaveLength(0);
  });

  test("relationship-specific facts alone do not authorize workspace-scoped assignment route guards", async () => {
    mockRelationshipData();
    mocks.staffContext = {
      ...context("workspace_a", "Summit Gym", 1),
      accessFacts: accessFactsFromDecision({
        decisions: [
          allowSpecificRelationship(
            "trainees.assignments.primary.manage",
            "relationship_workspace_a",
          ),
        ],
        membershipId: "membership_workspace_a" as MembershipId,
        sessionGeneration: 1,
        workspaceId: "workspace_a" as WorkspaceId,
      }),
    };

    renderRelationships();

    await screen.findByLabelText("Staff membership");
    const button = screen.getByRole("button", { name: "Set primary" });
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(relationshipCommandCalls()).toHaveLength(0);
  });

  test("set primary command uses relationshipId, exact body, and idempotency key", async () => {
    mockRelationshipData();

    renderRelationships();

    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "coverage" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));

    await waitFor(() =>
      expect(mocks.authSession.apiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            expectedVersion: 7,
            primaryTrainerMembershipId: "membership_workspace_a",
            reason: "coverage",
          },
          idempotencyKey: "relationship-key-1",
          method: "PUT",
          path: "/workspaces/workspace_a/relationships/relationship_workspace_a/primary-trainer",
        }),
      ),
    );
  });

  test("rapid relationship command submission dispatches only one command while pending", async () => {
    const pending = deferred<unknown>();
    mockRelationshipData({
      afterInitial: (request) => {
        if (request.method === "PUT") {
          return pending.promise;
        }

        return envelope({ relationship: relationship("workspace_a") });
      },
    });

    renderRelationships();

    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    const button = screen.getByRole("button", { name: "Set primary" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(relationshipCommandCalls()).toHaveLength(1));

    pending.resolve(envelope({ relationship: relationship("workspace_a") }));
  });

  test("ambiguous retry of the same logical relationship command keeps the same idempotency key", async () => {
    let attempts = 0;
    mocks.createIdempotencyKey.mockReturnValueOnce("stable-relationship-key");
    mockRelationshipData({
      afterInitial: (request) => {
        if (request.method === "PUT") {
          attempts += 1;
          if (attempts === 1) {
            throw new ApiError({
              category: "unknown",
              kind: "network",
              message: "network failure after send",
            });
          }
        }

        return envelope({ relationship: relationship("workspace_a") });
      },
    });

    renderRelationships();

    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));

    expect(
      await screen.findByText(
        "Relationship data could not be loaded. Try again.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));

    await waitFor(() =>
      expect(
        relationshipCommandCalls().map(([request]) => request.idempotencyKey),
      ).toEqual(["stable-relationship-key", "stable-relationship-key"]),
    );
    expect(mocks.createIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  test("relationship list filter changes do not rotate a retry idempotency key", async () => {
    let attempts = 0;
    mocks.createIdempotencyKey.mockReturnValueOnce("filter-stable-key");
    mockRelationshipData({
      afterInitial: (request) => {
        if (request.method === "PUT") {
          attempts += 1;
          if (attempts === 1) {
            throw new ApiError({
              category: "unknown",
              kind: "network",
              message: "ambiguous send",
            });
          }
        }

        return envelope({ relationship: relationship("workspace_a") });
      },
    });

    renderRelationships();

    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));

    expect(
      await screen.findByText(
        "Relationship data could not be loaded. Try again.",
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "ACTIVE" },
    });
    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));

    await waitFor(() =>
      expect(
        relationshipCommandCalls().map(([request]) => request.idempotencyKey),
      ).toEqual(["filter-stable-key", "filter-stable-key"]),
    );
    expect(mocks.createIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  test("remove assignment commands require confirmation and use Backend terminology", async () => {
    mockRelationshipData();

    renderRelationships();

    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove assistant" }));

    await waitFor(() =>
      expect(globalThis.confirm).toHaveBeenCalledWith(
        "Remove assistant trainer assignment for membership_workspace_a?",
      ),
    );
    expect(mocks.authSession.apiClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { expectedVersion: 7 },
        method: "DELETE",
        path: "/workspaces/workspace_a/relationships/relationship_workspace_a/assistants/membership_workspace_a",
      }),
    );
  });

  test("Backend 403 is access denied UX and does not logout", async () => {
    mockRelationshipData({
      afterInitial: (request) => {
        if (request.method === "PUT") {
          throw new ApiError({
            category: "forbidden",
            code: "PERMISSION_DENIED",
            kind: "backend",
            message: "Forbidden",
            status: 403,
          });
        }

        return envelope({ relationship: relationship("workspace_a") });
      },
    });

    renderRelationships();

    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));

    expect(
      await screen.findByText(
        "The Backend rejected this relationship action for the current access.",
      ),
    ).toBeInTheDocument();
    expect(mocks.authSession.logout).not.toHaveBeenCalled();
  });

  test("Backend 409 conflict is surfaced without overwrite", async () => {
    mockRelationshipData({
      afterInitial: (request) => {
        if (request.method === "PUT") {
          throw new ApiError({
            category: "expected-version-conflict",
            code: "COACHING_RELATIONSHIP_VERSION_CONFLICT",
            kind: "backend",
            message: "Version conflict",
            status: 409,
          });
        }

        return envelope({ relationship: relationship("workspace_a") });
      },
    });

    renderRelationships();

    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));

    expect(
      await screen.findByText(
        "The relationship changed on the server. Refresh before retrying.",
      ),
    ).toBeInTheDocument();
  });

  test("Backend 422 validation is safe business feedback", async () => {
    mockRelationshipData({
      afterInitial: (request) => {
        if (request.method === "PUT") {
          throw new ApiError({
            category: "validation",
            code: "WORKSPACE_MEMBERSHIP_NOT_FOUND",
            kind: "backend",
            message: "Unsafe backend detail",
            status: 422,
          });
        }

        return envelope({ relationship: relationship("workspace_a") });
      },
    });

    renderRelationships();

    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));

    expect(
      await screen.findByText(
        "Review the required relationship fields and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Unsafe backend detail")).not.toBeInTheDocument();
  });

  test("malformed relationship response fails closed", async () => {
    mockRelationshipData({
      detail: {
        ...relationship("workspace_a"),
        id: "trainee_workspace_a" as CoachingRelationshipDto["id"],
      },
    });

    renderRelationships();

    expect(
      await screen.findByText(
        "The Backend returned unexpected relationship data, so the UI failed closed.",
      ),
    ).toBeInTheDocument();
  });

  test("workspace A late relationship data cannot appear under workspace B", async () => {
    const workspaceA = deferred<unknown>();
    mocks.authSession.apiClient.request.mockImplementation(async (request) => {
      if (request.path === "/workspaces/workspace_a/relationships") {
        return workspaceA.promise;
      }

      if (request.path === "/workspaces/workspace_b/relationships") {
        return envelope([relationship("workspace_b")]);
      }

      if (
        request.path ===
        "/workspaces/workspace_b/relationships/relationship_workspace_b"
      ) {
        return envelope({ relationship: relationship("workspace_b") });
      }

      if (request.path === "/workspaces/workspace_b/branches") {
        return envelope([branch("workspace_b")]);
      }

      if (request.path === "/workspaces/workspace_b/memberships") {
        return envelope([membership("workspace_b")]);
      }

      return envelope([]);
    });
    const queryClient = createTestQueryClient();
    const { rerender } = render(relationshipsTree(queryClient));

    expect(screen.getByText("Loading relationships...")).toBeInTheDocument();

    mocks.authSession.generation = 2;
    mocks.staffContext = context("workspace_b", "Pulse Gym", 2);
    rerender(relationshipsTree(queryClient));

    expect(await screen.findByText("Pulse Gym")).toBeInTheDocument();
    workspaceA.resolve(envelope([relationship("workspace_a")]));

    await waitFor(() =>
      expect(
        screen.queryByText("relationship_workspace_a"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText("relationship_workspace_b").length).toBe(2);
  });

  test("workspace A mutation completion cannot publish success state under workspace B", async () => {
    const pending = deferred<unknown>();
    mockRelationshipData({
      afterInitial: (request) => {
        if (request.method === "PUT") {
          return pending.promise;
        }

        return envelope({ relationship: relationship("workspace_a") });
      },
    });
    const queryClient = createTestQueryClient();
    const { rerender } = render(relationshipsTree(queryClient));

    await screen.findByLabelText("Staff membership");
    fireEvent.change(screen.getByLabelText("Staff membership"), {
      target: { value: "membership_workspace_a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set primary" }));

    mocks.authSession.generation = 2;
    mocks.staffContext = context("workspace_b", "Pulse Gym", 2);
    mocks.authSession.apiClient.request.mockImplementation(async (request) => {
      if (request.path === "/workspaces/workspace_b/relationships") {
        return envelope([relationship("workspace_b")]);
      }

      if (
        request.path ===
        "/workspaces/workspace_b/relationships/relationship_workspace_b"
      ) {
        return envelope({ relationship: relationship("workspace_b") });
      }

      if (request.path === "/workspaces/workspace_b/branches") {
        return envelope([branch("workspace_b")]);
      }

      if (request.path === "/workspaces/workspace_b/memberships") {
        return envelope([membership("workspace_b")]);
      }

      return envelope([]);
    });
    rerender(relationshipsTree(queryClient));
    expect(await screen.findByText("Pulse Gym")).toBeInTheDocument();

    pending.resolve(envelope({ relationship: relationship("workspace_a") }));

    await waitFor(() =>
      expect(
        screen.queryByText("Relationship change saved."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText("relationship_workspace_b").length).toBe(2);
  });

  test("Arabic RTL relationship page renders actual management controls", async () => {
    mockRelationshipData();

    render(
      <div dir="rtl">
        <QueryClientProvider client={createTestQueryClient()}>
          <RelationshipManagement labels={messages.ar.relationships} />
        </QueryClientProvider>
      </div>,
    );

    expect(
      await screen.findByRole("heading", { name: "علاقات المتدربين" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("عضوية الطاقم")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "تعيين المدرب الأساسي" }),
    ).toBeInTheDocument();
  });
});

function renderRelationships() {
  return render(relationshipsTree());
}

function relationshipsTree(queryClient = createTestQueryClient()) {
  return (
    <QueryClientProvider client={queryClient}>
      <RelationshipManagement labels={messages.en.relationships} />
    </QueryClientProvider>
  );
}

function relationshipCommandCalls() {
  return mocks.authSession.apiClient.request.mock.calls.filter(
    ([request]) =>
      request.path.includes("/relationships/") && request.method !== "GET",
  );
}

function mockRelationshipData(input?: {
  afterInitial?: (request: { method?: string; path: string }) => unknown;
  detail?: CoachingRelationshipDto;
}) {
  mocks.authSession.apiClient.request.mockImplementation(async (request) => {
    if (input?.afterInitial && request.method !== "GET") {
      return input.afterInitial(request);
    }

    if (isRelationshipListPath(request.path, "workspace_a")) {
      return envelope([relationship("workspace_a")]);
    }

    if (
      request.path ===
      "/workspaces/workspace_a/relationships/relationship_workspace_a"
    ) {
      return envelope({
        relationship: input?.detail ?? relationship("workspace_a"),
      });
    }

    if (request.path === "/workspaces/workspace_a/branches") {
      return envelope([branch("workspace_a")]);
    }

    if (request.path === "/workspaces/workspace_a/memberships") {
      return envelope([membership("workspace_a")]);
    }

    return envelope({ relationship: relationship("workspace_a") });
  });
}

function envelope<T>(data: T): { data: T } {
  return { data };
}

function isRelationshipListPath(path: string, workspaceId: string): boolean {
  const basePath = `/workspaces/${workspaceId}/relationships`;
  return path === basePath || path.startsWith(`${basePath}?`);
}

function relationship(workspaceId: string): CoachingRelationshipDto {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    currentPrimaryTrainerAssignmentId: "assignment_primary",
    engagementPeriods: [{ startedAt: "2026-01-01T00:00:00.000Z" }],
    homeBranchId: `branch_${workspaceId}` as BranchId,
    id: `relationship_${workspaceId}` as CoachingRelationshipDto["id"],
    status: "ACTIVE",
    traineeMembershipId:
      `trainee_membership_${workspaceId}` as CoachingRelationshipDto["traineeMembershipId"],
    traineeUserId:
      `trainee_${workspaceId}` as CoachingRelationshipDto["traineeUserId"],
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 7,
    workspaceId: workspaceId as WorkspaceId,
  };
}

function branch(workspaceId: string): BranchDto {
  return {
    id: `branch_${workspaceId}` as BranchId,
    name: workspaceId === "workspace_a" ? "Downtown" : "Uptown",
    status: "ACTIVE",
    timezone: "Africa/Cairo",
    workspaceId: workspaceId as WorkspaceId,
  };
}

function membership(workspaceId: string): WorkspaceMembershipSummaryDto {
  return {
    accessVersion: 1,
    engagementPeriods: [],
    id: `membership_${workspaceId}` as MembershipId,
    joinedAt: "2026-01-01T00:00:00.000Z",
    permissionProfileIds: [],
    roles: ["TRAINER"],
    status: "ACTIVE",
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
        roles: ["TRAINER"],
        workspaceId: workspaceId as WorkspaceId,
        workspaceName,
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      membershipId: `membership_${workspaceId}` as MembershipId,
      roles: ["TRAINER"],
      workspaceId: workspaceId as WorkspaceId,
      workspaceName,
      workspaceTimezone: "Africa/Cairo",
    },
  };
}

function accessFacts(workspaceId: string, generation: number) {
  const relationshipPermissionKeys = [
    "trainees.update",
    "trainees.assignments.primary.manage",
    "trainees.assignments.assistant.manage",
    "trainees.assignments.nutritionist.manage",
  ] as const satisfies readonly PermissionDecisionDto["permission"][];

  return accessFactsFromDecision({
    decisions: relationshipPermissionKeys.map((permission) =>
      allowWorkspace(permission),
    ),
    membershipId: `membership_${workspaceId}` as MembershipId,
    sessionGeneration: generation,
    workspaceId: workspaceId as WorkspaceId,
  });
}

function allowWorkspace(
  permission: PermissionDecisionDto["permission"],
): PermissionDecisionDto {
  return {
    allowed: true,
    effect: "ALLOW",
    permission,
    scope: {
      type: "WORKSPACE",
    },
    source: "PROFILE",
  };
}

function allowSpecificRelationship(
  permission: PermissionDecisionDto["permission"],
  relationshipId: string,
): PermissionDecisionDto {
  return {
    allowed: true,
    effect: "ALLOW",
    permission,
    scope: {
      resourceIds: [relationshipId],
      type: "SPECIFIC_TRAINEES",
    },
    source: "PROFILE",
  };
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
