import type { AuthorizationCacheContext } from "@/lib/server-state";

export interface NotificationCommandBoundary {
  accessContext: AuthorizationCacheContext;
  membershipId: string;
  principalId: string;
  workspaceId: string;
}

type CommandStatus = "ambiguous" | "pending";
const records = new Map<string, CommandStatus>();
const capacity = 64;

export const notificationCommandRegistry = {
  capacity,
  logicalId(
    boundary: NotificationCommandBoundary,
    action: "mark-all" | "mark-one",
    notificationId?: string,
  ): string {
    return JSON.stringify([
      boundary.principalId,
      boundary.workspaceId,
      boundary.membershipId,
      boundary.accessContext,
      action,
      notificationId ?? "current-inbox",
    ]);
  },
  begin(logicalId: string): "capacity" | "duplicate" | "started" {
    if (records.get(logicalId) === "pending") return "duplicate";
    if (!records.has(logicalId) && records.size >= capacity) return "capacity";
    records.set(logicalId, "pending");
    return "started";
  },
  ambiguous(logicalId: string): void {
    records.set(logicalId, "ambiguous");
  },
  retire(logicalId: string): void {
    records.delete(logicalId);
  },
  status(logicalId: string): CommandStatus | undefined {
    return records.get(logicalId);
  },
  hasAmbiguous(
    boundary: NotificationCommandBoundary,
    action: "mark-all" | "mark-one",
  ): boolean {
    const identity = [
      boundary.principalId,
      boundary.workspaceId,
      boundary.membershipId,
      boundary.accessContext,
    ];
    return [...records].some(([logicalId, status]) => {
      if (status !== "ambiguous") return false;
      try {
        const parsed = JSON.parse(logicalId) as unknown[];
        return (
          identity.every((part, index) => parsed[index] === part) &&
          parsed[4] === action
        );
      } catch {
        return false;
      }
    });
  },
  resetForTests(): void {
    records.clear();
  },
};
