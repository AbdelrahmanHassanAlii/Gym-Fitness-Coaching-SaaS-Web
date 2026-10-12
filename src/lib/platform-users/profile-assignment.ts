import { ApiError, type ApiClient } from "@/lib/api";
import type { PlatformAuthority } from "@/lib/platform-access";
import { createQueryKey } from "@/lib/server-state";
import type { Query } from "@tanstack/react-query";

export type AssignedProfile = {
  id: string;
  name: string | null;
  status: "ACTIVE" | "ARCHIVED" | "UNAVAILABLE";
};
export type AssignmentState = {
  userId: string;
  platformMembership: {
    id: string;
    status: "ACTIVE" | "SUSPENDED" | "ENDED";
    version: number;
  };
  permissionProfiles: AssignedProfile[];
};
export type SelectorPage = {
  permissionProfiles: { id: string; name: string }[];
  nextCursor: string | null;
};
export type AssignmentIntent = Readonly<{
  target: string;
  path: string;
  key: string;
  body: Readonly<{ expectedVersion: number; profileIds: readonly string[] }>;
}>;
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{24}$/.test(v);
function exact(v: unknown, keys: string[]): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v).length === keys.length &&
    keys.every((k) => Object.hasOwn(v, k))
  );
}
function malformed(): never {
  throw new ApiError({
    category: "unknown",
    kind: "malformed-response",
    message: "Invalid profile assignment response",
  });
}
export function decodeAssignment(
  value: unknown,
  target: string,
): AssignmentState {
  if (
    !exact(value, ["data"]) ||
    !exact(value.data, ["userId", "platformMembership", "permissionProfiles"])
  )
    return malformed();
  const d = value.data,
    m = d.platformMembership;
  if (
    !id(d.userId) ||
    d.userId !== target ||
    !exact(m, ["id", "status", "version"]) ||
    !id(m.id) ||
    (m.status !== "ACTIVE" &&
      m.status !== "SUSPENDED" &&
      m.status !== "ENDED") ||
    typeof m.version !== "number" ||
    !Number.isSafeInteger(m.version) ||
    m.version < 0 ||
    !Array.isArray(d.permissionProfiles) ||
    d.permissionProfiles.length > 10000
  )
    return malformed();
  const profiles: AssignedProfile[] = d.permissionProfiles.map((p: unknown) => {
    if (!exact(p, ["id", "name", "status"]) || !id(p.id)) return malformed();
    if (p.status === "UNAVAILABLE" && p.name === null)
      return { id: p.id, name: null, status: p.status };
    if (
      (p.status === "ACTIVE" || p.status === "ARCHIVED") &&
      typeof p.name === "string"
    )
      return { id: p.id, name: p.name, status: p.status };
    return malformed();
  });
  return {
    userId: d.userId,
    platformMembership: { id: m.id, status: m.status, version: m.version },
    permissionProfiles: profiles,
  };
}
export function decodeSelector(value: unknown): SelectorPage {
  if (
    !exact(value, ["data"]) ||
    !exact(value.data, ["permissionProfiles", "nextCursor"])
  )
    return malformed();
  const d = value.data;
  if (
    !Array.isArray(d.permissionProfiles) ||
    d.permissionProfiles.length > 100 ||
    !(
      d.nextCursor === null ||
      (typeof d.nextCursor === "string" &&
        d.nextCursor.trim().length > 0 &&
        d.nextCursor.length <= 4096)
    )
  )
    return malformed();
  const profiles = d.permissionProfiles.map((p: unknown) => {
    if (!exact(p, ["id", "name"]) || !id(p.id) || typeof p.name !== "string")
      return malformed();
    return { id: p.id, name: p.name };
  });
  if (new Set(profiles.map((p) => p.id)).size !== profiles.length)
    return malformed();
  return { permissionProfiles: profiles, nextCursor: d.nextCursor };
}
export const canonicalProfileIds = (ids: readonly string[]) =>
  [...new Set(ids)].sort();
export const assignmentPath = (target: string) =>
  `/platform/users/${encodeURIComponent(target)}/permission-profile-assignment`;
export async function getAssignment(
  api: ApiClient,
  target: string,
  signal?: AbortSignal,
) {
  return decodeAssignment(
    await api.request<unknown>({
      method: "GET",
      path: assignmentPath(target),
      signal,
    }),
    target,
  );
}
export async function getSelector(
  api: ApiClient,
  cursor: string | null,
  signal?: AbortSignal,
) {
  return decodeSelector(
    await api.request<unknown>({
      method: "GET",
      path: "/platform/permission-profile-selector",
      query: { limit: 50, ...(cursor ? { cursor } : {}) },
      signal,
    }),
  );
}
export async function replaceAssignment(
  api: ApiClient,
  intent: AssignmentIntent,
) {
  return decodeAssignment(
    await api.request<unknown>({
      method: "PUT",
      path: intent.path,
      body: intent.body,
      idempotencyKey: intent.key,
      refreshOnUnauthorized: false,
    }),
    intent.target,
  );
}
export function profileAssignmentKey(
  authority: PlatformAuthority,
  target: string,
  selector = false,
) {
  return createQueryKey(
    "platform-profile-assignment",
    selector ? "selector" : "state",
    {
      principalId: authority.principalId,
      sessionGeneration: authority.sessionGeneration,
      membershipId: authority.membershipId,
      accessVersion: authority.accessVersion,
      validUntil: authority.validUntil,
      allowed: authority.allows("platform_permissions.manage"),
      permission: "platform_permissions.manage",
      userId: target,
    },
  );
}
export function sameTargetManagement(
  query: Query,
  authority: PlatformAuthority,
  target: string,
) {
  const index = query.queryKey[1] === "platform-user-lifecycle" ? 2 : 3;
  const identity = query.queryKey[index];
  return (
    typeof identity === "object" &&
    identity !== null &&
    "userId" in identity &&
    identity.userId === target &&
    "principalId" in identity &&
    identity.principalId === authority.principalId &&
    "sessionGeneration" in identity &&
    identity.sessionGeneration === authority.sessionGeneration &&
    "membershipId" in identity &&
    identity.membershipId === authority.membershipId &&
    "accessVersion" in identity &&
    identity.accessVersion === authority.accessVersion &&
    "validUntil" in identity &&
    identity.validUntil === authority.validUntil
  );
}
export function selectorPagesValid(pages: SelectorPage[]) {
  const ids = new Set<string>(),
    cursors = new Set<string>();
  for (const page of pages) {
    for (const p of page.permissionProfiles) {
      if (ids.has(p.id)) return false;
      ids.add(p.id);
    }
    if (page.nextCursor !== null) {
      if (cursors.has(page.nextCursor)) return false;
      cursors.add(page.nextCursor);
    }
  }
  return true;
}
