import type { WorkspaceId } from "@/contracts/common/ids";

export const subscriptionLifecycleStatuses = [
  "PENDING_ACTIVATION",
  "TRIAL",
  "ACTIVE",
  "GRACE_PERIOD",
  "FROZEN",
  "EXPIRED",
  "CANCELLED",
] as const;
export const billingPeriods = ["MONTHLY", "YEARLY"] as const;
export const subscriptionTermSources = [
  "TRIAL",
  "PURCHASE",
  "UPGRADE",
  "DOWNGRADE",
  "ADMIN_OVERRIDE",
] as const;
export const manualPaymentStatuses = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export const commercialAccessModes = [
  "WRITE",
  "READ_ONLY",
  "BILLING_RECOVERY_ONLY",
] as const;
export const usageComplianceStates = [
  "WITHIN_LIMIT",
  "OVER_TRAINEE_LIMIT",
  "OVER_STAFF_LIMIT",
  "OVER_STORAGE_LIMIT",
  "MULTIPLE_LIMIT_VIOLATIONS",
] as const;

export type SubscriptionLifecycleStatus =
  (typeof subscriptionLifecycleStatuses)[number];
export type BillingPeriod = (typeof billingPeriods)[number];
export type SubscriptionTermSource = (typeof subscriptionTermSources)[number];
export type ManualPaymentStatus = (typeof manualPaymentStatuses)[number];
export type CommercialAccessMode = (typeof commercialAccessModes)[number];
export type UsageCompliance = (typeof usageComplianceStates)[number];

export interface SubscriptionLimitsDto {
  activeTrainees?: number;
  activeStaff?: number;
  storageBytes: number;
}

export interface WorkspaceSubscriptionDto {
  id: string;
  workspaceId: WorkspaceId;
  lifecycleStatus: SubscriptionLifecycleStatus;
  currentTermsId?: string;
  startedAt?: string;
  expiresAt?: string;
  graceEndsAt?: string;
  frozenAt?: string;
  expiredAt?: string;
  cancelledAt?: string;
  version: number;
}

export interface SubscriptionTermsDto {
  id: string;
  subscriptionId: string;
  workspaceId: WorkspaceId;
  planVersionId: string;
  billingPeriod: BillingPeriod;
  limits: SubscriptionLimitsDto;
  enabledFeatures: readonly string[];
  effectiveFrom: string;
  effectiveTo?: string;
  source: SubscriptionTermSource;
}

export interface WorkspaceUsageDto {
  workspaceId: WorkspaceId;
  activeTrainees: number;
  activeStaff: number;
  storageBytes: number;
  reservedStorageBytes: number;
  calculatedAt: string;
}

export interface WorkspaceSubscriptionReadModelDto {
  subscription: WorkspaceSubscriptionDto;
  lifecycleStatus: SubscriptionLifecycleStatus;
  usageCompliance: UsageCompliance;
  accessMode: CommercialAccessMode;
  currentTerms: SubscriptionTermsDto | null;
  limits: SubscriptionLimitsDto | null;
  usage: WorkspaceUsageDto;
}

export interface WorkspaceUsageReadModelDto {
  usage: WorkspaceUsageDto;
  limits?: SubscriptionLimitsDto;
  usageCompliance: UsageCompliance;
}

export interface ManualPaymentDto {
  id: string;
  workspaceId: WorkspaceId;
  subscriptionId?: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentReference?: string;
  paidAt?: string;
  status: ManualPaymentStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  notes?: string;
  version: number;
  createdAt: string;
}

export interface CreateManualPaymentRequestDto {
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentReference?: string;
  paidAt?: string;
  notes?: string;
}

export interface CreateManualPaymentResponseDto {
  payment: ManualPaymentDto;
}

const lifecycleSet = new Set<string>(subscriptionLifecycleStatuses);
const billingPeriodSet = new Set<string>(billingPeriods);
const termSourceSet = new Set<string>(subscriptionTermSources);
const paymentStatusSet = new Set<string>(manualPaymentStatuses);
const accessModeSet = new Set<string>(commercialAccessModes);
const usageComplianceSet = new Set<string>(usageComplianceStates);

export function isWorkspaceSubscriptionReadModelDto(
  value: unknown,
): value is WorkspaceSubscriptionReadModelDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isWorkspaceSubscriptionDto(value.subscription) &&
    value.lifecycleStatus === value.subscription.lifecycleStatus &&
    typeof value.usageCompliance === "string" &&
    usageComplianceSet.has(value.usageCompliance) &&
    typeof value.accessMode === "string" &&
    accessModeSet.has(value.accessMode) &&
    (value.currentTerms === null ||
      isSubscriptionTermsDto(value.currentTerms)) &&
    (value.limits === null || isSubscriptionLimitsDto(value.limits)) &&
    isWorkspaceUsageDto(value.usage) &&
    value.subscription.workspaceId === value.usage.workspaceId &&
    (value.currentTerms === null ||
      value.currentTerms.workspaceId === value.subscription.workspaceId)
  );
}

export function isWorkspaceUsageReadModelDto(
  value: unknown,
): value is WorkspaceUsageReadModelDto {
  return (
    isRecord(value) &&
    isWorkspaceUsageDto(value.usage) &&
    (value.limits === undefined || isSubscriptionLimitsDto(value.limits)) &&
    typeof value.usageCompliance === "string" &&
    usageComplianceSet.has(value.usageCompliance)
  );
}

export function isManualPaymentDto(value: unknown): value is ManualPaymentDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workspaceId === "string" &&
    (value.subscriptionId === undefined ||
      typeof value.subscriptionId === "string") &&
    isNonNegativeFiniteNumber(value.amount) &&
    typeof value.currency === "string" &&
    /^[A-Z]{3}$/.test(value.currency) &&
    typeof value.paymentMethod === "string" &&
    (value.paymentReference === undefined ||
      typeof value.paymentReference === "string") &&
    (value.paidAt === undefined || typeof value.paidAt === "string") &&
    typeof value.status === "string" &&
    paymentStatusSet.has(value.status) &&
    (value.reviewedBy === undefined || typeof value.reviewedBy === "string") &&
    (value.reviewedAt === undefined || typeof value.reviewedAt === "string") &&
    (value.rejectionReason === undefined ||
      typeof value.rejectionReason === "string") &&
    (value.notes === undefined || typeof value.notes === "string") &&
    typeof value.version === "number" &&
    Number.isFinite(value.version) &&
    typeof value.createdAt === "string"
  );
}

function isWorkspaceSubscriptionDto(
  value: unknown,
): value is WorkspaceSubscriptionDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workspaceId === "string" &&
    typeof value.lifecycleStatus === "string" &&
    lifecycleSet.has(value.lifecycleStatus) &&
    (value.currentTermsId === undefined ||
      typeof value.currentTermsId === "string") &&
    (value.startedAt === undefined || typeof value.startedAt === "string") &&
    (value.expiresAt === undefined || typeof value.expiresAt === "string") &&
    (value.graceEndsAt === undefined ||
      typeof value.graceEndsAt === "string") &&
    (value.frozenAt === undefined || typeof value.frozenAt === "string") &&
    (value.expiredAt === undefined || typeof value.expiredAt === "string") &&
    (value.cancelledAt === undefined ||
      typeof value.cancelledAt === "string") &&
    typeof value.version === "number" &&
    Number.isFinite(value.version)
  );
}

function isSubscriptionTermsDto(value: unknown): value is SubscriptionTermsDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.subscriptionId === "string" &&
    typeof value.workspaceId === "string" &&
    typeof value.planVersionId === "string" &&
    typeof value.billingPeriod === "string" &&
    billingPeriodSet.has(value.billingPeriod) &&
    isSubscriptionLimitsDto(value.limits) &&
    Array.isArray(value.enabledFeatures) &&
    value.enabledFeatures.every((item) => typeof item === "string") &&
    typeof value.effectiveFrom === "string" &&
    (value.effectiveTo === undefined ||
      typeof value.effectiveTo === "string") &&
    typeof value.source === "string" &&
    termSourceSet.has(value.source)
  );
}

function isSubscriptionLimitsDto(
  value: unknown,
): value is SubscriptionLimitsDto {
  return (
    isRecord(value) &&
    (value.activeTrainees === undefined ||
      isNonNegativeFiniteNumber(value.activeTrainees)) &&
    (value.activeStaff === undefined ||
      isNonNegativeFiniteNumber(value.activeStaff)) &&
    isNonNegativeFiniteNumber(value.storageBytes)
  );
}

function isWorkspaceUsageDto(value: unknown): value is WorkspaceUsageDto {
  return (
    isRecord(value) &&
    typeof value.workspaceId === "string" &&
    isNonNegativeFiniteNumber(value.activeTrainees) &&
    isNonNegativeFiniteNumber(value.activeStaff) &&
    isNonNegativeFiniteNumber(value.storageBytes) &&
    isNonNegativeFiniteNumber(value.reservedStorageBytes) &&
    typeof value.calculatedAt === "string"
  );
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
