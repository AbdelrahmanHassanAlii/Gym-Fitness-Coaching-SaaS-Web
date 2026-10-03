import type {
  ApiDataEnvelope,
  ChangeHomeBranchRequestDto,
  CoachingRelationshipDto,
  ExpectedRelationshipVersionRequestDto,
  MembershipId,
  RelationshipCommandResponseDto,
  RelationshipId,
  RelationshipStatus,
  SetPrimaryTrainerRequestDto,
  StaffAssignmentRequestDto,
  WorkspaceId,
} from "@/contracts";
import {
  isCoachingRelationshipDto,
  isRelationshipCommandResponseDto,
  isRelationshipDetailDto,
} from "@/contracts";
import type { ApiClient } from "@/lib/api";
import { ApiError, serializeQueryParams } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";

export const relationshipKeys = {
  detail: (
    workspaceId: WorkspaceId,
    relationshipId: RelationshipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "relationship",
      { generation, relationshipId },
      accessContext,
    ),
  list: (
    workspaceId: WorkspaceId,
    generation: number,
    status: RelationshipStatus | "ALL",
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "relationships",
      { generation, status },
      accessContext,
    ),
};

export async function listRelationships(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  input: { status?: RelationshipStatus },
  signal?: AbortSignal,
): Promise<CoachingRelationshipDto[]> {
  const query = serializeQueryParams(
    input.status ? { status: input.status } : {},
  );
  const envelope = await apiClient.request<{
    data: unknown;
    meta?: { hasMore?: unknown; nextCursor?: unknown };
  }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships${query ? `?${query}` : ""}`,
    signal,
  });
  const relationships = requireArray(
    envelope.data,
    isCoachingRelationshipDto,
    "relationships",
  );
  if (
    relationships.some(
      (relationship) => relationship.workspaceId !== workspaceId,
    )
  ) {
    throw malformed("relationship workspace identity");
  }

  return relationships;
}

export async function getRelationship(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  signal?: AbortSignal,
): Promise<CoachingRelationshipDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isRelationshipDetailDto,
    "relationship detail",
  );
  if (
    data.relationship.workspaceId !== workspaceId ||
    data.relationship.id !== relationshipId
  ) {
    throw malformed("relationship detail identity");
  }

  return data.relationship;
}

export async function changeRelationshipHomeBranch(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: ChangeHomeBranchRequestDto,
  idempotencyKey: string,
): Promise<RelationshipCommandResponseDto> {
  return relationshipCommand(
    apiClient,
    "PUT",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/home-branch`,
    body,
    idempotencyKey,
    workspaceId,
    relationshipId,
  );
}

export async function setPrimaryTrainer(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: SetPrimaryTrainerRequestDto,
  idempotencyKey: string,
): Promise<RelationshipCommandResponseDto> {
  return relationshipCommand(
    apiClient,
    "PUT",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/primary-trainer`,
    body,
    idempotencyKey,
    workspaceId,
    relationshipId,
  );
}

export async function removePrimaryTrainer(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: ExpectedRelationshipVersionRequestDto,
  idempotencyKey: string,
): Promise<RelationshipCommandResponseDto> {
  return relationshipCommand(
    apiClient,
    "DELETE",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/primary-trainer`,
    body,
    idempotencyKey,
    workspaceId,
    relationshipId,
  );
}

export async function addRelationshipStaffAssignment(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  kind: "assistants" | "nutritionists",
  body: StaffAssignmentRequestDto,
  idempotencyKey: string,
): Promise<RelationshipCommandResponseDto> {
  return relationshipCommand(
    apiClient,
    "POST",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/${kind}`,
    body,
    idempotencyKey,
    workspaceId,
    relationshipId,
  );
}

export async function removeRelationshipStaffAssignment(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  kind: "assistants" | "nutritionists",
  membershipId: MembershipId,
  body: ExpectedRelationshipVersionRequestDto,
  idempotencyKey: string,
): Promise<RelationshipCommandResponseDto> {
  return relationshipCommand(
    apiClient,
    "DELETE",
    `/workspaces/${workspaceId}/relationships/${relationshipId}/${kind}/${membershipId}`,
    body,
    idempotencyKey,
    workspaceId,
    relationshipId,
  );
}

export function relationshipStatusFilter(
  value: string,
): RelationshipStatus | undefined {
  return value === "ALL" ? undefined : (value as RelationshipStatus);
}

async function relationshipCommand(
  apiClient: ApiClient,
  method: "DELETE" | "POST" | "PUT",
  path: string,
  body:
    | ChangeHomeBranchRequestDto
    | ExpectedRelationshipVersionRequestDto
    | SetPrimaryTrainerRequestDto
    | StaffAssignmentRequestDto,
  idempotencyKey: string,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
): Promise<RelationshipCommandResponseDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method,
    path,
  });
  const data = requireShape(
    envelope.data,
    isRelationshipCommandResponseDto,
    "relationship command",
  );
  if (
    data.relationship &&
    (data.relationship.workspaceId !== workspaceId ||
      data.relationship.id !== relationshipId)
  ) {
    throw malformed("relationship command identity");
  }
  if (data.assignment && data.assignment.relationshipId !== relationshipId) {
    throw malformed("relationship assignment identity");
  }

  return data;
}

function requireArray<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): T[] {
  if (!Array.isArray(value) || !value.every(guard)) {
    throw malformed(label);
  }

  return value;
}

function requireShape<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string,
): T {
  if (!guard(value)) {
    throw malformed(label);
  }

  return value;
}

function malformed(label: string): ApiError {
  return new ApiError({
    kind: "malformed-response",
    message: `Malformed ${label} response.`,
  });
}
