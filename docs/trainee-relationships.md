# WEB-014 Trainee Relationship Workflows

WEB-014 implements the Gym Staff Portal surface for Backend-supported trainee coaching relationships and assignment commands. The frontend remains a UX client only: Backend relationship routes, Stage 4 access checks, version checks, idempotency, and assignment eligibility remain authoritative.

## Implemented Scope

- Relationship list and detail for the selected staff workspace.
- Status filtering using the Backend `status` query parameter.
- Relationship identity display, including explicit `relationshipId` versus `traineeUserId` separation.
- Home-branch change command.
- Primary trainer set/remove commands.
- Assistant trainer add/remove commands.
- Nutritionist add/remove commands.
- Assignment command confirmations for removal actions.

WEB-014 does not implement training, workouts, nutrition plans, progress/check-ins, files, analytics dashboards, platform lead workflows, or support console behavior. Those remain WEB-015+ or later-stage work.

## Contract Matrix

| UI capability          | Method   | Route                                                                                       | Request                                                          | Response                                  | Permission                                                | Version/CAS                  | Idempotency                                   |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- | ---------------------------- | --------------------------------------------- |
| List relationships     | `GET`    | `/api/v1/workspaces/:workspaceId/relationships`                                             | query `status?`                                                  | array of `safeRelationship(...)`          | `trainees.read`                                           | none                         | none                                          |
| Relationship detail    | `GET`    | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId`                             | none                                                             | `{ relationship: safeRelationship(...) }` | service-level `trainees.read` or SELF active trainee read | none                         | none                                          |
| Change home branch     | `PUT`    | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId/home-branch`                 | `{ expectedVersion, homeBranchId, primaryTrainerMembershipId? }` | relationship command response             | `trainees.update`                                         | `expectedVersion` body field | `Idempotency-Key` required by command wrapper |
| Set primary trainer    | `PUT`    | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId/primary-trainer`             | `{ expectedVersion, primaryTrainerMembershipId, reason? }`       | relationship command response             | `trainees.assignments.primary.manage`                     | `expectedVersion` body field | `Idempotency-Key` required by command wrapper |
| Remove primary trainer | `DELETE` | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId/primary-trainer`             | `{ expectedVersion, reason? }`                                   | relationship command response             | `trainees.assignments.primary.manage`                     | `expectedVersion` body field | `Idempotency-Key` required by command wrapper |
| Add assistant          | `POST`   | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId/assistants`                  | `{ expectedVersion, staffMembershipId, reason? }`                | relationship command response             | `trainees.assignments.assistant.manage`                   | `expectedVersion` body field | `Idempotency-Key` required by command wrapper |
| Remove assistant       | `DELETE` | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId/assistants/:membershipId`    | `{ expectedVersion, reason? }`                                   | relationship command response             | `trainees.assignments.assistant.manage`                   | `expectedVersion` body field | `Idempotency-Key` required by command wrapper |
| Add nutritionist       | `POST`   | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutritionists`               | `{ expectedVersion, staffMembershipId, reason? }`                | relationship command response             | `trainees.assignments.nutritionist.manage`                | `expectedVersion` body field | `Idempotency-Key` required by command wrapper |
| Remove nutritionist    | `DELETE` | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutritionists/:membershipId` | `{ expectedVersion, reason? }`                                   | relationship command response             | `trainees.assignments.nutritionist.manage`                | `expectedVersion` body field | `Idempotency-Key` required by command wrapper |

## Security And Access Boundary

WEB-010 access facts drive presentation. Missing, stale, denied, unavailable, or malformed access facts fail closed for relationship assignment commands. Role names do not grant access, and no role-to-permission map is introduced. Backend remains the authorization boundary for every command.

Relationship assignment route guards are workspace-scoped Backend permission checks. Relationship-specific assignment and eligibility rules are revalidated by the Backend service; Web does not treat relationship-scoped facts, list membership, candidate rows, or staff role labels as command authorization.

The relationship detail route has Backend SELF semantics for an active trainee’s own relationship. WEB-014 is a Gym Staff Portal surface, so it does not reinterpret SELF access as staff assignment authority.

## Identity And Cache Boundaries

Relationship queries are scoped by:

- auth/session generation;
- workspace id;
- relationship id for detail;
- status filter for list;
- non-secret access context.

Query keys never include access tokens, refresh tokens, cookies, raw support session ids, or unnecessary PII. Runtime guards fail closed when response workspace or relationship identity does not match the requested context.

`relationshipId` is never interchangeable with `traineeUserId`. The runtime guard rejects a relationship row whose `id` equals `traineeUserId`, because that would make relationship-scoped access and trainee-user identity ambiguous in the UI.

## Version And Idempotency

All assignment and relationship mutation commands preserve Backend `expectedVersion` as an explicit body field. WEB-014 does not invent `If-Match` or a header CAS variant.

All mutation commands send a command-specific `Idempotency-Key`. One logical command keeps one stable key through an ambiguous retry. A successful command retires that logical key, and a materially different command receives a new key. Duplicate UI submission is blocked separately from Backend idempotency.

## Error Semantics

- `401`: locked WEB-007/WEB-009 auth handling.
- `403`: access-denied UX, no logout.
- `409`: conflict/idempotency conflict UX, no silent overwrite.
- `422`: validation UX.
- network/5xx/malformed: unavailable or fail-closed UX, not Backend denial.

Removal commands use Backend terminology such as remove assignment. They do not claim hard deletion or implement restore flows.
