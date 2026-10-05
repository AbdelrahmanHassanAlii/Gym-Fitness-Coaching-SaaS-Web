import type {
  ApiDataEnvelope,
  CurrentUserEffectiveAccessDecisionRequestDto,
  CurrentUserEffectiveAccessDecisionsDto,
  CurrentUserEffectiveAccessDecisionsRequestDto,
  MembershipId,
  PermissionDecisionDto,
  PermissionScopeDto,
  WorkspaceId,
} from "@/contracts";
import {
  isCurrentUserEffectiveAccessDecisionsDto,
  isPermissionKey,
} from "@/contracts";
import { ApiError, isApiError, type ApiClient } from "@/lib/api";
import type {
  AppQueryKey,
  AuthorizationCacheContext,
} from "@/lib/server-state";
import { appQueryKeys } from "@/lib/server-state";
import type { AccessFacts, AccessIdentity } from "./types";

const currentUserDecisionLimit = 25;

export type CurrentUserDecisionRequest =
  CurrentUserEffectiveAccessDecisionRequestDto;

export async function requestCurrentUserEffectiveAccessDecisions(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  membershipId: MembershipId,
  body: CurrentUserEffectiveAccessDecisionsRequestDto,
  signal?: AbortSignal,
): Promise<CurrentUserEffectiveAccessDecisionsDto> {
  const normalized = normalizeCurrentUserDecisionRequests(body.requests);
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body: {
      ...(body.expectedAccessVersion === undefined
        ? {}
        : { expectedAccessVersion: body.expectedAccessVersion }),
      requests: normalized,
    },
    method: "POST",
    path: `/workspaces/${workspaceId}/me/effective-access/decisions`,
    signal,
  });

  if (!isCurrentUserEffectiveAccessDecisionsDto(envelope.data)) {
    throw malformedCurrentUserDecisions("current-user decisions envelope");
  }

  if (envelope.data.workspaceId !== workspaceId) {
    throw malformedCurrentUserDecisions("current-user decisions workspace");
  }

  if (envelope.data.membershipId !== membershipId) {
    throw malformedCurrentUserDecisions("current-user decisions membership");
  }

  if (
    body.expectedAccessVersion !== undefined &&
    envelope.data.accessVersion !== body.expectedAccessVersion
  ) {
    throw malformedCurrentUserDecisions(
      "current-user decisions access version",
    );
  }

  return envelope.data;
}

export function currentUserEffectiveAccessQueryKey(input: {
  accessContext: AuthorizationCacheContext;
  accessVersion: number | null;
  membershipId: string;
  requests: readonly CurrentUserDecisionRequest[];
  sessionGeneration: number;
  workspaceId: WorkspaceId;
}): AppQueryKey {
  return appQueryKeys.workspaceDetail(
    input.workspaceId,
    "current-user-effective-access",
    {
      accessVersion: input.accessVersion,
      membershipId: input.membershipId,
      requests: requestKey(input.requests),
      sessionGeneration: input.sessionGeneration,
    },
    input.accessContext,
  );
}

export function currentUserEffectiveAccessFacts(input: {
  data: CurrentUserEffectiveAccessDecisionsDto;
  sessionGeneration: number;
}): AccessFacts {
  return {
    accessContext: accessContextFromBackend(input.data.context),
    context: "WORKSPACE",
    decisions: input.data.decisions.map((decision) => ({
      allowed: decision.allowed,
      effect: decision.effect,
      permission: decision.request.permission,
      scope: scopeFromCurrentUserRequest(decision.request),
      source: "NONE",
    })),
    membershipId: input.data.membershipId,
    sessionGeneration: input.sessionGeneration,
    status: "ready",
    workspaceId: input.data.workspaceId,
  };
}

export function unresolvedCurrentUserAccessFacts(
  input: AccessIdentity,
): AccessFacts {
  return {
    ...input,
    context: "WORKSPACE",
    decisions: [],
    status: "unresolved",
  };
}

export function erroredCurrentUserAccessFacts(
  input: AccessIdentity & { error: unknown },
): AccessFacts {
  return {
    accessContext: input.accessContext,
    context: "WORKSPACE",
    decisions: [],
    error: input.error,
    membershipId: input.membershipId,
    sessionGeneration: input.sessionGeneration,
    status: "error",
    workspaceId: input.workspaceId,
  };
}

export function normalizeCurrentUserDecisionRequests(
  requests: readonly CurrentUserDecisionRequest[],
): CurrentUserDecisionRequest[] {
  if (requests.length === 0 || requests.length > currentUserDecisionLimit) {
    throw malformedCurrentUserDecisions("current-user decision request count");
  }

  const normalized = requests.map(normalizeCurrentUserDecisionRequest);
  const seen = new Set<string>();
  for (const request of normalized) {
    const key = JSON.stringify(request);
    if (seen.has(key)) {
      throw malformedCurrentUserDecisions("current-user decision duplicate");
    }
    seen.add(key);
  }

  return normalized.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

export function isAccessVersionConflict(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.code === "WORKSPACE_MEMBERSHIP_ACCESS_VERSION_CONFLICT"
  );
}

function normalizeCurrentUserDecisionRequest(
  request: CurrentUserDecisionRequest,
): CurrentUserDecisionRequest {
  if (!isPermissionKey(request.permission)) {
    throw malformedCurrentUserDecisions("current-user decision permission");
  }

  if (request.scope === "WORKSPACE") {
    if (
      request.branchId !== undefined ||
      request.relationshipId !== undefined
    ) {
      throw malformedCurrentUserDecisions("current-user workspace scope");
    }
    return { permission: request.permission, scope: "WORKSPACE" };
  }

  if (request.scope === "BRANCH") {
    if (
      typeof request.branchId !== "string" ||
      request.branchId.length === 0 ||
      request.relationshipId !== undefined
    ) {
      throw malformedCurrentUserDecisions("current-user branch scope");
    }
    return {
      branchId: request.branchId,
      permission: request.permission,
      scope: "BRANCH",
    };
  }

  if (
    typeof request.relationshipId !== "string" ||
    request.relationshipId.length === 0 ||
    request.branchId !== undefined
  ) {
    throw malformedCurrentUserDecisions("current-user relationship scope");
  }

  return {
    permission: request.permission,
    relationshipId: request.relationshipId,
    scope: "RELATIONSHIP",
  };
}

function scopeFromCurrentUserRequest(
  request: CurrentUserDecisionRequest,
): PermissionDecisionDto["scope"] {
  if (request.scope === "WORKSPACE") {
    return { type: "WORKSPACE" };
  }

  if (request.scope === "BRANCH" && typeof request.branchId === "string") {
    return {
      resourceIds: [request.branchId],
      type: "BRANCH",
    } satisfies PermissionScopeDto;
  }

  if (
    request.scope === "RELATIONSHIP" &&
    typeof request.relationshipId === "string"
  ) {
    return {
      resourceIds: [request.relationshipId],
      type: "SPECIFIC_TRAINEES",
    } satisfies PermissionScopeDto;
  }

  return {
    resourceIds: [],
    type: "SPECIFIC_TRAINEES",
  } satisfies PermissionScopeDto;
}

function accessContextFromBackend(
  context: CurrentUserEffectiveAccessDecisionsDto["context"],
): AuthorizationCacheContext {
  return context === "SUPPORT_USER_CONTEXT" ? "support" : "user";
}

function requestKey(
  requests: readonly CurrentUserDecisionRequest[],
): readonly string[] {
  return normalizeCurrentUserDecisionRequests(requests).map((request) =>
    JSON.stringify(request),
  );
}

function malformedCurrentUserDecisions(message: string): ApiError {
  return new ApiError({
    category: "unknown",
    kind: "malformed-response",
    message: `Malformed ${message}`,
  });
}
