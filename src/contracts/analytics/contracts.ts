import type { RelationshipId, WorkspaceId } from "@/contracts/common/ids";
import { isOffsetTimestamp } from "@/lib/date-time";

export const analyticsGranularities = ["day", "week"] as const;
export const progressAnalyticsGranularities = [
  "none",
  "day",
  "week",
  "month",
] as const;
export const attentionCategories = [
  "CHECKIN_OVERDUE",
  "CHECKIN_PENDING_REVIEW",
  "NO_WORKOUT_ACTIVITY_7_DAYS",
  "NO_ACTIVE_PROGRAM",
  "NO_ACTIVE_NUTRITION_PLAN",
  "NEEDS_REASSIGNMENT",
] as const;
export const activityCategories = [
  "WORKOUT_COMPLETED",
  "PR_ACHIEVED",
  "CHECKIN_SUBMITTED",
  "INBODY_UPLOADED",
] as const;

export type AnalyticsGranularity = (typeof analyticsGranularities)[number];
export type ProgressAnalyticsGranularity =
  (typeof progressAnalyticsGranularities)[number];
export type AttentionCategory = (typeof attentionCategories)[number];
export type ActivityCategory = (typeof activityCategories)[number];

export interface AnalyticsRangeDto {
  from: string;
  to: string;
  timezone: string;
}
export interface RelationshipAnalyticsParamsDto {
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
}
export interface AnalyticsQueryDto {
  from?: string;
  to?: string;
  granularity?: AnalyticsGranularity;
}
export interface ProgressAnalyticsQueryDto {
  from?: string;
  to?: string;
  granularity?: ProgressAnalyticsGranularity;
  metricDefinitionId?: string;
  limit?: number;
  cursor?: string;
}
export interface DashboardScopeDto {
  pureWorkspaceWide: boolean;
  assignedTrainees: boolean;
  self: boolean;
  includeBranchIds: readonly string[];
  excludeBranchIds: readonly string[];
  includeRelationshipIds: readonly string[];
  excludeRelationshipIds: readonly string[];
}
export interface EmbeddedPageDto<T> {
  count: number | null;
  items: readonly T[];
  hasMore: boolean;
  nextCursor: string | null;
}
export interface AttentionItemDto {
  relationshipId: RelationshipId;
  checkInId?: string;
  dueAt?: string;
  severity: "high" | "medium" | "low";
}
export interface ActivityItemDto {
  relationshipId: RelationshipId | null;
  traineeDisplay: string | null;
  occurredAt: string;
  summary: string;
}
export interface BranchDashboardItemDto {
  branchId: string;
  name: string;
  activeTrainees: number;
  needsReassignment: number;
  completedWorkouts: number;
  overdueCheckIns: number;
  pendingReviewCheckIns: number;
}
export interface GymDashboardDto {
  workspaceId: WorkspaceId;
  generatedAt: string;
  window: AnalyticsRangeDto;
  scope: DashboardScopeDto;
  summary: Record<string, number>;
  branchBreakdown: Omit<EmbeddedPageDto<BranchDashboardItemDto>, "count">;
  needsAttention: Partial<
    Record<AttentionCategory, EmbeddedPageDto<AttentionItemDto>>
  >;
  recentActivity: Partial<
    Record<ActivityCategory, EmbeddedPageDto<ActivityItemDto>>
  > | null;
}
export interface TrainerDashboardDto {
  workspaceId: WorkspaceId;
  generatedAt: string;
  window: AnalyticsRangeDto;
  scope: DashboardScopeDto;
  summary: Record<string, number>;
  needsAttention: Partial<
    Record<AttentionCategory, EmbeddedPageDto<AttentionItemDto>>
  >;
  recentActivity: null;
}
export interface RelationshipDashboardDto {
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  generatedAt: string;
  relationship: {
    status: "ACTIVE" | "NEEDS_REASSIGNMENT";
    traineeUserId?: string;
    homeBranchId: string | null;
  };
  assignedStaff: readonly { assignmentType: string; startedAt: string }[];
  training: Record<string, unknown> | null;
  nutrition: Record<string, unknown> | null;
  progress: Record<string, unknown> | null;
  checkIns: Record<string, unknown> | null;
  adherence: Record<string, unknown> | null;
  needsAttention: Partial<
    Record<AttentionCategory, EmbeddedPageDto<AttentionItemDto>>
  >;
  access: {
    actorKind: string;
    sections: {
      training: boolean;
      nutrition: boolean;
      progress: boolean;
      checkIns: boolean;
    };
  };
}
export interface TrainingAnalyticsDto {
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  range: AnalyticsRangeDto;
  granularity: AnalyticsGranularity;
  summary: Record<string, number | null>;
  series: readonly Record<string, unknown>[];
  latestPr: Record<string, unknown> | null;
}

export function isAnalyticsRangeDto(
  value: unknown,
): value is AnalyticsRangeDto {
  return (
    isRecord(value) &&
    offsetTimestamp(value.from) &&
    offsetTimestamp(value.to) &&
    ianaTimeZone(value.timezone)
  );
}
export function isGymDashboardDto(value: unknown): value is GymDashboardDto {
  return (
    dashboardBase(value) &&
    isRecord(value.branchBreakdown) &&
    Array.isArray(value.branchBreakdown.items) &&
    value.branchBreakdown.items.every(branchItem) &&
    pageInfo(value.branchBreakdown) &&
    attentionMap(value.needsAttention) &&
    (value.recentActivity === null || activityMap(value.recentActivity))
  );
}
export function isTrainerDashboardDto(
  value: unknown,
): value is TrainerDashboardDto {
  return (
    dashboardBase(value) &&
    attentionMap(value.needsAttention) &&
    value.recentActivity === null
  );
}
export function isRelationshipDashboardDto(
  value: unknown,
): value is RelationshipDashboardDto {
  return (
    isRecord(value) &&
    id(value.workspaceId) &&
    id(value.relationshipId) &&
    offsetTimestamp(value.generatedAt) &&
    isRecord(value.relationship) &&
    (value.relationship.status === "ACTIVE" ||
      value.relationship.status === "NEEDS_REASSIGNMENT") &&
    (value.relationship.homeBranchId === null ||
      id(value.relationship.homeBranchId)) &&
    (value.relationship.traineeUserId === undefined ||
      id(value.relationship.traineeUserId)) &&
    Array.isArray(value.assignedStaff) &&
    value.assignedStaff.every(
      (item) =>
        isRecord(item) &&
        typeof item.assignmentType === "string" &&
        offsetTimestamp(item.startedAt),
    ) &&
    nullableRecord(value.training) &&
    nullableRecord(value.nutrition) &&
    nullableRecord(value.progress) &&
    nullableRecord(value.checkIns) &&
    nullableRecord(value.adherence) &&
    attentionMap(value.needsAttention) &&
    accessShape(value.access)
  );
}
export function isTrainingAnalyticsDto(
  value: unknown,
): value is TrainingAnalyticsDto {
  return (
    isRecord(value) &&
    id(value.workspaceId) &&
    id(value.relationshipId) &&
    isAnalyticsRangeDto(value.range) &&
    literal(value.granularity, analyticsGranularities) &&
    numberRecord(value.summary) &&
    Array.isArray(value.series) &&
    value.series.every(seriesBucket) &&
    (value.latestPr === null ||
      (isRecord(value.latestPr) && offsetTimestamp(value.latestPr.occurredAt)))
  );
}

function dashboardBase(
  value: unknown,
): value is Record<string, unknown> & GymDashboardDto {
  return (
    isRecord(value) &&
    id(value.workspaceId) &&
    offsetTimestamp(value.generatedAt) &&
    isAnalyticsRangeDto(value.window) &&
    scope(value.scope) &&
    numberRecord(value.summary)
  );
}
function scope(value: unknown): value is DashboardScopeDto {
  return (
    isRecord(value) &&
    typeof value.pureWorkspaceWide === "boolean" &&
    typeof value.assignedTrainees === "boolean" &&
    typeof value.self === "boolean" &&
    [
      value.includeBranchIds,
      value.excludeBranchIds,
      value.includeRelationshipIds,
      value.excludeRelationshipIds,
    ].every(stringArray)
  );
}
function attentionMap(value: unknown) {
  return categoryMap(value, attentionCategories, attentionItem);
}
function activityMap(value: unknown) {
  return categoryMap(value, activityCategories, activityItem);
}
function categoryMap(
  value: unknown,
  categories: readonly string[],
  guard: (item: unknown) => boolean,
) {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([category, itemPage]) =>
      categories.includes(category) &&
      isRecord(itemPage) &&
      (itemPage.count === null || nonNegativeInteger(itemPage.count)) &&
      Array.isArray(itemPage.items) &&
      itemPage.items.every(guard) &&
      pageInfo(itemPage),
  );
}
function branchItem(value: unknown) {
  return (
    isRecord(value) &&
    id(value.branchId) &&
    typeof value.name === "string" &&
    [
      value.activeTrainees,
      value.needsReassignment,
      value.completedWorkouts,
      value.overdueCheckIns,
      value.pendingReviewCheckIns,
    ].every(nonNegativeInteger)
  );
}
function attentionItem(value: unknown) {
  return (
    isRecord(value) &&
    id(value.relationshipId) &&
    ["high", "medium", "low"].includes(String(value.severity)) &&
    (value.checkInId === undefined || id(value.checkInId)) &&
    (value.dueAt === undefined || offsetTimestamp(value.dueAt))
  );
}
function activityItem(value: unknown) {
  return (
    isRecord(value) &&
    (value.relationshipId === null || id(value.relationshipId)) &&
    (value.traineeDisplay === null ||
      typeof value.traineeDisplay === "string") &&
    offsetTimestamp(value.occurredAt) &&
    typeof value.summary === "string"
  );
}
function pageInfo(value: Record<string, unknown>) {
  return (
    typeof value.hasMore === "boolean" &&
    (value.nextCursor === null || typeof value.nextCursor === "string")
  );
}
function seriesBucket(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    offsetTimestamp(value.from) &&
    offsetTimestamp(value.to)
  );
}
function numberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (item) => item === null || typeof item === "number",
    )
  );
}
function nullableRecord(
  value: unknown,
): value is Record<string, unknown> | null {
  return value === null || isRecord(value);
}
function accessShape(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.actorKind !== "string" ||
    !isRecord(value.sections)
  )
    return false;
  const sections = value.sections;
  return ["training", "nutrition", "progress", "checkIns"].every(
    (key) => typeof sections[key] === "boolean",
  );
}
function stringArray(value: unknown) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
function id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function nonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
function literal<T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === "string" && values.includes(value);
}
function offsetTimestamp(value: unknown): value is string {
  return typeof value === "string" && isOffsetTimestamp(value);
}
function ianaTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
