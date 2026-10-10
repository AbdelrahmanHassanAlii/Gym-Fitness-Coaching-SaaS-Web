import type { PlatformWorkspaceDirectoryPageDto } from "@/contracts";
import { platformWorkspaceStatuses } from "@/contracts";
import { ApiError, type ApiClient } from "@/lib/api";
import { isOffsetTimestamp } from "@/lib/date-time";

export const platformWorkspacePageLimit = 50;
const objectIdPattern = /^[0-9a-f]{24}$/;
const statusSet = new Set<string>(platformWorkspaceStatuses);

export async function listPlatformWorkspaces(
  apiClient: ApiClient,
  cursor?: string,
  signal?: AbortSignal,
): Promise<PlatformWorkspaceDirectoryPageDto> {
  const response = await apiClient.request<unknown>({
    method: "GET",
    path: "/platform/workspaces",
    query: {
      ...(cursor === undefined ? {} : { cursor }),
      limit: platformWorkspacePageLimit,
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
        objectIdPattern.test(value.meta.nextCursor)
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
