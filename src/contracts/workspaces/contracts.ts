import type { MembershipId, UserId, WorkspaceId } from "@/contracts/common/ids";

export const workspaceTypes = ["GYM", "INDEPENDENT_TRAINER"] as const;
export const workspaceStatuses = [
  "ACTIVE",
  "PENDING_ACTIVATION",
  "SUSPENDED",
  "ENDED",
] as const;
export const workspaceMembershipRoles = [
  "GYM_OWNER",
  "GYM_MANAGER",
  "TRAINER",
  "ASSISTANT_TRAINER",
  "NUTRITIONIST",
  "TRAINEE",
] as const;
export const gymStaffRoles = [
  "GYM_OWNER",
  "GYM_MANAGER",
  "TRAINER",
  "ASSISTANT_TRAINER",
  "NUTRITIONIST",
] as const;
export const workspaceMembershipStatuses = [
  "ACTIVE",
  "INVITED",
  "SUSPENDED",
  "ENDED",
] as const;

export type WorkspaceType = (typeof workspaceTypes)[number];
export type WorkspaceStatus = (typeof workspaceStatuses)[number];
export type WorkspaceMembershipRole = (typeof workspaceMembershipRoles)[number];
export type GymStaffRole = (typeof gymStaffRoles)[number];
export type WorkspaceMembershipStatus =
  (typeof workspaceMembershipStatuses)[number];

export interface WorkspaceSummaryDto {
  id: WorkspaceId;
  type: WorkspaceType;
  name: string;
  ownerUserId: UserId;
  status: WorkspaceStatus;
  timezone: string;
  defaultLanguage: "ar" | "en";
  country?: string;
  city?: string;
  governorate?: string;
}

export interface WorkspaceMembershipSummaryDto {
  id: MembershipId;
  workspaceId: WorkspaceId;
  userId: UserId;
  roles: readonly WorkspaceMembershipRole[];
  status: WorkspaceMembershipStatus;
  permissionProfileIds: readonly string[];
  accessVersion: number;
  joinedAt: string;
  endedAt?: string;
}

export interface MyWorkspaceDto {
  workspace: WorkspaceSummaryDto;
  membership: WorkspaceMembershipSummaryDto;
}

const staffRoleSet = new Set<string>(gymStaffRoles);
const workspaceMembershipRoleSet = new Set<string>(workspaceMembershipRoles);

export function isGymStaffRole(
  value: WorkspaceMembershipRole,
): value is GymStaffRole {
  return staffRoleSet.has(value);
}

export function isWorkspaceMembershipRole(
  value: string,
): value is WorkspaceMembershipRole {
  return workspaceMembershipRoleSet.has(value);
}
