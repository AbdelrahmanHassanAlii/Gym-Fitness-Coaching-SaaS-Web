import { isApiError } from "@/lib/api";

export function isPlatformAccessVersionConflict(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.code === "PLATFORM_MEMBERSHIP_ACCESS_VERSION_CONFLICT"
  );
}
