# WEB-015 Training, Workouts, And PRs

WEB-015 adds the Gym Staff Portal surface for relationship-scoped training program activation, workout session oversight, day progression commands, and personal-record reads. It consumes Backend Stage 8/9 contracts and keeps Backend authorization, lifecycle validation, assignment eligibility, personal-record recalculation, and workout execution rules authoritative.

The Web layer does not create a training policy engine. Roles do not grant training access, relationship list membership does not grant detail or mutation access, and assignment presence is not treated as authorization. WEB-010 access facts are used only to fail closed and present controls coherently before Backend revalidates every request.

## Implemented Scope

- Relationship-scoped program list, program detail, and program progress reads.
- Relationship-scoped current workout and recent workout reads.
- Relationship-scoped personal-record and personal-record-event reads.
- Exercise-library reads for the program editor.
- Scratch program creation with structured days and exercise prescriptions.
- New immutable program revisions with the loaded program's CAS version.
- Workout actuals editing and completed-workout corrections with PR recalculation owned by Backend.
- Program activation.
- Workout start, complete, and abandon commands.
- Program day skip and defer commands.
- Staff-shell navigation to `/app/training`.

The supporting exercise library is read-only. Platform exercise administration, reusable template administration, mobile workout execution, nutrition, analytics, notifications, files, and WEB-016+ workflows are deferred. The editor consumes existing exercises and creates programs for the selected coaching relationship; it does not create a new exercise taxonomy or a frontend assignment policy.

## Backend Contract Matrix

| Capability             | Backend route                                                                                           | Permission                                            | Body/query                                | CAS                                | Idempotency                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| List programs          | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/programs`                            | `programs.read`                                       | `limit`, `cursor`, `includeArchived`      | None                               | None                                                                  |
| Program detail         | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/programs/:programId`                 | `programs.read` plus Backend relationship read access | None                                      | None                               | None                                                                  |
| Program progress       | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/programs/:programId/progress`        | `programs.read`                                       | None                                      | None                               | None                                                                  |
| Activate program       | `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/programs/:programId/activate`       | `programs.activate`                                   | `expectedVersion`, optional `effectiveAt` | Program `version` in body          | Required `Idempotency-Key`; Backend fingerprint is `{ params, body }` |
| Current workout        | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/workouts/current`                    | `workouts.read`                                       | None                                      | None                               | None                                                                  |
| Recent workouts        | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/workouts`                            | `workouts.read`                                       | `limit`, `cursor`                         | None                               | None                                                                  |
| Start workout          | `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/workouts/start`                     | `workouts.create`                                     | Empty body                                | None                               | Required `Idempotency-Key`; Backend fingerprint is `{ params, body }` |
| Complete workout       | `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/workouts/:workoutId/complete`       | `workouts.complete`                                   | `expectedVersion`                         | Workout `version` in body          | Required `Idempotency-Key`; Backend fingerprint is `{ params, body }` |
| Abandon workout        | `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/workouts/:workoutId/abandon`        | `workouts.abandon`                                    | `expectedVersion`, optional `reason`      | Workout `version` in body          | Required `Idempotency-Key`; Backend fingerprint is `{ params, body }` |
| Skip day               | `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/programs/:programId/progress/skip`  | `workouts.day.skip`                                   | `expectedVersion`, optional `reason`      | Program progress `version` in body | Required `Idempotency-Key`; Backend fingerprint is `{ params, body }` |
| Defer day              | `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/programs/:programId/progress/defer` | `workouts.day.defer`                                  | `expectedVersion`, optional `reason`      | Program progress `version` in body | Required `Idempotency-Key`; Backend fingerprint is `{ params, body }` |
| Personal records       | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/personal-records`                    | `personal_records.read`                               | `limit`, `cursor`                         | None                               | None                                                                  |
| Personal record events | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/personal-record-events`              | `personal_records.read`                               | `limit`, `cursor`                         | None                               | None                                                                  |

Additional authoring contracts:

| Capability                | Route                                                                                                | Permission         | Request                                                                       | CAS                   | Idempotency                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- | --------------------- | ---------------------------------------- |
| Exercise library          | `GET /api/v1/workspaces/:workspaceId/exercises`                                                      | `exercises.read`   | `limit=25`                                                                    | None                  | None                                     |
| Create scratch program    | `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/programs`                        | `programs.create`  | `name`, `source: { type: SCRATCH }`, `days`                                   | None                  | Not used by route                        |
| Create revision           | `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/programs/:programId/revisions`   | `programs.update`  | `expectedVersion`, `days`                                                     | Program version, body | Not used by route                        |
| Edit workout actuals      | `PATCH /api/v1/workspaces/:workspaceId/relationships/:relationshipId/workouts/:workoutId`            | `workouts.update`  | `expectedVersion`, `exercises`, optional `notes`, optional `clientMutationId` | Workout version, body | Not used by route                        |
| Correct completed workout | `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/workouts/:workoutId/corrections` | `workouts.correct` | Actuals patch plus required `reason`                                          | Workout version, body | Required; fingerprint `{ params, body }` |

Source evidence is `apps/backend/src/modules/training/training.routes.ts`, `training.schemas.ts`, `training.service.ts`, `training.repository.ts`, and the corresponding `modules/workouts/workout.*` files. Backend Stage 8/9 tests were read for assignment restrictions, CAS races, correction-driven PR recalculation, and transactional replay. Backend source is never imported into the Web runtime or build.

All routes use authenticated workspace access middleware with the permission in the matrix. Services additionally check coaching relationship access, current staff assignments, lifecycle, and commercial entitlements. Trainer/assistant/self exceptions are Backend rules, not frontend role predicates. `programs.create` and `programs.update` cannot be inferred from `programs.read` or relationship list membership.

Program revisions are allowed by Backend only for DRAFT/ACTIVE programs. Active revisions retain day/exercise topology; existing workouts retain their original revision. Activation requires a DRAFT program. Workout completion/abandon require IN_PROGRESS; corrections require COMPLETED. Skip/defer requires active program progress and no current workout. Backend rechecks each condition transactionally.

Backend list routes accept endpoint-specific cursors and limits capped by Backend at 100. The Web surface requests a first-page slice with `limit=25` and labels these lists as capped rather than complete workspace history. No global search is presented over partial pages.

These are first-page previews, not necessarily the newest records: repositories use ascending ObjectId cursor order, and the response's `hasMore: false` is not used as a completeness claim. Relationship selection retains WEB-014's separately documented cap of 100. No cursor is synthesized, and no partial-page filter is advertised as global search.

## Identifier Semantics

`relationshipId` always means the coaching relationship identifier. It is kept separate from `traineeUserId`, `userId`, `membershipId`, `assignmentId`, `workspaceId`, `programId`, and `workoutId` in route builders, DTO guards, query keys, and component state.

Runtime guards reject security-relevant identity mismatches, including program/workout responses that belong to another workspace or relationship, details for the wrong program, or current workout data for the wrong relationship.

## Command Semantics

Commands do not use generic mutation retry. Each idempotent command receives a stable command-specific key for the same logical command fingerprint. A successful logical command retires that key, and a changed payload creates a new command key. Duplicate UI submit is separately guarded before the request layer.

All mutation invalidation captures workspace, relationship, program, generation, and non-secret access context from the command start. Late success or error is ignored when the current shell context no longer matches the captured context.

CAS values come from the loaded target: program version for activation/revision, workout version for actuals/completion/abandon/correction, and progress version for skip/defer. Users do not type internal version numbers. Successful mutations refresh only captured training keys. Workout writes also refresh PRs/events; program writes refresh program list/detail. A failed ambiguous non-idempotent program create disables resubmission until the user reloads/reconciles the list.

## Current Integration Limitation

The locked `StaffShell` produces `AccessFacts` with `decisions: []` (`shellAccessFacts`). It has no verified general current-user effective-permission feed. Consequently the production route currently fails closed before issuing protected training reads, and every mutation requires explicit verified facts. WEB-015 does not populate these facts from roles or call the admin membership effective-access inspection endpoint.

Tests inject verified effective-decision presentation models to exercise the implementation. This proves Web behavior with supplied facts, but is not seed-backed live trainer/assistant integration. A verified current-user facts producer and a configured seeded Backend are required before claiming the issue's live workflow testing complete. The issue must remain open and the branch must not be merged while that integration gate is unresolved.

## Error Semantics

- `401`: handled by locked WEB-007/009 auth lifecycle.
- `403`: access denied, no logout.
- `409`: conflict, no silent overwrite.
- `422`: safe validation or lifecycle feedback.
- `429`: rate limited if returned by Backend.
- Network and `5xx`: unavailable, not authorization denial.
- Malformed protected data fails closed.

## Support And Cache Safety

Query keys include auth generation, workspace, relationship, resource, limit, and the approved non-secret access context. They do not include access tokens, refresh tokens, cookies, raw support session IDs, credentials, or sensitive command payloads.

Support/user contexts remain separated by the existing WEB-010/011 access-context discriminator. WEB-015 does not implement Support Console behavior.
