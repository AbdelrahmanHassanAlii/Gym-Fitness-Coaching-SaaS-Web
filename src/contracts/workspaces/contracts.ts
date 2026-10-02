import type { MembershipId, UserId, WorkspaceId } from "@/contracts/common/ids";
import type { BranchId } from "@/contracts/common/ids";

export const workspaceTypes = ["GYM", "INDEPENDENT_TRAINER"] as const;
export const workspaceStatuses = [
  "PENDING_ACTIVATION",
  "ACTIVE",
  "RESTRICTED",
  "SUSPENDED",
  "ARCHIVED",
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
  "ARCHIVED",
] as const;
export const branchStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const invitationStatuses = [
  "PENDING",
  "ACCEPTED",
  "EXPIRED",
  "REVOKED",
  "SUPERSEDED",
] as const;
export const invitationTypes = [
  "OWNER_ACTIVATION",
  "STAFF_INVITATION",
  "TRAINEE_INVITATION",
] as const;

export type WorkspaceType = (typeof workspaceTypes)[number];
export type WorkspaceStatus = (typeof workspaceStatuses)[number];
export type WorkspaceMembershipRole = (typeof workspaceMembershipRoles)[number];
export type GymStaffRole = (typeof gymStaffRoles)[number];
export type WorkspaceMembershipStatus =
  (typeof workspaceMembershipStatuses)[number];
export type BranchStatus = (typeof branchStatuses)[number];
export type InvitationStatus = (typeof invitationStatuses)[number];
export type InvitationType = (typeof invitationTypes)[number];

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

export interface WorkspaceDetailDto {
  workspace: WorkspaceSummaryDto;
  membership: WorkspaceMembershipSummaryDto;
}

export interface BranchDto {
  id: BranchId;
  workspaceId: WorkspaceId;
  name: string;
  code?: string;
  timezone: string;
  status: BranchStatus;
  address?: string;
  city?: string;
  governorate?: string;
}

export interface InvitationDto {
  id: string;
  workspaceId?: WorkspaceId;
  type: InvitationType;
  email?: string;
  phone?: string;
  intendedRoles: readonly WorkspaceMembershipRole[];
  branchIds: readonly BranchId[];
  expiresAt: string;
  status: InvitationStatus;
}

export interface MembershipBranchAssignmentDto {
  id: string;
  workspaceId: WorkspaceId;
  membershipId: MembershipId;
  branchId: BranchId;
  active: boolean;
  startedAt: string;
  endedAt?: string;
}

export type UpdateWorkspaceRequestDto = Partial<{
  name: string;
  timezone: string;
  defaultLanguage: "ar" | "en";
  city: string;
  governorate: string;
}>;

export type CreateBranchRequestDto = {
  name: string;
  code?: string;
  timezone?: string;
  address?: string;
  city?: string;
  governorate?: string;
};

export type UpdateBranchRequestDto = Partial<CreateBranchRequestDto>;

export type InviteStaffRequestDto = {
  email?: string;
  phone?: string;
  roles: readonly WorkspaceMembershipRole[];
  branchIds?: readonly BranchId[];
  expiresAt?: string;
};

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
const branchStatusSet = new Set<string>(branchStatuses);
const invitationStatusSet = new Set<string>(invitationStatuses);
const invitationTypeSet = new Set<string>(invitationTypes);

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

export function isWorkspaceDetailDto(
  value: unknown,
): value is WorkspaceDetailDto {
  return isMyWorkspaceDto(value);
}

export function isBranchDto(value: unknown): value is BranchDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.workspaceId === "string" &&
    typeof value.name === "string" &&
    typeof value.timezone === "string" &&
    typeof value.status === "string" &&
    branchStatusSet.has(value.status) &&
    (value.code === undefined || typeof value.code === "string") &&
    (value.address === undefined || typeof value.address === "string") &&
    (value.city === undefined || typeof value.city === "string") &&
    (value.governorate === undefined || typeof value.governorate === "string")
  );
}

export function isMembershipDto(
  value: unknown,
): value is WorkspaceMembershipSummaryDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workspaceId === "string" &&
    typeof value.userId === "string" &&
    Array.isArray(value.roles) &&
    value.roles.every(
      (role) => typeof role === "string" && isWorkspaceMembershipRole(role),
    ) &&
    typeof value.status === "string" &&
    workspaceMembershipStatusSet.has(value.status) &&
    Array.isArray(value.permissionProfileIds) &&
    value.permissionProfileIds.every((id) => typeof id === "string") &&
    typeof value.accessVersion === "number" &&
    Number.isFinite(value.accessVersion) &&
    typeof value.joinedAt === "string" &&
    (value.endedAt === undefined || typeof value.endedAt === "string") &&
    Array.isArray(value.engagementPeriods) &&
    value.engagementPeriods.every(isEngagementPeriod)
  );
}

export function isInvitationDto(value: unknown): value is InvitationDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    (value.workspaceId === undefined ||
      typeof value.workspaceId === "string") &&
    typeof value.type === "string" &&
    invitationTypeSet.has(value.type) &&
    (value.email === undefined || typeof value.email === "string") &&
    (value.phone === undefined || typeof value.phone === "string") &&
    Array.isArray(value.intendedRoles) &&
    value.intendedRoles.every(
      (role) => typeof role === "string" && isWorkspaceMembershipRole(role),
    ) &&
    Array.isArray(value.branchIds) &&
    value.branchIds.every((id) => typeof id === "string") &&
    typeof value.expiresAt === "string" &&
    typeof value.status === "string" &&
    invitationStatusSet.has(value.status)
  );
}

export function isMembershipBranchAssignmentDto(
  value: unknown,
): value is MembershipBranchAssignmentDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workspaceId === "string" &&
    typeof value.membershipId === "string" &&
    typeof value.branchId === "string" &&
    typeof value.active === "boolean" &&
    typeof value.startedAt === "string" &&
    (value.endedAt === undefined || typeof value.endedAt === "string")
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
