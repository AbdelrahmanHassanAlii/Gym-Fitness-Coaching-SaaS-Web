import type {
  PlatformWorkspaceDetailDto,
  PlatformWorkspaceDirectoryPageDto,
  PlatformWorkspaceStatus,
  WorkspaceId,
} from "@/contracts";
import { platformWorkspaceStatuses, workspaceTypes } from "@/contracts";
import { ApiError, type ApiClient } from "@/lib/api";
import { isOffsetTimestamp } from "@/lib/date-time";

export const platformWorkspacePageLimit = 50;
const objectIdPattern = /^[0-9a-f]{24}$/;
const statusSet = new Set<string>(platformWorkspaceStatuses);
const typeSet = new Set<string>(workspaceTypes);

export interface PlatformWorkspaceDirectoryRequest {
  cursor?: string;
  q?: string;
  status?: PlatformWorkspaceStatus;
}

export async function listPlatformWorkspaces(
  apiClient: ApiClient,
  request: PlatformWorkspaceDirectoryRequest = {},
  signal?: AbortSignal,
): Promise<PlatformWorkspaceDirectoryPageDto> {
  const response = await apiClient.request<unknown>({
    method: "GET",
    path: "/platform/workspaces",
    query: {
      ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
      limit: platformWorkspacePageLimit,
      ...(request.q === undefined ? {} : { q: request.q }),
      ...(request.status === undefined ? {} : { status: request.status }),
    },
    signal,
  });

  if (!isDirectoryPage(response)) {
    throw new ApiError({
      category: "unknown",
      kind: "malformed-response",
      message: "Malformed Platform workspace directory response",
    });
  }

  return response;
}

export async function getPlatformWorkspace(
  apiClient: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<PlatformWorkspaceDetailDto> {
  const response = await apiClient.request<unknown>({
    method: "GET",
    path: `/platform/workspaces/${workspaceId}`,
    signal,
  });
  if (!isPlatformWorkspaceDetail(response)) {
    throw new ApiError({
      category: "unknown",
      kind: "malformed-response",
      message: "Malformed Platform workspace detail response",
    });
  }
  return response;
}

function isDirectoryPage(
  value: unknown,
): value is PlatformWorkspaceDirectoryPageDto {
  if (
    !isExactRecord(value, ["data", "meta"]) ||
    !Array.isArray(value.data) ||
    !value.data.every(isDirectoryRow) ||
    !isExactRecord(value.meta, ["hasMore", "nextCursor"]) ||
    typeof value.meta.hasMore !== "boolean"
  ) {
    return false;
  }

  const ids = value.data.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) return false;

  return value.meta.hasMore
    ? typeof value.meta.nextCursor === "string" &&
        value.meta.nextCursor.length > 0
    : value.meta.nextCursor === null;
}

function isDirectoryRow(
  value: unknown,
): value is PlatformWorkspaceDirectoryPageDto["data"][number] {
  return (
    isExactRecord(value, ["createdAt", "id", "name", "status"]) &&
    typeof value.id === "string" &&
    objectIdPattern.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.status === "string" &&
    statusSet.has(value.status) &&
    typeof value.createdAt === "string" &&
    isOffsetTimestamp(value.createdAt)
  );
}

function isPlatformWorkspaceDetail(
  value: unknown,
): value is PlatformWorkspaceDetailDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const optionalKeys = ["city", "country", "governorate"] as const;
  const expectedKeys = [
    "createdAt",
    "defaultLanguage",
    "id",
    "name",
    "status",
    "timezone",
    "type",
    ...optionalKeys.filter((key) => record[key] !== undefined),
  ];
  return (
    isExactRecord(value, expectedKeys) &&
    typeof record.id === "string" &&
    objectIdPattern.test(record.id) &&
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    typeof record.type === "string" &&
    typeSet.has(record.type) &&
    typeof record.status === "string" &&
    statusSet.has(record.status) &&
    typeof record.timezone === "string" &&
    record.timezone.length > 0 &&
    (record.defaultLanguage === "ar" || record.defaultLanguage === "en") &&
    typeof record.createdAt === "string" &&
    isOffsetTimestamp(record.createdAt) &&
    optionalKeys.every(
      (key) => record[key] === undefined || typeof record[key] === "string",
    )
  );
}

function isExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}
