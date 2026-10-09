# Platform Portal foundation

WEB-021 establishes `/platform` as a portal boundary separate from the Staff Portal at `/app`.

The shell discovers only the authenticated real actor through `GET /api/v1/me/platform-context`. An `ACTIVE` Platform membership is required before the shell evaluates the normalized three-permission foundation batch through `POST /api/v1/platform/me/effective-access/decisions`.

The visible Workspaces, Users, and Operations items are non-clickable navigation placeholders. They are gated respectively by `platform_workspaces.manage`, `platform_users.read`, and `audit.platform.read`. Operations uses audit read only as the approved WEB-021 visibility signal; it does not define the final Operations product or fetch audit data.

WEB-021 has no list queries, selectors, domain mutations, sensitive domain data, polling, WebSocket, or SSE behavior. A non-null Backend `validUntil` retires and refetches the decision set at expiry. An access-version conflict hides all prior decisions, rediscovers Platform context, and only then evaluates the current version.

Authenticated browser E2E remains unavailable without an unsafe production auth seam. Browser coverage is limited to unauthenticated `/platform` route protection; authenticated Platform behavior is covered at the component/API seams.
