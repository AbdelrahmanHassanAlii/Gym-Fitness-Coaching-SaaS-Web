# WEB-009 Auth And Session Lifecycle

WEB-009 adds the Web application authentication/session layer above the locked
WEB-007 transport. Backend remains authoritative for credential validation,
refresh-token rotation, cookie attributes, session revocation, MFA, and all
authorization decisions.

## Verified Backend Contract

- Login: `POST /api/v1/auth/login` with `{ identifier, password, clientType:
"WEB" }`.
- MFA login completion: `POST /api/v1/auth/mfa/login/verify` with
  `{ mfaChallengeToken, factorType, credential }`.
- Refresh/session bootstrap: `POST /api/v1/auth/refresh` with
  `{ clientType: "WEB" }` and browser credentials.
- Logout: `POST /api/v1/auth/logout`.
- Web refresh transport uses the secure HttpOnly `__Secure-gym_refresh` cookie
  scoped by Backend to `/api/v1/auth`. JavaScript never reads this cookie.
- Successful Web login, MFA login, and refresh return an access token and safe
  user identity while Backend sets or rotates the refresh cookie.

## State Machine

The frontend auth state is intentionally small:

- `initializing`: session is unresolved and protected content must not render.
- `authenticated`: memory-only access token and safe user identity are present.
- `unauthenticated`: no access token and no authenticated identity are present.

MFA challenge is a login-command result, not an authenticated application state.
The browser remains unauthenticated until MFA verification returns an auth token
response.

## Token Ownership

WEB-009 owns the in-memory access token. It is never written to
`localStorage`, `sessionStorage`, or cookies by frontend code. WEB-007 reads it
through an explicit provider and updates future state through its
`onAccessToken` refresh callback. Requests that participated in a refresh still
replay with the refresh result supplied directly by WEB-007.

The refresh token is owned by Backend and browser cookie transport. Frontend
code does not parse cookies and does not persist refresh tokens.

## Bootstrap

On protected/auth route entry the session controller performs a cookie-backed
refresh once per concurrent bootstrap flight. Success establishes an
authenticated state. Failure clears protected query cache and transitions to
`unauthenticated`.

If the public Backend base URL is not configured, public pages still render.
Auth commands fail with a typed configuration error and do not create local auth
state.

## Stale Async Protection

The controller increments a session generation and rotates its WEB-007 client
when replacing or clearing a session. Old refresh callbacks carry the old client
epoch and cannot overwrite a newer login or resurrect a logged-out session.
Bootstrap and authenticated query guards also compare generation before applying
results.

## Logout

Logout sends the verified Backend logout request with browser credentials. Local
logout cleanup always removes access token, identity, and session query cache.
If the server request fails, WEB-009 reports a `local-only` logout result: local
protected state is gone, but server revocation was not confirmed.

## Cache Boundary

WEB-009 uses WEB-008 `clearSessionQueryCache` on bootstrap failure, successful
login/session replacement, logout, and terminal session expiry. Ordinary
forbidden or validation errors do not destroy the auth session.

## Routes

`/login` is a minimal auth route for login and MFA login completion.
`/app` is a protected foundation route used only to prove session gating. It is
not a staff shell, dashboard, permission surface, or product feature.

Return URLs are sanitized to internal application paths. Absolute,
protocol-relative, malformed, and backslash-containing values fall back to
`/app`.

## Cross-Tab Semantics

V1 does not add `BroadcastChannel` or token synchronization. Each tab keeps its
own memory-only access token. If another tab logs out, Backend cookie/session
authority and the next refresh/protected request determine whether the current
tab can continue. Terminal refresh failure clears the local tab state.

## Boundaries

- WEB-007 owns HTTP transport, cookie refresh mechanics, and refresh
  single-flight replay.
- WEB-008 owns query/form/date infrastructure and cache clearing primitives.
- WEB-009 owns auth/session lifecycle and authentication-level route gating.
- WEB-010 owns permission/access UX.
- Later product issues own workspace screens, staff shell, dashboards, files,
  notifications, and support console behavior.
