import { describe, expect, test, vi } from "vitest";
import { createApiClient } from "@/lib/api";
import {
  createExport,
  getDeletion,
  getExport,
  issueDownload,
  listDeletions,
  listExports,
  mutateDeletion,
} from "./api";
import { id, at, exportRow, deletionRow } from "./fixtures";
import { SupportRuntime } from "@/lib/platform-support/runtime";
import type { MembershipId, UserId } from "@/contracts";
describe("Stage 17 request security", () => {
  test("a selected support session elsewhere in memory never adds a selector to Stage 17", async () => {
    const expiresAt = "2099-01-01T00:00:00Z";
    const fetch = Object.assign(
      vi.fn(async () =>
        Response.json({
          data: {
            supportSession: {
              id,
              status: "ACTIVE",
              version: 1,
              contextType: "WORKSPACE_SUPPORT",
              sessionType: "READ_ONLY",
              startedAt: at,
              expiresAt,
              policyRevision: 1,
            },
            workspace: {
              id,
              name: "Support Gym",
              type: "GYM",
              status: "ACTIVE",
              timezone: "Africa/Cairo",
              defaultLanguage: "en",
            },
          },
        }),
      ),
      { preconnect: vi.fn() },
    );
    const client = createApiClient({
      baseUrl: "https://api.test/api/v1",
      fetch,
    });
    const runtime = new SupportRuntime();
    runtime.bindAuth("memory-only-actor");
    expect(
      await runtime.select(client, id, id, {
        principalId: id as UserId,
        sessionGeneration: 1,
        membershipId: id as MembershipId,
        accessVersion: 1,
        validUntil: null,
        startValidUntil: null,
        permissions: ["support.sessions.start"],
      }),
    ).toBe(true);
    fetch.mockResolvedValueOnce(
      Response.json({
        data: [exportRow],
        meta: { hasMore: false, nextCursor: null },
      }),
    );
    fetch.mockResolvedValueOnce(Response.json({ items: [deletionRow] }));
    await listExports(client, id);
    await listDeletions(client);
    const calls = fetch.mock.calls as unknown as [URL, RequestInit][];
    for (const [, request] of calls.slice(1))
      expect(new Headers(request.headers).has("x-support-session-id")).toBe(
        false,
      );
    expect(runtime.getSnapshot().context).not.toBeNull();
    runtime.retire();
  });
  test("all operations omit support authority, use no-store, and decode distinct envelopes", async () => {
    const responses = [
      { data: [exportRow], meta: { hasMore: false, nextCursor: "older" } },
      { export: exportRow },
      { data: { export: exportRow } },
      { data: { url: "https://storage.test/file?secret=one", expiresAt: at } },
      { items: [deletionRow], nextCursor: id },
      { deletion: deletionRow },
      { data: { deletion: deletionRow } },
      { deletion: deletionRow },
      { deletion: deletionRow },
    ];
    const fetch = Object.assign(
      vi.fn(async () => Response.json(responses.shift())),
      { preconnect: vi.fn() },
    );
    const client = createApiClient({
      baseUrl: "https://api.test/api/v1",
      fetch,
      accessTokenProvider: () => "native-token",
    });
    await listExports(client, id, "cursor");
    await getExport(client, id, id);
    await createExport(client, id, "same-intent");
    await issueDownload(client, id, id);
    await listDeletions(client, id);
    await getDeletion(client, id);
    for (const action of ["approve", "postpone", "cancel"] as const)
      await mutateDeletion(
        client,
        id,
        action,
        {
          expectedVersion: 0,
          reason: "Confirmed",
          ...(action === "postpone" ? { reviewAfter: at } : {}),
        },
        "approval-intent",
      );
    for (const [, init] of fetch.mock.calls as unknown as [
      string,
      RequestInit,
    ][]) {
      expect(init.cache).toBe("no-store");
      expect(new Headers(init.headers).has("x-support-session-id")).toBe(false);
      expect(new Headers(init.headers).get("authorization")).toBe(
        "Bearer native-token",
      );
    }
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(String(calls[0][0])).toContain("cursor=cursor");
    expect(String(calls[4][0])).toContain(`after=${id}`);
    expect(new Headers(calls[2][1].headers).get("idempotency-key")).toBe(
      "same-intent",
    );
    expect(new Headers(calls[6][1].headers).get("idempotency-key")).toBe(
      "approval-intent",
    );
    for (const index of [7, 8])
      expect(new Headers(calls[index][1].headers).has("idempotency-key")).toBe(
        false,
      );
  });
  test("mutations never automatically refresh/replay and sanitize backend failure details", async () => {
    const fetch = Object.assign(
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: "AUTH_TOKEN_EXPIRED",
              message: "secret internal text",
              details: { storageKey: "secret" },
            },
          },
          { status: 401 },
        ),
      ),
      { preconnect: vi.fn() },
    );
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch,
      refresh: {},
    });
    await expect(createExport(client, id, "key")).rejects.toMatchObject({
      code: "AUTH_TOKEN_EXPIRED",
      message: "Data management request failed",
      details: undefined,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
