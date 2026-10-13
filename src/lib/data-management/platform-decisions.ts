"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api";
import type { MembershipId, UserId } from "@/contracts";
import {
  platformAccessKeys,
  requestPlatformEffectiveAccessDecisions,
} from "@/lib/platform-access";

export function useDataManagementDecisions(
  client: ApiClient,
  identity: {
    principalId: UserId;
    sessionGeneration: number;
    membershipId: MembershipId;
    accessVersion: number;
  } | null,
  detailed: boolean,
) {
  const requests = detailed
    ? [
        { permission: "deletion.read" as const },
        { permission: "deletion.approve" as const },
        { permission: "deletion.postpone" as const },
        { permission: "deletion.cancel" as const },
      ]
    : [{ permission: "deletion.read" as const }];
  const query = useQuery({
    enabled: identity !== null,
    queryKey: identity
      ? platformAccessKeys.decisions({
          ...identity,
          membershipStatus: "ACTIVE",
          requests,
        })
      : ["platform-access", "deletion-disabled"],
    queryFn: ({ signal }) =>
      requestPlatformEffectiveAccessDecisions(
        client,
        identity!,
        requests,
        signal,
      ),
    retry: false,
  });
  const deadline = query.data?.validUntil;
  const refetch = query.refetch;
  useEffect(() => {
    if (!deadline) return;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    function schedule() {
      const remaining = Date.parse(deadline!) - Date.now();
      if (remaining <= 0) {
        if (!disposed) void refetch();
        return;
      }
      timer = setTimeout(schedule, Math.min(remaining, 2147483647));
    }
    schedule();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [deadline, refetch]);
  return query;
}
