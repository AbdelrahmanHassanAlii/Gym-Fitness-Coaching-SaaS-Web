/**
 * @vitest-environment jsdom
 */
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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
const branchB = "branch_b" as BranchId;
const relationshipA = "relationship_a" as RelationshipId;
const relationshipB = "relationship_b" as RelationshipId;

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

  test("malformed or contradictory effective data fails closed", () => {
    const requirement = workspaceRequirement("staff.read", 1, workspaceA);

    expect(
      evaluateAccess(
        readyFacts(
          [
            {
              ...permissionDecision("staff.read", true, "ALLOW"),
              effect: "UNKNOWN",
            } as unknown as PermissionDecisionDto,
          ],
          1,
          workspaceA,
        ),
        requirement,
      ),
    ).toMatchObject({
      allowed: false,
      reason: "malformed",
      status: "unavailable",
    });

    expect(
      evaluateAccess(
        readyFacts(
          [
            permissionDecision("staff.read", true, "ALLOW"),
            permissionDecision("staff.read", false, "DENY"),
          ],
          1,
          workspaceA,
        ),
        requirement,
      ),
    ).toMatchObject({
      allowed: false,
      reason: "deny",
      status: "denied",
    });

    expect(
      evaluateAccess(
        readyFacts(
          [
            {
              ...permissionDecision("staff.read", true, "ALLOW"),
              permission: undefined,
            } as unknown as PermissionDecisionDto,
          ],
          1,
          workspaceA,
        ),
        requirement,
      ),
    ).toMatchObject({ allowed: false, reason: "unknown" });
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

  test("late account and workspace query results do not authorize the new boundary", async () => {
    const queryClient = new QueryClient();
    const accessKey = createAccessQueryKey({
      membershipId: membershipA,
      workspaceId: workspaceA,
    });
    const accountA = deferred<ReturnType<typeof readyFacts>>();
    const accountAWrite = accountA.promise.then((facts) => {
      queryClient.setQueryData(accessKey, facts);
    });
    const requirementB = workspaceRequirement("staff.read", 2, workspaceA);

    clearPermissionSessionState(queryClient);
    queryClient.setQueryData(
      accessKey,
      readyFacts(
        [permissionDecision("staff.read", false, "DENY")],
        2,
        workspaceA,
      ),
    );

    accountA.resolve(
      readyFacts(
        [permissionDecision("staff.read", true, "ALLOW")],
        1,
        workspaceA,
      ),
    );
    await accountAWrite;

    expect(
      evaluateAccess(
        queryClient.getQueryData(accessKey) as ReturnType<typeof readyFacts>,
        requirementB,
      ),
    ).toMatchObject({ allowed: false, reason: "stale" });

    const workspaceAKey = createAccessQueryKey({
      membershipId: membershipA,
      workspaceId: workspaceA,
    });
    const workspaceBKey = createAccessQueryKey({
      membershipId: membershipA,
      workspaceId: workspaceB,
    });
    const lateWorkspaceA = deferred<ReturnType<typeof readyFacts>>();
    const lateWorkspaceAWrite = lateWorkspaceA.promise.then((facts) => {
      queryClient.setQueryData(workspaceAKey, facts);
    });

    queryClient.setQueryData(
      workspaceBKey,
      readyFacts(
        [permissionDecision("staff.read", false, "DENY")],
        2,
        workspaceB,
      ),
    );
    lateWorkspaceA.resolve(
      readyFacts(
        [permissionDecision("staff.read", true, "ALLOW")],
        1,
        workspaceA,
      ),
    );
    await lateWorkspaceAWrite;

    expect(
      evaluateAccess(
        queryClient.getQueryData(workspaceBKey) as ReturnType<
          typeof readyFacts
        >,
        workspaceRequirement("staff.read", 2, workspaceB),
      ),
    ).toMatchObject({ allowed: false, reason: "deny" });
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

  test("access query keys separate non-secret context identities", () => {
    const keys = [
      createAccessQueryKey({
        accessContext: "user",
        membershipId: membershipA,
        workspaceId: workspaceA,
      }),
      createAccessQueryKey({
        accessContext: "support",
        membershipId: membershipA,
        workspaceId: workspaceA,
      }),
      createAccessQueryKey({
        context: "PLATFORM",
        membershipId: membershipA,
        workspaceId: workspaceA,
      }),
      createAccessQueryKey({
        branchId: branchA,
        membershipId: membershipA,
        workspaceId: workspaceA,
      }),
      createAccessQueryKey({
        branchId: branchB,
        membershipId: membershipA,
        workspaceId: workspaceA,
      }),
      createAccessQueryKey({
        membershipId: membershipA,
        relationshipId: relationshipA,
        workspaceId: workspaceA,
      }),
      createAccessQueryKey({
        membershipId: membershipA,
        relationshipId: relationshipB,
        workspaceId: workspaceA,
      }),
      createAccessQueryKey({
        membershipId: membershipA,
        workspaceId: workspaceB,
      }),
    ];

    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(
      keys.length,
    );
    expect(JSON.stringify(keys)).not.toMatch(
      /supportSessionId|authorization|refresh|accessToken|cookie/i,
    );
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
        platformFacts,
        workspaceRequirement("platform_permissions.manage", 1, workspaceA),
      ),
    ).toMatchObject({ allowed: false });

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
            permissionDecision("branches.update", false, "DENY", {
              resourceIds: [branchA],
              type: "BRANCH",
            }),
            permissionDecision("branches.update", true, "ALLOW", {
              resourceIds: [branchB],
              type: "BRANCH",
            }),
          ],
          1,
          workspaceA,
        ),
        {
          ...workspaceRequirement("branches.update", 1, workspaceA),
          branchId: branchB,
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
    expect(
      evaluateAccess(
        readyFacts(
          [
            permissionDecision("dashboard.relationship.read", false, "DENY", {
              resourceIds: [relationshipA],
              type: "SPECIFIC_TRAINEES",
            }),
            permissionDecision("dashboard.relationship.read", true, "ALLOW", {
              resourceIds: [relationshipB],
              type: "SPECIFIC_TRAINEES",
            }),
          ],
          1,
          workspaceA,
        ),
        {
          ...workspaceRequirement("dashboard.relationship.read", 1, workspaceA),
          relationshipId: relationshipB,
          scope: "relationship",
        },
      ),
    ).toMatchObject({ allowed: true });
  });

  test("role names and restricted account facts cannot create permission allow", () => {
    const requirement = workspaceRequirement("staff.manage", 1, workspaceA);
    const baseFacts = readyFacts([], 1, workspaceA) as ReturnType<
      typeof readyFacts
    > & {
      role?: string;
      restrictedUntilVerified?: string;
    };

    const ownerFacts = {
      ...baseFacts,
      role: "OWNER",
    } as ReturnType<typeof readyFacts>;
    const trainerFacts = {
      ...baseFacts,
      role: "TRAINER",
    } as ReturnType<typeof readyFacts>;
    const restrictedFacts = {
      ...baseFacts,
      restrictedUntilVerified: "2026-12-31T00:00:00.000Z",
    } as ReturnType<typeof readyFacts>;

    expect(evaluateAccess(ownerFacts, requirement)).toMatchObject({
      allowed: false,
    });
    expect(evaluateAccess(trainerFacts, requirement)).toMatchObject({
      allowed: false,
    });
    expect(evaluateAccess(restrictedFacts, requirement)).toMatchObject({
      allowed: false,
    });
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

  test("visible allowed action receiving Backend 403 reports denial without retrying or logging out", async () => {
    const command = vi.fn(async () => {
      throw new ApiError({
        category: "forbidden",
        code: "PERMISSION_DENIED",
        kind: "backend",
        message: "Permission denied.",
        status: 403,
      });
    });

    let thrown: unknown;
    try {
      await command();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ status: 403 });
    expect(accessDeniedByBackend(thrown)).toMatchObject({
      allowed: false,
      status: "denied",
    });
    expect(shouldLogoutForAccessError(thrown)).toBe(false);
    expect(command).toHaveBeenCalledTimes(1);
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
    const onClick = vi.fn();
    render(
      <AccessControlledButton
        decision={evaluateAccess(
          null,
          workspaceRequirement("staff.manage", 1, workspaceA),
        )}
        disabledReason="You do not have permission for this action."
        id="staff-action"
        loadingLabel="Checking access"
        onClick={onClick}
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
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("gate never renders protected children while unresolved and supports Arabic RTL wrappers", () => {
    const { rerender } = render(
      <div dir="rtl" lang="ar">
        <AccessGate
          decision={evaluateAccess(
            null,
            workspaceRequirement("staff.read", 1, workspaceA),
          )}
          loading={<p>جار التحقق من الوصول</p>}
        >
          <button>Protected child</button>
        </AccessGate>
      </div>,
    );

    expect(screen.getByText("جار التحقق من الوصول")).toBeInTheDocument();
    expect(screen.queryByText("Protected child")).not.toBeInTheDocument();

    rerender(
      <div dir="rtl" lang="ar">
        <AccessGate
          decision={evaluateAccess(
            readyFacts(
              [permissionDecision("staff.read", false, "DENY")],
              1,
              workspaceA,
            ),
            workspaceRequirement("staff.read", 1, workspaceA),
          )}
          denied={<p>ليست لديك صلاحية لهذا الإجراء.</p>}
        >
          <button>Protected child</button>
        </AccessGate>
      </div>,
    );

    expect(
      screen.getByText("ليست لديك صلاحية لهذا الإجراء."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Protected child")).not.toBeInTheDocument();
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
