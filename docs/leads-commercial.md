# WEB-013 Leads And Commercial Experience

WEB-013 adds the first staff-facing commercial surface in the Gym Staff Portal. The Backend remains the authority for commercial lifecycle, billing, payment review, entitlements, permissions, idempotency, and version checks.

## Implemented Scope

The Gym Staff Portal consumes the workspace-scoped Backend commercial routes:

| UI surface              | Method | Route                                                | Permission                  | Idempotency                             | CAS      |
| ----------------------- | ------ | ---------------------------------------------------- | --------------------------- | --------------------------------------- | -------- |
| Subscription summary    | `GET`  | `/api/v1/workspaces/:workspaceId/subscription`       | `billing.subscription.read` | Not used                                | Not used |
| Usage and quota summary | `GET`  | `/api/v1/workspaces/:workspaceId/subscription/usage` | `billing.usage.read`        | Not used                                | Not used |
| Manual payment list     | `GET`  | `/api/v1/workspaces/:workspaceId/payments`           | `billing.payments.read`     | Not used                                | Not used |
| Manual payment create   | `POST` | `/api/v1/workspaces/:workspaceId/payments`           | `billing.payments.create`   | Required by Backend idempotency wrapper | Not used |

The payment command uses an explicit per-submission `Idempotency-Key`. The key is not stored in query keys, URLs, or DOM data. Mutations use `retry: false`, and the UI prevents duplicate command submission while the first logical submission is pending.

## Deferred Scope

Backend has first-class lead routes, but the protected management routes are platform-scoped:

| Capability                                | Route family                                | Context                |
| ----------------------------------------- | ------------------------------------------- | ---------------------- |
| Public lead creation                      | `/api/v1/public/leads`                      | Public                 |
| Lead list/detail/update/status            | `/api/v1/platform/leads`                    | Platform               |
| Lead conversion, duplicate marking, merge | `/api/v1/platform/leads/:leadId/...`        | Platform               |
| Owner activation completion               | `/api/v1/public/owner-activations/complete` | Public activation flow |

WEB-013 does not create a frontend-only CRM, local lead table, pipeline, deal stage, or conversion workflow in the Gym Staff Portal. Platform lead operations require the future platform experience and the exact platform permissions.

Plan administration and subscription lifecycle commands are also platform-scoped in Backend. The staff portal shows the current workspace subscription, usage, and manual payment state, but it does not expose platform plan management, trial start, upgrade, downgrade, freeze, reactivate, cancel, payment approval, or payment rejection commands.

## Security And Context Boundaries

- Role names never grant commercial authorization.
- Backend permission checks remain authoritative.
- Missing, stale, or unavailable access facts fail closed for manual payment creation.
- `403` is access denial and does not log the user out.
- `409` is treated as commercial/version conflict and never overwrites state.
- Network and `5xx` failures are unavailable states, not permission denial.
- Query keys include session generation, workspace identity, and non-secret access context.
- Query keys do not include access tokens, refresh tokens, cookies, support session IDs, payment references, or other unnecessary sensitive values.
- Workspace response guards reject cross-workspace subscription, usage, and payment payloads.
- The page does not expose raw Backend error details.

## Money And Lifecycle Semantics

Manual payment `amount` is sent as the Backend `number` field from `CreateManualPaymentBody`. The frontend formats it for display only and does not perform billing calculations, rounding rules, subscription activation, approval, or rejection. Subscription lifecycle values are displayed exactly from Backend read models.
