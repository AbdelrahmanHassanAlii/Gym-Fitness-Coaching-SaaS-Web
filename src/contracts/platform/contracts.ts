import type { MembershipId, WorkspaceId } from "@/contracts/common/ids";
import type { WorkspaceType } from "@/contracts/workspaces/contracts";

export const platformMembershipStatuses = [
  "ACTIVE",
  "SUSPENDED",
  "ENDED",
] as const;

export const platformFoundationPermissions = [
  "deletion.read",
  "deletion.approve",
  "deletion.postpone",
  "deletion.cancel",
  "audit.platform.read",
  "platform_users.read",
  "platform_users.manage",
  "platform_permissions.manage",
  "platform_workspaces.manage",
  "subscriptions.read",
  "support.sessions.start",
  "support.sessions.read",
  "support.sessions.end_own",
  "support.sessions.revoke",
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

export interface PlatformWorkspaceManagementSummaryDto extends PlatformWorkspaceDetailDto {
  version: number;
}

export interface PlatformWorkspaceOwnerDto {
  id: import("@/contracts/common/ids").UserId;
  displayName?: string;
  email?: string;
}

export interface PlatformWorkspaceManagementStateDto {
  data: {
    workspace: PlatformWorkspaceManagementSummaryDto;
    owner: PlatformWorkspaceOwnerDto;
  };
}

export interface PlatformWorkspaceManagementResponseDto {
  data: { workspace: PlatformWorkspaceManagementSummaryDto };
}

export interface PlatformWorkspaceOwnerCandidatePageDto {
  data: readonly PlatformWorkspaceOwnerDto[];
  meta: { nextCursor: string | null; hasMore: boolean };
}

export interface CreatePlatformWorkspaceInput {
  type: WorkspaceType;
  name: string;
  ownerUserId: string;
  timezone: string;
  defaultLanguage: "ar" | "en";
  country?: string;
  city?: string;
  governorate?: string;
}
