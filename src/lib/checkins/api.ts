import type {
  CheckInAssignmentBodyDto,
  CheckInAssignmentDto,
  CheckInAssignmentId,
  CheckInAssignmentPatchDto,
  CheckInDto,
  CheckInExpectedVersionBodyDto,
  CheckInId,
  CheckInReviewBodyDto,
  CheckInTemplateBodyDto,
  CheckInTemplateDetailDto,
  CheckInTemplateDto,
  CheckInTemplateId,
  CheckInTemplateRevisionBodyDto,
  MembershipId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts";
import {
  isCheckInAssignmentDto,
  isCheckInDto,
  isCheckInTemplateDetailDto,
  isCheckInTemplateDto,
} from "@/contracts";
import type { ApiClient } from "@/lib/api";
import { ApiError, serializeQueryParams } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";

export const checkInPageLimit = 25;

export const checkInKeys = {
  assignments: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    cursor?: string,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "checkin-assignments",
      {
        cursor: cursor ?? null,
        generation,
        limit: checkInPageLimit,
        membershipId,
        relationshipId,
      },
      accessContext,
    ),
  checkin: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    checkinId: CheckInId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "checkin-instance",
      { checkinId, generation, membershipId, relationshipId },
      accessContext,
    ),
  checkins: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    relationshipId: RelationshipId,
    generation: number,
    cursor?: string,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "checkin-instances",
      {
        cursor: cursor ?? null,
        generation,
        limit: checkInPageLimit,
        membershipId,
        relationshipId,
      },
      accessContext,
    ),
  template: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    templateId: CheckInTemplateId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "checkin-template",
      { generation, membershipId, templateId },
      accessContext,
    ),
  templates: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    generation: number,
    cursor?: string,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "checkin-templates",
      {
        cursor: cursor ?? null,
        generation,
        limit: checkInPageLimit,
        membershipId,
      },
      accessContext,
    ),
};

export interface Page<T> {
  data: T[];
  nextCursor?: string;
}

export async function listCheckInTemplates(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<CheckInTemplateDto>> {
  const query = serializeQueryParams({ cursor, limit: checkInPageLimit });
  const page = await apiClient.request<{ data: unknown; nextCursor?: unknown }>(
    {
      method: "GET",
      path: `/workspaces/${workspaceId}/checkin-templates?${query}`,
      signal,
    },
  );
  return pageResult(page, isCheckInTemplateDto, "check-in templates");
}

export async function createCheckInTemplate(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  body: CheckInTemplateBodyDto,
  idempotencyKey: string,
): Promise<CheckInTemplateDetailDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/checkin-templates`,
  });
  return requireShape(
    envelope.data,
    isCheckInTemplateDetailDto,
    "check-in template create",
  );
}

export async function getCheckInTemplate(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  templateId: CheckInTemplateId,
  signal?: AbortSignal,
): Promise<CheckInTemplateDetailDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/checkin-templates/${templateId}`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isCheckInTemplateDetailDto,
    "check-in template",
  );
  if (data.template.id !== templateId)
    throw malformed("check-in template identity");
  return data;
}

export async function createCheckInTemplateRevision(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  templateId: CheckInTemplateId,
  body: CheckInTemplateRevisionBodyDto,
  idempotencyKey: string,
): Promise<CheckInTemplateDetailDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/checkin-templates/${templateId}/revisions`,
  });
  return requireShape(
    envelope.data,
    isCheckInTemplateDetailDto,
    "check-in template revision",
  );
}

export async function archiveCheckInTemplate(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  templateId: CheckInTemplateId,
  body: CheckInExpectedVersionBodyDto,
  idempotencyKey: string,
): Promise<CheckInTemplateDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/checkin-templates/${templateId}/archive`,
  });
  return command(envelope.data, "template", isCheckInTemplateDto).template;
}

export async function listCheckInAssignments(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<CheckInAssignmentDto>> {
  const query = serializeQueryParams({ cursor, limit: checkInPageLimit });
  const page = await apiClient.request<{ data: unknown; nextCursor?: unknown }>(
    {
      method: "GET",
      path: `/workspaces/${workspaceId}/relationships/${relationshipId}/checkin-assignments?${query}`,
      signal,
    },
  );
  return pageResult(page, isCheckInAssignmentDto, "check-in assignments");
}

export async function createCheckInAssignment(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: CheckInAssignmentBodyDto,
  idempotencyKey: string,
): Promise<CheckInAssignmentDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/checkin-assignments`,
  });
  return command(envelope.data, "assignment", isCheckInAssignmentDto)
    .assignment;
}

export async function updateCheckInAssignment(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  assignmentId: CheckInAssignmentId,
  body: CheckInAssignmentPatchDto,
): Promise<CheckInAssignmentDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    method: "PATCH",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/checkin-assignments/${assignmentId}`,
  });
  return command(envelope.data, "assignment", isCheckInAssignmentDto)
    .assignment;
}

export async function endCheckInAssignment(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  assignmentId: CheckInAssignmentId,
  body: CheckInExpectedVersionBodyDto,
  idempotencyKey: string,
): Promise<CheckInAssignmentDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/checkin-assignments/${assignmentId}/end`,
  });
  return command(envelope.data, "assignment", isCheckInAssignmentDto)
    .assignment;
}

export async function listCheckIns(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<CheckInDto>> {
  const query = serializeQueryParams({ cursor, limit: checkInPageLimit });
  const page = await apiClient.request<{ data: unknown; nextCursor?: unknown }>(
    {
      method: "GET",
      path: `/workspaces/${workspaceId}/relationships/${relationshipId}/checkins?${query}`,
      signal,
    },
  );
  return pageResult(page, isCheckInDto, "check-ins");
}

export async function getCheckIn(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  checkinId: CheckInId,
  signal?: AbortSignal,
): Promise<CheckInDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/checkins/${checkinId}`,
    signal,
  });
  const data = command(envelope.data, "checkin", isCheckInDto).checkin;
  if (data.id !== checkinId) throw malformed("check-in identity");
  return data;
}

export async function reviewCheckIn(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  checkinId: CheckInId,
  body: CheckInReviewBodyDto,
  idempotencyKey: string,
): Promise<CheckInDto> {
  const envelope = await apiClient.request<{ data: unknown }>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/checkins/${checkinId}/review`,
  });
  return command(envelope.data, "checkin", isCheckInDto).checkin;
}

function pageResult<T>(
  page: { data: unknown; nextCursor?: unknown },
  guard: (value: unknown) => value is T,
  label: string,
): Page<T> {
  if (!Array.isArray(page.data) || !page.data.every(guard))
    throw malformed(label);
  return {
    data: page.data,
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
