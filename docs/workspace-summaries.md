# Platform workspace subscription and counts summaries

The existing `/platform/workspaces/[workspaceId]` page composes two independent read-only cards. Its locked `platform_workspaces.manage` parent gate remains unchanged.

- Subscription uses only `GET /api/v1/platform/workspaces/:workspaceId/subscription-summary` and requires `subscriptions.read`. The older provisioning-capable subscription GET is not used.
- Counts uses `GET /api/v1/platform/workspaces/:workspaceId/counts` and independently requires `platform_workspaces.manage`.
- The existing Platform effective-access mechanism requests the additional commercial decision only on workspace detail routes. No gym role, workspace membership, or support authority is inferred.

Strict decoders reject unexpected/missing fields, invalid lifecycle/billing values, malformed dates, invalid identifiers, wrong workspace identity, and counts that are not nonnegative safe integers.

Each query includes workspace, principal, authentication generation, Platform membership, accessVersion, authority lifetime, permission and permission availability. Existing PlatformShell expiry and protected async epochs retire data and suppress late responses. No second expiry timer or persisted cache is added.

403 retires the affected card and refreshes Platform authority without logout. 404 WORKSPACE_NOT_FOUND from either card retires the entire workspace view and preserves q/status return navigation. Network/5xx/integrity failures remain unavailable states, never subscription absence or zero counts. Cards load and fail independently.

A null subscription is a localized empty state. Pending subscriptions without terms show status and no current plan. Term starts/ends describe validity, not invoice cycles. Dates use existing locale utilities in UTC, with an explicit localized timezone note. Empty lifecycle dates are omitted. Plan/version identifiers and all commercial internals stay out of the rendered UI.

Counts show only active branches, active coaching relationships, needs-reassignment relationships, and active staff memberships including owners. Counts are current live observations; zero is valid. Archived workspaces remain eligible. Retention can reduce surviving counts.

English/Arabic labels, RTL inheritance, semantic headings/status/errors/description lists, responsive metric wrapping, and semantic retry buttons are included. No subscription or billing mutation controls, quotas/usage UI, new route, or package dependency is added.
