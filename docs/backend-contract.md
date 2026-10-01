# WEB-006 Backend Contract Evidence

Issue: WEB-006 / #6

Web baseline: `2da0374e15002135b77a6dfeb9da327478517a7e`

Backend evidence baseline inspected:

- Local repository: `D:\Hasssan\Edara\Gym & Fitness Coaching SaaS\apps\backend`
- Backend origin: `https://github.com/AbdelrahmanHassanAlii/Gym-Fitness-Coaching-SaaS-Backend.git`
- Backend HEAD inspected: `d926cacccbfb6cfb68ca578a8d1895be47bf81b1`
- Backend remote `origin/main` observed locally at `188502c`
- Backend working tree remained clean.

## Source Of Truth

The Backend implementation is authoritative for Web V1 contracts. OpenAPI is useful only after regeneration and implementation review. Route files, TypeBox schemas, services, access control, idempotency, support access, tests, and existing Backend V1 docs win when they disagree with generated artifacts.

Confidence labels used by Web:

| Label                                                | Meaning                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `VERIFIED_FROM_IMPLEMENTATION`                       | Verified directly from Backend route/service/schema code.                               |
| `VERIFIED_FROM_OPENAPI_AND_IMPLEMENTATION`           | Regenerated OpenAPI and implementation agree.                                           |
| `DOCUMENTED_BEHAVIOR_NOT_FULLY_EXPRESSED_IN_OPENAPI` | Backend docs/source prove behavior that OpenAPI does not encode.                        |
| `PROVIDER_DEPENDENT`                                 | Contract depends on storage, messaging, or other provider behavior.                     |
| `UNVERIFIED_FOLLOW_UP`                               | Do not invent frontend fields or flows; create/resolve follow-up before implementation. |

## OpenAPI Revalidation

Generator: `apps/backend/scripts/export-openapi.ts`, invoked by `bun run openapi:emit`.

Checked artifact status:

| Artifact                                                | Paths | Operations | Method counts                                | Verdict                     |
| ------------------------------------------------------- | ----: | ---------: | -------------------------------------------- | --------------------------- |
| Existing `docs/apidog/openapi.json` before regeneration |   158 |        188 | GET 57, POST 102, PUT 9, PATCH 16, DELETE 4  | Stale                       |
| Fresh implementation export                             |   197 |        233 | GET 78, POST 121, PUT 10, PATCH 17, DELETE 7 | Current generated inventory |

Important limitations:

- The exporter heuristically adds optional `Idempotency-Key` to many authenticated mutating operations. It does not prove a route requires idempotency.
- `x-support-session-id` behavior is registered globally and is not fully represented in OpenAPI.
- Auth refresh cookie semantics, support context behavior, permission specificity, category-bound cursors, and Stage 18 time semantics require implementation evidence.
- The root Apidog artifact is outside the Backend Git repository in this local workspace. It was regenerated for analysis and is not committed by WEB-006.

## Module Contract Inventory

| Area                                          | Route group / purpose                                                                     | Frontend contract summary                                                                                                                                                 | Confidence                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Auth / Identity                               | `/api/v1/auth/*`, `/api/v1/me`                                                            | Register/login/MFA/refresh/logout, current user, restricted sessions, bearer access tokens. Web refresh uses a secure refresh cookie.                                     | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Workspace / Platform / Branches / Memberships | `/api/v1/platform/*`, `/api/v1/workspaces/*`, `/api/v1/me/workspaces`                     | Workspace selection, staff/platform membership management, branch membership, invitation acceptance. Some membership/access mutations use `accessVersion`.                | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Permissions / Access Control                  | `/api/v1/permissions`, permission profiles/access routes                                  | Backend permissions are authoritative. Frontend role labels are UX hints only. Explicit grants can allow or deny by scope.                                                | `DOCUMENTED_BEHAVIOR_NOT_FULLY_EXPRESSED_IN_OPENAPI` |
| Subscriptions / Payments / Entitlements       | Workspace billing and platform subscription/payment routes                                | Entitlement/quota failures are not generic permission failures. Payment/plan/subscription commands often require idempotency and `expectedVersion`.                       | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Leads / Owner Activation                      | Public leads and platform lead routes                                                     | Public lead creation, platform lead transitions, conversion, owner activation. Conversion/activation commands are idempotent where wrapped.                               | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Trainee Relationships                         | `/relationships`, trainee invitation/referral/migration/assignment commands               | `relationshipId` is the coaching relationship id. Relationship lifecycle and assignment commands use CAS on relationship version where schema includes `expectedVersion`. | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Training                                      | Exercise, program template, assigned program routes                                       | Program/template revisions and activation; `expectedVersion` protects mutable aggregates. Program activation commands are idempotent where wrapped.                       | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Workouts / PRs                                | Workout start/current/list/detail/complete/abandon/corrections, PR routes                 | Command routes use expected versions and selected idempotent wrappers. `relationshipId` scopes the workout to the coaching relationship.                                  | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Nutrition                                     | Foods and relationship nutrition plans                                                    | Food/plan updates use expected versions. Nutrition plan activation and selected commands are idempotent.                                                                  | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Progress                                      | Metric definitions, measurements, photos, health profile, notes, adherence/daily tracking | Several updates require expected versions. Daily tracking uses local date semantics and workspace timezone edit windows.                                                  | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Check-ins                                     | Templates, assignments, instances, submit/review                                          | Template/assignment/check-in mutations use expected versions. Check-in recurrence has its own timezone and period fields.                                                 | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Files / Documents                             | Upload intent, confirmation, download URL, file delete/restore, relationship documents    | Backend direct-upload workflow. Upload intent response currently omits the provider-signed headers object even though S3 provider signs headers.                          | `PROVIDER_DEPENDENT`                                 |
| Notifications                                 | `/api/v1/me/notifications`, preferences, push devices                                     | Cursor list, read/read-all, preferences with expectedVersion, push devices. No exact unread-count route was found.                                                        | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Audit                                         | Workspace and platform audit list routes                                                  | Cursor/list behavior documented in Backend V1 guides; sensitive audit permission matters.                                                                                 | `DOCUMENTED_BEHAVIOR_NOT_FULLY_EXPRESSED_IN_OPENAPI` |
| Support Access                                | `/api/v1/platform/support/*`, global `x-support-session-id` resolver                      | Support sessions can be `USER_CONTEXT` or `WORKSPACE_SUPPORT`. Runtime revalidates session, actor, parent auth, policy, IP, workspace, and sensitive gates.               | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Exports / Retention / Deletion                | Workspace exports and platform deletion lifecycle                                         | Export creation and deletion approval use idempotent wrappers. Support context is forbidden for export/deletion operations.                                               | `VERIFIED_FROM_IMPLEMENTATION`                       |
| Dashboards / Analytics                        | Stage 18 dashboard/analytics routes                                                       | Dashboard/analytics routes use workspace timezone, `[from,to)` ranges, route-specific granularity, category-bound cursors, and support-sensitive gates.                   | `VERIFIED_FROM_IMPLEMENTATION`                       |

## Web Auth Contract

Verified Web behavior:

- Web client type is `WEB`.
- Web refresh credential is a secure first-party HttpOnly cookie named `__Secure-gym_refresh`.
- Cookie path is `/api/v1/auth`.
- Cookie uses `Secure`, `HttpOnly`, `Max-Age` from refresh token TTL, and configured SameSite.
- Register, login, MFA login verify, and refresh set the cookie for `WEB` clients and remove `refreshToken` from the JSON response.
- Native/API clients use JSON refresh token transport.
- Web refresh reads the cookie, validates allowed origin for cookie flows, rotates refresh token, sets the new cookie, and returns a new access token response.
- Logout clears the Web refresh cookie when present.

WEB-009 owns auth UI/session implementation. WEB-007 owns HTTP transport mechanics.

## Idempotency Contract

Do not infer idempotency from HTTP method or OpenAPI. A route requires `Idempotency-Key` only when it calls `container.idempotency.runInTransaction` or `runInTransactionForActor`, or explicitly checks the header.

Verified route groups requiring idempotency:

- workspace invitation acceptance;
- lead owner activation, conversion, duplicate/merge commands;
- manual payment, plan/version, trial, subscription transition, payment review commands;
- trainee invitation, referral join, migration, relationship lifecycle/assignment commands where wrapped;
- training program activation/progress commands where wrapped;
- workout start/complete/abandon/correct/day skip/day defer commands;
- nutrition activation and selected nutrition commands;
- measurement/progress selected commands;
- check-in revision, assignment, submit, review commands where wrapped;
- file upload intent, confirm upload, file delete/restore, document create/delete;
- workspace export request creation;
- support access request start;
- retention/deletion approval route with explicit key requirement.

Idempotency service behavior:

- Missing or blank key returns `IDEMPOTENCY_KEY_REQUIRED`.
- Same key and same fingerprint can replay the original response.
- Same key with a different fingerprint returns `IDEMPOTENCY_KEY_REUSED`.
- In-progress command returns `IDEMPOTENCY_REQUEST_IN_PROGRESS`.
- Previous failed command returns `IDEMPOTENCY_PREVIOUS_ATTEMPT_FAILED`.

WEB-007 should generate one key per user command and reuse it only for retrying the exact same request.

## expectedVersion / CAS Contract

`expectedVersion` protects mutations when the request schema includes it. The value comes from the latest read DTO version, revision, or accessVersion. A 409 `*_VERSION_CONFLICT`, `*_REVISION_CONFLICT`, or access-version conflict must refetch and ask the user to reconcile. Do not auto-retry stale bodies.

Verified areas with expected-version semantics include permissions/access, subscriptions/payments, leads, relationships, training, workouts, nutrition, progress, check-ins, files/documents, notifications preferences, support policies/sessions, and retention/deletion.

## Permission And Scope Contract

Backend permission checks are security boundaries. Web permissions are only for visibility, enabling, and reducing predictable 403s.

Verified concepts:

- Permission keys are explicit strings in the Backend registry.
- Permission contexts are platform or workspace.
- Scopes include `SELF`, `SPECIFIC_TRAINEES`, `BRANCH`, `MULTIPLE_BRANCHES`, `ASSIGNED_TRAINEES`, and `WORKSPACE`.
- Explicit `DENY` beats `ALLOW` at equal specificity.
- More specific explicit grants beat less specific grants.
- Current specificity order in implementation is `SELF` > `SPECIFIC_TRAINEES` > `BRANCH` > `MULTIPLE_BRANCHES` > `ASSIGNED_TRAINEES` > `WORKSPACE`.
- Managers can be constrained by active branch assignments.
- Trainers, assistant trainers, and nutritionists are relationship-assignment scoped unless broader permission grants exist.
- `relationshipId` means coaching relationship id, not trainee user id.

WEB-010 owns frontend permission/access UX.

## Support Access Contract

The global support resolver reads `x-support-session-id` before downstream routes.

`USER_CONTEXT`:

- Requires target workspace, target user, and effective workspace membership.
- Workspace authorization uses the effective tenant membership's normal permissions and grants.
- Runtime revalidates that the target user and effective membership remain valid and active.

`WORKSPACE_SUPPORT`:

- Allows workspace inspection without effective tenant membership.
- Allows read/download permissions and the specific file download URL POST.
- Business writes fail with `SUPPORT_READ_ONLY` or `SUPPORT_WRITE_NOT_WHITELISTED`.

Sensitive support:

- Sensitive data requires support platform permission plus session allowance.
- Sensitive file download additionally requires `support.sensitive_files.read` and `allowSensitiveFileDownload`.
- Support context is forbidden for export and retention/deletion operations.

## Pagination And Cursor Contract

There is no universal cursor DTO. Web cursors must be opaque and bound to the filter/category/range that produced them.

Verified shapes:

- Ordinary cursor list query: `cursor`, `limit`.
- Notification cursor: base64url JSON `{ createdAt, id }`, response `page.nextCursor`.
- File document cursor: opaque `createdAt_id`, response `pageInfo`.
- Older list routes can use ObjectId-like cursors or fixed non-cursor lists.
- Dashboard analytics has category-bound cursors such as `attentionCursor`, `activityCursor`, and `branchCursor`.
- Progress analytics has route-specific cursor, limit up to 500, and progress-specific cursor errors.

WEB-008 can later add utilities, but WEB-006 intentionally does not create a fake universal cursor abstraction.

## Time And Timezone Contract

Stage 18 analytics and dashboard behavior:

- Analytics accepts date-only values or timezone-qualified instants for `from` and `to`.
- Offsetless date-time strings are rejected.
- Date-only values resolve at workspace IANA local midnight.
- Ranges are half-open: `[from,to)`.
- Default is the last 30 local calendar days through the current instant.
- Maximum local-day span is 366 days.
- Future `to` values are accepted if the range is valid.
- Week buckets start on local Monday.
- Server-returned `range.from`, `range.to`, and `range.timezone` are authoritative.
- Check-in recurrence timezone is assignment-specific and can differ from workspace timezone.

WEB-008 owns date utilities; WEB-006 documents the contract only.

## Files And Documents

Verified lifecycle:

1. Create upload intent.
2. Upload binary to returned storage URL.
3. Confirm upload with `expectedVersion`.
4. Optionally create relationship document metadata.
5. Request download URL when needed.
6. Delete/restore/purge follows backend lifecycle.

Verified file constants:

- Upload MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
- Max upload size: 200 MiB.
- Upload intent TTL: 15 minutes.
- Upload URL TTL: 10 minutes.
- Standard download URL TTL: 5 minutes.
- Sensitive download URL TTL: 2 minutes.
- Mandatory sensitive document categories: `INBODY`, `BLOOD_TEST`, `MEDICAL_REPORT`, `INJURY_REPORT`.

Upload signed-header finding:

- S3 provider signs `content-length`, `content-type`, `if-none-match: *`, and optionally `x-amz-checksum-sha256`.
- The upload-intent API response verified in `file.service.ts` returns `uploadUrl`, expiries, reserved bytes, and expected version, but does not expose a provider-signed headers map.
- Browser upload can send headers matching the intent, but whether that is sufficient is provider-dependent. Do not invent a `headers` DTO until Backend exposes it or provider integration proves it unnecessary.

## Notifications

Verified:

- List supports `cursor`, `limit` 1..100, and `unread`.
- Response has notifications plus `page.nextCursor`; no exact unread-count route was found.
- Mark-read and read-all are authenticated commands but are not idempotency wrapped.
- Preferences update requires `expectedVersion`.
- Push devices support `IOS`, `ANDROID`, and `WEB`.
- Preference enforcement is implemented during delivery processing for email/push and mandatory events can bypass preferences.
- Do not assume preferences suppress notification record creation unless the relevant registry/delivery behavior proves it.

## Dashboard And Analytics

Verified Stage 18 routes:

- `GET /api/v1/workspaces/:workspaceId/dashboard/trainer`
- `GET /api/v1/workspaces/:workspaceId/dashboard/gym`
- `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/dashboard`
- `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/analytics/training`
- `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/analytics/progress`
- `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/analytics/nutrition`
- `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/analytics/adherence`

Verified DTO concerns:

- Ratio values are API numbers; chart UX must inspect module docs before assuming percent vs 0..1 scale.
- Analytics series can be sparse.
- Progress analytics supports `none`, `day`, `week`, `month`.
- Other relationship analytics supports `day`, `week`.
- Dashboard attention/activity sections have independent category-bound cursors.
- Recent Activity can be restricted by permission and cursor category.
- Support-sensitive permissions apply to sensitive dashboard/analytics routes.

## Error Contract

Runtime error envelope:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": {},
    "correlationId": "request-correlation-id"
  }
}
```

Frontend rules:

- Use `error.code` first, HTTP status second.
- Preserve `correlationId`.
- `VALIDATION_FAILED` is route schema validation.
- `AUTH_REQUIRED`, `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_INVALID`, and `REFRESH_TOKEN_INVALID` drive auth recovery.
- Permission denials, support denials, quota/entitlement denials, not found, version conflicts, idempotency conflicts, and provider/storage failures must be handled as distinct categories.
- Do not parse `message` for logic.

## Relationship ID Safety

`relationshipId` is the coaching relationship id. It is not automatically:

- trainee user id;
- workspace membership id;
- assignment id.

Web code should use semantic names and type aliases such as `RelationshipId`, `UserId`, and `MembershipId` rather than plain `id` in DTO surfaces.
