import type {
  ApiDataEnvelope,
  MembershipId,
  PlatformContextDto,
  PlatformDecisionRequestDto,
  PlatformEffectiveAccessDecisionsDto,
  PlatformFoundationPermission,
} from "@/contracts";
import {
  platformFoundationPermissions,
  platformMembershipStatuses,
} from "@/contracts";
import { ApiError, type ApiClient } from "@/lib/api";

const platformDecisionLimit = 25;
const platformPermissionSet = new Set<string>(platformFoundationPermissions);
const platformMembershipStatusSet = new Set<string>(platformMembershipStatuses);

export const platformDecisionRequests = Object.freeze(
  platformFoundationPermissions.map((permission) =>
    Object.freeze({ permission }),
  ),
) satisfies readonly PlatformDecisionRequestDto[];

export async function requestPlatformContext(
  apiClient: ApiClient,
  signal?: AbortSignal,
): Promise<PlatformContextDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: "/me/platform-context",
    signal,
  });

  if (!isPlatformContextDto(envelope.data)) {
    throw malformedPlatformAccess("Platform context response");
  }

  return envelope.data;
}

export async function requestPlatformEffectiveAccessDecisions(
  apiClient: ApiClient,
  identity: { accessVersion: number; membershipId: MembershipId },
  requests: readonly PlatformDecisionRequestDto[],
  signal?: AbortSignal,
): Promise<PlatformEffectiveAccessDecisionsDto> {
  const normalizedRequests = normalizePlatformDecisionRequests(requests);
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body: {
      expectedAccessVersion: identity.accessVersion,
      requests: normalizedRequests,
    },
    method: "POST",
    path: "/platform/me/effective-access/decisions",
    signal,
  });

  if (!isPlatformEffectiveAccessDecisionsDto(envelope.data)) {
    throw malformedPlatformAccess("Platform decision response");
  }

  if (
    envelope.data.membershipId !== identity.membershipId ||
    envelope.data.accessVersion !== identity.accessVersion
  ) {
    throw malformedPlatformAccess("Platform decision identity");
  }

  const returnedPermissions = envelope.data.decisions.map(
    ({ permission }) => permission,
  );
  const requestedPermissions = normalizedRequests.map(
    ({ permission }) => permission,
  );
  if (
    returnedPermissions.length !== requestedPermissions.length ||
    returnedPermissions.some(
      (permission, index) => permission !== requestedPermissions[index],
    )
  ) {
    throw malformedPlatformAccess("Platform decision request set");
  }

  return envelope.data;
}

export function normalizePlatformDecisionRequests(
  requests: readonly PlatformDecisionRequestDto[],
): PlatformDecisionRequestDto[] {
  if (requests.length === 0 || requests.length > platformDecisionLimit) {
    throw malformedPlatformAccess("Platform decision request count");
  }

  const permissions = new Set<PlatformFoundationPermission>();
  for (const request of requests) {
    if (
      !isExactRecord(request, ["permission"]) ||
      typeof request.permission !== "string" ||
      !platformPermissionSet.has(request.permission)
    ) {
      throw malformedPlatformAccess("Platform decision permission");
    }

    const permission = request.permission as PlatformFoundationPermission;
    if (permissions.has(permission)) {
      throw malformedPlatformAccess("Platform decision duplicate");
    }
    permissions.add(permission);
  }

  return [...permissions]
    .sort((left, right) => left.localeCompare(right))
    .map((permission) => ({ permission }));
}

function isPlatformContextDto(value: unknown): value is PlatformContextDto {
  if (
    !isExactRecord(value, ["accessContext", "context", "membership"]) ||
    value.context !== "PLATFORM" ||
    value.accessContext !== "USER" ||
    !isExactRecord(value.membership, [
      "accessVersion",
      "id",
      "status",
      "updatedAt",
    ])
  ) {
    return false;
  }

  const membership = value.membership;
  return (
    typeof membership.id === "string" &&
    membership.id.length > 0 &&
    typeof membership.status === "string" &&
    platformMembershipStatusSet.has(membership.status) &&
    isNonNegativeInteger(membership.accessVersion) &&
    isRfc3339Utc(membership.updatedAt)
  );
}

function isPlatformEffectiveAccessDecisionsDto(
  value: unknown,
): value is PlatformEffectiveAccessDecisionsDto {
  if (
    !isExactRecord(value, [
      "accessContext",
      "accessVersion",
      "context",
      "decisions",
      "membershipId",
      "membershipStatus",
      "validUntil",
    ]) ||
    value.context !== "PLATFORM" ||
    value.accessContext !== "USER" ||
    value.membershipStatus !== "ACTIVE" ||
    typeof value.membershipId !== "string" ||
    value.membershipId.length === 0 ||
    !isNonNegativeInteger(value.accessVersion) ||
    !Array.isArray(value.decisions) ||
    !value.decisions.every(isPlatformDecisionDto) ||
    !(
      value.validUntil === null ||
      (typeof value.validUntil === "string" && isRfc3339Utc(value.validUntil))
    )
  ) {
    return false;
  }

  const permissions = value.decisions.map(({ permission }) => permission);
  return new Set(permissions).size === permissions.length;
}

function isPlatformDecisionDto(
  value: unknown,
): value is PlatformEffectiveAccessDecisionsDto["decisions"][number] {
  return (
    isExactRecord(value, ["allowed", "effect", "permission"]) &&
    typeof value.permission === "string" &&
    platformPermissionSet.has(value.permission) &&
    typeof value.allowed === "boolean" &&
    (value.effect === "ALLOW" || value.effect === "DENY") &&
    value.allowed === (value.effect === "ALLOW")
  );
}

function isExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRfc3339Utc(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function malformedPlatformAccess(subject: string): ApiError {
  return new ApiError({
    category: "unknown",
    kind: "malformed-response",
    message: `Malformed ${subject}`,
  });
}
