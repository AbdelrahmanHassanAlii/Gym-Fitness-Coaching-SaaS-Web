import type {
  ApiDataEnvelope,
  ConfirmUploadRequestDto,
  ConfirmUploadResponseDto,
  CreateDocumentRequestDto,
  CreateUploadIntentRequestDto,
  DocumentCommandResponseDto,
  DocumentDto,
  DocumentId,
  DocumentPageDto,
  DownloadUrlDto,
  FileId,
  RelationshipId,
  UploadIntentDto,
  WorkspaceId,
} from "@/contracts";
import {
  isConfirmUploadResponseDto,
  isDocumentCommandResponseDto,
  isDocumentDto,
  isDocumentPageDto,
  isDownloadUrlDto,
  isUploadIntentDto,
} from "@/contracts";
import type { ApiClient } from "@/lib/api";
import { ApiError, serializeQueryParams } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";

export const documentsPageLimit = 25;

export const fileKeys = {
  document: (
    workspaceId: WorkspaceId,
    membershipId: string,
    relationshipId: RelationshipId,
    documentId: DocumentId,
    generation: number,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceDetail(
      workspaceId,
      "documents-document",
      { documentId, generation, membershipId, relationshipId },
      accessContext,
    ),
  documents: (
    workspaceId: WorkspaceId,
    membershipId: string,
    relationshipId: RelationshipId,
    generation: number,
    cursor?: string,
    accessContext: AuthorizationCacheContext = "user",
  ) =>
    appQueryKeys.workspaceList(
      workspaceId,
      "documents",
      {
        cursor: cursor ?? null,
        generation,
        limit: documentsPageLimit,
        membershipId,
        relationshipId,
      },
      accessContext,
    ),
};

export interface ProviderUploadProgress {
  indeterminate: boolean;
  loaded: number;
  total?: number;
}

export interface ProviderUploadRequest {
  body: Blob;
  headers: Record<string, string>;
  method: "PUT";
  onProgress?: (progress: ProviderUploadProgress) => void;
  signal?: AbortSignal;
  url: string;
}

export async function createUploadIntent(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  body: CreateUploadIntentRequestDto,
  idempotencyKey: string,
): Promise<UploadIntentDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/files/upload-intents`,
  });
  const data = requireShape(envelope.data, isUploadIntentDto, "upload intent");
  if (data.uploadRequest.url !== data.uploadUrl) {
    throw malformed("upload intent URL identity");
  }
  return data;
}

export async function confirmUpload(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  uploadIntentId: string,
  body: ConfirmUploadRequestDto,
  idempotencyKey: string,
): Promise<ConfirmUploadResponseDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/files/upload-intents/${uploadIntentId}/confirm`,
  });
  return requireShape(
    envelope.data,
    isConfirmUploadResponseDto,
    "confirm upload",
  );
}

export async function uploadProviderObject({
  body,
  headers,
  method,
  onProgress,
  signal,
  url,
}: ProviderUploadRequest): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const abort = () => {
      if (!settled) {
        xhr.abort();
      }
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", abort);
      reject(error);
    };

    const succeed = () => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", abort);
      resolve();
    };

    xhr.upload.onprogress = (event) => {
      onProgress?.({
        indeterminate: !event.lengthComputable || event.total <= 0,
        loaded: event.loaded,
        ...(event.lengthComputable && event.total > 0
          ? { total: event.total }
          : {}),
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        succeed();
        return;
      }

      fail(
        new ApiError({
          category: xhr.status === 412 ? "provider-or-storage" : "unknown",
          code: xhr.status === 412 ? "PROVIDER_PRECONDITION_FAILED" : undefined,
          kind: "backend",
          message: `Provider upload failed with HTTP ${xhr.status}`,
          status: xhr.status,
        }),
      );
    };
    xhr.onerror = () =>
      fail(
        new ApiError({
          category: "provider-or-storage",
          kind: "network",
          message: "Provider upload failed before receiving a response",
        }),
      );
    xhr.onabort = () =>
      fail(
        new ApiError({
          category: "provider-or-storage",
          kind: "abort",
          message: "Provider upload was aborted locally",
        }),
      );
    xhr.ontimeout = () =>
      fail(
        new ApiError({
          category: "provider-or-storage",
          kind: "network",
          message: "Provider upload timed out",
        }),
      );

    xhr.open(method, url);
    for (const [header, value] of Object.entries(headers)) {
      if (header.toLowerCase() !== "content-length") {
        xhr.setRequestHeader(header, value);
      }
    }

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(body);
  });
}

export async function listDocuments(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  cursor?: string,
  signal?: AbortSignal,
): Promise<DocumentPageDto> {
  const query = serializeQueryParams({
    cursor,
    limit: documentsPageLimit,
  });
  const page = await apiClient.request<unknown>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/documents?${query}`,
    signal,
  });
  return requireShape(page, isDocumentPageDto, "documents page");
}

export async function getDocument(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  documentId: DocumentId,
  signal?: AbortSignal,
): Promise<DocumentDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "GET",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/documents/${documentId}`,
    signal,
  });
  return requireShape(envelope.data, isDocumentDto, "document");
}

export async function createDocument(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  body: CreateDocumentRequestDto,
  idempotencyKey: string,
): Promise<DocumentCommandResponseDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method: "POST",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/documents`,
  });
  return requireShape(
    envelope.data,
    isDocumentCommandResponseDto,
    "document create",
  );
}

export async function createDownloadUrl(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  fileId: FileId,
): Promise<DownloadUrlDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "POST",
    path: `/workspaces/${workspaceId}/files/${fileId}/download-url`,
  });
  return requireShape(envelope.data, isDownloadUrlDto, "download URL");
}

export async function deleteDocument(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  relationshipId: RelationshipId,
  documentId: DocumentId,
  body: { expectedVersion: number },
  idempotencyKey: string,
): Promise<DocumentCommandResponseDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    body,
    idempotencyKey,
    method: "DELETE",
    path: `/workspaces/${workspaceId}/relationships/${relationshipId}/documents/${documentId}`,
  });
  return requireShape(
    envelope.data,
    isDocumentCommandResponseDto,
    "document delete",
  );
}

function requireShape<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
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
