# Platform permission profile assignment

Web candidate uses locked Backend `8f4d2aa78228ffd30b8a6d32b6d6af6f05a032e4`.

The existing user detail page requires `platform_users.read`. A separate card requires
`platform_permissions.manage`; lifecycle authority remains `platform_users.manage`.
The detail route requests all three independent decisions. Other routes retain their
existing decision batches. PlatformShell owns expiry, identity, MFA and support safety.

The assignment GET and PUT strictly decode the Web-safe assignment DTO. The selector
is fetched only when an eligible editor opens, with opaque cursor pages and duplicate/
cursor-loop rejection. Current archived and unavailable profiles remain visible, but
replacement removes them explicitly. Unique ACTIVE IDs form an in-memory set, capped
at 20. Every changed replacement requires confirmation, including an empty assignment.
No effective-permission calculation or permission-entry preview is performed.

PUT uses only the assignment snapshot's management version. An immutable logical intent
retains endpoint, target, body, version and idempotency key. Uncertain network, aborted,
malformed or non-JSON success outcomes require explicit retry with that same intent.
Terminal failures retire the intent; a new confirmation creates a new key. No automatic
write replay or browser persistence is used.

Assignment success and terminal conflict refresh the same target's lifecycle management
state. Lifecycle refresh also invalidates assignment state. Unresolved writes block
competing actions across the two cards. Assignment success does not invalidate the
directory. Authority-bound query keys and protected request epochs suppress responses
from previous targets, principals, generations or deadlines. Management 403 retires only
assignment capability and refreshes decisions; READ survives when independently allowed.

EN/AR strings, logical CSS, labelled controls, status announcements and the established
focus-trap dialog pattern cover the additive surface. Focused component tests and mocked
Playwright flows cover confirmation, uncertainty, conflicts, retirement, stale results,
shared management versions, RTL and responsive accessibility.

Explicit grants editing, profile CRUD, user creation/invites, credential administration,
Platform Operations, WEB-022, WEB-023 and Mobile remain deferred.
