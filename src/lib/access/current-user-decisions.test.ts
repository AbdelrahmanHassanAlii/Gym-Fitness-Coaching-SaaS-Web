import { describe, expect, test, vi } from "vitest";
import type {
  ApiDataEnvelope,
  CurrentUserEffectiveAccessDecisionsDto,
  PermissionKey,
  BranchId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts";
import type { ApiClient } from "@/lib/api";
import {
  currentUserEffectiveAccessFacts,
  currentUserEffectiveAccessQueryKey,
  normalizeCurrentUserDecisionRequests,
  requestCurrentUserEffectiveAccessDecisions,
} from "./current-user-decisions";

describe("current-user effective access decisions", () => {
  test("posts exact Stage 19 route A with expectedAccessVersion and bounded requests", async () => {
    const apiClient = fakeApiClient(
      response([
        { permission: "programs.read", scope: "WORKSPACE" },
        { permission: "workouts.complete", scope: "WORKSPACE" },
      ]),
    );

    await requestCurrentUserEffectiveAccessDecisions(
      apiClient,
      "workspace_a" as WorkspaceId,
      {
        expectedAccessVersion: 3,
        requests: [
          { permission: "workouts.complete", scope: "WORKSPACE" },
          { permission: "programs.read", scope: "WORKSPACE" },
        ],
      },
    );

    expect(apiClient.request).toHaveBeenCalledWith({
      body: {
        expectedAccessVersion: 3,
        requests: [
          { permission: "programs.read", scope: "WORKSPACE" },
          { permission: "workouts.complete", scope: "WORKSPACE" },
        ],
      },
      method: "POST",
      path: "/workspaces/workspace_a/me/effective-access/decisions",
      signal: undefined,
    });
    expect(JSON.stringify(apiClient.request.mock.calls[0]?.[0])).not.toContain(
      "/memberships/",
    );
  });

  test("rejects duplicate and oversized batches before calling Backend", async () => {
    const apiClient = fakeApiClient(response([]));

    expect(() =>
      normalizeCurrentUserDecisionRequests([
        { permission: "programs.read", scope: "WORKSPACE" },
        { permission: "programs.read", scope: "WORKSPACE" },
      ]),
    ).toThrow(/duplicate/i);
    expect(() =>
      normalizeCurrentUserDecisionRequests(
        Array.from({ length: 26 }, () => ({
          permission: "programs.read" as PermissionKey,
          scope: "WORKSPACE" as const,
        })),
      ),
    ).toThrow(/count/i);
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  test("maps minimized Backend decisions into WEB-010 presentation facts without policy internals", () => {
    const facts = currentUserEffectiveAccessFacts({
      data: response([
        { permission: "workouts.create", scope: "WORKSPACE" },
        {
          branchId: "branch_a" as BranchId,
          permission: "workouts.create",
          scope: "BRANCH",
        },
        {
          relationshipId: "relationship_a" as RelationshipId,
          permission: "workouts.create",
          scope: "RELATIONSHIP",
        },
      ]).data,
      sessionGeneration: 7,
    });

    expect(facts).toMatchObject({
      accessContext: "support",
      membershipId: "membership_a",
      sessionGeneration: 7,
      status: "ready",
      workspaceId: "workspace_a",
    });
    expect(facts.decisions).toEqual([
      {
        allowed: true,
        effect: "ALLOW",
        permission: "workouts.create",
        scope: { type: "WORKSPACE" },
        source: "NONE",
      },
      {
        allowed: true,
        effect: "ALLOW",
        permission: "workouts.create",
        scope: { resourceIds: ["branch_a"], type: "BRANCH" },
        source: "NONE",
      },
      {
        allowed: true,
        effect: "ALLOW",
        permission: "workouts.create",
        scope: {
          resourceIds: ["relationship_a"],
          type: "SPECIFIC_TRAINEES",
        },
        source: "NONE",
      },
    ]);
    expect(JSON.stringify(facts)).not.toContain("grant");
    expect(JSON.stringify(facts)).not.toContain("profile");
  });

  test("query identity includes workspace membership context request set and no credentials", () => {
    const key = currentUserEffectiveAccessQueryKey({
      accessContext: "support",
      accessVersion: 5,
      membershipId: "membership_a",
      requests: [{ permission: "programs.read", scope: "WORKSPACE" }],
      sessionGeneration: 2,
      workspaceId: "workspace_a" as WorkspaceId,
    });

    expect(key).toContain("current-user-effective-access");
    expect(JSON.stringify(key)).toContain("workspace_a");
    expect(JSON.stringify(key)).toContain("membership_a");
    expect(JSON.stringify(key)).toContain("programs.read");
    expect(JSON.stringify(key)).toContain("support");
    expect(JSON.stringify(key)).not.toMatch(/token|supportSessionId/i);
  });
});

function fakeApiClient(
  envelope: ApiDataEnvelope<CurrentUserEffectiveAccessDecisionsDto>,
): ApiClient & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async () => envelope),
  } as ApiClient & { request: ReturnType<typeof vi.fn> };
}

function response(
  requests: CurrentUserEffectiveAccessDecisionsDto["decisions"][number]["request"][],
): ApiDataEnvelope<CurrentUserEffectiveAccessDecisionsDto> {
  return {
    data: {
      accessVersion: 3,
      context: "SUPPORT_USER_CONTEXT",
      decisions: requests.map((request) => ({
        allowed: true,
        effect: "ALLOW",
        request,
      })),
      membershipId:
        "membership_a" as CurrentUserEffectiveAccessDecisionsDto["membershipId"],
      workspaceId: "workspace_a" as WorkspaceId,
    },
  };
}
