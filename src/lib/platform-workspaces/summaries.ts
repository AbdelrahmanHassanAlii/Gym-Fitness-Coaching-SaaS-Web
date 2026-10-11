import type {
  BillingPeriod,
  SubscriptionLifecycleStatus,
  WorkspaceId,
} from "@/contracts";
import { billingPeriods, subscriptionLifecycleStatuses } from "@/contracts";
import { ApiError, type ApiClient } from "@/lib/api";
import { isOffsetTimestamp } from "@/lib/date-time";

export interface SubscriptionSummary {
  workspaceId: WorkspaceId;
  subscription: null | {
    lifecycleStatus: SubscriptionLifecycleStatus;
    startedAt: string | null;
    expiresAt: string | null;
    graceEndsAt: string | null;
    frozenAt: string | null;
    expiredAt: string | null;
    cancelledAt: string | null;
    currentTerms: null | {
      planId: string;
      planName: string;
      planVersionId: string;
      billingPeriod: BillingPeriod;
      effectiveFrom: string;
      effectiveTo: string | null;
    };
  };
}
const lifecycleDates = [
  "startedAt",
  "expiresAt",
  "graceEndsAt",
  "frozenAt",
  "expiredAt",
  "cancelledAt",
] as const;

export async function getPlatformSubscriptionSummary(
  client: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<SubscriptionSummary> {
  const value = await client.request<unknown>({
    method: "GET",
    path: `/platform/workspaces/${workspaceId}/subscription-summary`,
    signal,
  });
  if (
    !exact(value, ["data"]) ||
    !exact(value.data, ["workspaceId", "subscription"]) ||
    value.data.workspaceId !== workspaceId ||
    !subscription(value.data.subscription)
  )
    throw malformed();
  return value.data as unknown as SubscriptionSummary;
}
function subscription(value: unknown): boolean {
  if (value === null) return true;
  if (!exact(value, ["lifecycleStatus", ...lifecycleDates, "currentTerms"]))
    return false;
  return (
    typeof value.lifecycleStatus === "string" &&
    (subscriptionLifecycleStatuses as readonly string[]).includes(
      value.lifecycleStatus,
    ) &&
    lifecycleDates.every((key) => date(value[key])) &&
    terms(value.currentTerms)
  );
}
function terms(value: unknown): boolean {
  if (value === null) return true;
  return (
    exact(value, [
      "planId",
      "planName",
      "planVersionId",
      "billingPeriod",
      "effectiveFrom",
      "effectiveTo",
    ]) &&
    id(value.planId) &&
    id(value.planVersionId) &&
    typeof value.planName === "string" &&
    value.planName.trim().length > 0 &&
    typeof value.billingPeriod === "string" &&
    (billingPeriods as readonly string[]).includes(value.billingPeriod) &&
    typeof value.effectiveFrom === "string" &&
    isOffsetTimestamp(value.effectiveFrom) &&
    date(value.effectiveTo)
  );
}
function date(value: unknown): boolean {
  return (
    value === null || (typeof value === "string" && isOffsetTimestamp(value))
  );
}
function id(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
}
function exact(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function malformed() {
  return new ApiError({
    category: "unknown",
    kind: "malformed-response",
    message: "Malformed Platform workspace summary response",
  });
}

export interface WorkspaceCounts {
  workspaceId: WorkspaceId;
  counts: {
    branches: { active: number };
    trainees: { active: number; needsReassignment: number };
    staff: { activeIncludingOwners: number };
  };
}
export async function getPlatformWorkspaceCounts(
  client: ApiClient,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<WorkspaceCounts> {
  const value = await client.request<unknown>({
    method: "GET",
    path: `/platform/workspaces/${workspaceId}/counts`,
    signal,
  });
  if (
    !exact(value, ["data"]) ||
    !exact(value.data, ["workspaceId", "counts"]) ||
    value.data.workspaceId !== workspaceId ||
    !exact(value.data.counts, ["branches", "trainees", "staff"])
  )
    throw malformed();
  const { branches, trainees, staff } = value.data.counts;
  if (
    !exact(branches, ["active"]) ||
    !count(branches.active) ||
    !exact(trainees, ["active", "needsReassignment"]) ||
    !count(trainees.active) ||
    !count(trainees.needsReassignment) ||
    !exact(staff, ["activeIncludingOwners"]) ||
    !count(staff.activeIncludingOwners)
  )
    throw malformed();
  return value.data as unknown as WorkspaceCounts;
}
function count(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
