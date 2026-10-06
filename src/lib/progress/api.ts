import type {
  AdherenceAnalyticsDto,
  AdherenceConfigBodyDto,
  AdherenceConfigDto,
  CoachingNoteBodyDto,
  CoachingNoteDto,
  CoachingNoteId,
  CoachingNotePatchDto,
  ProgressDailyTrackingBodyDto,
  ProgressDailyTrackingEntryDto,
  MeasurementBodyDto,
  MeasurementDto,
  MeasurementId,
  MeasurementPatchDto,
  MetricDefinitionDto,
  ProgressAnalyticsDto,
  ProgressMeasurementAnalyticsGranularity,
  ProgressPhotoDto,
  RelationshipId,
  WorkspaceId,
} from "@/contracts";
import {
  isAdherenceAnalyticsDto,
  isAdherenceConfigDto,
  isCoachingNoteDto,
  isProgressDailyTrackingEntryDto,
  isHealthProfileDto,
  isMeasurementDto,
  isMetricDefinitionDto,
  isProgressAnalyticsDto,
  isProgressPhotoDto,
  type HealthProfileDto,
} from "@/contracts";
import type { MembershipId } from "@/contracts/common/ids";
import type { ApiClient } from "@/lib/api";
import { ApiError, serializeQueryParams } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";

export const progressPageLimit = 25;

export const progressKeys = {
  adherenceAnalytics: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    range: AnalyticsRange,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "progress-adherence-analytics",
      { generation, membershipId, relationshipId, ...range },
      accessContext,
    ),
  adherenceConfig: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "progress-adherence-config",
      { generation, membershipId, relationshipId },
      accessContext,
    ),
  dailyTracking: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    localDate: string,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "progress-daily-tracking",
      { generation, localDate, membershipId, relationshipId },
      accessContext,
    ),
  health: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "progress-health-profile",
      { generation, membershipId, relationshipId },
      accessContext,
    ),
  measurements: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    filters: { cursor?: string; metricDefinitionId?: string } = {},
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "progress-measurements",
      {
        generation,
        limit: progressPageLimit,
        membershipId,
        relationshipId,
        ...filters,
      },
      accessContext,
    ),
  metrics: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "progress-metric-definitions",
      { generation, limit: progressPageLimit, membershipId },
      accessContext,
    ),
  notes: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    cursor?: string,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "progress-notes",
      {
        cursor: cursor ?? null,
        generation,
        limit: progressPageLimit,
        membershipId,
        relationshipId,
      },
      accessContext,
    ),
  photos: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    cursor?: string,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "progress-photos",
      {
        cursor: cursor ?? null,
        generation,
        limit: progressPageLimit,
        membershipId,
        relationshipId,
      },
      accessContext,
    ),
  progressAnalytics: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    range: AnalyticsRange & { metricDefinitionId?: string; cursor?: string },
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "progress-analytics",
      { generation, membershipId, relationshipId, ...range },
      accessContext,
    ),
};

export interface Page<T> {
  data: T[];
  nextCursor?: string;
}

export interface AnalyticsRange {
  from?: string;
  granularity?: ProgressMeasurementAnalyticsGranularity | "day" | "week";
  to?: string;
}

export async function listMetricDefinitions(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<Page<MetricDefinitionDto>> {
  const query = serializeQueryParams({ limit: progressPageLimit });
  const page = await apiClient.request<{ data: unknown; nextCursor?: unknown }>(
    {
      method: "GET",
      path: `/workspaces/${workspaceId}/metric-definitions?${query}`,
      signal,
    },
  );
  return pageResult(page, isMetricDefinitionDto, "metric definitions");
}

export async function listMeasurements(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  filters: { cursor?: string; metricDefinitionId?: string } = {},
  signal?: AbortSignal,
): Promise<Page<MeasurementDto>> {
  const query = serializeQueryParams({ limit: progressPageLimit, ...filters });
  const page = await apiClient.request<{ data: unknown; nextCursor?: unknown }>(
    {
      method: "GET",
      path: `/workspaces/${workspaceId}/relationships/${relationshipId}/measurements?${query}`,
      signal,
    },
  );
  return pageResult(page, isMeasurementDto, "measurements");
}

export async function createMeasurement(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: MeasurementBodyDto,
  idempotencyKey: string,
): Promise<MeasurementDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/measurements`,
  });
  const data = command(envelope.data, "measurement", isMeasurementDto);
  return data.measurement;
}

export async function updateMeasurement(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  measurementId: MeasurementId,
  body: MeasurementPatchDto,
): Promise<MeasurementDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    method: "PATCH",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/measurements/${measurementId}`,
  });
  const data = command(envelope.data, "measurement", isMeasurementDto);
  if (data.measurement.id !== measurementId)
    throw malformed("measurement identity");
  return data.measurement;
}

export async function listProgressPhotos(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<ProgressPhotoDto>> {
  const query = serializeQueryParams({ cursor, limit: progressPageLimit });
  const page = await apiClient.request<{ data: unknown; nextCursor?: unknown }>(
    {
      method: "GET",
      path: `/workspaces/${workspaceId}/relationships/${relationshipId}/progress-photos?${query}`,
      signal,
    },
  );
  return pageResult(page, isProgressPhotoDto, "progress photos");
}

export async function getHealthProfile(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  signal?: AbortSignal,
): Promise<HealthProfileDto | null> {
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/health-profile`,
    signal,
  });
  if (!isRecord(envelope.data)) throw malformed("health profile");
  const value = envelope.data.healthProfile;
  if (value !== null && !isHealthProfileDto(value))
    throw malformed("health profile");
  return value;
}

export async function listNotes(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<CoachingNoteDto>> {
  const query = serializeQueryParams({ cursor, limit: progressPageLimit });
  const page = await apiClient.request<{ data: unknown; nextCursor?: unknown }>(
    {
      method: "GET",
      path: `/workspaces/${workspaceId}/relationships/${relationshipId}/notes?${query}`,
      signal,
    },
  );
  return pageResult(page, isCoachingNoteDto, "notes");
}

export async function createNote(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: CoachingNoteBodyDto,
): Promise<CoachingNoteDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    method: "POST",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/notes`,
  });
  return command(envelope.data, "note", isCoachingNoteDto).note;
}

export async function updateNote(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  noteId: CoachingNoteId,
  body: CoachingNotePatchDto,
): Promise<CoachingNoteDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    method: "PATCH",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/notes/${noteId}`,
  });
  return command(envelope.data, "note", isCoachingNoteDto).note;
}

export async function archiveNote(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  noteId: CoachingNoteId,
  body: { expectedVersion: number },
): Promise<CoachingNoteDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    method: "POST",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/notes/${noteId}/archive`,
  });
  return command(envelope.data, "note", isCoachingNoteDto).note;
}

export async function getAdherenceConfig(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  signal?: AbortSignal,
): Promise<AdherenceConfigDto | null> {
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/adherence-config`,
    signal,
  });
  if (!isRecord(envelope.data)) throw malformed("adherence config");
  const value = envelope.data.adherenceConfig;
  if (value !== null && !isAdherenceConfigDto(value))
    throw malformed("adherence config");
  return value;
}

export async function putAdherenceConfig(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: AdherenceConfigBodyDto,
): Promise<AdherenceConfigDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    method: "PUT",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/adherence-config`,
  });
  return command(envelope.data, "adherenceConfig", isAdherenceConfigDto)
    .adherenceConfig;
}

export async function getDailyTracking(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  localDate: string,
  signal?: AbortSignal,
): Promise<ProgressDailyTrackingEntryDto | null> {
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/daily-tracking/${localDate}`,
    signal,
  });
  if (!isRecord(envelope.data)) throw malformed("daily tracking");
  const value = envelope.data.dailyTrackingEntry;
  if (
    value !== null &&
    (!isProgressDailyTrackingEntryDto(value) || value.localDate !== localDate)
  ) {
    throw malformed("daily tracking");
  }
  return value;
}

export async function putDailyTracking(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  localDate: string,
  body: ProgressDailyTrackingBodyDto,
): Promise<ProgressDailyTrackingEntryDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    method: "PUT",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/daily-tracking/${localDate}`,
  });
  return command(
    envelope.data,
    "dailyTrackingEntry",
    isProgressDailyTrackingEntryDto,
  ).dailyTrackingEntry;
}

export async function getProgressAnalytics(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  range: AnalyticsRange & { metricDefinitionId?: string; cursor?: string },
  signal?: AbortSignal,
): Promise<ProgressAnalyticsDto> {
  const query = serializeQueryParams({ ...range });
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/analytics/progress?${query}`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isProgressAnalyticsDto,
    "progress analytics",
  );
  if (
    data.workspaceId !== workspaceId ||
    data.relationshipId !== relationshipId
  ) {
    throw malformed("progress analytics identity");
  }
  return data;
}

export async function getAdherenceAnalytics(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  range: AnalyticsRange,
  signal?: AbortSignal,
): Promise<AdherenceAnalyticsDto> {
  const query = serializeQueryParams({ ...range });
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/analytics/adherence?${query}`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isAdherenceAnalyticsDto,
    "adherence analytics",
  );
  if (
    data.workspaceId !== workspaceId ||
    data.relationshipId !== relationshipId
  ) {
    throw malformed("adherence analytics identity");
  }
  return data;
}

function pageResult<T>(
  page: { data: unknown; nextCursor?: unknown },
  guard: (value: unknown) => value is T,
  label: string,
): Page<T> {
  const data = requireArray(page.data, guard, label);
  return {
    data,
    ...(typeof page.nextCursor === "string"
      ? { nextCursor: page.nextCursor }
      : {}),
  };
}

function command<K extends string, T>(
  value: unknown,
  key: K,
  guard: (value: unknown) => value is T,
): Record<K, T> {
  if (!isRecord(value) || !guard(value[key])) throw malformed(key);
  return value as Record<K, T>;
}

function requireArray<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): T[] {
  if (!Array.isArray(value) || !value.every(guard)) throw malformed(label);
  return value;
}

function requireShape<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): T {
  if (!guard(value)) throw malformed(label);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function malformed(label: string): ApiError {
  return new ApiError({
    code: "WEB_MALFORMED_RESPONSE",
    kind: "malformed-response",
    message: `Malformed ${label} response.`,
  });
}
