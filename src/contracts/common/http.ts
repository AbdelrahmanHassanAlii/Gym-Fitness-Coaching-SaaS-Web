export const API_BASE_PATH = "/api/v1";

export interface ApiDataEnvelope<TData> {
  data: TData;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  correlationId?: string;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

export const authenticatedRequestHeaders = [
  "authorization",
  "content-type",
  "idempotency-key",
  "x-support-session-id",
] as const;

export type AuthenticatedRequestHeader =
  (typeof authenticatedRequestHeaders)[number];
