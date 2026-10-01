import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ApiError, type ApiClient } from "@/lib/api";
import { AppQueryProvider } from "./query-provider";
import { createAppQueryClient, shouldRetryQuery } from "./query-client";
import { appQueryKeys, createQueryKey } from "./query-keys";
import {
  clearSessionQueryCache,
  removeWorkspaceQueryCache,
} from "./cache-boundary";
import { createApiQueryFn } from "./api-query";
import { appendPage, createNextPageParam, flattenPages } from "./pagination";

describe("server-state infrastructure", () => {
  test("creates conservative query and mutation defaults", () => {
    const queryClient = createAppQueryClient();
    const queryOptions = queryClient.getDefaultOptions().queries;
    const mutationOptions = queryClient.getDefaultOptions().mutations;

    expect(queryOptions?.staleTime).toBe(30_000);
    expect(queryOptions?.gcTime).toBe(600_000);
    expect(queryOptions?.refetchOnWindowFocus).toBe(false);
    expect(mutationOptions?.retry).toBe(false);
  });

  test("does not retry non-retryable backend errors or cancellations", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(
        shouldRetryQuery(
          0,
          new ApiError({
            category: "unknown",
            kind: "backend",
            message: "No retry",
            status,
          }),
        ),
      ).toBe(false);
    }
    expect(
      shouldRetryQuery(
        0,
        new ApiError({ kind: "abort", message: "cancelled" }),
      ),
    ).toBe(false);
    expect(
      shouldRetryQuery(
        0,
        new ApiError({ kind: "malformed-response", message: "bad json" }),
      ),
    ).toBe(false);
  });

  test("retries only bounded network and server failures for queries", () => {
    expect(
      shouldRetryQuery(
        0,
        new ApiError({ kind: "network", message: "offline" }),
      ),
    ).toBe(true);
    expect(
      shouldRetryQuery(
        1,
        new ApiError({
          kind: "backend",
          message: "server",
          status: 500,
        }),
      ),
    ).toBe(true);
    expect(
      shouldRetryQuery(
        1,
        new ApiError({
          kind: "non-json-response",
          message: "proxy",
          status: 502,
        }),
      ),
    ).toBe(true);
    expect(
      shouldRetryQuery(
        2,
        new ApiError({
          kind: "backend",
          message: "server",
          status: 500,
        }),
      ),
    ).toBe(false);
  });

  test("keeps one browser QueryClient instance across provider rerenders", () => {
    const seenClients: QueryClient[] = [];

    function Probe() {
      seenClients.push(useQueryClient());
      return <div>probe</div>;
    }

    const rendered = render(
      <AppQueryProvider>
        <Probe />
      </AppQueryProvider>,
    );

    rendered.rerender(
      <AppQueryProvider>
        <Probe />
      </AppQueryProvider>,
    );

    expect(screen.getByText("probe")).toBeInTheDocument();
    expect(seenClients).toHaveLength(2);
    expect(seenClients[0]).toBe(seenClients[1]);
  });

  test("passes TanStack cancellation signal into WEB-007-facing requests", async () => {
    const abortController = new AbortController();
    const apiClient: ApiClient = {
      request: vi.fn().mockResolvedValue({ data: true }),
    };
    const queryFn = createApiQueryFn<{ data: boolean }>(apiClient, () => ({
      path: "/me",
    }));

    await queryFn({
      client: createAppQueryClient(),
      meta: undefined,
      queryKey: appQueryKeys.all,
      signal: abortController.signal,
    });

    expect(apiClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ signal: abortController.signal }),
    );
  });

  test("composes deterministic query keys without requiring secrets", () => {
    expect(appQueryKeys.workspace("workspace_1")).toEqual([
      "hassan-web",
      "workspace",
      "workspace_1",
    ]);
    expect(
      appQueryKeys.workspaceList("workspace_1", "documents", {
        category: "INBODY",
        cursor: "opaque&cursor",
      }),
    ).toEqual([
      "hassan-web",
      "workspace",
      "workspace_1",
      "access-context",
      "user",
      "documents",
      "list",
      { category: "INBODY", cursor: "opaque&cursor" },
    ]);
    expect(() =>
      createQueryKey("workspace", { accessToken: "secret-token" }),
    ).toThrow("sensitive field");
    expect(() =>
      createQueryKey("workspace", { supportSessionId: "support-secret" }),
    ).toThrow("sensitive field");
    expect(() =>
      createQueryKey("workspace", { refresh_token: "secret-token" }),
    ).toThrow("sensitive field");
    expect(() =>
      createQueryKey("workspace", { Authorization: "Bearer token" }),
    ).toThrow("sensitive field");
    expect(() =>
      createQueryKey("workspace", { nested: { signedUrl: "https://signed" } }),
    ).toThrow("sensitive field");
  });

  test("normalizes query-key filter objects deterministically", () => {
    const first = createQueryKey("workspace", "workspace_1", {
      b: "two",
      a: "one",
      cursor: "opaque+cursor",
      missing: undefined,
      nested: { z: "last", a: "first" },
    });
    const second = createQueryKey("workspace", "workspace_1", {
      nested: { a: "first", z: "last" },
      cursor: "opaque+cursor",
      a: "one",
      b: "two",
    });

    expect(first).toEqual(second);
    expect(() =>
      createQueryKey("workspace", new Date("2026-10-01") as never),
    ).toThrow("plain serializable objects");
  });

  test("provides cache clearing seams for future logout and workspace switches", () => {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(
      appQueryKeys.workspaceList("workspace_1", "files"),
      {
        name: "One",
      },
    );
    queryClient.setQueryData(
      appQueryKeys.workspaceDetail("workspace_1", "files", "file_1"),
      {
        name: "One detail",
      },
    );
    queryClient.setQueryData(
      appQueryKeys.workspaceList("workspace_2", "files"),
      {
        name: "Two",
      },
    );
    queryClient.setQueryData(createQueryKey("public", "marketing"), {
      name: "Public",
    });

    removeWorkspaceQueryCache(queryClient, "workspace_1");

    expect(
      queryClient.getQueryData(
        appQueryKeys.workspaceList("workspace_1", "files"),
      ),
    ).toBe(undefined);
    expect(
      queryClient.getQueryData(
        appQueryKeys.workspaceDetail("workspace_1", "files", "file_1"),
      ),
    ).toBe(undefined);
    expect(
      queryClient.getQueryData(
        appQueryKeys.workspaceList("workspace_2", "files"),
      ),
    ).toEqual({ name: "Two" });
    expect(
      queryClient.getQueryData(createQueryKey("public", "marketing")),
    ).toEqual({
      name: "Public",
    });

    clearSessionQueryCache(queryClient);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  test("separates ordinary and support-context cache entries without support-session secrets", () => {
    expect(
      appQueryKeys.workspaceList("workspace_1", "audit", undefined, "user"),
    ).toEqual([
      "hassan-web",
      "workspace",
      "workspace_1",
      "access-context",
      "user",
      "audit",
      "list",
      null,
    ]);
    expect(
      appQueryKeys.workspaceList("workspace_1", "audit", undefined, "support"),
    ).toEqual([
      "hassan-web",
      "workspace",
      "workspace_1",
      "access-context",
      "support",
      "audit",
      "list",
      null,
    ]);
  });

  test("keeps pagination helpers shape-neutral and cursors opaque", () => {
    type NextCursorPage = { items: string[]; page: { nextCursor?: string } };
    type CategoryPage = {
      buckets: { rows: string[] };
      cursors: { recent?: string };
    };

    const nextFromPage = createNextPageParam<NextCursorPage, string>(
      (lastPage) => lastPage.page.nextCursor,
    );
    const nextFromCategory = createNextPageParam<CategoryPage, string>(
      (lastPage) => lastPage.cursors.recent,
    );
    const cursor = "opaque+cursor/with=symbols";

    expect(nextFromPage({ items: [], page: { nextCursor: cursor } }, [])).toBe(
      cursor,
    );
    expect(
      nextFromCategory(
        { buckets: { rows: [] }, cursors: { recent: cursor } },
        [],
      ),
    ).toBe(cursor);
    expect(
      flattenPages(
        appendPage<NextCursorPage>([], {
          items: ["a", "b"],
          page: { nextCursor: cursor },
        }),
        (page) => page.items,
      ),
    ).toEqual(["a", "b"]);
  });
});
