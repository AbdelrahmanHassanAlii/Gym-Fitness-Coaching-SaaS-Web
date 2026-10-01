import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";
import type {
  AuthTokenResponseDto,
  SafeAuthUserDto,
  UserId,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import { AuthSessionController } from "./session-controller";
import { getSafeReturnPath } from "./redirects";

type FetchCall = {
  init?: RequestInit;
  input: RequestInfo | URL;
};

const baseUrl = "https://api.example.test";

const userA: SafeAuthUserDto = {
  email: "a@example.test",
  emailVerified: true,
  firstName: "A",
  id: "user_a" as UserId,
  lastName: "User",
  phoneVerified: false,
};

const userB: SafeAuthUserDto = {
  email: "b@example.test",
  emailVerified: true,
  firstName: "B",
  id: "user_b" as UserId,
  lastName: "User",
  phoneVerified: false,
};

describe("auth session lifecycle", () => {
  test("starts unresolved and restores a cookie-backed session once for concurrent bootstrap", async () => {
    const queryClient = new QueryClient();
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: tokenResponse("bootstrap-token", userA) }),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient,
    });

    expect(auth.state.status).toBe("initializing");

    const [first, second] = await Promise.all([
      auth.bootstrap(),
      auth.bootstrap(),
    ]);

    expect(first.status).toBe("authenticated");
    expect(second.status).toBe("authenticated");
    expect(auth.getAccessToken()).toBe("bootstrap-token");
    expect(calls).toHaveLength(1);
    expect(String(calls[0].input)).toBe(
      "https://api.example.test/api/v1/auth/refresh",
    );
    expect(calls[0].init?.credentials).toBe("include");
    expect(calls[0].init?.body).toBe('{"clientType":"WEB"}');
  });

  test("failed bootstrap clears protected cache and becomes unauthenticated", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["session", "old"], { private: true });
    const { fetchImpl } = createFetchMock([
      backendError(401, "REFRESH_TOKEN_INVALID"),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient,
    });

    await auth.bootstrap();

    expect(auth.state.status).toBe("unauthenticated");
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  test("logs in without storing refresh tokens in browser storage and clears prior cache", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["session", "old"], { private: true });
    const localStorageSpy =
      typeof localStorage === "undefined"
        ? null
        : vi.spyOn(localStorage, "setItem");
    const sessionStorageSpy =
      typeof sessionStorage === "undefined"
        ? null
        : vi.spyOn(sessionStorage, "setItem");
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: tokenResponse("login-token", userA) }),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient,
    });

    const result = await auth.login({
      identifier: "a@example.test",
      password: "password",
    });

    expect(result.status).toBe("authenticated");
    expect(auth.state).toMatchObject({
      accessToken: "login-token",
      status: "authenticated",
      user: userA,
    });
    expect(calls[0].init?.body).toBe(
      '{"identifier":"a@example.test","password":"password","clientType":"WEB"}',
    );
    if (localStorageSpy !== null) {
      expect(localStorageSpy).not.toHaveBeenCalled();
    }
    if (sessionStorageSpy !== null) {
      expect(sessionStorageSpy).not.toHaveBeenCalled();
    }
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  test("returns MFA challenge without authenticating until verified", async () => {
    const { fetchImpl } = createFetchMock([
      jsonResponse(200, {
        data: {
          availableMethods: ["TOTP"],
          mfaChallengeToken: "challenge-token",
          status: "MFA_REQUIRED",
        },
      }),
      jsonResponse(200, { data: tokenResponse("mfa-token", userA) }),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient: new QueryClient(),
    });

    const login = await auth.login({
      identifier: "a@example.test",
      password: "password",
    });

    expect(login.status).toBe("mfa-required");
    expect(auth.state.status).toBe("unauthenticated");

    const verified = await auth.verifyMfaLogin({
      credential: "123456",
      factorType: "TOTP",
      mfaChallengeToken: "challenge-token",
    });

    expect(verified.accessToken).toBe("mfa-token");
    expect(auth.state.status).toBe("authenticated");
  });

  test("login failure leaves a coherent unauthenticated state", async () => {
    const { fetchImpl } = createFetchMock([
      backendError(401, "AUTH_CREDENTIALS_INVALID"),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient: new QueryClient(),
    });

    await expect(
      auth.login({ identifier: "a@example.test", password: "wrong" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(auth.state.status).toBe("unauthenticated");
    expect(auth.getAccessToken()).toBeNull();
  });

  test("logout clears token identity and cache even when server logout fails", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["session", "old"], { private: true });
    const { fetchImpl } = createFetchMock([
      jsonResponse(200, { data: tokenResponse("login-token", userA) }),
      backendError(500, "INTERNAL_ERROR"),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient,
    });
    await auth.login({ identifier: "a@example.test", password: "password" });
    queryClient.setQueryData(["session", "new"], { private: true });

    const result = await auth.logout();

    expect(result.status).toBe("local-only");
    expect(auth.state.status).toBe("unauthenticated");
    expect(auth.getAccessToken()).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  test("terminal refresh failure clears local session while ordinary forbidden does not", async () => {
    const auth = new AuthSessionController({
      baseUrl,
      fetch: createFetchMock([
        jsonResponse(200, { data: tokenResponse("login-token", userA) }),
      ]).fetchImpl,
      queryClient: new QueryClient(),
    });
    await auth.login({ identifier: "a@example.test", password: "password" });

    const forbidden = new ApiError({
      category: "forbidden",
      kind: "backend",
      message: "Forbidden",
      status: 403,
    });
    await expect(
      auth.createAuthenticatedQueryGuard(async () => {
        throw forbidden;
      })({ signal: new AbortController().signal }),
    ).rejects.toBe(forbidden);
    expect(auth.state.status).toBe("authenticated");

    const expired = new ApiError({
      category: "unauthenticated",
      code: "REFRESH_TOKEN_INVALID",
      kind: "backend",
      message: "Expired",
      status: 401,
    });
    await expect(
      auth.createAuthenticatedQueryGuard(async () => {
        throw expired;
      })({ signal: new AbortController().signal }),
    ).rejects.toBe(expired);
    expect(auth.state.status).toBe("unauthenticated");
  });

  test("future token provider is updated after WEB-007 refresh callback", async () => {
    const { fetchImpl } = createFetchMock([
      jsonResponse(200, { data: tokenResponse("login-token", userA) }),
      backendError(401, "AUTH_TOKEN_EXPIRED"),
      jsonResponse(200, { data: tokenResponse("refresh-token", userA) }),
      jsonResponse(200, { data: { ok: true } }),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient: new QueryClient(),
    });
    await auth.login({ identifier: "a@example.test", password: "password" });

    await auth.apiClient.request({ path: "/me" });

    expect(auth.getAccessToken()).toBe("refresh-token");
  });

  test("stale bootstrap cannot overwrite a newer login", async () => {
    const refresh = deferred<Response>();
    const { fetchImpl } = createFetchMock([
      () => refresh.promise,
      jsonResponse(200, { data: tokenResponse("login-token", userB) }),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient: new QueryClient(),
    });

    const bootstrap = auth.bootstrap();
    await auth.login({ identifier: "b@example.test", password: "password" });
    refresh.resolve(
      jsonResponse(200, { data: tokenResponse("old-token", userA) }),
    );
    await bootstrap;

    expect(auth.state).toMatchObject({
      accessToken: "login-token",
      status: "authenticated",
      user: userB,
    });
  });

  test("stale refresh callback cannot resurrect or overwrite a newer session", async () => {
    const refresh = deferred<Response>();
    const { calls, fetchImpl } = createFetchMock([
      jsonResponse(200, { data: tokenResponse("token-a", userA) }),
      backendError(401, "AUTH_TOKEN_EXPIRED"),
      () => refresh.promise,
      jsonResponse(200, { data: tokenResponse("token-b", userB) }),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient: new QueryClient(),
    });
    await auth.login({ identifier: "a@example.test", password: "password" });
    const oldRequest = auth.apiClient
      .request({ path: "/me" })
      .catch(() => null);
    await waitForCalls(calls, 3);
    await auth.login({ identifier: "b@example.test", password: "password" });

    refresh.resolve(
      jsonResponse(200, { data: tokenResponse("stale-token", userA) }),
    );
    await oldRequest;

    expect(auth.state).toMatchObject({
      accessToken: "token-b",
      status: "authenticated",
      user: userB,
    });
  });

  test("old in-flight protected query cannot repopulate cache after logout", async () => {
    const response = deferred<{ private: true }>();
    const queryClient = new QueryClient();
    const { fetchImpl } = createFetchMock([
      jsonResponse(200, { data: tokenResponse("login-token", userA) }),
      jsonResponse(200, { data: { success: true } }),
    ]);
    const auth = new AuthSessionController({
      baseUrl,
      fetch: fetchImpl,
      queryClient,
    });
    await auth.login({ identifier: "a@example.test", password: "password" });

    const query = queryClient
      .fetchQuery({
        queryFn: auth.createAuthenticatedQueryGuard(
          async () => response.promise,
        ),
        queryKey: ["session", "protected"],
      })
      .catch(() => null);
    await auth.logout();
    response.resolve({ private: true });
    await query;

    expect(queryClient.getQueryData(["session", "protected"])).toBeUndefined();
  });

  test("rejects external return URLs", () => {
    expect(getSafeReturnPath("/app?tab=one")).toBe("/app?tab=one");
    expect(getSafeReturnPath("https://evil.example/app")).toBe("/app");
    expect(getSafeReturnPath("//evil.example/app")).toBe("/app");
    expect(getSafeReturnPath("%2F%2Fevil.example%2Fapp")).toBe("/app");
  });
});

function tokenResponse(
  accessToken: string,
  user: SafeAuthUserDto,
): AuthTokenResponseDto {
  return {
    accessToken,
    restrictedUntilVerified: false,
    user,
  };
}

function createFetchMock(
  responses: Array<Response | (() => Response | Promise<Response>)>,
): { calls: FetchCall[]; fetchImpl: typeof fetch } {
  const calls: FetchCall[] = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ init, input });
      const next = queue.shift();

      if (typeof next === "function") {
        return await next();
      }

      if (next === undefined) {
        throw new Error("No mocked response available");
      }

      return next;
    },
  ) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function backendError(status: number, code: string): Response {
  return jsonResponse(status, {
    error: {
      code,
      correlationId: `corr-${code}`,
      message: code,
    },
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function waitForCalls(calls: FetchCall[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (calls.length >= count) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error(`Expected ${count} fetch calls, received ${calls.length}`);
}
