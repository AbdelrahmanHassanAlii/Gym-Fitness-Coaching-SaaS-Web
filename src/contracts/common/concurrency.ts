export interface ExpectedVersionRequest {
  expectedVersion: number;
}

export const idempotencyRequirementLevels = [
  "REQUIRED",
  "NOT_REQUIRED",
  "NOT_APPLICABLE",
  "UNVERIFIED",
] as const;

export type IdempotencyRequirement =
  (typeof idempotencyRequirementLevels)[number];

export const idempotentCommandRouteGroups = [
  "workspace-invitation-acceptance",
  "lead-owner-activation-and-conversion",
  "commercial-payments-plans-and-subscriptions",
  "trainee-relationship-lifecycle-and-assignments",
  "training-program-activation-and-progress",
  "workout-start-complete-abandon-correct-skip-defer",
  "nutrition-plan-activation-and-selected-commands",
  "progress-measurements-and-selected-commands",
  "check-in-revision-assignment-submit-review",
  "file-upload-confirm-delete-restore-document-commands",
  "workspace-export-request",
  "support-access-request",
  "retention-deletion-approval",
] as const;

export type IdempotentCommandRouteGroup =
  (typeof idempotentCommandRouteGroups)[number];

const idempotentCommandRouteGroupSet = new Set<string>(
  idempotentCommandRouteGroups,
);

export function isIdempotentCommandRouteGroup(
  value: string | null | undefined,
): value is IdempotentCommandRouteGroup {
  return typeof value === "string" && idempotentCommandRouteGroupSet.has(value);
}
