# Platform Portal foundation

WEB-021 establishes `/platform` as a portal boundary separate from the Staff Portal at `/app`.

The shell discovers only the authenticated real actor through `GET /api/v1/me/platform-context`. An `ACTIVE` Platform membership is required before the shell evaluates the normalized three-permission foundation batch through `POST /api/v1/platform/me/effective-access/decisions`.

The visible entries are gated respectively by `platform_workspaces.manage`, `platform_users.read`, and `audit.platform.read`. Workspaces links to the read-only `/platform/workspaces` directory. Users and Operations remain non-clickable placeholders. Operations uses audit read only as the approved WEB-021 visibility signal; it does not define the final Operations product or fetch audit data.

WEB-021 has no list queries, selectors, domain mutations, sensitive domain data, polling, WebSocket, or SSE behavior. A non-null Backend `validUntil` retires and refetches the decision set at expiry. An access-version conflict hides all prior decisions, rediscovers Platform context, and only then evaluates the current version.

Authenticated browser E2E remains unavailable without an unsafe production auth seam. Browser coverage is limited to unauthenticated `/platform` route protection; authenticated Platform behavior is covered at the component/API seams.

## Workspace directory V1

The directory calls `GET /api/v1/platform/workspaces` with an explicit page size of 50 and an optional Backend-issued cursor. The cursor is opaque and is returned unchanged for continuation requests. Pages use Backend `_id` keyset order; the UI does not claim created-date or snapshot ordering.

The strict response boundary accepts only top-level `data` and `meta`. Rows contain exactly `id`, `name`, `status`, and `createdAt`; owner, subscription, count, tenant-policy, and lifecycle-action data are absent. Duplicate IDs within or across loaded pages fail closed.

The root query identity includes the principal, auth generation, Platform membership, access version, decision expiry identity, and fixed page size. A changed identity starts from page one. WEB-021 authority expiry removes the routed content, while a continuation failure may retain earlier rows only under the still-current authority. `CURSOR_INVALID` offers a first-page restart.

Search, filters, selectable sorting, workspace detail, create, owner selection, lifecycle actions, subscriptions, and counts remain deferred. Authenticated browser E2E remains unavailable; `/platform/workspaces` has unauthenticated redirect coverage and its authenticated behavior is verified at component and API seams.
