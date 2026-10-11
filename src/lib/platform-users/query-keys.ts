import { createQueryKey } from "@/lib/server-state";
import type { PlatformAuthority } from "@/lib/platform-access";
import type { MembershipStatus } from "./contracts";

export function platformUserAuthorityIdentity(authority: PlatformAuthority) {
  return {
    principalId: authority.principalId,
    sessionGeneration: authority.sessionGeneration,
    membershipId: authority.membershipId,
    accessVersion: authority.accessVersion,
    authorityValidUntil: authority.validUntil,
    permission: "platform_users.read",
    allowed: authority.allows("platform_users.read"),
  };
}
export const platformUserKeys = {
  all: createQueryKey("platform-users"),
  list: (
    identity: ReturnType<typeof platformUserAuthorityIdentity> & {
      q?: string;
      platformMembershipStatus?: MembershipStatus;
      limit: number;
    },
  ) => createQueryKey("platform-users", "directory", identity),
  detail: (
    identity: ReturnType<typeof platformUserAuthorityIdentity> & {
      userId: string;
    },
  ) => createQueryKey("platform-users", "detail", identity),
};
