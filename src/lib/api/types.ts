import type { AuthTokenResponseDto } from "@/contracts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryPrimitive = string | number | boolean | null | undefined;
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[];
export type QueryParams = Readonly<Record<string, QueryValue>>;

export interface ApiRequestOptions<
  TBody = unknown,
  TQuery extends QueryParams = QueryParams,
> {
  method?: HttpMethod;
  path: string;
  query?: TQuery;
  body?: TBody;
  accessToken?: string | null;
  supportSessionId?: string | null;
  idempotencyKey?: string | null;
  headers?: HeadersInit;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  refreshOnUnauthorized?: boolean;
}

export interface CookieRefreshOptions {
  credentials?: RequestCredentials;
  onAccessToken?: (
    accessToken: string,
    response: AuthTokenResponseDto,
  ) => void | Promise<void>;
  path?: string;
}

export interface ApiClientOptions {
  accessTokenProvider?: () => string | null | Promise<string | null>;
  baseUrl: string;
  credentials?: RequestCredentials;
  fetch?: typeof fetch;
  refresh?: false | CookieRefreshOptions;
}

export interface ApiClient {
  request<TResponse, TBody = unknown, TQuery extends QueryParams = QueryParams>(
    options: ApiRequestOptions<TBody, TQuery>,
  ): Promise<TResponse>;
}

export interface NormalizedRequestOptions {
  accessToken?: string | null;
  body?: unknown;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  idempotencyKey?: string | null;
  method: HttpMethod;
  path: string;
  query?: QueryParams;
  signal?: AbortSignal;
  supportSessionId?: string | null;
}
