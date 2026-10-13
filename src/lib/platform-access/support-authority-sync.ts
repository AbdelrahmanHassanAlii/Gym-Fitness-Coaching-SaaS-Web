import type { QueryClient } from "@tanstack/react-query";
import type {
  PlatformContextDto,
  PlatformEffectiveAccessDecisionsDto,
  UserId,
} from "@/contracts";
import { platformAccessKeys } from "./query-keys";
import {
  normalizePlatformDecisionRequests,
  platformSupportManagementDecisionRequests,
  platformSupportStartDecisionRequests,
} from "./api";

/** Publishes only decoded support request sets into the existing identity-scoped decision cache. */
export async function publishSupportAuthority(
  queryClient: QueryClient,
  actor: { principalId: UserId; sessionGeneration: number },
  context: PlatformContextDto,
  management: PlatformEffectiveAccessDecisionsDto,
  start: PlatformEffectiveAccessDecisionsDto,
  isCurrent: () => boolean,
): Promise<boolean> {
  const contextKey = platformAccessKeys.context({
    principalId: actor.principalId,
    sessionGeneration: actor.sessionGeneration,
  });
  const current = queryClient.getQueryData<PlatformContextDto>(contextKey);
  const bindingMatches = () => {
    const latest = queryClient.getQueryData<PlatformContextDto>(contextKey);
    return (
      isCurrent() &&
      (!latest ||
        (latest.membership.id === context.membership.id &&
          latest.membership.status === "ACTIVE" &&
          latest.membership.accessVersion <= context.membership.accessVersion))
    );
  };
  if (
    !isCurrent() ||
    context.membership.status !== "ACTIVE" ||
    (current &&
      (current.membership.id !== context.membership.id ||
        current.membership.accessVersion > context.membership.accessVersion))
  )
    return false;
  const identity = {
    ...actor,
    membershipId: context.membership.id,
    membershipStatus: "ACTIVE" as const,
    accessVersion: context.membership.accessVersion,
  };
  const entries = [
    [management, platformSupportManagementDecisionRequests],
    [start, platformSupportStartDecisionRequests],
  ] as const;
  for (const [data, requests] of entries) {
    if (
      data.membershipId !== identity.membershipId ||
      data.accessVersion !== identity.accessVersion ||
      data.decisions.map((d) => d.permission).join("|") !==
        normalizePlatformDecisionRequests(requests)
          .map((r) => r.permission)
          .join("|")
    )
      return false;
  }
  // Cancel older reads before publishing; a late result cannot resurrect a denied capability.
  await Promise.all([
    queryClient.cancelQueries({ exact: true, queryKey: contextKey }),
    ...entries.map(([, requests]) =>
      queryClient.cancelQueries({
        exact: true,
        queryKey: platformAccessKeys.decisions({ ...identity, requests }),
      }),
    ),
  ]);
  if (!bindingMatches()) return false;
  for (const [data, requests] of entries)
    queryClient.setQueryData(
      platformAccessKeys.decisions({ ...identity, requests }),
      data,
    );
  queryClient.setQueryData(contextKey, context);
  return true;
}
