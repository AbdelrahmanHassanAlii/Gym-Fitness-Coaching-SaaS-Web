import type { MembershipId, UserId } from "@/contracts";
import { createQueryKey, type AppQueryKey } from "@/lib/server-state";

export interface PlatformWorkspaceDirectoryIdentity {
  accessVersion: number;
  authorityValidUntil: string | null;
  limit: number;
  membershipId: MembershipId;
  principalId: UserId;
  sessionGeneration: number;
}

export const platformWorkspaceDirectoryKeys = {
  all: createQueryKey("platform-workspaces"),
  list: (identity: PlatformWorkspaceDirectoryIdentity): AppQueryKey =>
    createQueryKey("platform-workspaces", "directory", identity),
};
