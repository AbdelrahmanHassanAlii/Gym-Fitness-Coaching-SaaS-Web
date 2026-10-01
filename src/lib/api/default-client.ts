import { publicEnv } from "@/config/env.public";
import { createApiClient } from "./client";
import type { ApiClient, ApiClientOptions } from "./types";

export function createDefaultApiClient(
  options: Omit<ApiClientOptions, "baseUrl"> = {},
): ApiClient {
  if (publicEnv.backendApiBaseUrl === null) {
    throw new Error(
      "NEXT_PUBLIC_BACKEND_API_BASE_URL is required to create the API client",
    );
  }

  return createApiClient({
    ...options,
    baseUrl: publicEnv.backendApiBaseUrl,
  });
}
