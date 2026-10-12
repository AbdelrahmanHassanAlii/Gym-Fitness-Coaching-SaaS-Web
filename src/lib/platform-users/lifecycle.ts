import { ApiError, type ApiClient } from "@/lib/api";
import { isOffsetTimestamp } from "@/lib/date-time";
import type { PlatformAuthority } from "@/lib/platform-access";
import { createQueryKey } from "@/lib/server-state";
import type { MembershipStatus } from "./contracts";

export type LifecycleCommand = "suspend" | "reactivate" | "end";
export interface ManagementState {
  userId: string;
  platformMembership: {
    id: string;
    status: MembershipStatus;
    version: number;
    suspendedAt: string | null;
    endedAt: string | null;
  };
}
const id = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
function exact(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
const timestamp = (value: unknown) =>
  value === null || (typeof value === "string" && isOffsetTimestamp(value));
export function decodeManagementState(
  value: unknown,
  userId: string,
): ManagementState {
  if (
    exact(value, ["data"]) &&
    exact(value.data, ["userId", "platformMembership"])
  ) {
    const data = value.data,
      member = data.platformMembership;
    if (
      id(data.userId) &&
      data.userId === userId &&
      exact(member, ["id", "status", "version", "suspendedAt", "endedAt"]) &&
      id(member.id) &&
      ["ACTIVE", "SUSPENDED", "ENDED"].includes(member.status as string) &&
      typeof member.version === "number" &&
      Number.isSafeInteger(member.version) &&
      member.version >= 0 &&
      timestamp(member.suspendedAt) &&
      timestamp(member.endedAt)
    )
      return data as unknown as ManagementState;
  }
  throw new ApiError({
    category: "unknown",
    kind: "malformed-response",
    message: "Malformed Platform lifecycle response",
  });
}
export async function getManagementState(
  api: ApiClient,
  userId: string,
  signal?: AbortSignal,
) {
  return decodeManagementState(
    await api.request<unknown>({
      method: "GET",
      path: `/platform/users/${encodeURIComponent(userId)}/management-state`,
      signal,
    }),
    userId,
  );
}
export async function mutateLifecycle(
  api: ApiClient,
  userId: string,
  command: LifecycleCommand,
  expectedVersion: number,
  idempotencyKey: string,
) {
  return decodeManagementState(
    await api.request<unknown>({
      method: "POST",
      path: `/platform/users/${encodeURIComponent(userId)}/${command}`,
      body: { expectedVersion },
      idempotencyKey,
    }),
    userId,
  );
}
export function lifecycleActions(status: MembershipStatus): LifecycleCommand[] {
  return status === "ACTIVE"
    ? ["suspend", "end"]
    : status === "SUSPENDED"
      ? ["reactivate", "end"]
      : ["reactivate"];
}
export function managementKey(authority: PlatformAuthority, userId: string) {
  return createQueryKey("platform-user-lifecycle", {
    principalId: authority.principalId,
    sessionGeneration: authority.sessionGeneration,
    membershipId: authority.membershipId,
    accessVersion: authority.accessVersion,
    validUntil: authority.validUntil,
    permission: "platform_users.manage",
    allowed: authority.allows("platform_users.manage"),
    userId,
  });
}
