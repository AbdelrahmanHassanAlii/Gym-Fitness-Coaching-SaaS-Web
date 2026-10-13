import { isApiError } from "@/lib/api";
import type { DataManagementLabels } from "@/i18n/data-management";

// Owned by the route's real actor/membership/resource identity. Temporary
// permission revalidation may hide children without losing a sent intent.
export class MemoryIntent<T> {
  constructor(readonly identity: string = "") {}
  private value: T | null = null;
  get(): T | null {
    return this.value;
  }
  set(value: T | null): void {
    this.value = value;
  }
}
export class MemoryRows<T extends { id: string; version: number }> {
  private rows: T[] = [];
  constructor(readonly identity: string = "") {}
  read(): T[] {
    return this.rows;
  }
  merge(incoming: T[]): T[] {
    this.rows = mergeVersions(this.rows, incoming);
    return this.rows;
  }
}

export function mergeVersions<T extends { id: string; version: number }>(
  current: T[],
  incoming: T[],
): T[] {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    const previous = rows.get(row.id);
    if (!previous || row.version >= previous.version) rows.set(row.id, row);
  }
  return [...rows.values()];
}
export function isUncertain(error: unknown): boolean {
  return (
    !isApiError(error) || error.kind !== "backend" || (error.status ?? 0) >= 500
  );
}
export function errorMessage(
  error: unknown,
  labels: DataManagementLabels,
): string {
  if (!isApiError(error)) return labels.errors.generic;
  if (error.kind === "malformed-response") return labels.errors.malformed;
  const code = error.code ?? "";
  if (code.startsWith("AUTH_")) return labels.errors.auth;
  if (code === "TWO_FACTOR_REQUIRED") return labels.errors.mfa;
  if (code.includes("SUPPORT")) return labels.errors.support;
  if (code.includes("PERMISSION") || code.includes("MEMBERSHIP"))
    return labels.denied;
  if (code === "ACTIVE_EXPORT_EXISTS") return labels.errors.active;
  if (code === "EXPORT_NOT_ALLOWED_FOR_SUBSCRIPTION")
    return labels.errors.subscription;
  if (code === "WORKSPACE_INACTIVE") return labels.errors.inactive;
  if (
    code === "WORKSPACE_DELETION_LOCKED" ||
    code === "WORKSPACE_DELETION_LOCK_CONFLICT"
  )
    return labels.errors.locked;
  if (code === "EXPORT_NOT_READY" || code === "EXPORT_ARTIFACT_NOT_READY")
    return labels.errors.notReady;
  if (code === "WORKSPACE_DELETION_VERSION_CONFLICT")
    return labels.errors.conflict;
  if (code === "WORKSPACE_DELETION_INVALID_TRANSITION")
    return labels.errors.transition;
  if (code.includes("ELIGIB")) return labels.errors.eligibility;
  if (code.endsWith("NOT_FOUND")) return labels.errors.missing;
  if (code.startsWith("IDEMPOTENCY_")) return labels.errors.idempotency;
  return labels.errors.generic;
}
export function canReview(status: string): boolean {
  return status === "PENDING_APPROVAL" || status === "POSTPONED";
}
export function activeExport(status: string): boolean {
  return status === "PENDING" || status === "PROCESSING";
}
export function decisionAlive(deadline: string | null | undefined): boolean {
  return !deadline || Date.parse(deadline) > Date.now();
}
