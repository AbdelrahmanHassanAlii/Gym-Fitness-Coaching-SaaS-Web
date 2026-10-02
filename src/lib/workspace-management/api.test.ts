import { describe, expect, test, vi } from "vitest";
import type {
  ApiDataEnvelope,
  BranchDto,
  BranchId,
  MembershipBranchAssignmentDto,
  MembershipId,
  WorkspaceId,
  WorkspaceMembershipSummaryDto,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import type { ApiClient, ApiRequestOptions } from "@/lib/api";
import {
  archiveBranch,
  assignMembershipBranch,
  createBranch,
  getWorkspaceDetail,
  inviteStaff,
  listBranches,
  listMemberships,
  removeMembershipBranch,
  transitionMembership,
  updateWorkspace,
  workspaceManagementKeys,
} from ".";

const workspaceId = "workspace_a" as WorkspaceId;
const branchId = "branch_a" as BranchId;
const membershipId = "membership_a" as MembershipId;

describe("workspace management API", () => {
  test("uses exact workspace and branch management routes without invented CAS or idempotency", async () => {
    const apiClient = fakeApiClient([
      { data: workspaceDetail() },
      { data: workspaceDetail() },
      { data: [branch()] },
      { data: branch() },
      { data: branch({ status: "ARCHIVED" }) },
    ]);

    await getWorkspaceDetail(apiClient, workspaceId);
    await updateWorkspace(apiClient, workspaceId, { name: "Summit" });
    await listBranches(apiClient, workspaceId);
    await createBranch(apiClient, workspaceId, { name: "Downtown" });
    await archiveBranch(apiClient, workspaceId, branchId);

    expect(apiClient.calls).toEqual([
      { method: "GET", path: "/workspaces/workspace_a" },
      {
        body: { name: "Summit" },
        method: "PATCH",
        path: "/workspaces/workspace_a",
      },
      { method: "GET", path: "/workspaces/workspace_a/branches" },
      {
        body: { name: "Downtown" },
        method: "POST",
        path: "/workspaces/workspace_a/branches",
      },
      {
        method: "POST",
        path: "/workspaces/workspace_a/branches/branch_a/archive",
      },
    ]);
    expect(apiClient.calls).not.toContainEqual(
      expect.objectContaining({
        expectedVersion: expect.anything(),
        idempotencyKey: expect.anything(),
      }),
    );
  });

  test("uses exact staff membership invitation and branch assignment routes", async () => {
    const assignment = branchAssignment();
    const apiClient = fakeApiClient([
      { data: [membership()] },
      { data: membership({ status: "SUSPENDED" }) },
      {
        data: {
          invitation: invitation(),
          token: "not-persisted-by-ui",
        },
      },
      { data: [assignment] },
      { data: assignment },
      { data: { success: true } },
    ]);

    await listMemberships(apiClient, workspaceId);
    await transitionMembership(apiClient, workspaceId, membershipId, "suspend");
    await inviteStaff(apiClient, workspaceId, {
      email: "coach@example.test",
      roles: ["TRAINER"],
    });
    await import(".").then((api) =>
      api.listMembershipBranchAssignments(apiClient, workspaceId, membershipId),
    );
    await assignMembershipBranch(
      apiClient,
      workspaceId,
      membershipId,
      branchId,
    );
    await removeMembershipBranch(
      apiClient,
      workspaceId,
      membershipId,
      branchId,
    );

    expect(apiClient.calls).toEqual([
      { method: "GET", path: "/workspaces/workspace_a/memberships" },
      {
        method: "POST",
        path: "/workspaces/workspace_a/memberships/membership_a/suspend",
      },
      {
        body: { email: "coach@example.test", roles: ["TRAINER"] },
        method: "POST",
        path: "/workspaces/workspace_a/staff/invitations",
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/memberships/membership_a/branches",
      },
      {
        method: "POST",
        path: "/workspaces/workspace_a/memberships/membership_a/branches/branch_a",
      },
      {
        method: "DELETE",
        path: "/workspaces/workspace_a/memberships/membership_a/branches/branch_a",
      },
    ]);
  });

  test("fails closed on malformed protected management responses", async () => {
    const apiClient = fakeApiClient([{ data: [{ id: "branch_a" }] }]);

    await expect(listBranches(apiClient, workspaceId)).rejects.toMatchObject({
      kind: "malformed-response",
    } satisfies Partial<ApiError>);
  });

  test("query keys are deterministic, workspace-scoped, session-scoped, and credential-free", () => {
    const keyA = workspaceManagementKeys.branches(workspaceId, 1, "user");
    const keyB = workspaceManagementKeys.branches(
      "workspace_b" as WorkspaceId,
      1,
      "user",
    );
    const supportKey = workspaceManagementKeys.branches(
      workspaceId,
      1,
      "support",
    );

    expect(keyA).toEqual(
      workspaceManagementKeys.branches(workspaceId, 1, "user"),
    );
    expect(keyA).not.toEqual(keyB);
    expect(keyA).not.toEqual(supportKey);
    expect(JSON.stringify(keyA)).not.toMatch(
      /accessToken|refresh|token|cookie|supportSessionId|x-support-session-id/i,
    );
  });
});

function fakeApiClient(responses: ApiDataEnvelope<unknown>[]) {
  const calls: ApiRequestOptions[] = [];
  const request = vi.fn(async (options: ApiRequestOptions) => {
    calls.push(stripVolatile(options));
    return responses.shift();
  });

  return {
    calls,
    request,
  } as unknown as ApiClient & { calls: ApiRequestOptions[] };
}

function stripVolatile(options: ApiRequestOptions): ApiRequestOptions {
  const rest = { ...options };
  delete rest.signal;
  return rest;
}

function workspaceDetail() {
  return {
    membership: membership(),
    workspace: {
      defaultLanguage: "en",
      id: workspaceId,
      name: "Summit Gym",
      ownerUserId: "user_owner",
      status: "ACTIVE",
      timezone: "Africa/Cairo",
      type: "GYM",
    },
  };
}

function branch(input: Partial<BranchDto> = {}): BranchDto {
  return {
    id: branchId,
    name: "Downtown",
    status: "ACTIVE",
    timezone: "Africa/Cairo",
    workspaceId,
    ...input,
  };
}

function membership(
  input: Partial<WorkspaceMembershipSummaryDto> = {},
): WorkspaceMembershipSummaryDto {
  return {
    accessVersion: 1,
    engagementPeriods: [],
    id: membershipId,
    joinedAt: "2026-01-01T00:00:00.000Z",
    permissionProfileIds: [],
    roles: ["TRAINER"],
    status: "ACTIVE",
    userId: "user_a" as WorkspaceMembershipSummaryDto["userId"],
    workspaceId,
    ...input,
  };
}

function invitation() {
  return {
    branchIds: [branchId],
    email: "coach@example.test",
    expiresAt: "2026-12-31T00:00:00.000Z",
    id: "invitation_a",
    intendedRoles: ["TRAINER"],
    status: "PENDING",
    type: "STAFF_INVITATION",
    workspaceId,
  };
}

function branchAssignment(): MembershipBranchAssignmentDto {
  return {
    active: true,
    branchId,
    id: "assignment_a",
    membershipId,
    startedAt: "2026-01-01T00:00:00.000Z",
    workspaceId,
  };
}
