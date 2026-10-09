# WEB-020 Dashboards, Analytics, And Timezone UX

WEB-020 adds the Staff Portal route `/app/analytics`. It consumes the locked
Backend Stage 18 read contracts only. The feature sends no mutation, body,
`Idempotency-Key`, or `expectedVersion`.

## Access boundary

The page uses the existing current-user Route A decision batch. Its seven data
permissions are the three dashboard reads and four relationship analytics
reads. `trainees.read` and `metric_definitions.read` are selector dependencies;
they do not make the navigation or page usable by themselves. Relationship
queries require a relationship returned by the current workspace selector, and
progress additionally requires an active metric returned by the metric
selector.

The relationship selector validates the Backend page envelope without
flattening it: `{ data: { data, meta: { nextCursor, hasMore } } }`. Analytics
responses are committed only when their workspace, relationship, and (for
progress) metric identities match the active targets. Nested sensitive
sections are validated as complete Stage 18 DTOs before rendering.

Support context is a whole-page denied/no-fetch state. This is intentional:
the locked Backend has a known mismatch between the Stage 18 sensitive access
mapping and the support session URL classifier. WEB-020 does not work around
that mismatch.

## Time contract

Analytics accepts date-only values or timestamps with an explicit offset.
Ranges are half-open `[from,to)`. Date-only values represent workspace-local
calendar midnights, and the Backend's returned `range` or `window` is the sole
authority for rendered boundaries and timezone. The Web does not add 24 hours
to construct a local day and does not substitute browser or branch timezone.
The Backend's 366-local-day maximum is inclusive, so two date-only endpoints
may differ by at most 365 calendar days.

## Pagination

Branch, attention-category, activity-category, metric, and progress-point
cursors remain opaque and independently keyed. A continuation is committed
only while its principal, session generation, workspace, membership, access
context/version, target, filter, category, expected cursor, and pagination
generation are still current. Progress points and branch rows are deduplicated
by stable ID without reordering Backend results.

Branch-scoped attention continuations and cursor recovery retain the active
`branchId`. Category completions reconcile against current state so parallel
attention or activity pages cannot erase sibling results. Explicit refresh
retires every pagination generation before fetching authoritative first pages.

Recent activity follows a two-phase read: the initial gym request carries no
activity continuation parameters. Activity pagination is enabled only after a
validated response reports `scope.pureWorkspaceWide` and includes the section.
Trainer dashboard requests never send activity parameters.

## Testing boundary

Vitest component and integration tests cover access AND-gates, runtime response
validation, query identity, category isolation, more-than-500 point merging,
date-only/DST examples, and stale continuation rejection. Playwright covers
unauthenticated route protection only.

`AUTHENTICATED ANALYTICS E2E NOT AVAILABLE — INFRASTRUCTURE DEBT`
