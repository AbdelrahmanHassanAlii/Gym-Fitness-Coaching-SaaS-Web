import type {
  MembershipId,
  PlatformDecisionRequestDto,
  UserId,
} from "@/contracts";
import { createQueryKey, type AppQueryKey } from "@/lib/server-state";
import { normalizePlatformDecisionRequests } from "./api";

type PrincipalIdentity = {
  principalId: UserId;
  sessionGeneration: number;
};

export const platformAccessKeys = {
  all: createQueryKey("platform-access"),
  context: (identity: PrincipalIdentity): AppQueryKey =>
    createQueryKey("platform-access", "platform-context", identity),
  decisions: (
    identity: PrincipalIdentity & {
      accessVersion: number;
      membershipId: MembershipId;
      membershipStatus: "ACTIVE";
      requests: readonly PlatformDecisionRequestDto[];
    },
  ): AppQueryKey =>
    createQueryKey("platform-access", "effective-access-decisions", {
      accessContext: "USER",
      accessVersion: identity.accessVersion,
      membershipId: identity.membershipId,
      membershipStatus: identity.membershipStatus,
      permissions: normalizePlatformDecisionRequests(identity.requests).map(
        ({ permission }) => permission,
      ),
      principalId: identity.principalId,
      sessionGeneration: identity.sessionGeneration,
    }),
};
