import { createIdempotencyKey } from "@/lib/api/idempotency";
import { isApiError, type ApiClient } from "@/lib/api";
import {
  decodeContext,
  decodeSessionEnvelope,
  decodeStart,
  isObjectId,
  malformed,
  type StartBody,
} from "./contracts";

export interface StartIntent {
  readonly path: "/platform/support/access-requests";
  readonly key: string;
  readonly body: Readonly<StartBody>;
  readonly identity: string;
}
export function freezeStartIntent(
  body: StartBody,
  identity: string,
): StartIntent {
  return Object.freeze({
    path: "/platform/support/access-requests",
    key: createIdempotencyKey(),
    body: Object.freeze({ ...body }),
    identity,
  });
}
const safeOptions = {
  cache: "no-store",
  refreshOnUnauthorized: false,
} as const;
export async function startSupport(
  api: ApiClient,
  intent: StartIntent,
  signal?: AbortSignal,
) {
  return decodeStart(
    await api.request({
      ...safeOptions,
      path: intent.path,
      method: "POST",
      body: intent.body,
      idempotencyKey: intent.key,
      signal,
    }),
    intent.body,
  );
}
export async function readSession(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
) {
  if (!isObjectId(id)) malformed();
  return decodeSessionEnvelope(
    await api.request({
      ...safeOptions,
      path: `/platform/support/sessions/${id}`,
      method: "GET",
      signal,
    }),
    id,
  );
}
export async function terminateSession(
  api: ApiClient,
  id: string,
  version: number,
  action: "end" | "revoke",
  signal?: AbortSignal,
) {
  if (!isObjectId(id) || !Number.isSafeInteger(version) || version < 0)
    malformed();
  const session = decodeSessionEnvelope(
    await api.request({
      ...safeOptions,
      path: `/platform/support/sessions/${id}/${action}`,
      method: "POST",
      body: { expectedVersion: version },
      signal,
    }),
    id,
  );
  if (
    session.status !== (action === "end" ? "ENDED" : "REVOKED") ||
    session.version <= version
  )
    malformed();
  return session;
}
/** Only this verified read can carry the selector in V1. No generic runtime client. */
export async function readCurrentContext(
  api: ApiClient,
  id: string,
  workspaceId: string,
  signal?: AbortSignal,
) {
  if (!isObjectId(id) || !isObjectId(workspaceId)) malformed();
  return decodeContext(
    await api.request({
      ...safeOptions,
      path: "/me/support-context",
      method: "GET",
      supportSessionId: id,
      signal,
    }),
    id,
    workspaceId,
  );
}
export function uncertain(error: unknown): boolean {
  return (
    !isApiError(error) ||
    error.kind !== "backend" ||
    (error.status ?? 0) >= 500 ||
    [
      "IDEMPOTENCY_REQUEST_IN_PROGRESS",
      "IDEMPOTENCY_COMPLETION_CONFLICT",
    ].includes(error.code ?? "")
  );
}
export function errorCode(error: unknown): string {
  return isApiError(error) ? (error.code ?? "") : "";
}
