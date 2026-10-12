import { ApiError } from "@/lib/api";
import { isOffsetTimestamp } from "@/lib/date-time";

export const supportPermissions = [
  "support.sessions.start",
  "support.sessions.read",
  "support.sessions.end_own",
  "support.sessions.revoke",
] as const;
export const sessionStatuses = [
  "ACTIVE",
  "ENDED",
  "EXPIRED",
  "REVOKED",
  "SECURITY_TERMINATED",
] as const;
export type SessionStatus = (typeof sessionStatuses)[number];
export type TargetType = "GYM" | "INDEPENDENT_TRAINER";
export interface SupportSession {
  id: string;
  requestId: string;
  policyId: string;
  realActorPlatformMembershipId: string;
  targetType?: TargetType | "STAFF" | "TRAINEE" | null;
  targetWorkspaceId?: string | null;
  targetUserId?: string | null;
  effectiveMembershipId?: string | null;
  contextType: "WORKSPACE_SUPPORT" | "USER_CONTEXT";
  sessionType: "READ_ONLY" | "WRITE_SUPPORT";
  startedAt: string;
  expiresAt: string;
  endedAt?: string | null;
  revokedAt?: string | null;
  status: SessionStatus;
  terminationReason?: string | null;
  version: number;
}
export interface SupportContext {
  supportSession: {
    id: string;
    status: "ACTIVE";
    version: number;
    contextType: "WORKSPACE_SUPPORT";
    sessionType: "READ_ONLY";
    startedAt: string;
    expiresAt: string;
    policyRevision: number;
  };
  workspace: {
    id: string;
    name: string;
    type: TargetType;
    status:
      "PENDING_ACTIVATION" | "ACTIVE" | "RESTRICTED" | "SUSPENDED" | "ARCHIVED";
    timezone: string;
    defaultLanguage: "en" | "ar";
  };
}
export interface StartBody {
  targetType: TargetType;
  targetWorkspaceId: string;
  contextType: "WORKSPACE_SUPPORT";
  sessionType: "READ_ONLY";
  requestedDurationMinutes: number;
  reason: string;
  reference?: string;
  requestedSensitiveAccess: false;
  requestedSensitiveFileDownload: false;
}
export const isObjectId = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{24}$/.test(v);
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const instant = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && isOffsetTimestamp(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function exact(
  v: unknown,
  required: string[],
  optional: string[] = [],
): v is Record<string, unknown> {
  return (
    record(v) &&
    required.every((k) => Object.hasOwn(v, k)) &&
    Object.keys(v).every((k) => required.includes(k) || optional.includes(k))
  );
}
export function malformed(): never {
  throw new ApiError({
    kind: "malformed-response",
    category: "unknown",
    message: "Support response could not be validated",
  });
}
export function decodeSession(
  value: unknown,
  expectedId?: string,
): SupportSession {
  if (
    !exact(
      value,
      [
        "id",
        "requestId",
        "policyId",
        "realActorPlatformMembershipId",
        "contextType",
        "sessionType",
        "startedAt",
        "expiresAt",
        "status",
        "version",
      ],
      [
        "targetType",
        "targetWorkspaceId",
        "targetUserId",
        "effectiveMembershipId",
        "endedAt",
        "revokedAt",
        "terminationReason",
      ],
    )
  )
    malformed();
  if (
    ![
      value.id,
      value.requestId,
      value.policyId,
      value.realActorPlatformMembershipId,
    ].every(isObjectId) ||
    (expectedId !== undefined && value.id !== expectedId) ||
    !integer(value.version) ||
    !instant(value.startedAt) ||
    !instant(value.expiresAt) ||
    Date.parse(value.startedAt) >= Date.parse(value.expiresAt) ||
    !sessionStatuses.includes(value.status as SessionStatus) ||
    !["WORKSPACE_SUPPORT", "USER_CONTEXT"].includes(
      String(value.contextType),
    ) ||
    !["READ_ONLY", "WRITE_SUPPORT"].includes(String(value.sessionType))
  )
    malformed();
  if (
    value.targetType != null &&
    !["GYM", "INDEPENDENT_TRAINER", "STAFF", "TRAINEE"].includes(
      String(value.targetType),
    )
  )
    malformed();
  for (const k of [
    "targetWorkspaceId",
    "targetUserId",
    "effectiveMembershipId",
  ])
    if (value[k] != null && !isObjectId(value[k])) malformed();
  for (const k of ["endedAt", "revokedAt"])
    if (value[k] != null && !instant(value[k])) malformed();
  if (value.terminationReason != null && !text(value.terminationReason, 500))
    malformed();
  return value as unknown as SupportSession;
}
export function decodeSessionEnvelope(
  value: unknown,
  expectedId: string,
): SupportSession {
  if (!exact(value, ["data"])) malformed();
  return decodeSession(value.data, expectedId);
}
export function decodeStart(value: unknown, body: StartBody): SupportSession {
  if (
    !exact(value, ["data"]) ||
    !exact(value.data, ["decision", "supportSession"]) ||
    value.data.decision !== "APPROVED"
  )
    malformed();
  const session = decodeSession(value.data.supportSession);
  if (
    session.targetWorkspaceId !== body.targetWorkspaceId ||
    session.targetType !== body.targetType ||
    session.contextType !== "WORKSPACE_SUPPORT" ||
    session.sessionType !== "READ_ONLY" ||
    session.targetUserId != null ||
    session.effectiveMembershipId != null
  )
    malformed();
  return session;
}
export function decodeContext(
  value: unknown,
  sessionId: string,
  workspaceId: string,
  now = Date.now(),
): SupportContext {
  if (
    !exact(value, ["data"]) ||
    !exact(value.data, ["supportSession", "workspace"])
  )
    malformed();
  const { supportSession: s, workspace: w } = value.data;
  if (
    !exact(s, [
      "id",
      "status",
      "version",
      "contextType",
      "sessionType",
      "startedAt",
      "expiresAt",
      "policyRevision",
    ]) ||
    !exact(w, ["id", "name", "type", "status", "timezone", "defaultLanguage"])
  )
    malformed();
  if (
    !isObjectId(s.id) ||
    s.id !== sessionId ||
    s.status !== "ACTIVE" ||
    s.contextType !== "WORKSPACE_SUPPORT" ||
    s.sessionType !== "READ_ONLY" ||
    !integer(s.version) ||
    !integer(s.policyRevision) ||
    !instant(s.startedAt) ||
    !instant(s.expiresAt) ||
    Date.parse(s.startedAt) >= Date.parse(s.expiresAt) ||
    Date.parse(s.expiresAt) <= now ||
    !isObjectId(w.id) ||
    w.id !== workspaceId ||
    !text(w.name, 160) ||
    !["GYM", "INDEPENDENT_TRAINER"].includes(String(w.type)) ||
    ![
      "PENDING_ACTIVATION",
      "ACTIVE",
      "RESTRICTED",
      "SUSPENDED",
      "ARCHIVED",
    ].includes(String(w.status)) ||
    !text(w.timezone, 80) ||
    !["en", "ar"].includes(String(w.defaultLanguage))
  )
    malformed();
  return value.data as unknown as SupportContext;
}
export function makeStartBody(
  targetWorkspaceId: string,
  targetType: TargetType,
  duration: number,
  reason: string,
  reference: string,
): StartBody {
  reason = reason.trim();
  reference = reference.trim();
  if (
    !isObjectId(targetWorkspaceId) ||
    !["GYM", "INDEPENDENT_TRAINER"].includes(targetType) ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 60 ||
    reason.length < 3 ||
    reason.length > 500 ||
    reference.length > 120
  )
    throw new Error("Invalid support input");
  return Object.freeze({
    targetWorkspaceId,
    targetType,
    contextType: "WORKSPACE_SUPPORT",
    sessionType: "READ_ONLY",
    requestedDurationMinutes: duration,
    reason,
    ...(reference ? { reference } : {}),
    requestedSensitiveAccess: false,
    requestedSensitiveFileDownload: false,
  });
}
