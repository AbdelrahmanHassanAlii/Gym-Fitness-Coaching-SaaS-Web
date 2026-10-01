import type {
  PermissionContext,
  PermissionDecisionDto,
  PermissionKey,
} from "@/contracts";
import type {
  BranchId,
  MembershipId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts/common/ids";
import type { AuthorizationCacheContext } from "@/lib/server-state";

export type AccessFactsStatus = "unresolved" | "ready" | "error";
export type AccessDecisionStatus =
  "allowed" | "denied" | "unavailable" | "unresolved";
export type AccessScopeKind =
  "platform" | "workspace" | "branch" | "relationship";

export interface AccessIdentity {
  accessContext: AuthorizationCacheContext;
  sessionGeneration: number;
  workspaceId?: WorkspaceId;
  membershipId?: MembershipId;
}

export interface AccessRequirement {
  permission: PermissionKey;
  context: PermissionContext;
  scope: AccessScopeKind;
  accessContext?: AuthorizationCacheContext;
  sessionGeneration: number;
  workspaceId?: WorkspaceId;
  branchId?: BranchId;
  relationshipId?: RelationshipId;
}

export interface AccessFacts extends AccessIdentity {
  status: AccessFactsStatus;
  context: PermissionContext;
  decisions?: readonly PermissionDecisionDto[];
  error?: unknown;
}

export interface AccessDecision {
  status: AccessDecisionStatus;
  allowed: boolean;
  requirement: AccessRequirement;
  reason:
    | "allowed"
    | "backend-denied"
    | "context-mismatch"
    | "deny"
    | "malformed"
    | "missing-facts"
    | "scope-mismatch"
    | "stale"
    | "unavailable"
    | "unknown";
  matchedDecision?: PermissionDecisionDto;
}
