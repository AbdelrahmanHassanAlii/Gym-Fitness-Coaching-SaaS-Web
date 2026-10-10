import type {
  MembershipId,
  PlatformWorkspaceStatus,
  UserId,
  WorkspaceId,
} from "@/contracts";
import { createQueryKey, type AppQueryKey } from "@/lib/server-state";

export type PlatformWorkspaceDirectoryIdentity = {
  accessVersion: number;
  authorityValidUntil: string | null;
  limit: number;
  membershipId: MembershipId;
  principalId: UserId;
  q?: string;
  sessionGeneration: number;
  status?: PlatformWorkspaceStatus;
};

export type PlatformWorkspaceDetailIdentity = Omit<
  PlatformWorkspaceDirectoryIdentity,
  "limit" | "q" | "status"
> & { workspaceId: WorkspaceId };

export const platformWorkspaceDirectoryKeys = {
  all: createQueryKey("platform-workspaces"),
  list: (identity: PlatformWorkspaceDirectoryIdentity): AppQueryKey =>
    createQueryKey("platform-workspaces", "directory", identity),
  detail: (identity: PlatformWorkspaceDetailIdentity): AppQueryKey =>
    createQueryKey("platform-workspaces", "detail", identity),
};
