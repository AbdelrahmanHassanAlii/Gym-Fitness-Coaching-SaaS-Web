import type { QueryClient } from "@tanstack/react-query";
import { appQueryKeys } from "./query-keys";

export function clearSessionQueryCache(queryClient: QueryClient): void {
  queryClient.clear();
}

export function removeWorkspaceQueryCache(
  queryClient: QueryClient,
  workspaceId: string,
): void {
  queryClient.removeQueries({
    queryKey: appQueryKeys.workspace(workspaceId),
  });
}

export function invalidateWorkspaceQueryCache(
  queryClient: QueryClient,
  workspaceId: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: appQueryKeys.workspace(workspaceId),
  });
}
