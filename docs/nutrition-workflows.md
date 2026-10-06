# WEB-016 Nutrition Workflows

WEB-016 adds the Gym Staff Portal nutrition surface at `/app/nutrition`.

## Scope

In scope:

- Workspace food library reads and workspace food create/update/archive.
- Relationship nutrition plan list/detail.
- Nutrition plan creation and revision creation.
- Nutrition plan activate, complete, and archive lifecycle commands.
- Selected-date daily nutrition/water tracking read-only review.
- Relationship nutrition analytics read-only review.
- Conservative presentation for Nutritionist and eligible staff workflows.

Out of scope:

- Daily tracking mutation, correction, and adherence configuration mutation.
- Allergy snippets or `health.food_allergies.read`.
- Platform/system food administration.
- Meal marketplace, arbitrary macro/scoring engines, and WEB-017 progress/check-in workflows.

## Backend Contracts

Foods:

- `GET /api/v1/workspaces/:workspaceId/foods`
- `POST /api/v1/workspaces/:workspaceId/foods`
- `PATCH /api/v1/workspaces/:workspaceId/foods/:foodId`
- `POST /api/v1/workspaces/:workspaceId/foods/:foodId/archive`

Nutrition plans:

- `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutrition-plans`
- `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutrition-plans`
- `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutrition-plans/:planId`
- `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutrition-plans/:planId/revisions`
- `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutrition-plans/:planId/activate`
- `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutrition-plans/:planId/complete`
- `POST /api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutrition-plans/:planId/archive`

Tracking and analytics:

- `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/daily-tracking/:localDate`
- `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/analytics/nutrition`

## Permission Presentation

The StaffShell uses Stage 19 Route A for already-effective presentation decisions only:

- Navigation/read: `nutrition.plans.read`, `foods.read`, `adherence.read`, `analytics.nutrition.read`.
- Page actions: `nutrition.plans.create`, `nutrition.plans.update`, `nutrition.plans.activate`, `nutrition.plans.complete`, `nutrition.plans.archive`, `foods.create`, `foods.update`, `foods.archive`.

All WEB-016 requests are `WORKSPACE` decisions. WEB-016 does not request `trainees.read` or `health.food_allergies.read`.

Route A never proves selected relationship or row-level eligibility. Backend target routes remain authoritative.

## Command Safety

- Plan activation is the only WEB-016 command that sends `Idempotency-Key`.
- Activation command identity includes workspace, relationship, plan, and expected plan version.
- Non-idempotent creates and lifecycle commands are not auto-retried after ambiguous network/server outcomes; the UI refetches authoritative state and requires user reconciliation.
- `expectedVersion` is used for food update/archive and plan revision/activate/complete/archive.

## Food Authority

System foods are read-only in this workspace surface. Private foods returned by the workspace route are actor-owned. Gym food row mutation is presented conservatively because the minimized Stage 19 decision does not expose the Backend decision source needed to prove per-row authority.

## Identity And Cache

Nutrition query keys include auth generation, workspace, membership, support/user access context, relationship, resource, date/range, filters, and cursor where material. Access version remains part of the Stage 19 decision identity rather than every domain-data key.

Response guards fail closed on mismatched workspace, relationship, plan, food, local date, or analytics identity.
