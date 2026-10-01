import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "@/lib/api";

const maxNetworkQueryRetries = 2;

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        gcTime: 10 * 60 * 1000,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
        staleTime: 30 * 1000,
      },
    },
  });
}

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= maxNetworkQueryRetries) {
    return false;
  }

  if (!isApiError(error)) {
    return false;
  }

  if (error.kind === "network") {
    return true;
  }

  if (error.kind === "non-json-response" && error.status !== undefined) {
    return error.status >= 500;
  }

  if (error.kind !== "backend") {
    return false;
  }

  if (error.status === undefined) {
    return false;
  }

  return error.status >= 500;
}
