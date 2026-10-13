import { ApiError } from "@/lib/api";
import { isOffsetTimestamp } from "@/lib/date-time";

export const exportStatuses = [
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED",
  "EXPIRED",
] as const;
export const deletionStatuses = [
  "PENDING_APPROVAL",
  "POSTPONED",
  "CANCELLED",
  "APPROVED",
  "PROCESSING",
  "FAILED",
  "COMPLETED",
] as const;
export interface ExportDto {
  id: string;
  workspaceId: string;
  requestedByUserId: string;
  status: (typeof exportStatuses)[number];
  requestedAt: string;
  completedAt?: string;
  failedAt?: string;
  expiresAt?: string;
  expiredAt?: string;
  failure?: { code: string; retryable: false };
  format: "ZIP_JSON_V1";
  manifestVersion: 1;
  version: number;
}
export interface DeletionDto {
  id: string;
  workspaceId: string;
  subscriptionId: string;
  status: (typeof deletionStatuses)[number];
  eligibilityBasis: { expiredAt: string; eligibilityAt: string };
  reviewAfter?: string;
  approvedAt?: string;
  cancelledAt?: string;
  completedAt?: string;
  liveDataDeletedAt?: string;
  backupExpiryAt?: string;
  currentStep?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export function malformed(): never {
  throw new ApiError({
    kind: "malformed-response",
    message: "Invalid data management response",
  });
}
function record(
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return malformed();
  const result = value as Record<string, unknown>;
  if (
    required.some((k) => !Object.hasOwn(result, k)) ||
    Object.keys(result).some((k) => ![...required, ...optional].includes(k))
  )
    return malformed();
  return result;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return malformed();
  return value;
}
function id(value: unknown): string {
  const result = string(value);
  if (!/^[0-9a-f]{24}$/.test(result)) return malformed();
  return result;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !isOffsetTimestamp(value))
    return malformed();
  return value;
}
function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    return malformed();
  return value;
}
function dates(
  value: Record<string, unknown>,
  fields: string[],
): Record<string, string> {
  return Object.fromEntries(
    fields
      .filter((k) => Object.hasOwn(value, k))
      .map((k) => [k, timestamp(value[k])]),
  );
}
export function decodeExport(value: unknown): ExportDto {
  const v = record(
    value,
    [
      "id",
      "workspaceId",
      "requestedByUserId",
      "status",
      "requestedAt",
      "format",
      "manifestVersion",
      "version",
    ],
    ["completedAt", "failedAt", "expiresAt", "expiredAt", "failure"],
  );
  if (
    !exportStatuses.includes(v.status as ExportDto["status"]) ||
    v.format !== "ZIP_JSON_V1" ||
    v.manifestVersion !== 1
  )
    return malformed();
  let failure: ExportDto["failure"];
  if (Object.hasOwn(v, "failure")) {
    const f = record(v.failure, ["code", "retryable"]);
    if (f.retryable !== false) return malformed();
    failure = { code: string(f.code), retryable: false };
  }
  return {
    id: id(v.id),
    workspaceId: id(v.workspaceId),
    requestedByUserId: id(v.requestedByUserId),
    status: v.status as ExportDto["status"],
    requestedAt: timestamp(v.requestedAt),
    format: "ZIP_JSON_V1",
    manifestVersion: 1,
    version: version(v.version),
    ...dates(v, ["completedAt", "failedAt", "expiresAt", "expiredAt"]),
    ...(failure ? { failure } : {}),
  };
}
export function decodeDeletion(value: unknown): DeletionDto {
  const v = record(
    value,
    [
      "id",
      "workspaceId",
      "subscriptionId",
      "status",
      "eligibilityBasis",
      "version",
      "createdAt",
      "updatedAt",
    ],
    [
      "reviewAfter",
      "approvedAt",
      "cancelledAt",
      "completedAt",
      "liveDataDeletedAt",
      "backupExpiryAt",
      "currentStep",
    ],
  );
  if (!deletionStatuses.includes(v.status as DeletionDto["status"]))
    return malformed();
  const basis = record(v.eligibilityBasis, ["expiredAt", "eligibilityAt"]);
  return {
    id: id(v.id),
    workspaceId: id(v.workspaceId),
    subscriptionId: id(v.subscriptionId),
    status: v.status as DeletionDto["status"],
    eligibilityBasis: {
      expiredAt: timestamp(basis.expiredAt),
      eligibilityAt: timestamp(basis.eligibilityAt),
    },
    version: version(v.version),
    createdAt: timestamp(v.createdAt),
    updatedAt: timestamp(v.updatedAt),
    ...dates(v, [
      "reviewAfter",
      "approvedAt",
      "cancelledAt",
      "completedAt",
      "liveDataDeletedAt",
      "backupExpiryAt",
    ]),
    ...(Object.hasOwn(v, "currentStep")
      ? { currentStep: string(v.currentStep) }
      : {}),
  };
}
export function decodeExportCreate(value: unknown): ExportDto {
  return decodeExport(record(record(value, ["data"]).data, ["export"]).export);
}
export function decodeExportDetail(value: unknown): ExportDto {
  return decodeExport(record(value, ["export"]).export);
}
export function decodeExportList(value: unknown): {
  items: ExportDto[];
  nextCursor: string | null;
} {
  const v = record(value, ["data", "meta"]),
    meta = record(v.meta, ["hasMore", "nextCursor"]);
  if (!Array.isArray(v.data) || meta.hasMore !== false) return malformed();
  return {
    items: v.data.map(decodeExport),
    nextCursor: meta.nextCursor === null ? null : string(meta.nextCursor),
  };
}
export function decodeDownload(value: unknown): {
  url: string;
  expiresAt: string;
} {
  const v = record(record(value, ["data"]).data, ["url", "expiresAt"]);
  const url = string(v.url);
  try {
    const parsed = new URL(url);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return malformed();
  } catch {
    return malformed();
  }
  return { url, expiresAt: timestamp(v.expiresAt) };
}
export function decodeDeletionList(value: unknown): {
  items: DeletionDto[];
  nextCursor: string | null;
} {
  const v = record(value, ["items"], ["nextCursor"]);
  if (!Array.isArray(v.items)) return malformed();
  return {
    items: v.items.map(decodeDeletion),
    nextCursor: Object.hasOwn(v, "nextCursor") ? id(v.nextCursor) : null,
  };
}
export function decodeDeletionDetail(value: unknown): DeletionDto {
  return decodeDeletion(record(value, ["deletion"]).deletion);
}
export function decodeApproval(value: unknown): DeletionDto {
  return decodeDeletion(
    record(record(value, ["data"]).data, ["deletion"]).deletion,
  );
}
export const decodePostpone = decodeDeletionDetail;
export const decodeCancel = decodeDeletionDetail;
export function decodeError(value: unknown): { code: string } {
  const v = record(
    record(value, ["error"]).error,
    ["code", "message"],
    ["details", "correlationId"],
  );
  string(v.message);
  if (Object.hasOwn(v, "correlationId")) string(v.correlationId);
  return { code: string(v.code) };
}
