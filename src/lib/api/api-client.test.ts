import { describe, expect, test, vi } from "vitest";
import { createApiClient } from "./client";
import { ApiError, isApiError } from "./errors";
import { createIdempotencyKey } from "./idempotency";
import { composeApiUrl, serializeQueryParams } from "./serialization";

type FetchCall = {
  init?: RequestInit;
  input: RequestInfo | URL;
};

const baseUrl = "https://api.example.test";

describe("API transport foundation", () => {
  test("composes configured backend origin, API prefix, relative path, and sorted query", () => {
    const url = composeApiUrl(baseUrl, "/workspaces", {
      active: true,
      cursor: "opaque+/=",
      limit: 25,
    });

    expect(url.toString()).toBe(
      "https://api.example.test/api/v1/workspaces?active=true&cursor=opaque%2B%2F%3D&limit=25",
    );
  });

  test("does not double the API prefix when the environment URL already includes it", () => {
    const url = composeApiUrl("https://api.example.test/api/v1", "/me");

    expect(url.toString()).toBe("https://api.example.test/api/v1/me");
  });

  test("rejects arbitrary absolute request URLs", () => {
    expect(() =>
      composeApiUrl(baseUrl, "https://evil.example.test/me"),
    ).toThrow("must not be an absolute URL");
    expect(() => composeApiUrl(baseUrl, "//evil.example.test/me")).toThrow(
      "must not be an absolute URL",
    );
  });

  test("serializes query arrays, booleans, numbers, reserved characters, and omits undefined", () => {
    expect(
      serializeQueryParams({
        cursor: "opaque&cursor=with+plus/=",
        from: "2026-10-01",
        include: ["a", "b=ج"],
        missing: undefined,
        ok: false,
        to: "2026-10-31T10:00:00Z",
        total: 2,
      }),
    ).toBe(
      "cursor=opaque%26cursor%3Dwith%2Bplus%2F%3D&from=2026-10-01&include=a&include=b%3D%D8%AC&ok=false&to=2026-10-31T10%3A00%3A00Z&total=2",
    );
  });

  test("rejects generic null query values without route-specific semantics", () => {
    expect(() => serializeQueryParams({ nullable: null })).toThrow(
      "null values require endpoint-specific handling",
    );
  });

  test("rejects path oddities that could obscure URL intent", () => {
    expect(() => composeApiUrl(baseUrl, "workspaces\\one")).toThrow(
      "unsupported characters",
    );
    expect(() => composeApiUrl(baseUrl, "/workspaces/\u0000")).toThrow(
      "unsupported characters",
    );
    expect(() => composeApiUrl(baseUrl, "http://evil.example/me")).toThrow(
      "must not be an absolute URL",
    );
  });

  test("serializes JSON request bodies and parses successful JSON responses", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: { ok: true } }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    const response = await client.request<{ data: { ok: boolean } }>({
      body: { expectedVersion: 3 },
      method: "PATCH",
      path: "/documents/doc_1",
    });

    expect(response.data.ok).toBe(true);
    expect(calls[0].init?.method).toBe("PATCH");
    expect(calls[0].init?.body).toBe('{"expectedVersion":3}');
    expect(headerValue(calls[0], "content-type")).toBe("application/json");
  });

  test("serializes intentional JSON primitive bodies", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: "null" }),
      jsonResponse(200, { data: "false" }),
      jsonResponse(200, { data: "zero" }),
      jsonResponse(200, { data: "empty" }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await client.request({ body: null, path: "/null-body" });
    await client.request({ body: false, path: "/false-body" });
    await client.request({ body: 0, path: "/zero-body" });
    await client.request({ body: "", path: "/empty-body" });

    expect(calls.map((call) => call.init?.body)).toEqual([
      "null",
      "false",
      "0",
      '""',
    ]);
  });

  test("returns undefined for 204 and empty successful responses", async () => {
    const { fetchImpl } = createFetchMock([
      new Response(null, { status: 204 }),
      new Response("", { status: 200 }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await expect(client.request<void>({ path: "/first" })).resolves.toBe(
      undefined,
    );
    await expect(client.request<void>({ path: "/second" })).resolves.toBe(
      undefined,
    );
  });

  test("attaches Authorization only when a token is supplied", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: "with-token" }),
      jsonResponse(200, { data: "without-token" }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await client.request({ accessToken: "access-token", path: "/me" });
    await client.request({ path: "/me" });

    expect(headerValue(calls[0], "authorization")).toBe("Bearer access-token");
    expect(headerValue(calls[1], "authorization")).toBeNull();
  });

  test("can use a future auth access-token provider without owning auth state", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: true }),
    ]);
    const client = createApiClient({
      accessTokenProvider: () => "provided-token",
      baseUrl,
      fetch: fetchImpl,
    });

    await client.request({ path: "/me" });

    expect(headerValue(calls[0], "authorization")).toBe(
      "Bearer provided-token",
    );
  });

  test("attaches support-session header only when explicitly supplied", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: "support" }),
      jsonResponse(200, { data: "normal" }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await client.request({
      path: "/support-view",
      supportSessionId: "support-session-id",
    });
    await client.request({ path: "/normal-view" });

    expect(headerValue(calls[0], "x-support-session-id")).toBe(
      "support-session-id",
    );
    expect(headerValue(calls[1], "x-support-session-id")).toBeNull();
  });

  test("preserves explicit idempotency key and does not create one for ordinary commands", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: "command" }),
      jsonResponse(200, { data: "ordinary" }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await client.request({
      idempotencyKey: "idem-1",
      method: "POST",
      path: "/commands",
    });
    await client.request({ method: "POST", path: "/ordinary" });

    expect(headerValue(calls[0], "idempotency-key")).toBe("idem-1");
    expect(headerValue(calls[1], "idempotency-key")).toBeNull();
  });

  test("creates idempotency keys with platform randomUUID when callers need one", () => {
    const randomUUID = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000007");

    expect(createIdempotencyKey()).toBe("00000000-0000-4000-8000-000000000007");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  test("preserves expectedVersion exactly in mutation bodies", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: true }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await client.request({
      body: { expectedVersion: 0, name: "Updated" },
      method: "PATCH",
      path: "/versioned",
    });

    expect(calls[0].init?.body).toBe('{"expectedVersion":0,"name":"Updated"}');
  });

  test("normalizes Backend error envelopes without parsing messages for logic", async () => {
    const { fetchImpl } = createFetchMock([
      jsonResponse(
        409,
        {
          error: {
            code: "DOCUMENT_VERSION_CONFLICT",
            correlationId: "corr-1",
            details: { expectedVersion: 2 },
            message: "Conflict",
          },
        },
        false,
      ),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await expect(
      client.request({ path: "/documents/doc_1" }),
    ).rejects.toMatchObject({
      category: "expected-version-conflict",
      code: "DOCUMENT_VERSION_CONFLICT",
      correlationId: "corr-1",
      kind: "backend",
      status: 409,
    });
  });

  test("classifies representative Backend error envelopes", async () => {
    const { fetchImpl } = createFetchMock([
      jsonResponse(400, backendError("VALIDATION_FAILED"), false),
      jsonResponse(401, backendError("AUTH_REQUIRED"), false),
      jsonResponse(403, backendError("ACCESS_DENIED"), false),
      jsonResponse(404, backendError("RESOURCE_NOT_FOUND"), false),
      jsonResponse(409, backendError("IDEMPOTENCY_KEY_CONFLICT"), false),
      jsonResponse(402, backendError("ENTITLEMENT_REQUIRED"), false),
      jsonResponse(500, backendError("INTERNAL_ERROR"), false),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await expect(client.request({ path: "/validation" })).rejects.toMatchObject(
      { category: "validation", status: 400 },
    );
    await expect(client.request({ path: "/auth" })).rejects.toMatchObject({
      category: "unauthenticated",
      status: 401,
    });
    await expect(client.request({ path: "/forbidden" })).rejects.toMatchObject({
      category: "forbidden",
      status: 403,
    });
    await expect(client.request({ path: "/missing" })).rejects.toMatchObject({
      category: "not-found",
      status: 404,
    });
    await expect(
      client.request({ path: "/idempotency" }),
    ).rejects.toMatchObject({ category: "idempotency-conflict", status: 409 });
    await expect(client.request({ path: "/quota" })).rejects.toMatchObject({
      category: "entitlement-or-quota",
      status: 402,
    });
    await expect(client.request({ path: "/server" })).rejects.toMatchObject({
      category: "unknown",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  });

  test("distinguishes network failures from Backend errors", async () => {
    const networkFailure = new TypeError("fetch failed");
    const { fetchImpl } = createFetchMock([networkFailure]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await expect(client.request({ path: "/me" })).rejects.toMatchObject({
      kind: "network",
    });
  });

  test("distinguishes caller aborts", async () => {
    const { fetchImpl } = createFetchMock([
      new DOMException("Aborted", "AbortError"),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });
    const controller = new AbortController();

    await expect(
      client.request({ path: "/me", signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "abort" });
  });

  test("normalizes malformed JSON responses", async () => {
    const { fetchImpl } = createFetchMock([
      new Response("{", {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await expect(client.request({ path: "/broken" })).rejects.toMatchObject({
      kind: "malformed-response",
      status: 200,
    });
  });

  test("normalizes non-JSON proxy errors", async () => {
    const { fetchImpl } = createFetchMock([
      new Response("Bad gateway", {
        headers: { "content-type": "text/plain" },
        status: 502,
      }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await expect(
      client.request({ path: "/proxy-error" }),
    ).rejects.toMatchObject({
      kind: "non-json-response",
      status: 502,
    });
  });

  test("does not recursively refresh the refresh endpoint", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
    ]);
    const client = createApiClient({
      baseUrl,
      fetch: fetchImpl,
      refresh: { onAccessToken: vi.fn() },
    });

    await expect(
      client.request({ method: "POST", path: "/auth/refresh" }),
    ).rejects.toMatchObject({ category: "unauthenticated" });
    expect(calls).toHaveLength(1);
  });

  test("does not recursively refresh when refresh returns non-auth failures", async () => {
    const failures = [
      jsonResponse(403, backendError("SUPPORT_ACCESS_DENIED"), false),
      new Response("{", {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
      new TypeError("refresh network failed"),
      jsonResponse(500, backendError("INTERNAL_ERROR"), false),
    ];

    for (const failure of failures) {
      const { calls, fetchImpl } = createFetchMock([
        jsonResponse(401, authExpiredEnvelope(), false),
        failure,
      ]);
      const client = createApiClient({
        baseUrl,
        fetch: fetchImpl,
        refresh: {},
      });

      await expect(client.request({ path: "/me" })).rejects.toBeTruthy();
      expect(
        calls.filter((call) => pathname(call) === "/api/v1/auth/refresh"),
      ).toHaveLength(1);
    }
  });

  test("replays one 401 after a successful cookie refresh", async () => {
    const onAccessToken = vi.fn();
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(200, refreshEnvelope("fresh-access-token")),
      jsonResponse(200, { data: { ok: true } }),
    ]);
    const client = createApiClient({
      baseUrl,
      fetch: fetchImpl,
      refresh: { onAccessToken },
    });

    const response = await client.request<{ data: { ok: boolean } }>({
      accessToken: "old-access-token",
      path: "/me",
    });

    expect(response.data.ok).toBe(true);
    expect(calls).toHaveLength(3);
    expect(pathname(calls[1])).toBe("/api/v1/auth/refresh");
    expect(calls[1].init?.credentials).toBe("include");
    expect(calls[1].init?.body).toBe('{"clientType":"WEB"}');
    expect(headerValue(calls[1], "authorization")).toBeNull();
    expect(headerValue(calls[2], "authorization")).toBe(
      "Bearer fresh-access-token",
    );
    expect(onAccessToken).toHaveBeenCalledWith(
      "fresh-access-token",
      expect.objectContaining({ accessToken: "fresh-access-token" }),
    );
  });

  test("preserves the same Idempotency-Key across a 401 replay", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(200, refreshEnvelope("fresh")),
      jsonResponse(200, { data: "ok" }),
    ]);
    const client = createApiClient({
      baseUrl,
      fetch: fetchImpl,
      refresh: {},
    });

    await client.request({
      idempotencyKey: "same-logical-command",
      method: "POST",
      path: "/commands",
    });

    expect(headerValue(calls[0], "idempotency-key")).toBe(
      "same-logical-command",
    );
    expect(headerValue(calls[2], "idempotency-key")).toBe(
      "same-logical-command",
    );
  });

  test("replays an original request at most once after refresh", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(200, refreshEnvelope("fresh")),
      jsonResponse(401, authExpiredEnvelope(), false),
    ]);
    const client = createApiClient({
      baseUrl,
      fetch: fetchImpl,
      refresh: {},
    });

    await expect(client.request({ path: "/me" })).rejects.toMatchObject({
      category: "unauthenticated",
    });
    expect(calls).toHaveLength(3);
  });

  test("coordinates concurrent 401s through a single refresh flight", async () => {
    const deferredRefresh = createDeferred<Response>();
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(401, authExpiredEnvelope(), false),
      deferredRefresh.promise,
      jsonResponse(200, { data: "first" }),
      jsonResponse(200, { data: "second" }),
    ]);
    const client = createApiClient({
      baseUrl,
      fetch: fetchImpl,
      refresh: {},
    });

    const first = client.request({ path: "/first" });
    const second = client.request({ path: "/second" });
    await Promise.resolve();
    deferredRefresh.resolve(jsonResponse(200, refreshEnvelope("fresh")));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { data: "first" },
      { data: "second" },
    ]);
    expect(
      calls.filter((call) => pathname(call) === "/api/v1/auth/refresh"),
    ).toHaveLength(1);
  });

  test("uses the refresh result token for all waiting replays even when the provider remains stale", async () => {
    const deferredRefresh = createDeferred<Response>();
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(401, authExpiredEnvelope(), false),
      deferredRefresh.promise,
      jsonResponse(200, { data: "first" }),
      jsonResponse(200, { data: "second" }),
    ]);
    const client = createApiClient({
      accessTokenProvider: () => "access-old",
      baseUrl,
      fetch: fetchImpl,
      refresh: {
        onAccessToken: async () => {
          await Promise.resolve();
        },
      },
    });

    const first = client.request({ path: "/first" });
    const second = client.request({ path: "/second" });
    await Promise.resolve();
    deferredRefresh.resolve(jsonResponse(200, refreshEnvelope("access-new")));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { data: "first" },
      { data: "second" },
    ]);
    expect(headerValue(calls[3], "authorization")).toBe("Bearer access-new");
    expect(headerValue(calls[4], "authorization")).toBe("Bearer access-new");
  });

  test("preserves each concurrent replay's own body, query, idempotency key, and support context", async () => {
    const deferredRefresh = createDeferred<Response>();
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(401, authExpiredEnvelope(), false),
      deferredRefresh.promise,
      jsonResponse(200, { data: "a" }),
      jsonResponse(200, { data: "b" }),
      jsonResponse(200, { data: "c" }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl, refresh: {} });

    const first = client.request({
      idempotencyKey: "key-a",
      method: "POST",
      path: "/commands/a",
      query: { cursor: "cursor&a" },
      supportSessionId: "support-a",
      body: { command: "a" },
    });
    const second = client.request({
      idempotencyKey: "key-b",
      method: "PATCH",
      path: "/commands/b",
      supportSessionId: "support-b",
      body: { command: "b" },
    });
    const third = client.request({
      method: "GET",
      path: "/commands/c",
      query: { page: 3 },
    });
    await Promise.resolve();
    deferredRefresh.resolve(jsonResponse(200, refreshEnvelope("fresh")));

    await expect(Promise.all([first, second, third])).resolves.toEqual([
      { data: "a" },
      { data: "b" },
      { data: "c" },
    ]);

    expect(pathWithSearch(calls[4])).toBe(
      "/api/v1/commands/a?cursor=cursor%26a",
    );
    expect(calls[4].init?.body).toBe('{"command":"a"}');
    expect(headerValue(calls[4], "idempotency-key")).toBe("key-a");
    expect(headerValue(calls[4], "x-support-session-id")).toBe("support-a");
    expect(calls[5].init?.method).toBe("PATCH");
    expect(calls[5].init?.body).toBe('{"command":"b"}');
    expect(headerValue(calls[5], "idempotency-key")).toBe("key-b");
    expect(headerValue(calls[5], "x-support-session-id")).toBe("support-b");
    expect(pathWithSearch(calls[6])).toBe("/api/v1/commands/c?page=3");
    expect(headerValue(calls[6], "idempotency-key")).toBeNull();
    expect(headerValue(calls[6], "x-support-session-id")).toBeNull();
  });

  test("keeps independent clients from sharing refresh flights or tokens", async () => {
    const { calls: callsA, fetchImpl: fetchA } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(200, refreshEnvelope("token-a")),
      jsonResponse(200, { data: "a" }),
    ]);
    const { calls: callsB, fetchImpl: fetchB } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(200, refreshEnvelope("token-b")),
      jsonResponse(200, { data: "b" }),
    ]);
    const clientA = createApiClient({ baseUrl, fetch: fetchA, refresh: {} });
    const clientB = createApiClient({ baseUrl, fetch: fetchB, refresh: {} });

    await expect(
      Promise.all([
        clientA.request({ path: "/client-a" }),
        clientB.request({ path: "/client-b" }),
      ]),
    ).resolves.toEqual([{ data: "a" }, { data: "b" }]);

    expect(headerValue(callsA[2], "authorization")).toBe("Bearer token-a");
    expect(headerValue(callsB[2], "authorization")).toBe("Bearer token-b");
  });

  test("callback failure rejects waiters consistently and clears refresh state for a later refresh", async () => {
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(200, refreshEnvelope("failed-callback-token")),
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(200, refreshEnvelope("next-token")),
      jsonResponse(200, { data: "next" }),
    ]);
    const callbackError = new Error("auth callback failed");
    let shouldThrow = true;
    const client = createApiClient({
      baseUrl,
      fetch: fetchImpl,
      refresh: {
        onAccessToken: () => {
          if (shouldThrow) {
            shouldThrow = false;
            throw callbackError;
          }
        },
      },
    });

    await expect(
      Promise.all([
        client.request({ path: "/first" }),
        client.request({ path: "/second" }),
      ]),
    ).rejects.toBe(callbackError);

    await expect(client.request({ path: "/later" })).resolves.toEqual({
      data: "next",
    });
    expect(
      calls.filter((call) => pathname(call) === "/api/v1/auth/refresh"),
    ).toHaveLength(2);
  });

  test("one aborted waiter does not cancel a shared refresh needed by another request", async () => {
    const deferredRefresh = createDeferred<Response>();
    const calls: FetchCall[] = [];
    const fetchFunction = async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push({ init, input });

      if (calls.length === 1 || calls.length === 2) {
        return jsonResponse(401, authExpiredEnvelope(), false);
      }

      if (calls.length === 3) {
        return deferredRefresh.promise;
      }

      if (init?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      return jsonResponse(200, {
        data: pathname({ input, init }),
      });
    };
    const fetchImpl = Object.assign(fetchFunction, {
      preconnect: vi.fn(),
    }) satisfies typeof fetch;
    const client = createApiClient({ baseUrl, fetch: fetchImpl, refresh: {} });
    const abortingController = new AbortController();

    const aborted = client.request({
      path: "/aborted",
      signal: abortingController.signal,
    });
    const survives = client.request({ path: "/survives" });
    await Promise.resolve();
    abortingController.abort();
    deferredRefresh.resolve(jsonResponse(200, refreshEnvelope("fresh")));

    await expect(aborted).rejects.toMatchObject({ kind: "abort" });
    await expect(survives).resolves.toEqual({
      data: "/api/v1/survives",
    });
    expect(
      calls.filter((call) => pathname(call) === "/api/v1/auth/refresh"),
    ).toHaveLength(1);
  });

  test("propagates refresh failure as a typed session failure", async () => {
    const { fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(
        401,
        {
          error: {
            code: "REFRESH_TOKEN_INVALID",
            message: "Refresh token invalid",
          },
        },
        false,
      ),
    ]);
    const client = createApiClient({
      baseUrl,
      fetch: fetchImpl,
      refresh: {},
    });

    await expect(client.request({ path: "/me" })).rejects.toMatchObject({
      category: "unauthenticated",
      code: "REFRESH_TOKEN_INVALID",
      kind: "backend",
      message: "Web refresh failed; the user session is no longer valid",
    });
  });

  test("does not expose refresh tokens to JavaScript storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(401, authExpiredEnvelope(), false),
      jsonResponse(200, refreshEnvelope("fresh")),
      jsonResponse(200, { data: true }),
    ]);
    const client = createApiClient({
      baseUrl,
      fetch: fetchImpl,
      refresh: {},
    });

    await client.request({ path: "/me" });

    expect(calls[1].init?.body).toBe('{"clientType":"WEB"}');
    expect(setItem).not.toHaveBeenCalled();
  });

  test("rejects caller attempts to smuggle protected headers", async () => {
    const { fetchImpl } = createFetchMock([jsonResponse(200, { data: true })]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await expect(
      client.request({
        headers: { Authorization: "Bearer bypass" },
        path: "/me",
      }),
    ).rejects.toThrow("Use the explicit API client option for authorization");
  });

  test("rejects protected header smuggling regardless of case or Headers input", async () => {
    const { fetchImpl } = createFetchMock([
      jsonResponse(200, { data: true }),
      jsonResponse(200, { data: true }),
    ]);
    const client = createApiClient({ baseUrl, fetch: fetchImpl });

    await expect(
      client.request({
        headers: { AUTHORIZATION: "Bearer bypass" },
        path: "/auth-header",
      }),
    ).rejects.toThrow("authorization");
    await expect(
      client.request({
        headers: new Headers({
          "IdEmPoTeNcY-kEy": "bypass",
          "X-SuPpOrT-SeSsIoN-Id": "bypass",
        }),
        path: "/typed-headers",
      }),
    ).rejects.toThrow(/idempotency-key|x-support-session-id/);
  });

  test("keeps ApiError detectable for later feature boundaries", () => {
    const error = new ApiError({
      category: "support-access",
      kind: "backend",
      message: "Support denied",
      status: 403,
    });

    expect(isApiError(error)).toBe(true);
    expect(isApiError(new Error("plain"))).toBe(false);
  });
});

function createFetchMock(
  responses: Array<Response | Error | Promise<Response>>,
): {
  calls: FetchCall[];
  fetchImpl: typeof fetch;
} {
  const calls: FetchCall[] = [];
  const queue = [...responses];
  const fetchFunction = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    calls.push({ init, input });
    const next = queue.shift();

    if (next === undefined) {
      throw new Error("Unexpected fetch call");
    }

    if (next instanceof Error || next instanceof DOMException) {
      throw next;
    }

    return next;
  };
  const fetchImpl = Object.assign(fetchFunction, {
    preconnect: vi.fn(),
  }) satisfies typeof fetch;

  return { calls, fetchImpl };
}

function jsonResponse(
  status: number,
  body: unknown,
  ok = status < 400,
): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
    statusText: ok ? "OK" : "Error",
  });
}

function authExpiredEnvelope() {
  return {
    error: {
      code: "AUTH_TOKEN_EXPIRED",
      message: "Access token expired",
    },
  };
}

function backendError(code: string) {
  return {
    error: {
      code,
      message: `${code} message`,
    },
  };
}

function refreshEnvelope(accessToken: string) {
  return {
    data: {
      accessToken,
      restrictedUntilVerified: false,
      user: {
        emailVerified: true,
        firstName: "A",
        id: "user_1",
        lastName: "B",
        phoneVerified: true,
      },
    },
  };
}

function headerValue(call: FetchCall, header: string): string | null {
  return new Headers(call.init?.headers).get(header);
}

function pathname(call: FetchCall): string {
  return new URL(String(call.input)).pathname;
}

function pathWithSearch(call: FetchCall): string {
  const url = new URL(String(call.input));

  return `${url.pathname}${url.search}`;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}
