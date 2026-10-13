import {
  ApiError,
  isApiError,
  type ApiClient,
  type ApiRequestOptions,
} from "@/lib/api";
import {
  decodeApproval,
  decodeCancel,
  decodeDeletionDetail,
  decodeDeletionList,
  decodeDownload,
  decodeError,
  decodeExportCreate,
  decodeExportDetail,
  decodeExportList,
  decodePostpone,
  malformed,
} from "./decoders";

function identifier(value: string): string {
  if (!/^[0-9a-f]{24}$/.test(value)) return malformed();
  return value;
}
// All Stage 17 traffic uses the native session. Mutations never replay automatically.
async function request<T>(
  client: ApiClient,
  options: ApiRequestOptions,
  decode: (v: unknown) => T,
): Promise<T> {
  try {
    return decode(
      await client.request<unknown>({
        ...options,
        cache: "no-store",
        supportSessionId: null,
        refreshOnUnauthorized: false,
        decodeError: (value) => ({
          error: {
            code: decodeError(value).code,
            message: "Data management request failed",
          },
        }),
      }),
    );
  } catch (error) {
    if (isApiError(error) && error.kind === "backend")
      throw new ApiError({
        kind: "backend",
        code: error.code,
        category: error.category,
        status: error.status,
        message: "Data management request failed",
      });
    throw error;
  }
}
const exportsPath = (workspaceId: string) =>
  `/workspaces/${identifier(workspaceId)}/exports`;
const deletionPath = (id: string) =>
  `/platform/workspace-deletions/${identifier(id)}`;
export const listExports = (
  c: ApiClient,
  w: string,
  cursor?: string,
  signal?: AbortSignal,
) =>
  request(
    c,
    { path: exportsPath(w), query: { cursor, limit: 25 }, signal },
    decodeExportList,
  );
export const getExport = async (
  c: ApiClient,
  w: string,
  id: string,
  signal?: AbortSignal,
) => {
  const row = await request(
    c,
    { path: `${exportsPath(w)}/${identifier(id)}`, signal },
    decodeExportDetail,
  );
  if (row.id !== id || row.workspaceId !== w) return malformed();
  return row;
};
export const createExport = (c: ApiClient, w: string, key: string) =>
  request(
    c,
    { path: exportsPath(w), method: "POST", idempotencyKey: key },
    decodeExportCreate,
  );
export const issueDownload = (c: ApiClient, w: string, id: string) =>
  request(
    c,
    {
      path: `${exportsPath(w)}/${identifier(id)}/download-url`,
      method: "POST",
    },
    decodeDownload,
  );
export const listDeletions = (
  c: ApiClient,
  after?: string,
  signal?: AbortSignal,
) =>
  request(
    c,
    {
      path: "/platform/workspace-deletions",
      query: { after, limit: 25 },
      signal,
    },
    decodeDeletionList,
  );
export const getDeletion = async (
  c: ApiClient,
  id: string,
  signal?: AbortSignal,
) => {
  const row = await request(
    c,
    { path: deletionPath(id), signal },
    decodeDeletionDetail,
  );
  if (row.id !== id) return malformed();
  return row;
};
export type DeletionAction = "approve" | "postpone" | "cancel";
export type ActionBody = {
  expectedVersion: number;
  reason: string;
  reviewAfter?: string;
};
export const mutateDeletion = (
  c: ApiClient,
  id: string,
  action: DeletionAction,
  body: ActionBody,
  key?: string,
) =>
  request(
    c,
    {
      path: `${deletionPath(id)}/${action}`,
      method: "POST",
      body,
      ...(action === "approve" ? { idempotencyKey: key } : {}),
    },
    action === "approve"
      ? decodeApproval
      : action === "postpone"
        ? decodePostpone
        : decodeCancel,
  );

// A one-shot browser navigation carries no API headers and no referrer.
export function handoffDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.referrerPolicy = "no-referrer";
  anchor.click();
  anchor.removeAttribute("href");
}
