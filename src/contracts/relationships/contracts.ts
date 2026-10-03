import type {
  BranchId,
  MembershipId,
  RelationshipId,
  UserId,
  WorkspaceId,
} from "@/contracts/common/ids";

export const relationshipStatuses = [
  "PENDING",
  "ACTIVE",
  "NEEDS_REASSIGNMENT",
  "ENDED",
  "ARCHIVED",
] as const;

export const traineeAssignmentTypes = [
  "PRIMARY_TRAINER",
  "ASSISTANT_TRAINER",
  "NUTRITIONIST",
] as const;

export type RelationshipStatus = (typeof relationshipStatuses)[number];
export type TraineeAssignmentType = (typeof traineeAssignmentTypes)[number];

export interface CoachingEngagementPeriodDto {
  startedAt: string;
  endedAt?: string;
}

export interface CoachingRelationshipDto {
  id: RelationshipId;
  workspaceId: WorkspaceId;
  traineeUserId: UserId;
  traineeMembershipId?: MembershipId;
  status: RelationshipStatus;
  homeBranchId?: BranchId;
  proposedPrimaryTrainerMembershipId?: MembershipId;
  currentPrimaryTrainerAssignmentId?: string;
  engagementPeriods: readonly CoachingEngagementPeriodDto[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TraineeStaffAssignmentDto {
  id: string;
  relationshipId: RelationshipId;
  staffMembershipId: MembershipId;
  assignmentType: TraineeAssignmentType;
  active: boolean;
  startedAt: string;
  endedAt?: string;
}

export interface RelationshipDetailDto {
  relationship: CoachingRelationshipDto;
}

export interface ExpectedRelationshipVersionRequestDto {
  expectedVersion: number;
  reason?: string;
}

export interface ChangeHomeBranchRequestDto {
  expectedVersion: number;
  homeBranchId: BranchId;
  primaryTrainerMembershipId?: MembershipId;
}

export interface SetPrimaryTrainerRequestDto {
  expectedVersion: number;
  primaryTrainerMembershipId: MembershipId;
  reason?: string;
}

export interface StaffAssignmentRequestDto {
  expectedVersion: number;
  staffMembershipId: MembershipId;
  reason?: string;
}

export interface RelationshipCommandResponseDto {
  relationship?: CoachingRelationshipDto;
  assignment?: TraineeStaffAssignmentDto;
  removed?: true;
}

const relationshipStatusSet = new Set<string>(relationshipStatuses);
const assignmentTypeSet = new Set<string>(traineeAssignmentTypes);

export function isCoachingRelationshipDto(
  value: unknown,
): value is CoachingRelationshipDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workspaceId === "string" &&
    typeof value.traineeUserId === "string" &&
    value.id !== value.traineeUserId &&
    (value.traineeMembershipId === undefined ||
      typeof value.traineeMembershipId === "string") &&
    typeof value.status === "string" &&
    relationshipStatusSet.has(value.status) &&
    (value.homeBranchId === undefined ||
      typeof value.homeBranchId === "string") &&
    (value.proposedPrimaryTrainerMembershipId === undefined ||
      typeof value.proposedPrimaryTrainerMembershipId === "string") &&
    (value.currentPrimaryTrainerAssignmentId === undefined ||
      typeof value.currentPrimaryTrainerAssignmentId === "string") &&
    Array.isArray(value.engagementPeriods) &&
    value.engagementPeriods.every(isCoachingEngagementPeriodDto) &&
    typeof value.version === "number" &&
    Number.isFinite(value.version) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function isRelationshipDetailDto(
  value: unknown,
): value is RelationshipDetailDto {
  return (
    isRecord(value) &&
    "relationship" in value &&
    isCoachingRelationshipDto(value.relationship)
  );
}

export function isTraineeStaffAssignmentDto(
  value: unknown,
): value is TraineeStaffAssignmentDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.relationshipId === "string" &&
    typeof value.staffMembershipId === "string" &&
    typeof value.assignmentType === "string" &&
    assignmentTypeSet.has(value.assignmentType) &&
    value.active === true &&
    typeof value.startedAt === "string" &&
    (value.endedAt === undefined || typeof value.endedAt === "string")
  );
}

export function isRelationshipCommandResponseDto(
  value: unknown,
): value is RelationshipCommandResponseDto {
  return (
    isRecord(value) &&
    (value.relationship === undefined ||
      isCoachingRelationshipDto(value.relationship)) &&
    (value.assignment === undefined ||
      isTraineeStaffAssignmentDto(value.assignment)) &&
    (value.removed === undefined || value.removed === true)
  );
}

function isCoachingEngagementPeriodDto(
  value: unknown,
): value is CoachingEngagementPeriodDto {
  return (
    isRecord(value) &&
    typeof value.startedAt === "string" &&
    (value.endedAt === undefined || typeof value.endedAt === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
