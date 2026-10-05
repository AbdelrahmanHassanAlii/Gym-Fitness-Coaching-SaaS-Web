import { isApiError, type ApiError, type ApiRequestOptions } from "@/lib/api";
import {
  appQueryKeys,
  createQueryKey,
  type AppQueryKey,
} from "@/lib/server-state";
import type { QueryClient } from "@tanstack/react-query";
import {
  isPermissionKey,
  permissionEffects,
  type PermissionDecisionDto,
  type PermissionScopeDto,
} from "@/contracts";
import type {
  BranchId,
  MembershipId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts/common/ids";
import type {
  AccessDecision,
  AccessFacts,
  AccessIdentity,
  AccessRequirement,
} from "./types";

export function evaluateAccess(
  facts: AccessFacts | null | undefined,
  requirement: AccessRequirement,
): AccessDecision {
  if (!facts || facts.status === "unresolved") {
    return decision("unresolved", false, requirement, "missing-facts");
  }

  if (facts.status === "error") {
    return decision("unavailable", false, requirement, "unavailable");
  }

  if (!isCurrentAccessIdentity(facts, requirement)) {
    return decision("unresolved", false, requirement, "stale");
  }

  if (facts.context !== requirement.context) {
    return decision("denied", false, requirement, "context-mismatch");
  }

  const scoped = (facts.decisions ?? []).filter(
    (item) =>
      item.permission === requirement.permission &&
      scopeMatchesRequirement(item.scope, requirement),
  );
  const matching = scoped.filter(isWellFormedDecision);

  if (scoped.length > 0 && matching.length !== scoped.length) {
    return decision("unavailable", false, requirement, "malformed");
  }

  if (matching.length === 0) {
    return decision("denied", false, requirement, "unknown");
  }

  const explicitDeny = matching.find(
    (item) => item.effect === "DENY" || item.explicitDeny === true,
  );
  if (explicitDeny) {
    return decision("denied", false, requirement, "deny", explicitDeny);
  }

  const allow = matching.find(
    (item) => item.allowed === true && item.effect === "ALLOW",
  );
  if (allow) {
    return decision("allowed", true, requirement, "allowed", allow);
  }

  return decision("denied", false, requirement, "backend-denied", matching[0]);
}

export function isCurrentAccessIdentity(
  facts: Pick<
    AccessFacts,
    "accessContext" | "membershipId" | "sessionGeneration" | "workspaceId"
  >,
  requirement: Pick<
    AccessRequirement,
    "accessContext" | "membershipId" | "sessionGeneration" | "workspaceId"
  >,
): boolean {
  if (facts.sessionGeneration !== requirement.sessionGeneration) {
    return false;
  }

  if ((requirement.accessContext ?? "user") !== facts.accessContext) {
    return false;
  }

  if (
    requirement.workspaceId !== undefined &&
    requirement.workspaceId !== facts.workspaceId
  ) {
    return false;
  }

  if (
    requirement.membershipId !== undefined &&
    requirement.membershipId !== facts.membershipId
  ) {
    return false;
  }

  return true;
}

export function accessDeniedByBackend(error: unknown): AccessDecision | null {
  if (!isApiError(error) || error.kind !== "backend" || error.status !== 403) {
    return null;
  }

  return decision("denied", false, placeholderRequirement, "backend-denied");
}

export function isPermissionForbidden(error: unknown): error is ApiError {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.category === "forbidden"
  );
}

export function shouldLogoutForAccessError(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.category === "unauthenticated"
  );
}

export function createAccessQueryKey(input: {
  accessContext?: AccessRequirement["accessContext"];
  branchId?: BranchId;
  context?: AccessRequirement["context"];
  membershipId: MembershipId;
  relationshipId?: RelationshipId;
  workspaceId: WorkspaceId;
}): AppQueryKey {
  const accessContext = input.accessContext ?? "user";
  if (input.context === "PLATFORM") {
    return createQueryKey(
      "access",
      "platform",
      ...appQueryKeys.accessContext(accessContext),
      {
        membershipId: input.membershipId,
      },
    );
  }

  return appQueryKeys.workspaceDetail(
    input.workspaceId,
    "effective-access",
    {
      branchId: input.branchId ?? null,
      membershipId: input.membershipId,
      relationshipId: input.relationshipId ?? null,
      scope:
        input.relationshipId !== undefined
          ? "relationship"
          : input.branchId !== undefined
            ? "branch"
            : "workspace",
    },
    accessContext,
  );
}

export function clearPermissionSessionState(queryClient: QueryClient): void {
  queryClient.clear();
}

export function accessMutationRequest<TBody>(
  options: ApiRequestOptions<TBody>,
): ApiRequestOptions<TBody> {
  return {
    ...options,
    refreshOnUnauthorized: options.refreshOnUnauthorized ?? true,
  };
}

function scopeMatchesRequirement(
  scope: PermissionScopeDto | undefined,
  requirement: AccessRequirement,
): boolean {
  if (requirement.scope === "platform") {
    return requirement.context === "PLATFORM";
  }

  if (requirement.scope === "workspace") {
    return scope === undefined || scope.type === "WORKSPACE";
  }

  const resourceIds = scope?.resourceIds ?? [];
  if (requirement.scope === "branch") {
    return (
      (scope?.type === "BRANCH" || scope?.type === "MULTIPLE_BRANCHES") &&
      requirement.branchId !== undefined &&
      resourceIds.includes(requirement.branchId)
    );
  }

  return (
    scope?.type === "SPECIFIC_TRAINEES" &&
    requirement.relationshipId !== undefined &&
    resourceIds.includes(requirement.relationshipId)
  );
}

function decision(
  status: AccessDecision["status"],
  allowed: boolean,
  requirement: AccessRequirement,
  reason: AccessDecision["reason"],
  matchedDecision?: PermissionDecisionDto,
): AccessDecision {
  return {
    allowed,
    matchedDecision,
    reason,
    requirement,
    status,
  };
}

function isWellFormedDecision(
  item: PermissionDecisionDto,
): item is PermissionDecisionDto {
  return (
    isPermissionKey(item.permission) &&
    typeof item.allowed === "boolean" &&
    permissionEffects.includes(item.effect) &&
    (item.source === "EXPLICIT_GRANT" ||
      item.source === "PROFILE" ||
      item.source === "NONE")
  );
}

const placeholderRequirement: AccessRequirement = {
  context: "WORKSPACE",
  permission: "workspace.read",
  scope: "workspace",
  sessionGeneration: -1,
};

export function accessFactsFromDecision(input: {
  accessContext?: AccessIdentity["accessContext"];
  context?: AccessFacts["context"];
  decisions: readonly PermissionDecisionDto[];
  membershipId?: MembershipId;
  sessionGeneration: number;
  workspaceId?: WorkspaceId;
}): AccessFacts {
  return {
    accessContext: input.accessContext ?? "user",
    context: input.context ?? "WORKSPACE",
    decisions: input.decisions,
    membershipId: input.membershipId,
    sessionGeneration: input.sessionGeneration,
    status: "ready",
    workspaceId: input.workspaceId,
  };
}
