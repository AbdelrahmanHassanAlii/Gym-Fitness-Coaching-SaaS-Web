import { ApiError, type ApiClient } from "@/lib/api";
import { isOffsetTimestamp } from "@/lib/date-time";
import {
  accountStatuses,
  membershipStatuses,
  type MembershipStatus,
  type PlatformUserDetail,
  type PlatformUserPage,
} from "./contracts";

export const platformUserPageLimit = 50;
export interface PlatformUserRequest {
  q?: string;
  platformMembershipStatus?: MembershipStatus;
  cursor?: string;
}

export async function listPlatformUsers(
  api: ApiClient,
  query: PlatformUserRequest = {},
  signal?: AbortSignal,
): Promise<PlatformUserPage> {
  const value = await api.request<unknown>({
    method: "GET",
    path: "/platform/users",
    query: { ...query, limit: platformUserPageLimit },
    signal,
  });
  if (!isPlatformUserPage(value)) throw malformed();
  return value;
}
export async function getPlatformUser(
  api: ApiClient,
  userId: string,
  signal?: AbortSignal,
): Promise<PlatformUserDetail> {
  const value = await api.request<unknown>({
    method: "GET",
    path: `/platform/users/${encodeURIComponent(userId)}`,
    signal,
  });
  if (
    !exact(value, ["data"]) ||
    !isUser(value.data, true) ||
    value.data.id !== userId
  )
    throw malformed();
  return value.data as unknown as PlatformUserDetail;
}
function malformed() {
  return new ApiError({
    category: "unknown",
    kind: "malformed-response",
    message: "Malformed Platform member response",
  });
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
const id = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
const date = (value: unknown) =>
  typeof value === "string" && isOffsetTimestamp(value);
function isUser(
  value: unknown,
  detail = false,
): value is Record<string, unknown> {
  if (!record(value)) return false;
  const optional = ["displayName", "email"].filter((key) =>
    Object.hasOwn(value, key),
  );
  if (
    !exact(value, [
      "id",
      "status",
      "createdAt",
      "platformMembership",
      ...(detail ? ["updatedAt"] : []),
      ...optional,
    ]) ||
    !id(value.id) ||
    !date(value.createdAt) ||
    !accountStatuses.includes(value.status as never)
  )
    return false;
  if (
    Object.hasOwn(value, "displayName") &&
    (typeof value.displayName !== "string" || !value.displayName.trim())
  )
    return false;
  if (Object.hasOwn(value, "email") && typeof value.email !== "string")
    return false;
  const member = value.platformMembership;
  if (!record(member) || !membershipStatuses.includes(member.status as never))
    return false;
  if (!detail) return exact(member, ["status"]);
  const lifecycle = ["suspendedAt", "endedAt"].filter((key) =>
    Object.hasOwn(member, key),
  );
  return (
    date(value.updatedAt) &&
    exact(member, ["id", "status", "createdAt", "updatedAt", ...lifecycle]) &&
    id(member.id) &&
    date(member.createdAt) &&
    date(member.updatedAt) &&
    lifecycle.every((key) => date(member[key]))
  );
}
export function isPlatformUserPage(value: unknown): value is PlatformUserPage {
  if (
    !exact(value, ["data", "meta"]) ||
    !Array.isArray(value.data) ||
    value.data.length > platformUserPageLimit ||
    !value.data.every((row) => isUser(row)) ||
    !exact(value.meta, ["nextCursor", "hasMore"]) ||
    typeof value.meta.hasMore !== "boolean"
  )
    return false;
  const ids = value.data.map((row) => row.id);
  if (new Set(ids).size !== ids.length) return false;
  return value.meta.hasMore
    ? value.data.length > 0 &&
        typeof value.meta.nextCursor === "string" &&
        value.meta.nextCursor.length > 0
    : value.meta.nextCursor === null;
}
