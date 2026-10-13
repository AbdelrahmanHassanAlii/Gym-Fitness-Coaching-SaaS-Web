"use client";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuthSession } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { publishSupportAuthority } from "@/lib/platform-access/support-authority-sync";
import type { PlatformContextDto } from "@/contracts";
import {
  platformSupportManagementDecisionRequests,
  platformAccessKeys,
  platformSupportStartDecisionRequests,
  requestPlatformContext,
  requestPlatformEffectiveAccessDecisions,
} from "@/lib/platform-access";
import { SupportRuntime, type SupportAuthority } from "./runtime";

const RuntimeContext = createContext<SupportRuntime | null>(null);
export function SupportContextProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(() => new SupportRuntime());
  const queryClient = useQueryClient();
  const { apiClient, generation, state } = useAuthSession();
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  // Token included only in this private in-memory identity, never in cache keys/logs.
  const authIdentity =
    state.status === "authenticated" && !state.restrictedUntilVerified
      ? JSON.stringify([state.user.id, generation, state.accessToken])
      : null;
  useLayoutEffect(() => {
    runtime.bindAuth(authIdentity);
  }, [runtime, authIdentity]);
  const hasSelection = snapshot.context !== null || snapshot.revalidating;
  useEffect(() => {
    if (!hasSelection) return;
    let busy = false,
      disposed = false,
      flight: AbortController | null = null;
    const refresh = async () => {
      if (busy || disposed) return;
      const captured = runtime.getSnapshot().authority;
      if (!captured) return;
      let epoch = runtime.getSnapshot().epoch;
      const controller = new AbortController();
      flight = controller;
      runtime.attachAuthorityRefresh(controller);
      busy = true;
      try {
        const context = await requestPlatformContext(
          apiClient,
          controller.signal,
        );
        if (controller.signal.aborted || runtime.getSnapshot().epoch !== epoch)
          return;
        if (
          context.membership.status !== "ACTIVE" ||
          context.membership.id !== captured.membershipId ||
          context.membership.accessVersion < captured.accessVersion
        ) {
          runtime.retire();
          return;
        }
        if (
          context.membership.accessVersion !== captured.accessVersion ||
          runtime.getSnapshot().revalidating
        ) {
          epoch = runtime.beginAuthorityRevalidation(
            context.membership.accessVersion,
            controller,
          );
          if (controller.signal.aborted || !runtime.getSnapshot().revalidating)
            return;
        }
        const decisions = await requestPlatformEffectiveAccessDecisions(
          apiClient,
          {
            membershipId: context.membership.id,
            accessVersion: context.membership.accessVersion,
          },
          platformSupportManagementDecisionRequests,
          controller.signal,
        );
        if (controller.signal.aborted || runtime.getSnapshot().epoch !== epoch)
          return;
        const startDecision = await requestPlatformEffectiveAccessDecisions(
          apiClient,
          {
            membershipId: context.membership.id,
            accessVersion: context.membership.accessVersion,
          },
          platformSupportStartDecisionRequests,
          controller.signal,
        );
        if (controller.signal.aborted || runtime.getSnapshot().epoch !== epoch)
          return;
        const next: SupportAuthority = {
          ...captured,
          accessVersion: context.membership.accessVersion,
          validUntil: decisions.validUntil,
          startValidUntil: startDecision.validUntil,
          permissions: [
            ...(startDecision.decisions[0].allowed
              ? ["support.sessions.start"]
              : []),
            ...decisions.decisions
              .filter((d) => d.allowed && d.permission.startsWith("support."))
              .map((d) => d.permission)
              .filter((p) => p !== "support.sessions.start"),
          ],
        };
        if (
          !(await publishSupportAuthority(
            queryClient,
            captured,
            context,
            decisions,
            startDecision,
            () =>
              !controller.signal.aborted &&
              runtime.getSnapshot().epoch === epoch,
          ))
        ) {
          if (
            !controller.signal.aborted &&
            runtime.getSnapshot().epoch === epoch
          ) {
            const latest = queryClient.getQueryData<PlatformContextDto>(
              platformAccessKeys.context({
                principalId: captured.principalId,
                sessionGeneration: captured.sessionGeneration,
              }),
            );
            if (
              latest?.membership.status === "ACTIVE" &&
              latest.membership.id === captured.membershipId &&
              latest.membership.accessVersion > context.membership.accessVersion
            )
              runtime.beginAuthorityRevalidation(
                latest.membership.accessVersion,
              );
            else runtime.retire();
          }
          return;
        }
        if (!runtime.acceptRediscoveredAuthority(next, epoch)) return;
        await runtime.validate(apiClient);
      } catch {
        if (!controller.signal.aborted && runtime.getSnapshot().epoch === epoch)
          runtime.retire();
      } finally {
        busy = false;
        if (
          !disposed &&
          controller.signal.aborted &&
          runtime.getSnapshot().revalidating
        )
          void refresh();
      }
    };
    const timer = window.setInterval(() => void refresh(), 20_000);
    const focus = () => void refresh();
    const unsubscribe = runtime.subscribe(() => {
      if (runtime.getSnapshot().revalidating) void refresh();
    });
    if (runtime.getSnapshot().revalidating) void refresh();
    window.addEventListener("focus", focus);
    return () => {
      disposed = true;
      flight?.abort();
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [runtime, apiClient, hasSelection, queryClient]);
  useEffect(() => () => runtime.dispose(), [runtime]);
  return (
    <RuntimeContext.Provider value={runtime}>
      {children}
    </RuntimeContext.Provider>
  );
}
export function useOptionalSupportRuntime() {
  return useContext(RuntimeContext);
}
export function useSupportRuntime() {
  const runtime = useOptionalSupportRuntime();
  if (!runtime) throw new Error("SupportContextProvider required");
  return runtime;
}
export function useSupportSnapshot() {
  const runtime = useSupportRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
