import type { MembershipId, WorkspaceId } from "@/contracts/common/ids";
import type { WorkspaceType } from "@/contracts/workspaces/contracts";

export const platformMembershipStatuses = [
  "ACTIVE",
  "SUSPENDED",
  "ENDED",
] as const;

export const platformFoundationPermissions = [
  "audit.platform.read",
  "platform_users.read",
  "platform_workspaces.manage",
] as const;

export type PlatformMembershipStatus =
  (typeof platformMembershipStatuses)[number];
export type PlatformFoundationPermission =
  (typeof platformFoundationPermissions)[number];

export interface PlatformContextDto {
  context: "PLATFORM";
  accessContext: "USER";
  membership: {
    id: MembershipId;
    status: PlatformMembershipStatus;
    accessVersion: number;
    updatedAt: string;
  };
}

export interface PlatformDecisionRequestDto {
  permission: PlatformFoundationPermission;
}

export interface PlatformEffectiveAccessDecisionsRequestDto {
  expectedAccessVersion: number;
  requests: readonly PlatformDecisionRequestDto[];
}

export interface PlatformEffectiveAccessDecisionDto {
  permission: PlatformFoundationPermission;
  allowed: boolean;
  effect: "ALLOW" | "DENY";
}

export interface PlatformEffectiveAccessDecisionsDto {
  context: "PLATFORM";
  accessContext: "USER";
  membershipId: MembershipId;
  membershipStatus: "ACTIVE";
  accessVersion: number;
  validUntil: string | null;
  decisions: readonly PlatformEffectiveAccessDecisionDto[];
}

export const platformWorkspaceStatuses = [
  "PENDING_ACTIVATION",
  "ACTIVE",
  "RESTRICTED",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export type PlatformWorkspaceStatus =
  (typeof platformWorkspaceStatuses)[number];

export interface PlatformWorkspaceDirectoryRowDto {
  id: WorkspaceId;
  name: string;
  status: PlatformWorkspaceStatus;
  createdAt: string;
}

export interface PlatformWorkspaceDetailDto {
  id: WorkspaceId;
  name: string;
  type: WorkspaceType;
  status: PlatformWorkspaceStatus;
  timezone: string;
  defaultLanguage: "ar" | "en";
  createdAt: string;
  country?: string;
  city?: string;
  governorate?: string;
}

export interface PlatformWorkspaceDirectoryPageDto {
  data: readonly PlatformWorkspaceDirectoryRowDto[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}
