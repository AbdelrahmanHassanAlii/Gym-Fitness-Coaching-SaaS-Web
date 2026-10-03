import type {
  ApiDataEnvelope,
  CreateManualPaymentRequestDto,
  CreateManualPaymentResponseDto,
  ManualPaymentDto,
  WorkspaceId,
  WorkspaceSubscriptionReadModelDto,
  WorkspaceUsageReadModelDto,
} from "@/contracts";
import {
  isManualPaymentDto,
  isWorkspaceSubscriptionReadModelDto,
  isWorkspaceUsageReadModelDto,
} from "@/contracts";
import type { ApiClient } from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";

export const commercialKeys = {
  payments: (
    workspaceId: WorkspaceId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "commercial-payments",
      { generation },
      accessContext,
    ),
  subscription: (
    workspaceId: WorkspaceId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "commercial-subscription",
      { generation },
      accessContext,
    ),
  usage: (
    workspaceId: WorkspaceId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "commercial-usage",
      { generation },
      accessContext,
    ),
};

export async function getWorkspaceSubscription(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<WorkspaceSubscriptionReadModelDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/subscription`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isWorkspaceSubscriptionReadModelDto,
    "workspace subscription",
  );
  if (data.subscription.workspaceId !== workspaceId) {
    throw malformed("workspace subscription identity");
  }

  return data;
}

export async function getWorkspaceUsage(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<WorkspaceUsageReadModelDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/subscription/usage`,
    signal,
  });
  const data = requireShape(
    envelope.data,
    isWorkspaceUsageReadModelDto,
    "workspace usage",
  );
  if (data.usage.workspaceId !== workspaceId) {
    throw malformed("workspace usage identity");
  }

  return data;
}

export async function listWorkspacePayments(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<ManualPaymentDto[]> {
  const envelope = await apiClient.request<{
    data: unknown;
    meta?: { hasMore?: unknown; nextCursor?: unknown };
  }>({
    method: "GET",
    path: `/workspaces/${workspaceId}/payments`,
    signal,
  });
  const payments = requireArray(
    envelope.data,
    isManualPaymentDto,
    "workspace payments",
  );
  if (payments.some((payment) => payment.workspaceId !== workspaceId)) {
    throw malformed("workspace payment identity");
  }

  return payments;
}

export async function createManualPayment(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  body: CreateManualPaymentRequestDto,
  idempotencyKey: string,
): Promise<CreateManualPaymentResponseDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/payments`,
  });
  const data = envelope.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("payment" in data) ||
    !isManualPaymentDto(data.payment)
  ) {
    throw malformed("manual payment");
  }
  if (data.payment.workspaceId !== workspaceId) {
    throw malformed("manual payment identity");
  }

  return { payment: data.payment };
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
