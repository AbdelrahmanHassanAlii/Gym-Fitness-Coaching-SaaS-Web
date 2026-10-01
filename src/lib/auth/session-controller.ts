import type {
  ApiDataEnvelope,
  AuthSuccessDto,
  AuthTokenResponseDto,
  LoginResponseDto,
  WebRefreshRequestDto,
} from "@/contracts";
import {
  ApiError,
  createApiClient,
  isApiError,
  type ApiClient,
} from "@/lib/api";
import type { QueryClient } from "@tanstack/react-query";
import { clearSessionQueryCache } from "@/lib/server-state";
import type {
  AuthenticatedAuthState,
  AuthSessionSnapshot,
  AuthState,
  LoginCommand,
  LoginCommandResult,
  LogoutResult,
  MfaLoginCommand,
  UnauthenticatedAuthState,
} from "./types";

const unauthenticatedState: UnauthenticatedAuthState = {
  accessToken: null,
  restrictedUntilVerified: false,
  status: "unauthenticated",
  user: null,
};

const initializingState: AuthState = {
  accessToken: null,
  restrictedUntilVerified: false,
  status: "initializing",
  user: null,
};

export interface AuthSessionControllerOptions {
  baseUrl: string | null;
  fetch?: typeof fetch;
  queryClient: QueryClient;
}

export class AuthSessionController {
  private apiClientEpoch = 0;
  private bootstrapFlight: Promise<AuthState> | null = null;
  private readonly baseUrl: string | null;
  private readonly fetchImpl?: typeof fetch;
  private sessionGeneration = 0;
  private readonly listeners = new Set<() => void>();
  private readonly queryClient: QueryClient;
  private stateValue: AuthState = initializingState;
  private transport: ApiClient;

  constructor(options: AuthSessionControllerOptions) {
    this.baseUrl = options.baseUrl;
    this.fetchImpl = options.fetch;
    this.queryClient = options.queryClient;
    this.transport = this.createTransport();
  }

  get apiClient(): ApiClient {
    return this.transport;
  }

  get state(): AuthState {
    return this.stateValue;
  }

  get generation(): number {
    return this.sessionGeneration;
  }

  getAccessToken = (): string | null => {
    return this.stateValue.accessToken;
  };

  getSnapshot = (): AuthSessionSnapshot => ({
    apiClient: this.transport,
    generation: this.sessionGeneration,
    state: this.stateValue,
  });

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  async bootstrap(): Promise<AuthState> {
    if (this.stateValue.status === "authenticated") {
      return this.stateValue;
    }

    if (this.bootstrapFlight !== null) {
      return this.bootstrapFlight;
    }

    const startedGeneration = this.sessionGeneration;
    this.setState(initializingState);
    this.bootstrapFlight = this.requestCookieRefresh()
      .then((response) => {
        if (this.sessionGeneration !== startedGeneration) {
          return this.stateValue;
        }

        return this.establishSession(response, { clearCache: true });
      })
      .catch((error: unknown) => {
        if (this.sessionGeneration === startedGeneration) {
          this.terminateLocalSession(toApiError(error));
        }

        return this.stateValue;
      })
      .finally(() => {
        this.bootstrapFlight = null;
      });

    return this.bootstrapFlight;
  }

  async login(command: LoginCommand): Promise<LoginCommandResult> {
    this.startSessionReplacement();
    this.ensureBackendConfigured();

    try {
      const envelope = await this.transport.request<
        ApiDataEnvelope<LoginResponseDto>
      >({
        body: { ...command, clientType: "WEB" },
        method: "POST",
        path: "/auth/login",
        refreshOnUnauthorized: false,
      });

      if (isMfaRequiredLogin(envelope.data)) {
        this.setState(unauthenticatedState);
        return { challenge: envelope.data, status: "mfa-required" };
      }

      const session = this.establishSession(envelope.data, {
        clearCache: true,
      });
      return { session, status: "authenticated" };
    } catch (error) {
      this.terminateLocalSession(toApiError(error));
      throw error;
    }
  }

  async verifyMfaLogin(
    command: MfaLoginCommand,
  ): Promise<AuthenticatedAuthState> {
    this.startSessionReplacement();
    this.ensureBackendConfigured();

    try {
      const envelope = await this.transport.request<
        ApiDataEnvelope<AuthTokenResponseDto>
      >({
        body: command,
        method: "POST",
        path: "/auth/mfa/login/verify",
        refreshOnUnauthorized: false,
      });

      return this.establishSession(envelope.data, { clearCache: true });
    } catch (error) {
      this.terminateLocalSession(toApiError(error));
      throw error;
    }
  }

  async logout(): Promise<LogoutResult> {
    const startedGeneration = this.sessionGeneration;
    let result: LogoutResult = { status: "server-confirmed" };

    try {
      this.ensureBackendConfigured();
      await this.transport.request<ApiDataEnvelope<AuthSuccessDto>>({
        credentials: "include",
        method: "POST",
        path: "/auth/logout",
        refreshOnUnauthorized: false,
      });
    } catch (error) {
      result = { error: toApiError(error), status: "local-only" };
    } finally {
      if (this.sessionGeneration === startedGeneration) {
        this.terminateLocalSession(
          result.status === "local-only" ? result.error : undefined,
        );
      }
    }

    return result;
  }

  markSessionExpired(error?: ApiError): void {
    this.terminateLocalSession(error);
  }

  createAuthenticatedQueryGuard<T>(
    read: (apiClient: ApiClient, signal: AbortSignal) => Promise<T>,
  ): (context: { signal: AbortSignal }) => Promise<T> {
    return async (context) => {
      const startedGeneration = this.sessionGeneration;
      let result: T;

      try {
        result = await read(this.transport, context.signal);
      } catch (error) {
        if (
          isApiError(error) &&
          error.kind === "backend" &&
          error.category === "unauthenticated"
        ) {
          this.terminateLocalSession(error);
        }

        throw error;
      }

      if (this.sessionGeneration !== startedGeneration) {
        throw new ApiError({
          category: "unauthenticated",
          kind: "abort",
          message: "Ignored stale authenticated response after session changed",
        });
      }

      return result;
    };
  }

  private createTransport(): ApiClient {
    const epoch = this.apiClientEpoch;

    return createApiClient({
      accessTokenProvider: this.getAccessToken,
      baseUrl: this.baseUrl ?? "http://127.0.0.1",
      fetch: this.fetchImpl,
      refresh: {
        onAccessToken: (accessToken, response) => {
          this.applyRefreshResult(epoch, accessToken, response);
        },
      },
    });
  }

  private rotateTransport(): void {
    this.apiClientEpoch += 1;
    this.transport = this.createTransport();
  }

  private async requestCookieRefresh(): Promise<AuthTokenResponseDto> {
    this.ensureBackendConfigured();
    const envelope = await this.transport.request<
      ApiDataEnvelope<AuthTokenResponseDto>,
      WebRefreshRequestDto
    >({
      body: { clientType: "WEB" },
      credentials: "include",
      method: "POST",
      path: "/auth/refresh",
      refreshOnUnauthorized: false,
    });

    return envelope.data;
  }

  private applyRefreshResult(
    epoch: number,
    accessToken: string,
    response: AuthTokenResponseDto,
  ): void {
    if (
      epoch !== this.apiClientEpoch ||
      this.stateValue.status !== "authenticated" ||
      this.stateValue.user.id !== response.user.id
    ) {
      return;
    }

    this.setState({
      accessToken,
      restrictedUntilVerified: response.restrictedUntilVerified,
      status: "authenticated",
      user: response.user,
    });
  }

  private establishSession(
    response: AuthTokenResponseDto,
    options: { clearCache: boolean },
  ): AuthenticatedAuthState {
    this.sessionGeneration += 1;
    this.rotateTransport();

    if (options.clearCache) {
      clearSessionQueryCache(this.queryClient);
    }

    const state: AuthenticatedAuthState = {
      accessToken: response.accessToken,
      restrictedUntilVerified: response.restrictedUntilVerified,
      status: "authenticated",
      user: response.user,
    };
    this.setState(state);

    return state;
  }

  private startSessionReplacement(): void {
    this.sessionGeneration += 1;
    this.rotateTransport();
    clearSessionQueryCache(this.queryClient);
    this.setState(unauthenticatedState);
  }

  private terminateLocalSession(error?: ApiError): void {
    this.sessionGeneration += 1;
    this.rotateTransport();
    clearSessionQueryCache(this.queryClient);
    this.setState(
      error
        ? { ...unauthenticatedState, lastError: error }
        : unauthenticatedState,
    );
  }

  private setState(state: AuthState): void {
    this.stateValue = state;
    this.listeners.forEach((listener) => listener());
  }

  private ensureBackendConfigured(): void {
    if (this.baseUrl !== null) {
      return;
    }

    throw new ApiError({
      category: "unknown",
      kind: "network",
      message: "Backend API base URL is not configured",
    });
  }
}

function isMfaRequiredLogin(
  value: LoginResponseDto,
): value is Extract<LoginResponseDto, { status: "MFA_REQUIRED" }> {
  return "status" in value && value.status === "MFA_REQUIRED";
}

function toApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  return new ApiError({
    cause: error,
    category: "unknown",
    kind: "network",
    message: "Authentication operation failed",
  });
}
