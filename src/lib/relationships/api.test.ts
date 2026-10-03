import { describe, expect, test, vi } from "vitest";
import type {
  ApiDataEnvelope,
  BranchId,
  CoachingRelationshipDto,
  MembershipId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import type { ApiClient, ApiRequestOptions } from "@/lib/api";
import {
  addRelationshipStaffAssignment,
  changeRelationshipHomeBranch,
  getRelationship,
  listRelationships,
  relationshipKeys,
  removeRelationshipStaffAssignment,
  setPrimaryTrainer,
} from ".";

const workspaceId = "workspace_a" as WorkspaceId;
const relationshipId = "relationship_a" as RelationshipId;
const branchId = "branch_a" as BranchId;
const membershipId = "membership_a" as MembershipId;

describe("relationship API", () => {
  test("uses exact relationship list and detail routes", async () => {
    const apiClient = fakeApiClient([
      { data: [relationship()] },
      { data: { relationship: relationship() } },
    ]);

    await listRelationships(apiClient, workspaceId, { status: "ACTIVE" });
    await getRelationship(apiClient, workspaceId, relationshipId);

    expect(apiClient.calls).toEqual([
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships?status=ACTIVE",
      },
      {
        method: "GET",
        path: "/workspaces/workspace_a/relationships/relationship_a",
      },
    ]);
  });

  test("uses exact assignment command routes, expectedVersion bodies, and idempotency keys", async () => {
    const apiClient = fakeApiClient([
      { data: { relationship: relationship({ homeBranchId: branchId }) } },
      { data: { relationship: relationship() } },
      {
        data: {
          assignment: assignment("ASSISTANT_TRAINER"),
          relationship: relationship(),
        },
      },
      { data: { removed: true, relationship: relationship() } },
    ]);

    await changeRelationshipHomeBranch(
      apiClient,
      workspaceId,
      relationshipId,
      {
        expectedVersion: 7,
        homeBranchId: branchId,
        primaryTrainerMembershipId: membershipId,
      },
      "branch-key",
    );
    await setPrimaryTrainer(
      apiClient,
      workspaceId,
      relationshipId,
      {
        expectedVersion: 8,
        primaryTrainerMembershipId: membershipId,
        reason: "handoff",
      },
      "primary-key",
    );
    await addRelationshipStaffAssignment(
      apiClient,
      workspaceId,
      relationshipId,
      "assistants",
      { expectedVersion: 9, staffMembershipId: membershipId },
      "assistant-key",
    );
    await removeRelationshipStaffAssignment(
      apiClient,
      workspaceId,
      relationshipId,
      "nutritionists",
      membershipId,
      { expectedVersion: 10, reason: "done" },
      "nutritionist-key",
    );

    expect(apiClient.calls).toEqual([
      {
        body: {
          expectedVersion: 7,
          homeBranchId: "branch_a",
          primaryTrainerMembershipId: "membership_a",
        },
        idempotencyKey: "branch-key",
        method: "PUT",
        path: "/workspaces/workspace_a/relationships/relationship_a/home-branch",
      },
      {
        body: {
          expectedVersion: 8,
          primaryTrainerMembershipId: "membership_a",
          reason: "handoff",
        },
        idempotencyKey: "primary-key",
        method: "PUT",
        path: "/workspaces/workspace_a/relationships/relationship_a/primary-trainer",
      },
      {
        body: { expectedVersion: 9, staffMembershipId: "membership_a" },
        idempotencyKey: "assistant-key",
        method: "POST",
        path: "/workspaces/workspace_a/relationships/relationship_a/assistants",
      },
      {
        body: { expectedVersion: 10, reason: "done" },
        idempotencyKey: "nutritionist-key",
        method: "DELETE",
        path: "/workspaces/workspace_a/relationships/relationship_a/nutritionists/membership_a",
      },
    ]);
  });

  test("fails closed on malformed, cross-workspace, or trainee-user-id-shaped relationship data", async () => {
    await expect(
      listRelationships(
        fakeApiClient([
          {
            data: [
              relationship({
                workspaceId: "workspace_b" as WorkspaceId,
              }),
            ],
          },
        ]),
        workspaceId,
        {},
      ),
    ).rejects.toMatchObject({
      kind: "malformed-response",
    } satisfies Partial<ApiError>);

    await expect(
      getRelationship(
        fakeApiClient([
          {
            data: {
              relationship: relationship({
                id: "trainee_user_a" as RelationshipId,
              }),
            },
          },
        ]),
        workspaceId,
        "trainee_user_a" as RelationshipId,
      ),
    ).rejects.toMatchObject({
      kind: "malformed-response",
    } satisfies Partial<ApiError>);
  });

  test("query keys are session, workspace, relationship, status, and context scoped without credentials", () => {
    const userList = relationshipKeys.list(workspaceId, 1, "ACTIVE", "user");
    const supportList = relationshipKeys.list(
      workspaceId,
      1,
      "ACTIVE",
      "support",
    );
    const workspaceBList = relationshipKeys.list(
      "workspace_b" as WorkspaceId,
      1,
      "ACTIVE",
      "user",
    );
    const detailA = relationshipKeys.detail(
      workspaceId,
      relationshipId,
      1,
      "user",
    );
    const detailB = relationshipKeys.detail(
      workspaceId,
      "relationship_b" as RelationshipId,
      1,
      "user",
    );

    expect(userList).toEqual(
      relationshipKeys.list(workspaceId, 1, "ACTIVE", "user"),
    );
    expect(userList).not.toEqual(supportList);
    expect(userList).not.toEqual(workspaceBList);
    expect(detailA).not.toEqual(detailB);
    expect(JSON.stringify([userList, detailA])).not.toMatch(
      /accessToken|refresh|cookie|supportSessionId|x-support-session-id/i,
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

function relationship(
  input: Partial<CoachingRelationshipDto> = {},
): CoachingRelationshipDto {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    engagementPeriods: [],
    id: relationshipId,
    status: "ACTIVE",
    traineeUserId: "trainee_user_a" as CoachingRelationshipDto["traineeUserId"],
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 7,
    workspaceId,
    ...input,
  };
}

function assignment(assignmentType: "ASSISTANT_TRAINER" | "NUTRITIONIST") {
  return {
    active: true,
    assignmentType,
    id: "assignment_a",
    relationshipId,
    staffMembershipId: membershipId,
    startedAt: "2026-01-01T00:00:00.000Z",
  };
}
