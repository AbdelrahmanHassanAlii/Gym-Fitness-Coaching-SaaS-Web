const protectedRequestHeaders = new Set([
  "authorization",
  "cookie",
  "idempotency-key",
  "x-support-session-id",
]);

export interface BuildHeadersOptions {
  accessToken?: string | null;
  body?: unknown;
  headers?: HeadersInit;
  idempotencyKey?: string | null;
  supportSessionId?: string | null;
}

export function buildRequestHeaders(options: BuildHeadersOptions): Headers {
  const headers = new Headers();
  headers.set("accept", "application/json");

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  mergeCallerHeaders(headers, options.headers);

  if (options.accessToken !== undefined && options.accessToken !== null) {
    headers.set("authorization", `Bearer ${options.accessToken}`);
  }

  if (
    options.supportSessionId !== undefined &&
    options.supportSessionId !== null
  ) {
    headers.set("x-support-session-id", options.supportSessionId);
  }

  if (options.idempotencyKey !== undefined && options.idempotencyKey !== null) {
    headers.set("idempotency-key", options.idempotencyKey);
  }

  return headers;
}

function mergeCallerHeaders(headers: Headers, callerHeaders?: HeadersInit) {
  if (callerHeaders === undefined) {
    return;
  }

  const normalized = new Headers(callerHeaders);

  normalized.forEach((value, key) => {
    const lowerKey = key.toLowerCase();

    if (protectedRequestHeaders.has(lowerKey)) {
      throw new Error(`Use the explicit API client option for ${lowerKey}`);
    }

    headers.set(key, value);
  });
}
