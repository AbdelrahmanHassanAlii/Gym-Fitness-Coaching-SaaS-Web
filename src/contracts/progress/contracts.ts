import type {
  CoachingNoteId,
  DailyTrackingEntryId,
  FileId,
  HealthProfileId,
  MeasurementId,
  MetricDefinitionId,
  ProgressPhotoId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts/common/ids";
import { isOffsetTimestamp } from "@/lib/date-time";

export const metricDefinitionScopes = ["SYSTEM", "GYM", "PRIVATE"] as const;
export const metricDefinitionStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const metricValueTypes = ["NUMBER", "INTEGER"] as const;
export const measurementSources = [
  "TRAINEE",
  "TRAINER",
  "INBODY",
  "OTHER",
] as const;
export const progressPhotoVisibilities = [
  "PRIVATE",
  "TRAINER_VISIBLE",
] as const;
export const progressPhotoTypes = ["FRONT", "SIDE", "BACK", "OTHER"] as const;
export const noteVisibilities = ["PRIVATE", "SHARED_WITH_TRAINEE"] as const;
export const noteStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const adherenceMetricKeys = [
  "WORKOUT",
  "NUTRITION",
  "WATER",
  "STEPS",
  "SLEEP",
  "BODY_WEIGHT",
  "MOOD",
  "ENERGY",
] as const;
export const progressMeasurementAnalyticsGranularities = [
  "none",
  "day",
  "week",
  "month",
] as const;
export const adherenceAnalyticsGranularities = ["day", "week"] as const;

export type MetricDefinitionScope = (typeof metricDefinitionScopes)[number];
export type MetricDefinitionStatus = (typeof metricDefinitionStatuses)[number];
export type MetricValueType = (typeof metricValueTypes)[number];
export type MeasurementSource = (typeof measurementSources)[number];
export type ProgressPhotoVisibility =
  (typeof progressPhotoVisibilities)[number];
export type ProgressPhotoType = (typeof progressPhotoTypes)[number];
export type NoteVisibility = (typeof noteVisibilities)[number];
export type NoteStatus = (typeof noteStatuses)[number];
export type AdherenceMetricKey = (typeof adherenceMetricKeys)[number];
export type ProgressMeasurementAnalyticsGranularity =
  (typeof progressMeasurementAnalyticsGranularities)[number];
export type AdherenceAnalyticsGranularity =
  (typeof adherenceAnalyticsGranularities)[number];

export interface MetricDefinitionDto {
  id: MetricDefinitionId;
  scope: MetricDefinitionScope;
  workspaceId?: WorkspaceId;
  ownerMembershipId?: string;
  key?: string;
  name: string;
  valueType: MetricValueType;
  unit: string;
  category: string;
  status: MetricDefinitionStatus;
  version: number;
}

export interface MeasurementDto {
  id: MeasurementId;
  metricDefinitionId: MetricDefinitionId;
  value: number;
  measuredAt: string;
  source: MeasurementSource;
  notes?: string;
  version: number;
}

export interface MeasurementBodyDto {
  metricDefinitionId: MetricDefinitionId;
  value: number;
  measuredAt: string;
  source: Exclude<MeasurementSource, "TRAINEE">;
  notes?: string;
}

export interface MeasurementPatchDto {
  expectedVersion: number;
  value?: number;
  measuredAt?: string;
  source?: Exclude<MeasurementSource, "TRAINEE">;
  notes?: string;
}

export interface ProgressPhotoDto {
  id: ProgressPhotoId;
  capturedAt: string;
  weightAtCaptureKg?: number;
  visibility: ProgressPhotoVisibility;
  photos: readonly { type: ProgressPhotoType; fileId: FileId }[];
  version: number;
}

export interface HealthProfileDto {
  id: HealthProfileId;
  injuries?: readonly string[];
  physicalLimitations?: readonly string[];
  foodAllergies: readonly string[];
  medications?: readonly string[];
  medicalNotes?: string;
  emergencyNotes?: string;
  version: number;
}

export interface CoachingNoteDto {
  id: CoachingNoteId;
  category: string;
  visibility: NoteVisibility;
  content: string;
  sensitive: boolean;
  status: NoteStatus;
  version: number;
}

export interface CoachingNoteBodyDto {
  category: string;
  visibility?: NoteVisibility;
  content: string;
  sensitive?: boolean;
}

export interface CoachingNotePatchDto extends Partial<CoachingNoteBodyDto> {
  expectedVersion: number;
}

export interface AdherenceConfigDto {
  id: string;
  enabledMetrics: readonly AdherenceMetricKey[];
  version: number;
}

export interface AdherenceConfigBodyDto {
  expectedVersion?: number;
  enabledMetrics: AdherenceMetricKey[];
}

export type DailyMetricValuesDto = Partial<{
  WORKOUT: { completed: boolean };
  NUTRITION: { adherencePercent: number };
  WATER: { ml: number };
  STEPS: { count: number };
  SLEEP: { minutes: number };
  BODY_WEIGHT: { kg: number };
  MOOD: { score: number };
  ENERGY: { score: number };
}>;

export interface ProgressDailyTrackingEntryDto {
  id: DailyTrackingEntryId;
  localDate: string;
  timezoneAtEntry: string;
  values: DailyMetricValuesDto;
  version: number;
}

export interface ProgressDailyTrackingBodyDto {
  expectedVersion?: number;
  values: DailyMetricValuesDto;
  reason?: string;
}

export interface ProgressAnalyticsDto {
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  range: { from: string; to: string; timezone: string };
  metricDefinitionId: MetricDefinitionId;
  summary: {
    firstInWindow: ProgressAnalyticsPointDto | null;
    latestInWindow: ProgressAnalyticsPointDto | null;
    latest: ProgressAnalyticsPointDto | null;
    delta: number | null;
    percentChange: number | null;
  };
  points: readonly ProgressAnalyticsPointDto[];
  page: { hasMore: boolean; nextCursor: string | null };
  buckets: readonly ProgressAnalyticsBucketDto[];
  photoSummary: { count: number };
}

export interface ProgressAnalyticsBucketDto {
  key: string;
  from: string;
  to: string;
  latest: ProgressAnalyticsPointDto;
}

export interface ProgressAnalyticsPointDto {
  id: MeasurementId;
  value: number;
  unit: string;
  metricDefinitionId: MetricDefinitionId;
  metricKey: string | null;
  metricName: string;
  measuredAt: string;
}

export interface AdherenceAnalyticsDto {
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  range: { from: string; to: string; timezone: string };
  granularity: AdherenceAnalyticsGranularity;
  training: AdherenceTrainingSummaryDto | null;
  checkIns: AdherenceCheckInSummaryDto | null;
  nutrition: AdherenceNutritionSummaryDto | null;
  water: AdherenceWaterSummaryDto | null;
  series: readonly AdherenceSeriesDto[];
}

export interface AdherenceTrainingSummaryDto {
  startedSessions: number;
  completedSessions: number;
  abandonedSessions: number;
  programDaysCompleted: number;
  programDaysSkipped: number;
  programDaysDeferred: number;
  workoutAdherenceRate: number | null;
  prCount: number;
}

export interface AdherenceCheckInSummaryDto {
  dueCount: number;
  submittedOrReviewedCount: number;
  complianceRate: number | null;
}

export interface AdherenceNutritionSummaryDto {
  daysTracked: number;
  averageAdherenceRate: number | null;
}

export interface AdherenceWaterSummaryDto {
  daysTracked: number;
  averageMl: number | null;
  targetMl: number | null;
}

export interface AdherenceSeriesDto {
  key: string;
  from: string;
  to: string;
  training?: { workoutAdherenceRate: number | null };
  checkIns?: { complianceRate: number | null };
  nutrition?: { adherenceRate: number | null };
  water?: { adherenceRate: number | null };
}

export const isMetricDefinitionDto = (
  value: unknown,
): value is MetricDefinitionDto =>
  isRecord(value) &&
  id(value.id) &&
  literal(value.scope, metricDefinitionScopes) &&
  optionalId(value.workspaceId) &&
  optionalString(value.ownerMembershipId) &&
  optionalString(value.key) &&
  typeof value.name === "string" &&
  literal(value.valueType, metricValueTypes) &&
  typeof value.unit === "string" &&
  typeof value.category === "string" &&
  literal(value.status, metricDefinitionStatuses) &&
  version(value.version);

export const isMeasurementDto = (value: unknown): value is MeasurementDto =>
  isRecord(value) &&
  id(value.id) &&
  id(value.metricDefinitionId) &&
  number(value.value) &&
  timestamp(value.measuredAt) &&
  literal(value.source, measurementSources) &&
  optionalString(value.notes) &&
  version(value.version);

export const isProgressPhotoDto = (value: unknown): value is ProgressPhotoDto =>
  isRecord(value) &&
  id(value.id) &&
  timestamp(value.capturedAt) &&
  optionalNumber(value.weightAtCaptureKg) &&
  literal(value.visibility, progressPhotoVisibilities) &&
  Array.isArray(value.photos) &&
  value.photos.every(
    (item) =>
      isRecord(item) &&
      literal(item.type, progressPhotoTypes) &&
      id(item.fileId),
  ) &&
  version(value.version);

export const isHealthProfileDto = (value: unknown): value is HealthProfileDto =>
  isRecord(value) &&
  id(value.id) &&
  stringArray(value.foodAllergies) &&
  optionalStringArray(value.injuries) &&
  optionalStringArray(value.physicalLimitations) &&
  optionalStringArray(value.medications) &&
  optionalString(value.medicalNotes) &&
  optionalString(value.emergencyNotes) &&
  version(value.version);

export const isCoachingNoteDto = (value: unknown): value is CoachingNoteDto =>
  isRecord(value) &&
  id(value.id) &&
  typeof value.category === "string" &&
  literal(value.visibility, noteVisibilities) &&
  typeof value.content === "string" &&
  typeof value.sensitive === "boolean" &&
  literal(value.status, noteStatuses) &&
  version(value.version);

export const isAdherenceConfigDto = (
  value: unknown,
): value is AdherenceConfigDto =>
  isRecord(value) &&
  id(value.id) &&
  Array.isArray(value.enabledMetrics) &&
  value.enabledMetrics.every((item) => literal(item, adherenceMetricKeys)) &&
  version(value.version);

export const isProgressDailyTrackingEntryDto = (
  value: unknown,
): value is ProgressDailyTrackingEntryDto =>
  isRecord(value) &&
  id(value.id) &&
  localDate(value.localDate) &&
  typeof value.timezoneAtEntry === "string" &&
  isRecord(value.values) &&
  version(value.version);

export const isProgressAnalyticsDto = (
  value: unknown,
): value is ProgressAnalyticsDto =>
  isRecord(value) &&
  id(value.workspaceId) &&
  id(value.relationshipId) &&
  isRecord(value.range) &&
  timestamp(value.range.from) &&
  timestamp(value.range.to) &&
  validTimezone(value.range.timezone) &&
  id(value.metricDefinitionId) &&
  isRecord(value.summary) &&
  (value.summary.firstInWindow === null ||
    isProgressAnalyticsPointDto(value.summary.firstInWindow)) &&
  (value.summary.latestInWindow === null ||
    isProgressAnalyticsPointDto(value.summary.latestInWindow)) &&
  (value.summary.latest === null ||
    isProgressAnalyticsPointDto(value.summary.latest)) &&
  nullableNumber(value.summary.delta) &&
  nullableNumber(value.summary.percentChange) &&
  Array.isArray(value.points) &&
  value.points.every(isProgressAnalyticsPointDto) &&
  isRecord(value.page) &&
  typeof value.page.hasMore === "boolean" &&
  (value.page.nextCursor === null ||
    typeof value.page.nextCursor === "string") &&
  Array.isArray(value.buckets) &&
  value.buckets.every(isProgressAnalyticsBucketDto) &&
  isRecord(value.photoSummary) &&
  version(value.photoSummary.count) &&
  progressMetricIdentitiesMatch(value);

export const isAdherenceAnalyticsDto = (
  value: unknown,
): value is AdherenceAnalyticsDto =>
  isRecord(value) &&
  id(value.workspaceId) &&
  id(value.relationshipId) &&
  isRecord(value.range) &&
  timestamp(value.range.from) &&
  timestamp(value.range.to) &&
  validTimezone(value.range.timezone) &&
  literal(value.granularity, adherenceAnalyticsGranularities) &&
  (value.training === null || isAdherenceTrainingSummary(value.training)) &&
  (value.checkIns === null || isAdherenceCheckInSummary(value.checkIns)) &&
  (value.nutrition === null || isAdherenceNutritionSummary(value.nutrition)) &&
  (value.water === null || isAdherenceWaterSummary(value.water)) &&
  Array.isArray(value.series) &&
  value.series.every(isAdherenceSeries);

function isAdherenceTrainingSummary(value: unknown) {
  return (
    isRecord(value) &&
    [
      value.startedSessions,
      value.completedSessions,
      value.abandonedSessions,
      value.programDaysCompleted,
      value.programDaysSkipped,
      value.programDaysDeferred,
      value.prCount,
    ].every(nonNegativeInteger) &&
    nullableNumber(value.workoutAdherenceRate)
  );
}

function isAdherenceCheckInSummary(value: unknown) {
  return (
    isRecord(value) &&
    nonNegativeInteger(value.dueCount) &&
    nonNegativeInteger(value.submittedOrReviewedCount) &&
    nullableNumber(value.complianceRate)
  );
}

function isAdherenceNutritionSummary(value: unknown) {
  return (
    isRecord(value) &&
    nonNegativeInteger(value.daysTracked) &&
    nullableNumber(value.averageAdherenceRate)
  );
}

function isAdherenceWaterSummary(value: unknown) {
  return (
    isRecord(value) &&
    nonNegativeInteger(value.daysTracked) &&
    nullableNumber(value.averageMl) &&
    nullableNumber(value.targetMl)
  );
}

function isAdherenceSeries(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    timestamp(value.from) &&
    timestamp(value.to) &&
    optionalRateComponent(value.training, "workoutAdherenceRate") &&
    optionalRateComponent(value.checkIns, "complianceRate") &&
    optionalRateComponent(value.nutrition, "adherenceRate") &&
    optionalRateComponent(value.water, "adherenceRate") &&
    [value.training, value.checkIns, value.nutrition, value.water].some(
      (component) => component !== undefined,
    )
  );
}

function optionalRateComponent(value: unknown, key: string) {
  return value === undefined || (isRecord(value) && nullableNumber(value[key]));
}

function isProgressAnalyticsPointDto(
  value: unknown,
): value is ProgressAnalyticsPointDto {
  return (
    isRecord(value) &&
    id(value.id) &&
    number(value.value) &&
    typeof value.unit === "string" &&
    id(value.metricDefinitionId) &&
    (value.metricKey === null || typeof value.metricKey === "string") &&
    typeof value.metricName === "string" &&
    timestamp(value.measuredAt)
  );
}

function isProgressAnalyticsBucketDto(
  value: unknown,
): value is ProgressAnalyticsBucketDto {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    timestamp(value.from) &&
    timestamp(value.to) &&
    isProgressAnalyticsPointDto(value.latest)
  );
}

function progressMetricIdentitiesMatch(
  value: Record<string, unknown>,
): boolean {
  const metricDefinitionId = value.metricDefinitionId;
  if (typeof metricDefinitionId !== "string" || !isRecord(value.summary))
    return false;
  const summaryPoints = [
    value.summary.firstInWindow,
    value.summary.latestInWindow,
    value.summary.latest,
  ].filter((point) => point !== null);
  const points = Array.isArray(value.points) ? value.points : [];
  const bucketPoints = Array.isArray(value.buckets)
    ? value.buckets.filter(isRecord).map((bucket) => bucket.latest)
    : [];
  return [...summaryPoints, ...points, ...bucketPoints].every(
    (point) =>
      isRecord(point) && point.metricDefinitionId === metricDefinitionId,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function optionalId(value: unknown): value is string | undefined {
  return value === undefined || id(value);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalNumber(value: unknown): value is number | undefined {
  return value === undefined || number(value);
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || number(value);
}

function version(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function stringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function optionalStringArray(
  value: unknown,
): value is readonly string[] | undefined {
  return value === undefined || stringArray(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && isOffsetTimestamp(value);
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function localDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
