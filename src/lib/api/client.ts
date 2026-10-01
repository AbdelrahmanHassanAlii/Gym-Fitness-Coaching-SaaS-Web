import type { ApiDataEnvelope, AuthTokenResponseDto } from "@/contracts";
import { buildRequestHeaders } from "./headers";
import { composeApiUrl, normalizeApiPath } from "./serialization";
import {
  ApiError,
  createBackendApiError,
  isApiError,
  type ApiErrorCategory,
} from "./errors";
import type {
  ApiClient,
  ApiClientOptions,
  ApiRequestOptions,
  CookieRefreshOptions,
  NormalizedRequestOptions,
  QueryParams,
} from "./types";

const defaultRefreshPath = "/auth/refresh";

export function createApiClient(options: ApiClientOptions): ApiClient {
  return new FetchApiClient(options);
}

class FetchApiClient implements ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly accessTokenProvider?: ApiClientOptions["accessTokenProvider"];
  private readonly credentials?: RequestCredentials;
  private readonly refresh: false | CookieRefreshOptions;
  private refreshFlight: Promise<AuthTokenResponseDto> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.fetchImpl = options.fetch ?? fetch;
    this.accessTokenProvider = options.accessTokenProvider;
    this.credentials = options.credentials;
    this.refresh = options.refresh ?? false;
  }

  async request<
    TResponse,
    TBody = unknown,
    TQuery extends QueryParams = QueryParams,
  >(options: ApiRequestOptions<TBody, TQuery>): Promise<TResponse> {
    const normalized = await this.normalizeOptions(options);

    try {
      return await this.send<TResponse>(normalized);
    } catch (error) {
      if (!this.shouldRefreshAfterError(error, normalized, options)) {
        throw error;
      }

      const tokenResponse = await this.refreshAccessToken();

      return this.send<TResponse>({
        ...normalized,
        accessToken: tokenResponse.accessToken,
      });
    }
  }

  private async normalizeOptions<TBody, TQuery extends QueryParams>(
    options: ApiRequestOptions<TBody, TQuery>,
  ): Promise<NormalizedRequestOptions> {
    const accessToken =
      options.accessToken !== undefined
        ? options.accessToken
        : await this.accessTokenProvider?.();

    return {
      accessToken,
      body: options.body,
      credentials: options.credentials ?? this.credentials,
      headers: options.headers,
      idempotencyKey: options.idempotencyKey,
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      path: normalizeApiPath(options.path),
      query: options.query,
      signal: options.signal,
      supportSessionId: options.supportSessionId,
    };
  }

  private async send<TResponse>(
    options: NormalizedRequestOptions,
  ): Promise<TResponse> {
    const url = composeApiUrl(this.baseUrl, options.path, options.query);
    const headers = buildRequestHeaders({
      accessToken: options.accessToken,
      body: options.body,
      headers: options.headers,
      idempotencyKey: options.idempotencyKey,
      supportSessionId: options.supportSessionId,
    });

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: options.credentials,
        headers,
        method: options.method,
        signal: options.signal,
      });
    } catch (error) {
      throw normalizeFetchFailure(error);
    }

    return parseApiResponse<TResponse>(response);
  }

  private shouldRefreshAfterError<TBody, TQuery extends QueryParams>(
    error: unknown,
    normalized: NormalizedRequestOptions,
    originalOptions: ApiRequestOptions<TBody, TQuery>,
  ): boolean {
    if (
      this.refresh === false ||
      originalOptions.refreshOnUnauthorized === false ||
      isRefreshPath(normalized.path) ||
      !isApiError(error) ||
      error.kind !== "backend" ||
      error.category !== "unauthenticated"
    ) {
      return false;
    }

    return true;
  }

  private async refreshAccessToken(): Promise<AuthTokenResponseDto> {
    if (this.refresh === false) {
      throw createSessionFailure();
    }

    if (this.refreshFlight === null) {
      this.refreshFlight = this.performCookieRefresh(this.refresh).finally(
        () => {
          this.refreshFlight = null;
        },
      );
    }

    return this.refreshFlight;
  }

  private async performCookieRefresh(
    refresh: CookieRefreshOptions,
  ): Promise<AuthTokenResponseDto> {
    const url = composeApiUrl(this.baseUrl, refresh.path ?? defaultRefreshPath);
    const headers = buildRequestHeaders({
      body: { clientType: "WEB" },
    });

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        body: JSON.stringify({ clientType: "WEB" }),
        credentials: refresh.credentials ?? "include",
        headers,
        method: "POST",
      });
    } catch (error) {
      throw normalizeFetchFailure(error);
    }

    try {
      const envelope =
        await parseApiResponse<ApiDataEnvelope<AuthTokenResponseDto>>(response);
      await refresh.onAccessToken?.(envelope.data.accessToken, envelope.data);
      return envelope.data;
    } catch (error) {
      if (isApiError(error) && error.category === "unauthenticated") {
        throw new ApiError({
          category: "unauthenticated",
          cause: error,
          code: error.code,
          correlationId: error.correlationId,
          details: error.details,
          kind: "backend",
          message: "Web refresh failed; the user session is no longer valid",
          status: error.status,
        });
      }

      throw error;
    }
  }
}

export async function parseApiResponse<TResponse>(
  response: Response,
): Promise<TResponse> {
  if (response.status === 204) {
    return undefined as TResponse;
  }

  const text = await response.text();

  if (text === "") {
    if (response.ok) {
      return undefined as TResponse;
    }

    throw new ApiError({
      category: categoryFromStatus(response.status),
      kind: "non-json-response",
      message: `HTTP ${response.status} response did not include a JSON error envelope`,
      status: response.status,
    });
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError({
      category: categoryFromStatus(response.status),
      kind: "non-json-response",
      message: `HTTP ${response.status} response was not JSON`,
      status: response.status,
    });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ApiError({
      cause: error,
      category: categoryFromStatus(response.status),
      kind: "malformed-response",
      message: `HTTP ${response.status} response contained malformed JSON`,
      status: response.status,
    });
  }

  if (!response.ok) {
    if (isApiErrorEnvelope(parsed)) {
      throw createBackendApiError(response.status, parsed);
    }

    throw new ApiError({
      category: categoryFromStatus(response.status),
      kind: "malformed-response",
      message: `HTTP ${response.status} response did not match the Backend error envelope`,
      status: response.status,
    });
  }

  return parsed as TResponse;
}

function normalizeFetchFailure(error: unknown): ApiError {
  if (isAbortError(error)) {
    return new ApiError({
      cause: error,
      category: "unknown",
      kind: "abort",
      message: "API request was aborted",
    });
  }

  return new ApiError({
    cause: error,
    category: "unknown",
    kind: "network",
    message: "API request failed before receiving a response",
  });
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function isApiErrorEnvelope(value: unknown): value is {
  error: {
    code: string;
    message: string;
    details?: unknown;
    correlationId?: string;
  };
} {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  const error = (value as { error: unknown }).error;

  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function isRefreshPath(path: string): boolean {
  return normalizeApiPath(path) === defaultRefreshPath;
}

function createSessionFailure(): ApiError {
  return new ApiError({
    category: "unauthenticated",
    kind: "backend",
    message: "Web refresh is not configured for this API client",
    status: 401,
  });
}

function categoryFromStatus(status: number): ApiErrorCategory {
  if (status === 401) {
    return "unauthenticated";
  }

  if (status === 403) {
    return "forbidden";
  }

  if (status === 404) {
    return "not-found";
  }

  return "unknown";
}
