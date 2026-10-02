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
  engagementPeriods: readonly {
    startedAt: string;
    endedAt?: string;
  }[];
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

const workspaceTypeSet = new Set<string>(workspaceTypes);
const workspaceStatusSet = new Set<string>(workspaceStatuses);
const workspaceMembershipStatusSet = new Set<string>(
  workspaceMembershipStatuses,
);

export function isMyWorkspaceDto(value: unknown): value is MyWorkspaceDto {
  if (
    !isRecord(value) ||
    !isRecord(value.workspace) ||
    !isRecord(value.membership)
  ) {
    return false;
  }

  const { membership, workspace } = value;
  return (
    typeof workspace.id === "string" &&
    typeof workspace.name === "string" &&
    typeof workspace.ownerUserId === "string" &&
    typeof workspace.timezone === "string" &&
    (workspace.defaultLanguage === "ar" ||
      workspace.defaultLanguage === "en") &&
    typeof workspace.type === "string" &&
    workspaceTypeSet.has(workspace.type) &&
    typeof workspace.status === "string" &&
    workspaceStatusSet.has(workspace.status) &&
    typeof membership.id === "string" &&
    typeof membership.workspaceId === "string" &&
    typeof membership.userId === "string" &&
    Array.isArray(membership.roles) &&
    membership.roles.every(
      (role) => typeof role === "string" && isWorkspaceMembershipRole(role),
    ) &&
    typeof membership.status === "string" &&
    workspaceMembershipStatusSet.has(membership.status) &&
    Array.isArray(membership.permissionProfileIds) &&
    membership.permissionProfileIds.every((id) => typeof id === "string") &&
    typeof membership.accessVersion === "number" &&
    Number.isFinite(membership.accessVersion) &&
    typeof membership.joinedAt === "string" &&
    (membership.endedAt === undefined ||
      typeof membership.endedAt === "string") &&
    Array.isArray(membership.engagementPeriods) &&
    membership.engagementPeriods.every(isEngagementPeriod)
  );
}

function isEngagementPeriod(value: unknown): value is {
  startedAt: string;
  endedAt?: string;
} {
  return (
    isRecord(value) &&
    typeof value.startedAt === "string" &&
    (value.endedAt === undefined || typeof value.endedAt === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
