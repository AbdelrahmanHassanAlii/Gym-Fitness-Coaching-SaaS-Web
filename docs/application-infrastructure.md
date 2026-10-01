# WEB-008 Application Infrastructure

Issue: WEB-008 / #8

This document describes the reusable application-data layer above the locked WEB-007 transport. It does not implement auth/account lifecycle, permission UX, staff shell, product hooks, dashboards, or file/document flows.

## Dependencies

WEB-008 adds:

- `@tanstack/react-query` for server-state cache ownership, query cancellation, retries, mutation policy, and future feature query composition.
- `react-hook-form` for form state primitives and provider integration.

No schema validation library is added yet. Backend validation remains authoritative, OpenAPI does not express every behavioral rule, and no concrete product forms exist yet to justify duplicating schemas. Future feature forms can add route-specific schemas when they have real field contracts and localized UX needs.

## Query Client Lifecycle

`AppQueryProvider` is a narrow Client Component nested below the Server Component root layout. It creates one browser `QueryClient` through a lazy `useState` initializer, avoiding a new client per render. Server Components are preserved; the root layout still resolves `lang`, `dir`, and theme bootstrap server-side.

Do not share a module-global `QueryClient` for SSR requests. Generic prefetch/hydration is deferred until a feature needs it.

## Default Policy

Queries:

- `staleTime`: 30 seconds
- `gcTime`: 10 minutes
- `refetchOnWindowFocus`: false
- retry: only bounded network failures and server-class failures, maximum two retries

Mutations:

- `retry`: false

The retry policy does not retry 400, 401, 403, 404, or 409 errors. CAS/version conflicts, idempotency conflicts, validation errors, auth failures, permission denials, quota/entitlement errors, and support errors are left for feature UX.

## Cancellation

`createApiQueryFn` forwards TanStack Query's `AbortSignal` to WEB-007 request options. Deliberate cancellation should remain transport cancellation, not a user-facing network failure.

## Query Keys

All keys start with:

```text
["hassan-web", ...]
```

Factories support workspace/resource/list/detail/relationship shapes without pre-creating product modules. Query keys must not contain access tokens, refresh tokens, support-session ids, authorization headers, cookies, signed URLs, passwords, or other secrets. Support context may affect authorization, but the secret support-session id does not belong in cache keys.

## Cache Session And Tenant Boundary

WEB-009 can call `clearSessionQueryCache(queryClient)` on logout/session change to remove protected cached data before another user can see it. Later workspace context code can call `removeWorkspaceQueryCache` or `invalidateWorkspaceQueryCache` for tenant transitions.

WEB-008 does not implement logout, current user, workspace state, or route protection.

## Pagination

WEB-006 verified multiple pagination shapes. WEB-008 does not create one universal Backend page DTO. Pagination helpers accept caller-supplied next-page resolution and preserve opaque cursors unchanged. Endpoint-specific cursor interpretation belongs with feature contracts.

## Forms And Validation

React Hook Form is the shared form state primitive. Infrastructure exports the provider/hooks and localized reusable validation message keys for Arabic and English.

`getBackendValidationSummary` preserves Backend validation code, message, and raw details. It intentionally does not map arbitrary details into field errors because WEB-006 did not verify a universal field-path shape.

## Date And Time

`DateOnly` is represented as a branded `YYYY-MM-DD` string after calendar validation. Helpers preserve the string and do not convert DateOnly values to UTC instants for business logic.

Offset timestamps must include `Z` or an explicit numeric offset. Formatting an instant requires an explicit IANA timezone for business display. Workspace timezone semantics remain owned by Backend/product features when converting local dates to server ranges.

Half-open ranges preserve the locked `[from,to)` semantics. WEB-008 does not implement DST arithmetic, recurrence scheduling, or fixed `+24h` local calendar math.

## Boundaries

- WEB-008 owns server-state, forms, validation conventions, and date/time primitives.
- WEB-009 owns auth/session lifecycle.
- WEB-010 owns permission/access UX.
- WEB-018 owns provider-dependent direct upload flows.
