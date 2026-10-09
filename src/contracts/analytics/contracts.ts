import type { RelationshipId, WorkspaceId } from "@/contracts/common/ids";
import type { NutritionAnalyticsDto } from "@/contracts/nutrition/contracts";
import { isNutritionAnalyticsDto } from "@/contracts/nutrition/contracts";
import type {
  AdherenceAnalyticsDto,
  ProgressAnalyticsDto,
} from "@/contracts/progress/contracts";
import {
  isAdherenceAnalyticsDto,
  isProgressAnalyticsDto,
} from "@/contracts/progress/contracts";
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
  summary: GymDashboardSummaryDto;
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
  summary: TrainerDashboardSummaryDto;
  needsAttention: Partial<
    Record<AttentionCategory, EmbeddedPageDto<AttentionItemDto>>
  >;
  recentActivity: null;
}
export interface GymDashboardSummaryDto {
  activeTrainees: number;
  needsReassignment: number;
  activeStaff: number;
  completedWorkouts: number;
  overdueCheckIns: number;
  pendingReviewCheckIns: number;
}
export interface TrainerDashboardSummaryDto {
  assignedActiveTrainees: number;
  newlyAssignedTrainees: number;
  completedWorkouts: number;
  overdueCheckIns: number;
  pendingReviewCheckIns: number;
}
export interface TrainingSummaryDto {
  startedSessions: number;
  completedSessions: number;
  abandonedSessions: number;
  programDaysCompleted: number;
  programDaysSkipped: number;
  programDaysDeferred: number;
  workoutAdherenceRate: number | null;
  prCount: number;
}
export interface TrainingSeriesDto {
  key: string;
  from: string;
  to: string;
  startedSessions: number;
  completedSessions: number;
  abandonedSessions: number;
  programDaysCompleted: number;
  programDaysSkipped: number;
  programDaysDeferred: number;
  workoutAdherenceRate: number | null;
}
export interface CheckInSummaryDto {
  dueCount: number;
  submittedOrReviewedCount: number;
  complianceRate: number | null;
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
  assignedStaff: readonly {
    assignmentType: "PRIMARY_TRAINER" | "ASSISTANT_TRAINER" | "NUTRITIONIST";
    startedAt: string;
  }[];
  training: TrainingAnalyticsDto | null;
  nutrition: NutritionAnalyticsDto | null;
  progress: ProgressAnalyticsDto | null;
  checkIns: CheckInSummaryDto | null;
  adherence: AdherenceAnalyticsDto;
  needsAttention: Partial<
    Record<AttentionCategory, EmbeddedPageDto<AttentionItemDto>>
  >;
  access: {
    actorKind:
      | "OWNER"
      | "MANAGER"
      | "TRAINER"
      | "ASSISTANT_TRAINER"
      | "NUTRITIONIST"
      | "TRAINEE";
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
  summary: TrainingSummaryDto;
  series: readonly TrainingSeriesDto[];
  latestPr: {
    occurredAt: string;
    exerciseId: string | null;
    value: number | null;
  } | null;
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
    gymSummary(value.summary) &&
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
    trainerSummary(value.summary) &&
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
        literal(item.assignmentType, [
          "PRIMARY_TRAINER",
          "ASSISTANT_TRAINER",
          "NUTRITIONIST",
        ] as const) &&
        offsetTimestamp(item.startedAt),
    ) &&
    (value.training === null || isTrainingAnalyticsDto(value.training)) &&
    (value.nutrition === null || isNutritionAnalyticsDto(value.nutrition)) &&
    (value.progress === null || isProgressAnalyticsDto(value.progress)) &&
    (value.checkIns === null || checkInSummary(value.checkIns)) &&
    isAdherenceAnalyticsDto(value.adherence) &&
    attentionMap(value.needsAttention) &&
    accessShape(value.access) &&
    relationshipNestedIdentitiesMatch(value)
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
    trainingSummary(value.summary) &&
    Array.isArray(value.series) &&
    value.series.every(trainingSeriesBucket) &&
    (value.latestPr === null ||
      (isRecord(value.latestPr) &&
        offsetTimestamp(value.latestPr.occurredAt) &&
        (value.latestPr.exerciseId === null || id(value.latestPr.exerciseId)) &&
        nullableNumber(value.latestPr.value)))
  );
}

function dashboardBase(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    id(value.workspaceId) &&
    offsetTimestamp(value.generatedAt) &&
    isAnalyticsRangeDto(value.window) &&
    scope(value.scope)
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
  guard: (item: unknown, category: string) => boolean,
) {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([category, itemPage]) =>
      categories.includes(category) &&
      isRecord(itemPage) &&
      (itemPage.count === null || nonNegativeInteger(itemPage.count)) &&
      Array.isArray(itemPage.items) &&
      itemPage.items.every((item) => guard(item, category)) &&
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
function attentionItem(value: unknown, category: string) {
  if (!(
    isRecord(value) &&
    id(value.relationshipId) &&
    ["high", "medium", "low"].includes(String(value.severity)) &&
    (value.checkInId === undefined || id(value.checkInId)) &&
    (value.dueAt === undefined || offsetTimestamp(value.dueAt))
  ))
    return false;
  if (category === "CHECKIN_OVERDUE")
    return (
      id(value.checkInId) &&
      offsetTimestamp(value.dueAt) &&
      value.severity === "high"
    );
  if (category === "CHECKIN_PENDING_REVIEW")
    return (
      id(value.checkInId) &&
      offsetTimestamp(value.dueAt) &&
      value.severity === "medium"
    );
  if (value.checkInId !== undefined || value.dueAt !== undefined) return false;
  if (category === "NEEDS_REASSIGNMENT") return value.severity === "high";
  if (category === "NO_ACTIVE_NUTRITION_PLAN") return value.severity === "low";
  return value.severity === "medium";
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
function trainingSeriesBucket(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    offsetTimestamp(value.from) &&
    offsetTimestamp(value.to) &&
    trainingCounts(value) &&
    nullableNumber(value.workoutAdherenceRate)
  );
}
function trainingSummary(value: unknown): value is TrainingSummaryDto {
  return (
    isRecord(value) &&
    trainingCounts(value) &&
    nonNegativeInteger(value.prCount) &&
    nullableNumber(value.workoutAdherenceRate)
  );
}
function trainingCounts(value: Record<string, unknown>) {
  return [
    value.startedSessions,
    value.completedSessions,
    value.abandonedSessions,
    value.programDaysCompleted,
    value.programDaysSkipped,
    value.programDaysDeferred,
  ].every(nonNegativeInteger);
}
function gymSummary(value: unknown): value is GymDashboardSummaryDto {
  return (
    isRecord(value) &&
    [
      value.activeTrainees,
      value.needsReassignment,
      value.activeStaff,
      value.completedWorkouts,
      value.overdueCheckIns,
      value.pendingReviewCheckIns,
    ].every(nonNegativeInteger)
  );
}
function trainerSummary(value: unknown): value is TrainerDashboardSummaryDto {
  return (
    isRecord(value) &&
    [
      value.assignedActiveTrainees,
      value.newlyAssignedTrainees,
      value.completedWorkouts,
      value.overdueCheckIns,
      value.pendingReviewCheckIns,
    ].every(nonNegativeInteger)
  );
}
function checkInSummary(value: unknown): value is CheckInSummaryDto {
  return (
    isRecord(value) &&
    nonNegativeInteger(value.dueCount) &&
    nonNegativeInteger(value.submittedOrReviewedCount) &&
    nullableNumber(value.complianceRate)
  );
}
function accessShape(value: unknown) {
  if (
    !isRecord(value) ||
    !literal(value.actorKind, [
      "OWNER",
      "MANAGER",
      "TRAINER",
      "ASSISTANT_TRAINER",
      "NUTRITIONIST",
      "TRAINEE",
    ] as const) ||
    !isRecord(value.sections)
  )
    return false;
  const sections = value.sections;
  return ["training", "nutrition", "progress", "checkIns"].every(
    (key) => typeof sections[key] === "boolean",
  );
}
function relationshipNestedIdentitiesMatch(value: Record<string, unknown>) {
  const nested = [
    value.training,
    value.nutrition,
    value.progress,
    value.adherence,
  ];
  return nested.every(
    (section) =>
      section === null ||
      (isRecord(section) &&
        section.workspaceId === value.workspaceId &&
        section.relationshipId === value.relationshipId),
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
function nullableNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
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
