/**
 * @vitest-environment jsdom
 */
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  isPermissionKey,
  type BranchId,
  type MembershipId,
  type PermissionDecisionDto,
  type RelationshipId,
  type WorkspaceId,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import {
  AccessControlledButton,
  AccessGate,
  accessDeniedByBackend,
  accessFactsFromDecision,
  accessMutationRequest,
  clearPermissionSessionState,
  createAccessQueryKey,
  evaluateAccess,
  shouldLogoutForAccessError,
} from ".";

const workspaceA = "workspace_a" as WorkspaceId;
const workspaceB = "workspace_b" as WorkspaceId;
const membershipA = "membership_a" as MembershipId;
const membershipB = "membership_b" as MembershipId;
const branchA = "branch_a" as BranchId;
const relationshipA = "relationship_a" as RelationshipId;

describe("permission access UX model", () => {
  test("uses only verified Backend permission identifiers", () => {
    expect(isPermissionKey("staff.permissions.manage")).toBe(true);
    expect(isPermissionKey("dashboard.gym.read")).toBe(true);
    expect(isPermissionKey("canEditUser")).toBe(false);
    expect(isPermissionKey("isSuperAdmin")).toBe(false);
  });

  test("unresolved, missing, malformed, and error facts fail closed", () => {
    const requirement = workspaceRequirement("staff.read", 1, workspaceA);

    expect(evaluateAccess(null, requirement)).toMatchObject({
      allowed: false,
      status: "unresolved",
    });
    expect(
      evaluateAccess(
        { ...readyFacts([], 1, workspaceA), decisions: [] },
        requirement,
      ),
    ).toMatchObject({ allowed: false, reason: "unknown", status: "denied" });
    expect(
      evaluateAccess(
        { ...readyFacts([], 1, workspaceA), status: "error" },
        requirement,
      ),
    ).toMatchObject({ allowed: false, status: "unavailable" });
  });

  test("explicit allowed, denied, and deny-wins behavior drive UX", () => {
    const requirement = workspaceRequirement("staff.read", 1, workspaceA);
    const allow = permissionDecision("staff.read", true, "ALLOW");
    const deny = permissionDecision("staff.read", false, "DENY");

    expect(
      evaluateAccess(readyFacts([allow], 1, workspaceA), requirement),
    ).toMatchObject({
      allowed: true,
      status: "allowed",
    });
    expect(
      evaluateAccess(readyFacts([allow, deny], 1, workspaceA), requirement),
    ).toMatchObject({
      allowed: false,
      reason: "deny",
      status: "denied",
    });
  });

  test("ordinary 403 becomes access denial and does not request logout", () => {
    const forbidden = new ApiError({
      category: "forbidden",
      code: "PERMISSION_DENIED",
      kind: "backend",
      message: "Permission denied.",
      status: 403,
    });

    expect(accessDeniedByBackend(forbidden)).toMatchObject({
      allowed: false,
      reason: "backend-denied",
      status: "denied",
    });
    expect(shouldLogoutForAccessError(forbidden)).toBe(false);
    expect(
      shouldLogoutForAccessError(
        new ApiError({
          category: "unauthenticated",
          kind: "backend",
          message: "Auth required",
          status: 401,
        }),
      ),
    ).toBe(true);
  });

  test("session A allow cannot leak after logout or account replacement", () => {
    const staleFacts = readyFacts(
      [permissionDecision("staff.read", true, "ALLOW")],
      1,
      workspaceA,
    );
    const afterLogout = workspaceRequirement("staff.read", 2, workspaceA);
    const accountB = readyFacts(
      [permissionDecision("staff.read", false, "DENY")],
      2,
      workspaceA,
    );

    expect(evaluateAccess(staleFacts, afterLogout)).toMatchObject({
      allowed: false,
      reason: "stale",
    });
    expect(evaluateAccess(accountB, afterLogout)).toMatchObject({
      allowed: false,
      reason: "deny",
    });
  });

  test("workspace A facts and late responses cannot expose workspace B", async () => {
    const lateA = deferred<ReturnType<typeof readyFacts>>();
    const currentB = workspaceRequirement("staff.read", 2, workspaceB);
    const bDenied = readyFacts(
      [permissionDecision("staff.read", false, "DENY")],
      2,
      workspaceB,
    );

    expect(evaluateAccess(bDenied, currentB)).toMatchObject({
      allowed: false,
      reason: "deny",
    });

    lateA.resolve(
      readyFacts(
        [permissionDecision("staff.read", true, "ALLOW")],
        1,
        workspaceA,
      ),
    );

    expect(evaluateAccess(await lateA.promise, currentB)).toMatchObject({
      allowed: false,
      reason: "stale",
    });
  });

  test("support and ordinary user contexts are distinct without raw support session ids", () => {
    const supportFacts = readyFacts(
      [permissionDecision("audit.workspace.read", true, "ALLOW")],
      1,
      workspaceA,
      "support",
    );
    const userRequirement = workspaceRequirement(
      "audit.workspace.read",
      1,
      workspaceA,
      "user",
    );
    const supportKey = createAccessQueryKey({
      accessContext: "support",
      membershipId: membershipA,
      workspaceId: workspaceA,
    });

    expect(evaluateAccess(supportFacts, userRequirement)).toMatchObject({
      allowed: false,
      reason: "stale",
    });
    expect(supportKey).toContain("support");
    expect(JSON.stringify(supportKey)).not.toContain("support-session");
  });

  test("platform context is distinct from workspace roles and branch/relationship scopes are explicit", () => {
    const platformFacts = accessFactsFromDecision({
      accessContext: "user",
      context: "PLATFORM",
      decisions: [
        permissionDecision("platform_permissions.manage", true, "ALLOW"),
      ],
      sessionGeneration: 1,
    });

    expect(
      evaluateAccess(platformFacts, {
        context: "PLATFORM",
        permission: "platform_permissions.manage",
        scope: "platform",
        sessionGeneration: 1,
      }),
    ).toMatchObject({ allowed: true });

    expect(
      evaluateAccess(
        readyFacts(
          [
            permissionDecision("branches.update", true, "ALLOW", {
              resourceIds: [branchA],
              type: "BRANCH",
            }),
          ],
          1,
          workspaceA,
        ),
        {
          ...workspaceRequirement("branches.update", 1, workspaceA),
          branchId: branchA,
          scope: "branch",
        },
      ),
    ).toMatchObject({ allowed: true });

    expect(
      evaluateAccess(
        readyFacts(
          [
            permissionDecision("dashboard.relationship.read", true, "ALLOW", {
              resourceIds: [relationshipA],
              type: "SPECIFIC_TRAINEES",
            }),
          ],
          1,
          workspaceA,
        ),
        {
          ...workspaceRequirement("dashboard.relationship.read", 1, workspaceA),
          relationshipId: relationshipA,
          scope: "relationship",
        },
      ),
    ).toMatchObject({ allowed: true });
  });

  test("restrictedUntilVerified does not invent a frontend permission policy", () => {
    const facts = readyFacts(
      [permissionDecision("workspace.read", true, "ALLOW")],
      1,
      workspaceA,
    );

    expect(
      evaluateAccess(
        facts,
        workspaceRequirement("workspace.read", 1, workspaceA),
      ),
    ).toMatchObject({ allowed: true });
  });

  test("access mutations are not configured for automatic retries", () => {
    expect(accessMutationRequest({ path: "/workspaces/1" })).toEqual({
      path: "/workspaces/1",
      refreshOnUnauthorized: true,
    });
  });

  test("permission session clearing removes prior protected cache", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      createAccessQueryKey({
        membershipId: membershipA,
        workspaceId: workspaceA,
      }),
      { allowed: true },
    );

    clearPermissionSessionState(queryClient);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe("permission access components", () => {
  test("gate hides, disables, or renders fallback based on access state", () => {
    render(
      <>
        <AccessGate
          decision={evaluateAccess(
            null,
            workspaceRequirement("staff.read", 1, workspaceA),
          )}
          loading={<p>Checking access</p>}
        >
          <button>Allowed action</button>
        </AccessGate>
        <AccessGate
          decision={evaluateAccess(
            readyFacts(
              [permissionDecision("staff.read", false, "DENY")],
              1,
              workspaceA,
            ),
            workspaceRequirement("staff.read", 1, workspaceA),
          )}
          denied={<p>Access denied</p>}
        >
          <button>Hidden action</button>
        </AccessGate>
      </>,
    );

    expect(screen.getByText("Checking access")).toBeInTheDocument();
    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByText("Allowed action")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden action")).not.toBeInTheDocument();
  });

  test("controlled button is accessibly disabled while unresolved or denied", () => {
    render(
      <AccessControlledButton
        decision={evaluateAccess(
          null,
          workspaceRequirement("staff.manage", 1, workspaceA),
        )}
        disabledReason="You do not have permission for this action."
        id="staff-action"
        loadingLabel="Checking access"
        onClick={vi.fn()}
      >
        Invite staff
      </AccessControlledButton>,
    );

    const button = screen.getByRole("button", { name: "Invite staff" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "aria-describedby",
      "staff-action-access-state",
    );
  });
});

function workspaceRequirement(
  permission: Parameters<typeof permissionDecision>[0],
  sessionGeneration: number,
  workspaceId: WorkspaceId,
  accessContext: "support" | "user" = "user",
) {
  return {
    accessContext,
    context: "WORKSPACE" as const,
    permission,
    scope: "workspace" as const,
    sessionGeneration,
    workspaceId,
  };
}

function readyFacts(
  decisions: readonly PermissionDecisionDto[],
  sessionGeneration: number,
  workspaceId: WorkspaceId,
  accessContext: "support" | "user" = "user",
) {
  return accessFactsFromDecision({
    accessContext,
    decisions,
    membershipId: accessContext === "user" ? membershipA : membershipB,
    sessionGeneration,
    workspaceId,
  });
}

function permissionDecision(
  permission: PermissionDecisionDto["permission"],
  allowed: boolean,
  effect: PermissionDecisionDto["effect"],
  scope?: PermissionDecisionDto["scope"],
): PermissionDecisionDto {
  return {
    allowed,
    effect,
    permission,
    profileBaselineApplied: true,
    source: "PROFILE",
    ...(effect === "DENY" ? { explicitDeny: true } : {}),
    ...(scope ? { scope } : {}),
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
