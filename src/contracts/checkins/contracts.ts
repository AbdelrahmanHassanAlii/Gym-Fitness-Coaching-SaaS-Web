import type {
  CheckInAssignmentId,
  CheckInId,
  CheckInTemplateId,
  CheckInTemplateRevisionId,
  MembershipId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts/common/ids";

export const checkInTemplateStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const checkInFieldTypes = [
  "NUMBER",
  "TEXT",
  "LONG_TEXT",
  "RATING",
  "BOOLEAN",
] as const;
export const checkInFrequencies = ["WEEKLY"] as const;
export const checkInStatuses = [
  "UPCOMING",
  "DUE",
  "SUBMITTED",
  "REVIEWED",
  "OVERDUE",
  "SKIPPED",
] as const;

export type CheckInTemplateStatus = (typeof checkInTemplateStatuses)[number];
export type CheckInFieldType = (typeof checkInFieldTypes)[number];
export type CheckInStatus = (typeof checkInStatuses)[number];

export interface CheckInFieldDto {
  fieldKey: string;
  type: CheckInFieldType;
  label: string;
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
}

export interface CheckInTemplateDto {
  id: CheckInTemplateId;
  workspaceId: WorkspaceId;
  ownerMembershipId: MembershipId;
  name: string;
  currentRevisionId: CheckInTemplateRevisionId;
  status: CheckInTemplateStatus;
  version: number;
}

export interface CheckInTemplateRevisionDto {
  id: CheckInTemplateRevisionId;
  templateId: CheckInTemplateId;
  revision: number;
  fields: readonly CheckInFieldDto[];
}

export interface CheckInTemplateDetailDto {
  template: CheckInTemplateDto;
  revision: CheckInTemplateRevisionDto | null;
}

export interface CheckInTemplateBodyDto {
  name: string;
  fields: CheckInFieldDto[];
}

export interface CheckInTemplateRevisionBodyDto {
  expectedVersion: number;
  fields: CheckInFieldDto[];
}

export interface CheckInExpectedVersionBodyDto {
  expectedVersion: number;
  reason?: string;
}

export interface CheckInAssignmentDto {
  id: CheckInAssignmentId;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  templateId: CheckInTemplateId;
  recurrence: { frequency: "WEEKLY"; dayOfWeek: number; timezone: string };
  active: boolean;
  startedAt: string;
  endedAt?: string;
  version: number;
}

export interface CheckInAssignmentBodyDto {
  templateId: CheckInTemplateId;
  recurrence: { frequency: "WEEKLY"; dayOfWeek?: number; timezone: string };
  startedAt?: string;
}

export interface CheckInAssignmentPatchDto {
  expectedVersion: number;
  recurrence?: { frequency: "WEEKLY"; dayOfWeek?: number; timezone: string };
}

export interface CheckInDto {
  id: CheckInId;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  assignmentId: CheckInAssignmentId;
  templateId: CheckInTemplateId;
  templateRevisionId: CheckInTemplateRevisionId;
  periodKey: string;
  periodStartAt: string;
  periodEndAt: string;
  opensAt: string;
  dueAt: string;
  timezone: string;
  dayOfWeek: number;
  status: CheckInStatus;
  submittedAt?: string;
  reviewedAt?: string;
  responses: readonly {
    fieldKey: string;
    value: string | number | boolean | null;
  }[];
  trainerFeedback?: { comment: string; reviewedByMembershipId: MembershipId };
  version: number;
}

export interface CheckInReviewBodyDto {
  expectedVersion: number;
  trainerFeedback: { comment: string };
}

export const isCheckInTemplateDto = (
  value: unknown,
): value is CheckInTemplateDto =>
  isRecord(value) &&
  id(value.id) &&
  id(value.workspaceId) &&
  id(value.ownerMembershipId) &&
  typeof value.name === "string" &&
  id(value.currentRevisionId) &&
  literal(value.status, checkInTemplateStatuses) &&
  version(value.version);

export const isCheckInTemplateRevisionDto = (
  value: unknown,
): value is CheckInTemplateRevisionDto =>
  isRecord(value) &&
  id(value.id) &&
  id(value.templateId) &&
  version(value.revision) &&
  Array.isArray(value.fields) &&
  value.fields.every(isCheckInFieldDto);

export const isCheckInTemplateDetailDto = (
  value: unknown,
): value is CheckInTemplateDetailDto =>
  isRecord(value) &&
  isCheckInTemplateDto(value.template) &&
  (value.revision === null || isCheckInTemplateRevisionDto(value.revision));

export const isCheckInAssignmentDto = (
  value: unknown,
): value is CheckInAssignmentDto =>
  isRecord(value) &&
  id(value.id) &&
  id(value.workspaceId) &&
  id(value.relationshipId) &&
  id(value.templateId) &&
  isRecord(value.recurrence) &&
  value.recurrence.frequency === "WEEKLY" &&
  version(value.recurrence.dayOfWeek) &&
  typeof value.recurrence.timezone === "string" &&
  typeof value.active === "boolean" &&
  timestamp(value.startedAt) &&
  optionalTimestamp(value.endedAt) &&
  version(value.version);

export const isCheckInDto = (value: unknown): value is CheckInDto =>
  isRecord(value) &&
  id(value.id) &&
  id(value.workspaceId) &&
  id(value.relationshipId) &&
  id(value.assignmentId) &&
  id(value.templateId) &&
  id(value.templateRevisionId) &&
  typeof value.periodKey === "string" &&
  timestamp(value.periodStartAt) &&
  timestamp(value.periodEndAt) &&
  timestamp(value.opensAt) &&
  timestamp(value.dueAt) &&
  typeof value.timezone === "string" &&
  version(value.dayOfWeek) &&
  literal(value.status, checkInStatuses) &&
  optionalTimestamp(value.submittedAt) &&
  optionalTimestamp(value.reviewedAt) &&
  Array.isArray(value.responses) &&
  value.responses.every(
    (item) => isRecord(item) && typeof item.fieldKey === "string",
  ) &&
  version(value.version);

function isCheckInFieldDto(value: unknown): value is CheckInFieldDto {
  return (
    isRecord(value) &&
    typeof value.fieldKey === "string" &&
    literal(value.type, checkInFieldTypes) &&
    typeof value.label === "string" &&
    typeof value.required === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function literal<T extends readonly string[]>(
  value: unknown,
  list: T,
): value is T[number] {
  return typeof value === "string" && list.includes(value);
}

function id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function version(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value as string);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function optionalTimestamp(value: unknown): value is string | undefined {
  return value === undefined || timestamp(value);
}
