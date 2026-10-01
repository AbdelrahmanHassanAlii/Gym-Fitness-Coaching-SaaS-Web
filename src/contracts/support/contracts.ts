import type { ExpectedVersionRequest } from "@/contracts/common/concurrency";
import type {
  MembershipId,
  SupportSessionId,
  UserId,
  WorkspaceId,
} from "@/contracts/common/ids";

export const supportTargetTypes = [
  "GYM",
  "INDEPENDENT_TRAINER",
  "STAFF",
  "TRAINEE",
] as const;
export const supportSessionTypes = ["READ_ONLY", "WRITE_SUPPORT"] as const;
export const supportContextTypes = [
  "USER_CONTEXT",
  "WORKSPACE_SUPPORT",
] as const;
export const supportSessionStatuses = [
  "ACTIVE",
  "ENDED",
  "EXPIRED",
  "REVOKED",
  "SECURITY_TERMINATED",
] as const;

export type SupportTargetType = (typeof supportTargetTypes)[number];
export type SupportSessionType = (typeof supportSessionTypes)[number];
export type SupportContextType = (typeof supportContextTypes)[number];
export type SupportSessionStatus = (typeof supportSessionStatuses)[number];

export interface SupportAccessRequestDto {
  targetType: SupportTargetType;
  targetWorkspaceId?: WorkspaceId;
  targetUserId?: UserId;
  effectiveMembershipId?: MembershipId;
  contextType: SupportContextType;
  sessionType: SupportSessionType;
  requestedDurationMinutes: number;
  requestedSensitiveAccess?: boolean;
  requestedSensitiveFileDownload?: boolean;
  reason: string;
  reference?: string;
}

export interface SupportSessionDto {
  id: SupportSessionId;
  requestId: string;
  policyId: string;
  realActorPlatformMembershipId: string;
  targetType?: SupportTargetType;
  targetWorkspaceId?: WorkspaceId;
  targetUserId?: UserId;
  effectiveMembershipId?: MembershipId;
  contextType: SupportContextType;
  sessionType: SupportSessionType;
  startedAt: string;
  expiresAt: string;
  endedAt?: string;
  revokedAt?: string;
  status: SupportSessionStatus;
  terminationReason?: string;
  version: number;
}

export type SupportSessionTransitionRequestDto = ExpectedVersionRequest;
