import { isApiError } from "@/lib/api";
import type { SupportLabels } from "@/i18n/support";
const authCodes = new Set([
  "AUTH_REQUIRED",
  "TWO_FACTOR_REQUIRED",
  "AUTH_SESSION_RESTRICTED",
  "PLATFORM_MEMBERSHIP_REQUIRED",
  "PLATFORM_MEMBERSHIP_INACTIVE",
]);
const targetCodes = new Set([
  "TARGET_WORKSPACE_NOT_FOUND",
  "WORKSPACE_NOT_FOUND",
]);
const policyCodes = new Set([
  "POLICY_NOT_FOUND",
  "POLICY_DISABLED",
  "POLICY_NOT_YET_VALID",
  "POLICY_EXPIRED",
  "TARGET_NOT_ALLOWED",
  "SESSION_TYPE_NOT_ALLOWED",
  "DURATION_NOT_ALLOWED",
  "WORKSPACE_NOT_ALLOWED",
  "IP_NOT_ALLOWED",
  "SUPPORT_ACCESS_DENIED",
]);
const keyCodes = new Set([
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_PREVIOUS_ATTEMPT_FAILED",
  "IDEMPOTENCY_CONFLICT",
]);
export function supportError(error: unknown, labels: SupportLabels): string {
  if (!isApiError(error)) return labels.failed;
  const code = error.code ?? "";
  if (authCodes.has(code)) return labels.auth;
  if (
    [
      "PERMISSION_DENIED",
      "SUPPORT_ACCESS_FORBIDDEN",
      "SUPPORT_SESSION_OWNERSHIP_REQUIRED",
    ].includes(code)
  )
    return labels.denied;
  if (targetCodes.has(code)) return labels.targetDenied;
  if (policyCodes.has(code)) return labels.accessDenied;
  if (keyCodes.has(code)) return labels.keyConflict;
  if (code === "IDEMPOTENCY_REQUEST_IN_PROGRESS") return labels.inProgress;
  if (code === "SUPPORT_SESSION_VERSION_CONFLICT") return labels.conflict;
  // Runtime failures and unknown codes are minimized; never render Backend messages.
  return labels.failed;
}
