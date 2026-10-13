import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, type ApiClient } from "@/lib/api";
import { unsafeApiId } from "@/contracts/common/ids";
import {
  decodeContext,
  decodeSession,
  decodeStart,
  makeStartBody,
} from "./contracts";
import {
  freezeStartIntent,
  startSupport,
  readSession,
  terminateSession,
  uncertain,
} from "./api";
import {
  SupportRuntime,
  authorityLive,
  type SupportAuthority,
} from "./runtime";
import {
  platformDecisionRequests,
  platformSupportDecisionRequests,
} from "@/lib/platform-access";

const id = "68e7a9d10d56fd2b98d4a100",
  workspaceId = "68e7a9d10d56fd2b98d4a101",
  at = "2026-10-13T10:00:00.000Z";
const body = makeStartBody(
  workspaceId,
  "GYM",
  30,
  "  Investigate view  ",
  " case 10 ",
);
const session = {
  id,
  requestId: id,
  policyId: id,
  realActorPlatformMembershipId: id,
  targetType: "GYM",
  targetWorkspaceId: workspaceId,
  contextType: "WORKSPACE_SUPPORT",
  sessionType: "READ_ONLY",
  startedAt: at,
  expiresAt: "2026-10-13T11:00:00.000Z",
  status: "ACTIVE",
  version: 2,
};
function current() {
  return {
    data: {
      supportSession: {
        id,
        status: "ACTIVE",
        version: 2,
        contextType: "WORKSPACE_SUPPORT",
        sessionType: "READ_ONLY",
        startedAt: at,
        expiresAt: session.expiresAt,
        policyRevision: 3,
      },
      workspace: {
        id: workspaceId,
        name: "Workspace",
        type: "GYM",
        status: "ACTIVE",
        timezone: "Africa/Cairo",
        defaultLanguage: "en",
      },
    },
  };
}
const authority: SupportAuthority = {
  principalId: unsafeApiId<"user">(id),
  membershipId: unsafeApiId<"membership">(id),
  sessionGeneration: 1,
  accessVersion: 4,
  validUntil: null,
  startValidUntil: null,
  permissions: ["support.sessions.start", "support.sessions.end_own"],
};
afterEach(() => {
  vi.useRealTimers();
});
describe("Support strict contracts and independent permissions", () => {
  it("fixes the read-only body, trims privacy fields and validates bounds", () => {
    expect(body).toMatchObject({
      contextType: "WORKSPACE_SUPPORT",
      sessionType: "READ_ONLY",
      reason: "Investigate view",
      reference: "case 10",
      requestedSensitiveAccess: false,
      requestedSensitiveFileDownload: false,
    });
    for (const duration of [0, 61, 1.2, NaN])
      expect(() =>
        makeStartBody(workspaceId, "GYM", duration, "reason", ""),
      ).toThrow();
    for (const reason of ["ab", "a".repeat(501), "   "])
      expect(() => makeStartBody(workspaceId, "GYM", 1, reason, "")).toThrow();
    expect(() =>
      makeStartBody(workspaceId, "GYM", 60, "reason", "a".repeat(121)),
    ).toThrow();
  });
  it("rejects hidden fields, unsafe versions, malformed IDs/dates and wrong targets", () => {
    expect(
      decodeSession({ ...session, targetUserId: null, endedAt: null }),
    ).toMatchObject({ id });
    for (const targetType of ["STAFF", "TRAINEE"])
      expect(decodeSession({ ...session, targetType }).targetType).toBe(
        targetType,
      );
    expect(() => decodeSession({ ...session, targetType: "USER" })).toThrow();
    for (const patch of [
      { sourceIp: "secret" },
      { version: Number.MAX_SAFE_INTEGER + 1 },
      { id: "BAD" },
      { status: "UNKNOWN" },
      { startedAt: "invalid" },
      { expiresAt: at },
    ])
      expect(() => decodeSession({ ...session, ...patch })).toThrow();
    expect(() =>
      decodeStart(
        {
          data: {
            decision: "APPROVED",
            supportSession: { ...session, targetWorkspaceId: id },
          },
        },
        body,
      ),
    ).toThrow();
    expect(() =>
      decodeStart(
        { data: { decision: "DENIED", supportSession: session } },
        body,
      ),
    ).toThrow();
  });
  it("validates current identity, active state, fixed context/type and expiry", () => {
    const now = Date.parse(at) + 1000;
    expect(decodeContext(current(), id, workspaceId, now).workspace.id).toBe(
      workspaceId,
    );
    for (const patch of [
      { id: workspaceId },
      { status: "REVOKED" },
      { contextType: "USER_CONTEXT" },
      { sessionType: "WRITE_SUPPORT" },
      { policyRevision: -1 },
      { parentSessionId: id },
    ]) {
      const dto = current();
      Object.assign(dto.data.supportSession, patch);
      expect(() => decodeContext(dto, id, workspaceId, now)).toThrow();
    }
    expect(() => decodeContext(current(), id, id, now)).toThrow();
    expect(() =>
      decodeContext(current(), id, workspaceId, Date.parse(session.expiresAt)),
    ).toThrow();
  });
  it("requests support permissions only in the route-specific set and independently", () => {
    expect(
      platformDecisionRequests.some((r) => r.permission.startsWith("support.")),
    ).toBe(false);
    expect(
      platformSupportDecisionRequests
        .filter((r) => r.permission.startsWith("support."))
        .map((r) => r.permission),
    ).toEqual([
      "support.sessions.start",
      "support.sessions.read",
      "support.sessions.end_own",
      "support.sessions.revoke",
    ]);
    expect(authorityLive(authority, "support.sessions.end_own")).toBe(true);
    expect(authorityLive(authority, "support.sessions.read")).toBe(false);
    expect(authorityLive(authority, "support.sessions.revoke")).toBe(false);
  });
});
describe("API intents and selector boundary", () => {
  it("freezes one intent and reuses its key/body on explicit retry without automatic retry", async () => {
    const calls: RequestInit[] = [];
    let fail = true;
    const api = createApiClient({
      baseUrl: "https://example.test/api/v1",
      fetch: vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init!);
        if (fail) {
          fail = false;
          throw new TypeError("Network");
        }
        return Response.json({
          data: { decision: "APPROVED", supportSession: session },
        });
      }) as unknown as typeof fetch,
    });
    const intent = freezeStartIntent(body, "actor-authority");
    await expect(startSupport(api, intent)).rejects.toThrow();
    expect(calls).toHaveLength(1);
    await startSupport(api, intent);
    expect(calls).toHaveLength(2);
    expect(calls[0].body).toBe(calls[1].body);
    expect(new Headers(calls[0].headers).get("Idempotency-Key")).toBe(
      intent.key,
    );
    expect(new Headers(calls[1].headers).get("Idempotency-Key")).toBe(
      intent.key,
    );
    expect(freezeStartIntent(body, "actor-authority").key).not.toBe(intent.key);
    expect(Object.isFrozen(intent.body)).toBe(true);
  });
  it("management calls never receive a selector and terminations use only version", async () => {
    const request = vi.fn(async (options) => ({
      data:
        options.method === "POST"
          ? { ...session, status: "ENDED", version: 3 }
          : session,
    }));
    const api: ApiClient = { request: request as ApiClient["request"] };
    await readSession(api, id);
    await terminateSession(api, id, 2, "end");
    expect(request.mock.calls[0][0]).toMatchObject({
      cache: "no-store",
      refreshOnUnauthorized: false,
    });
    expect(request.mock.calls[1][0]).toMatchObject({
      body: { expectedVersion: 2 },
    });
    for (const [options] of request.mock.calls) {
      expect(options.supportSessionId).toBeUndefined();
      expect(options.idempotencyKey).toBeUndefined();
    }
    expect(
      uncertain(new ApiError({ kind: "malformed-response", message: "bad" })),
    ).toBe(true);
    expect(
      uncertain(
        new ApiError({
          kind: "backend",
          code: "POLICY_DISABLED",
          status: 403,
          message: "private",
        }),
      ),
    ).toBe(false);
  });
});
describe("Memory-only runtime and retirement", () => {
  const allPermissions = [
    "support.sessions.start",
    "support.sessions.read",
    "support.sessions.end_own",
    "support.sessions.revoke",
  ];
  it.each([
    "support.sessions.read",
    "support.sessions.end_own",
    "support.sessions.revoke",
    "all",
  ])(
    "preserves runtime while management authority %s is lost",
    async (lost) => {
      const runtime = setup(),
        api = { request: vi.fn(async () => current()) } as ApiClient;
      const initial = { ...authority, permissions: allPermissions };
      await runtime.select(api, id, workspaceId, initial);
      const before = runtime.getSnapshot();
      const permissions = allPermissions.filter(
        (p) => p === "support.sessions.start" || (lost !== "all" && p !== lost),
      );
      runtime.observeAuthority({ ...initial, permissions });
      expect(runtime.getSnapshot().context).toBe(before.context);
      expect(runtime.getSnapshot().epoch).toBe(before.epoch);
      expect(runtime.getSnapshot().authority?.permissions).toEqual(permissions);
      expect(runtime.isSelected(id)).toBe(true);
      runtime.observeAuthority({
        ...initial,
        permissions: allPermissions.filter(
          (p) => p !== "support.sessions.start",
        ),
      });
      expect(runtime.getSnapshot().context).toBeNull();
      expect(runtime.getSnapshot().authority).toBeNull();
      expect(runtime.isSelected(id)).toBe(false);
      runtime.dispose();
    },
  );
  it("expires management actions independently from the start deadline", async () => {
    const runtime = setup(),
      api = { request: vi.fn(async () => current()) } as ApiClient;
    await runtime.select(api, id, workspaceId, {
      ...authority,
      permissions: allPermissions,
      validUntil: new Date(Date.parse(at) + 1000).toISOString(),
      startValidUntil: new Date(Date.parse(at) + 2000).toISOString(),
    });
    const epoch = runtime.getSnapshot().epoch;
    vi.advanceTimersByTime(1000);
    expect(runtime.getSnapshot().context).not.toBeNull();
    expect(runtime.getSnapshot().epoch).toBe(epoch);
    expect(runtime.getSnapshot().authority?.permissions).toEqual([
      "support.sessions.start",
    ]);
    vi.advanceTimersByTime(1000);
    expect(runtime.getSnapshot().context).toBeNull();
    expect(runtime.isSelected(id)).toBe(false);
    runtime.dispose();
  });
  function setup() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at));
    const runtime = new SupportRuntime();
    runtime.bindAuth("actor-generation-token");
    return runtime;
  }
  it("activates only after bootstrap; no admin-read or native membership is required", async () => {
    const runtime = setup(),
      request = vi.fn(async () => current()),
      api: ApiClient = { request: request as ApiClient["request"] };
    expect(runtime.getSnapshot().context).toBeNull();
    expect(await runtime.select(api, id, workspaceId, authority)).toBe(true);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/me/support-context",
        supportSessionId: id,
        cache: "no-store",
        refreshOnUnauthorized: false,
      }),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(location.href).not.toContain(id);
    const second = new SupportRuntime();
    expect(second.getSnapshot().context).toBeNull();
    runtime.dispose();
  });
  it.each([
    "SUPPORT_SESSION_NOT_ACTIVE",
    "SUPPORT_SESSION_EXPIRED",
    "POLICY_DISABLED",
    "SUPPORT_SESSION_IP_MISMATCH",
  ])("retires on %s with no header-free fallback", async (code) => {
    const runtime = setup(),
      request = vi.fn(async () => {
        throw new ApiError({
          kind: "backend",
          status: 403,
          code,
          message: "private",
        });
      }),
      api: ApiClient = { request: request as ApiClient["request"] };
    expect(await runtime.select(api, id, workspaceId, authority)).toBe(false);
    expect(runtime.getSnapshot().context).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });
  it("aborts and ignores late context after actor/target selection changes", async () => {
    const runtime = setup();
    let resolve!: (v: unknown) => void;
    const request = vi.fn(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
      api: ApiClient = { request: request as ApiClient["request"] };
    const first = runtime.select(api, id, workspaceId, authority),
      epoch = runtime.getSnapshot().epoch;
    runtime.bindAuth("different-actor");
    resolve(current());
    expect(await first).toBe(false);
    expect(runtime.getSnapshot().epoch).toBeGreaterThan(epoch);
    expect(runtime.getSnapshot().context).toBeNull();
    const options = request.mock.calls[0] as unknown as [
      { signal: AbortSignal },
    ];
    expect(options[0].signal.aborted).toBe(true);
    runtime.dispose();
  });
  it("retires and purges at expiry using actual timers before a Backend job", async () => {
    const runtime = setup(),
      api: ApiClient = {
        request: vi.fn(async () => current()) as ApiClient["request"],
      };
    await runtime.select(api, id, workspaceId, authority);
    const epoch = runtime.getSnapshot().epoch;
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(runtime.getSnapshot()).toMatchObject({
      context: null,
      pending: false,
      authority: null,
      notice: "expired",
    });
    expect(runtime.getSnapshot().epoch).toBeGreaterThan(epoch);
    expect(await runtime.validate(api)).toBe(false);
    expect(api.request).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });
  it("uses Platform deadline separately and retires changed authority/auth", async () => {
    const runtime = setup(),
      api: ApiClient = {
        request: vi.fn(async () => current()) as ApiClient["request"],
      };
    await runtime.select(api, id, workspaceId, {
      ...authority,
      startValidUntil: new Date(Date.parse(at) + 1000).toISOString(),
    });
    vi.advanceTimersByTime(1000);
    expect(runtime.getSnapshot().notice).toBe("lost");
    await runtime.select(api, id, workspaceId, authority);
    runtime.observeAuthority({ ...authority, permissions: [] });
    expect(runtime.getSnapshot().context).toBeNull();
    await runtime.select(api, id, workspaceId, authority);
    runtime.bindAuth(null);
    expect(runtime.getSnapshot().context).toBeNull();
    runtime.dispose();
  });
});
