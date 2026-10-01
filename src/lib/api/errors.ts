import type { ApiErrorEnvelope } from "@/contracts";

export type ApiErrorKind =
  "backend" | "network" | "abort" | "malformed-response" | "non-json-response";

export type ApiErrorCategory =
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "expected-version-conflict"
  | "idempotency-conflict"
  | "entitlement-or-quota"
  | "support-access"
  | "provider-or-storage"
  | "unknown";

export interface ApiErrorOptions {
  category?: ApiErrorCategory;
  cause?: unknown;
  code?: string;
  correlationId?: string;
  details?: unknown;
  kind: ApiErrorKind;
  message: string;
  status?: number;
}

export class ApiError extends Error {
  readonly category: ApiErrorCategory;
  readonly code?: string;
  readonly correlationId?: string;
  readonly details?: unknown;
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(options: ApiErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "ApiError";
    this.kind = options.kind;
    this.category = options.category ?? "unknown";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.correlationId = options.correlationId;
  }
}

export function createBackendApiError(
  status: number,
  envelope: ApiErrorEnvelope,
): ApiError {
  return new ApiError({
    category: classifyBackendError(status, envelope.error.code),
    code: envelope.error.code,
    correlationId: envelope.error.correlationId,
    details: envelope.error.details,
    kind: "backend",
    message: envelope.error.message,
    status,
  });
}

export function classifyBackendError(
  status: number,
  code: string,
): ApiErrorCategory {
  if (code === "VALIDATION_FAILED") {
    return "validation";
  }

  if (
    code === "AUTH_REQUIRED" ||
    code === "AUTH_TOKEN_EXPIRED" ||
    code === "AUTH_TOKEN_INVALID" ||
    code === "REFRESH_TOKEN_INVALID"
  ) {
    return "unauthenticated";
  }

  if (code.includes("VERSION_CONFLICT") || code.includes("REVISION_CONFLICT")) {
    return "expected-version-conflict";
  }

  if (code.includes("IDEMPOTENCY")) {
    return "idempotency-conflict";
  }

  if (
    code.includes("ENTITLEMENT") ||
    code.includes("QUOTA") ||
    code.includes("PLAN_LIMIT")
  ) {
    return "entitlement-or-quota";
  }

  if (code.includes("SUPPORT")) {
    return "support-access";
  }

  if (
    code.includes("STORAGE") ||
    code.includes("PROVIDER") ||
    code.includes("UPLOAD")
  ) {
    return "provider-or-storage";
  }

  if (status === 401) {
    return "unauthenticated";
  }

  if (status === 403) {
    return "forbidden";
  }

  if (status === 404) {
    return "not-found";
  }

  return "unknown";
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
