# WEB-007 API Client

Issue: WEB-007 / #7

This document describes the Web HTTP transport foundation. It does not implement React Query, auth/account state, permission UX, product repositories, dashboards, or file upload workflows.

## Architecture

The client lives under `src/lib/api` and uses native `fetch`. It consumes Web-owned contracts from `src/contracts` and the existing public config seam for `NEXT_PUBLIC_BACKEND_API_BASE_URL`.

Request paths are API-relative. The transport composes:

```text
NEXT_PUBLIC_BACKEND_API_BASE_URL + /api/v1 + request path
```

The composer tolerates a configured base URL that already ends in `/api/v1`, but request paths must not be absolute URLs or protocol-relative URLs.

## Auth Seam

WEB-007 accepts an explicit `accessToken` per request or an optional `accessTokenProvider`. It can attach:

```text
Authorization: Bearer <token>
```

It does not persist tokens, read local storage, read auth cookies, create React context, implement route guards, or own account state. WEB-009 owns those behaviors.

## Web Refresh

Web refresh uses the locked WEB-006 cookie contract. JavaScript does not read the HttpOnly refresh cookie. When configured, refresh sends:

```text
POST /api/v1/auth/refresh
credentials: include
body: { "clientType": "WEB" }
```

The client coordinates concurrent 401 responses through one refresh flight per client instance. After refresh succeeds, each eligible original request is replayed at most once with the refreshed access token and the original idempotency key. The refresh endpoint itself is never refresh-retried.

## Retry Policy

There is no generic automatic retry for network errors, timeouts, 5xx responses, version conflicts, or idempotency conflicts. A single 401 replay after a successful refresh is the only automatic replay. This preserves Backend command semantics where a request may have reached the server even if the browser did not receive a response.

## Idempotency

Idempotency is command-specific. The transport never attaches `Idempotency-Key` to every mutation. Callers pass an explicit key for commands that WEB-006 marks idempotent. `createIdempotencyKey()` is available for callers that need a UUID, but a logical command retry must reuse the same key.

## Support Context

Support context is explicit:

```text
x-support-session-id: <support session id>
```

The client never fabricates or infers a support session id. Later support-console work owns active support context selection and expiry handling.

## Serialization

Query serialization is deterministic and preserves strings as supplied, including date-only values, offset timestamps, and opaque cursors. `undefined` is omitted. `null` is serialized as an empty value only when the caller explicitly supplies it.

JSON request bodies are stringified once. `204` and empty successful responses resolve to `undefined`. Non-JSON and malformed JSON responses become typed transport errors.

## Errors

`ApiError` preserves HTTP status, Backend error code, message, details, and correlation id when available. Error categories distinguish validation, unauthenticated/session failure, forbidden, not found, expected-version conflict, idempotency conflict, entitlement/quota, support access, provider/storage, network, abort, non-JSON, and malformed response cases.

Callers should use Backend `error.code` first and HTTP status second. Message text is not a logic contract.

## Cancellation And Timeout

Requests accept `AbortSignal`. WEB-007 does not impose a default timeout because the correct timeout budget is product-flow and deployment dependent. Future infrastructure can pass an abort signal or timeout controller without changing the transport contract.

## File Upload Boundary

The client is ready to transport file API DTOs, but it does not implement provider direct-upload behavior. WEB-006 left signed upload headers provider-dependent because the upload-intent response does not expose a generic provider-signed header map. WEB-018 owns product file/document flows.

## Security

The transport does not log tokens, cookies, idempotency keys, support-session ids, signed URLs, or sensitive bodies. Protected headers are supplied through explicit options rather than caller-smuggled custom headers.
