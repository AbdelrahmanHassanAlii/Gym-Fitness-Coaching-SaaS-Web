import type { ApiError } from "@/lib/api";

export type BackendValidationSummary = {
  code: string;
  globalMessage: string;
  rawDetails: unknown;
};

export function getBackendValidationSummary(
  error: unknown,
): BackendValidationSummary | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("kind" in error) ||
    !("category" in error)
  ) {
    return null;
  }

  const apiError = error as ApiError;

  if (apiError.kind !== "backend" || apiError.category !== "validation") {
    return null;
  }

  return {
    code: apiError.code ?? "VALIDATION_FAILED",
    globalMessage: apiError.message,
    rawDetails: apiError.details,
  };
}
