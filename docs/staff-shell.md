# WEB-011 Staff Shell

WEB-011 adds the authenticated Gym Staff Portal shell. It is route and
navigation infrastructure only; product workflows remain WEB-012 and later.

## Contract Evidence

- `GET /api/v1/me/workspaces` is the verified current-user workspace source.
- Backend `safeWorkspace(...)` exposes workspace id, type, name, status,
  timezone, and locale fields.
- Backend `safeMembership(...)` exposes membership id, workspace id, user id,
  roles, status, permission profile ids, access version, and timestamps.
- Staff experience roles are `GYM_OWNER`, `GYM_MANAGER`, `TRAINER`,
  `ASSISTANT_TRAINER`, and `NUTRITIONIST`.
- `TRAINEE` is a Backend role literal but is not a Web gym staff shell role.

## Boundaries

- Role determines staff-shell eligibility and presentation labels only. It does
  not grant permission.
- Permission-sensitive navigation remains UX only and uses WEB-010 access
  presentation models.
- The shell does not fetch the admin-only membership effective-access route as a
  universal current-user `can(permission)` API.
- 401/session expiry remains WEB-007/WEB-009 territory.
- 403 remains an access outcome and does not log out the user.
- Platform Portal and Support Console remain separate future surfaces.
- Raw support session ids remain transport-only and are not placed in shell
  state, DOM, URLs, or query keys.

## Context Model

The shell context is scoped by authenticated session generation, non-secret
access context, workspace id, membership id, and optional branch id. Workspace
or session changes rebuild the shell context so stale workspace A data cannot
authorize workspace B.

Branch context is represented as a shell seam only. WEB-011 does not implement
branch CRUD and does not infer that workspace membership grants every branch.

## Navigation

Only `/app` is currently actionable. Future product areas are displayed as
non-actionable shell destinations until their owning issues implement real
routes. Disabled navigation is not a security boundary; Backend authorization
remains authoritative for every API call.
