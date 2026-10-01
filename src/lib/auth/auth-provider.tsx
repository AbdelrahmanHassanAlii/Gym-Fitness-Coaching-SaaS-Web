"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { publicEnv } from "@/config/env.public";
import { AuthSessionController } from "./session-controller";
import type { AuthSessionContextValue, AuthSessionSnapshot } from "./types";

const AuthSessionContext = createContext<AuthSessionController | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const controller = useMemo(() => {
    return new AuthSessionController({
      baseUrl: publicEnv.backendApiBaseUrl,
      queryClient,
    });
  }, [queryClient]);

  return (
    <AuthSessionContext.Provider value={controller}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const controller = useContext(AuthSessionContext);

  if (controller === null) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }

  useSyncExternalStore(
    controller.subscribe,
    () => controller.state,
    () => controller.state,
  );
  const snapshot = controller.getSnapshot();

  return {
    ...snapshot,
    bootstrap: controller.bootstrap.bind(controller),
    getAccessToken: controller.getAccessToken,
    login: controller.login.bind(controller),
    logout: controller.logout.bind(controller),
    markSessionExpired: controller.markSessionExpired.bind(controller),
    subscribe: controller.subscribe,
    verifyMfaLogin: controller.verifyMfaLogin.bind(controller),
  };
}

export function useAuthSnapshot(): AuthSessionSnapshot {
  const { apiClient, generation, state } = useAuthSession();

  return { apiClient, generation, state };
}
