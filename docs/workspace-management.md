# WEB-012 Workspace, Branch, and Staff Management

WEB-012 adds the first real Gym Staff Portal management surface on top of the
locked staff shell. It consumes verified Backend routes only and does not create
a frontend authorization policy.

## Contract Matrix

| UI operation                      | Method and path                                                                           | Request                                                               | Response                                                       | Permission evidence                               | CAS / idempotency                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Read workspace detail             | `GET /api/v1/workspaces/:workspaceId`                                                     | none                                                                  | `WorkspaceDetailDto` from `safeWorkspace` and `safeMembership` | `workspace.read`                                  | none                                                 |
| Update workspace settings         | `PATCH /api/v1/workspaces/:workspaceId`                                                   | `name`, `timezone`, `defaultLanguage`, `city`, `governorate`          | workspace detail envelope                                      | `workspace.update`                                | no `expectedVersion`; no automatic `Idempotency-Key` |
| List branches                     | `GET /api/v1/workspaces/:workspaceId/branches`                                            | none                                                                  | `BranchDto[]`                                                  | `branches.read`                                   | none                                                 |
| Create branch                     | `POST /api/v1/workspaces/:workspaceId/branches`                                           | `name`, optional `code`, `timezone`, `address`, `city`, `governorate` | `BranchDto`                                                    | `branches.create`                                 | no automatic `Idempotency-Key`                       |
| Update branch                     | `PATCH /api/v1/workspaces/:workspaceId/branches/:branchId`                                | update branch fields                                                  | `BranchDto`                                                    | `branches.update` with Backend branch scope       | no `expectedVersion`                                 |
| Archive branch                    | `POST /api/v1/workspaces/:workspaceId/branches/:branchId/archive`                         | none                                                                  | `BranchDto`                                                    | `branches.archive` with Backend branch scope      | no automatic retry                                   |
| List staff memberships            | `GET /api/v1/workspaces/:workspaceId/memberships`                                         | none                                                                  | `WorkspaceMembershipSummaryDto[]`                              | `staff.read`                                      | none                                                 |
| Suspend/reactivate/end membership | `POST /api/v1/workspaces/:workspaceId/memberships/:membershipId/{suspend,reactivate,end}` | none                                                                  | `WorkspaceMembershipSummaryDto`                                | `staff.manage`                                    | no automatic retry                                   |
| Invite staff                      | `POST /api/v1/workspaces/:workspaceId/staff/invitations`                                  | optional `email`, `phone`, `branchIds`, `expiresAt`, required `roles` | invitation plus token envelope                                 | `staff.invite`                                    | invitation token is not persisted by the UI          |
| List branch assignments           | `GET /api/v1/workspaces/:workspaceId/memberships/:membershipId/branches`                  | none                                                                  | `MembershipBranchAssignmentDto[]`                              | `staff.branches.manage`                           | none                                                 |
| Assign member to branch           | `POST /api/v1/workspaces/:workspaceId/memberships/:membershipId/branches/:branchId`       | none                                                                  | `MembershipBranchAssignmentDto`                                | `staff.branches.manage` with Backend branch scope | no automatic retry                                   |
| Remove branch assignment          | `DELETE /api/v1/workspaces/:workspaceId/memberships/:membershipId/branches/:branchId`     | none                                                                  | success envelope                                               | `staff.branches.manage` with Backend branch scope | no automatic retry                                   |

No workspace switch command exists in the verified contract. Workspace
selection remains local staff-shell context.

## Authorization Boundary

Backend remains authoritative. WEB-012 does not grant capability from role,
workspace ownership labels, branch assignment, selected URL, or hidden buttons.
Roles are displayed as Backend identity facts. 403 responses are shown as access
denied and do not log the user out; 401/session expiry remains WEB-007/WEB-009.

WEB-012 does not use the admin effective-access inspection route as a universal
current-user `can(permission)` endpoint.

## Cache And Context

Management query keys include the authenticated session generation, workspace
id, resource kind, and non-secret access context. Branch and membership routes
also include their concrete ids where relevant. Query keys never include access
tokens, refresh tokens, cookies, raw support session ids, or authorization
headers.

Workspace A data cannot satisfy workspace B because each management query key
is workspace-scoped. Session replacement changes the generation, which prevents
late session A results from becoming session B state. Support context, if a
future surface enables it, must use the non-secret access-context discriminator;
the raw support session id remains WEB-007 transport-only.

## Forms And Mutation Safety

Forms use the WEB-008 React Hook Form foundation. Client-side validation is
limited to required fields and input usability; Backend validation remains
authoritative. The generic Backend validation summary is not treated as a
universal field mapper.

Mutations explicitly set `retry: false`. WEB-012 does not invent
`expectedVersion`, does not regenerate idempotency keys, does not apply generic
optimistic updates, and does not silently overwrite 409/conflict responses.

## Runtime Guards

Workspace detail, branch, membership, invitation, and assignment responses are
checked at the transport-facing boundary. Malformed protected management data
fails closed as unavailable instead of rendering privileged management state.

## Scope

Implemented: workspace settings, branch list/create/update/archive, staff
membership list/status transitions, staff invitation creation, and staff branch
assignment list/add/remove.

Omitted because not present as a verified current WEB-012 route or owned by a
later issue: workspace CRUD outside the current workspace, branch restore,
invitation listing, product dashboards, leads, trainee relationships, training,
nutrition, progress, files, notifications, Platform Portal, and Support
Console.
