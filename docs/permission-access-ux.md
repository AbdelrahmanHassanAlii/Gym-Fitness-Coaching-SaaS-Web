# WEB-010 Permission And Access UX

WEB-010 adds a frontend UX layer for Backend Stage 4 access facts. It is not an
authorization boundary. Backend route authorization remains authoritative for
every direct API call.

## Verified Backend Contract

- Permission identifiers are explicit Backend registry strings.
- Contexts are `PLATFORM` and `WORKSPACE`.
- Effects are `ALLOW` and `DENY`.
- Scopes are `SELF`, `SPECIFIC_TRAINEES`, `BRANCH`, `MULTIPLE_BRANCHES`,
  `ASSIGNED_TRAINEES`, and `WORKSPACE`.
- Backend evaluation can return effective permission decisions with
  `allowed`, `effect`, `source`, scope, explicit deny/override markers, and
  reasons.
- Explicit DENY wins over ALLOW at equal effective decision points.
- Backend exposes permission definitions and membership/profile/access
  administration routes. It does not expose one generic current-user
  `can(permission)` endpoint for every frontend surface.

## Frontend Boundary

Frontend access checks may hide, disable, or explain UI. They never prove that
an action is secure. If the frontend displays an action as allowed and Backend
later returns 403, the command failed and the user remains authenticated.

The Web layer fails closed:

- unresolved access is not allowed;
- unavailable access facts are not allowed;
- stale session/workspace/support context is not allowed;
- malformed or missing decisions are not allowed;
- denied and unauthenticated are distinct states.

## Identifier Strategy

`src/contracts/permissions/contracts.ts` contains a Web-owned audited list of
Backend permission identifiers from the locked Backend registry. The Web repo
does not import Backend source at runtime and does not create a shared fourth
package. Drift must be handled by a future contract audit whenever Backend adds
or renames permission keys.

## Context Model

Access facts are tied to:

- auth session generation;
- workspace id where applicable;
- non-secret access context: `user` or `support`;
- permission context: `WORKSPACE` or `PLATFORM`.

Raw support-session ids must never be placed in query keys. Support results use
the non-secret access-context discriminator only. Platform access remains
separate from workspace/gym roles.

Branch and relationship access require explicit scoped facts. Workspace access
does not imply every branch, and trainer role labels do not imply relationship
access.

## Restricted Accounts

`restrictedUntilVerified` is retained by WEB-009 auth state. WEB-010 does not
invent a permission policy from that field. Backend remains authoritative for
restricted-session behavior.

## Components

`AccessGate` supports hide/fallback/loading rendering. `AccessControlledButton`
keeps destructive or protected actions disabled while access is unresolved or
denied and exposes an accessible state description.

## 403 Handling

`accessDeniedByBackend` converts a Backend 403 into a denied access result.
Ordinary 403, validation, quota, and network errors do not log out the user.
Only authenticated-session failures remain WEB-009 territory.

## Future Consumption

WEB-011 and later product features can fetch Backend effective access facts and
feed them into this layer. They must keep cache keys scoped by session,
workspace, and non-secret access context, and must never derive permissions from
role names alone.
