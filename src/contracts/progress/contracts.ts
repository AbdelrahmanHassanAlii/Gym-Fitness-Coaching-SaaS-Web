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
  buckets: readonly unknown[];
  photoSummary: { count: number };
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
  training: Record<string, unknown> | null;
  checkIns: Record<string, unknown> | null;
  nutrition: Record<string, unknown> | null;
  water: Record<string, unknown> | null;
  series: readonly Record<string, unknown>[];
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
  typeof value.range.timezone === "string" &&
  id(value.metricDefinitionId) &&
  isRecord(value.summary) &&
  (value.summary.latest === null ||
    isProgressAnalyticsPointDto(value.summary.latest)) &&
  Array.isArray(value.points) &&
  value.points.every(isProgressAnalyticsPointDto) &&
  isRecord(value.page) &&
  typeof value.page.hasMore === "boolean" &&
  (value.page.nextCursor === null ||
    typeof value.page.nextCursor === "string") &&
  Array.isArray(value.buckets) &&
  isRecord(value.photoSummary) &&
  version(value.photoSummary.count);

export const isAdherenceAnalyticsDto = (
  value: unknown,
): value is AdherenceAnalyticsDto =>
  isRecord(value) &&
  id(value.workspaceId) &&
  id(value.relationshipId) &&
  isRecord(value.range) &&
  timestamp(value.range.from) &&
  timestamp(value.range.to) &&
  typeof value.range.timezone === "string" &&
  literal(value.granularity, adherenceAnalyticsGranularities) &&
  (value.training === null || isRecord(value.training)) &&
  (value.checkIns === null || isRecord(value.checkIns)) &&
  (value.nutrition === null || isRecord(value.nutrition)) &&
  (value.water === null || isRecord(value.water)) &&
  Array.isArray(value.series);

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

function version(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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
  if (typeof value !== "string") return false;
  const parsed = new Date(value as string);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
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
