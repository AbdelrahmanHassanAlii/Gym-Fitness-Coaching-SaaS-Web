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
import {
  platformSupportDecisionRequests,
  platformSupportStartDecisionRequests,
  requestPlatformContext,
  requestPlatformEffectiveAccessDecisions,
} from "@/lib/platform-access";
import { SupportRuntime, type SupportAuthority } from "./runtime";

const RuntimeContext = createContext<SupportRuntime | null>(null);
export function SupportContextProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(() => new SupportRuntime());
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
  const hasContext = snapshot.context !== null;
  useEffect(() => {
    if (!hasContext) return;
    const { epoch, authority: captured } = runtime.getSnapshot();
    if (!captured) return;
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (
        busy ||
        controller.signal.aborted ||
        runtime.getSnapshot().epoch !== epoch
      )
        return;
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
          context.membership.accessVersion !== captured.accessVersion
        ) {
          runtime.retire();
          return;
        }
        const decisions = await requestPlatformEffectiveAccessDecisions(
          apiClient,
          {
            membershipId: context.membership.id,
            accessVersion: context.membership.accessVersion,
          },
          platformSupportDecisionRequests,
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
        runtime.observeAuthority(next);
        if (runtime.getSnapshot().epoch !== epoch) return;
        await runtime.validate(apiClient);
      } catch {
        if (!controller.signal.aborted && runtime.getSnapshot().epoch === epoch)
          runtime.retire();
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), 20_000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [runtime, apiClient, snapshot.epoch, hasContext]);
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
