import type {
  ApiDataEnvelope,
  BranchDto,
  BranchId,
  CreateBranchRequestDto,
  InviteStaffRequestDto,
  InvitationDto,
  MembershipBranchAssignmentDto,
  MembershipId,
  UpdateBranchRequestDto,
  UpdateWorkspaceRequestDto,
  WorkspaceDetailDto,
  WorkspaceId,
  WorkspaceMembershipSummaryDto,
} from "@/contracts";
import {
  isBranchDto,
  isInvitationDto,
  isMembershipBranchAssignmentDto,
  isMembershipDto,
  isWorkspaceDetailDto,
} from "@/contracts";
import type { ApiClient } from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";

export const workspaceManagementKeys = {
  branches: (
    workspaceId: WorkspaceId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "branches",
      { generation },
      accessContext,
    ),
  branchAssignments: (
    workspaceId: WorkspaceId,
    membershipId: MembershipId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "membership-branch-assignments",
      { generation, membershipId },
      accessContext,
    ),
  memberships: (
    workspaceId: WorkspaceId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "memberships",
      { generation },
      accessContext,
    ),
  workspace: (
    workspaceId: WorkspaceId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "workspace-management",
      { generation },
      accessContext,
    ),
};

export async function getWorkspaceDetail(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<WorkspaceDetailDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}`,
    signal,
  });

  return requireShape(envelope.data, isWorkspaceDetailDto, "workspace detail");
}

export async function updateWorkspace(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  body: UpdateWorkspaceRequestDto,
): Promise<WorkspaceDetailDto["workspace"]> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    method: "PATCH",
    path: `/workspaces/${workspaceId}`,
  });

  return requireShape(envelope.data, isWorkspaceDetailDto, "workspace update")
    .workspace;
}

export async function listBranches(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<BranchDto[]> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/branches`,
    signal,
  });

  return requireArray(envelope.data, isBranchDto, "branches");
}

export async function createBranch(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  body: CreateBranchRequestDto,
): Promise<BranchDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    method: "POST",
    path: `/workspaces/${workspaceId}/branches`,
  });

  return requireShape(envelope.data, isBranchDto, "branch create");
}

export async function updateBranch(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  branchId: BranchId,
  body: UpdateBranchRequestDto,
): Promise<BranchDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    method: "PATCH",
    path: `/workspaces/${workspaceId}/branches/${branchId}`,
  });

  return requireShape(envelope.data, isBranchDto, "branch update");
}

export async function archiveBranch(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  branchId: BranchId,
): Promise<BranchDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "POST",
    path: `/workspaces/${workspaceId}/branches/${branchId}/archive`,
  });

  return requireShape(envelope.data, isBranchDto, "branch archive");
}

export async function listMemberships(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<WorkspaceMembershipSummaryDto[]> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/memberships`,
    signal,
  });

  return requireArray(envelope.data, isMembershipDto, "memberships");
}

export async function transitionMembership(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  membershipId: MembershipId,
  command: "end" | "reactivate" | "suspend",
): Promise<WorkspaceMembershipSummaryDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "POST",
    path: `/workspaces/${workspaceId}/memberships/${membershipId}/${command}`,
  });

  return requireShape(envelope.data, isMembershipDto, "membership transition");
}

export async function inviteStaff(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  body: InviteStaffRequestDto,
): Promise<{ invitation: InvitationDto; token: string }> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    method: "POST",
    path: `/workspaces/${workspaceId}/staff/invitations`,
  });

  const data = envelope.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("invitation" in data) ||
    !("token" in data) ||
    !isInvitationDto(data.invitation) ||
    typeof data.token !== "string"
  ) {
    throw malformed("staff invitation");
  }

  return {
    invitation: data.invitation,
    token: data.token,
  };
}

export async function listMembershipBranchAssignments(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  membershipId: MembershipId,
  signal?: AbortSignal,
): Promise<MembershipBranchAssignmentDto[]> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/memberships/${membershipId}/branches`,
    signal,
  });

  return requireArray(
    envelope.data,
    isMembershipBranchAssignmentDto,
    "branch assignments",
  );
}

export async function assignMembershipBranch(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  membershipId: MembershipId,
  branchId: BranchId,
): Promise<MembershipBranchAssignmentDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "POST",
    path: `/workspaces/${workspaceId}/memberships/${membershipId}/branches/${branchId}`,
  });

  return requireShape(
    envelope.data,
    isMembershipBranchAssignmentDto,
    "branch assignment",
  );
}

export async function removeMembershipBranch(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  membershipId: MembershipId,
  branchId: BranchId,
): Promise<void> {
  await apiClient.request<ApiDataEnvelope<{ success: true }>>({
    method: "DELETE",
    path: `/workspaces/${workspaceId}/memberships/${membershipId}/branches/${branchId}`,
  });
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
