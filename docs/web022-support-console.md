# WEB-022 Support Console

## Scope and locked contracts

Web baseline: `33ff3659c528d48fb8117203c6901b8a2c0dd043`.
Backend baseline: `455523ac233e91258fd2b77aa6668865a5095e1a`.

V1 supports workspace-bound `WORKSPACE_SUPPORT` / `READ_ONLY` sessions, known workspace targeting, explicit start confirmation, fresh runtime validation, a persistent banner, end own, administrative detail and separately authorized revoke. The verified workspace surface displays only the minimized workspace metadata returned by current-context validation. It intentionally contains no business write controls or speculative workspace reads.

Deferred: policy management/directories, complete active-session and history directories, user context, write support, sensitive reads/files, extension/renewal, delegated actors, audit exploration, export/deletion, credentials and broad native `/app` navigation.

## Routes and permissions

| Web route                                    | Contract / gate                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/platform/support`                          | Operational console; start requires `support.sessions.start`                          |
| `/platform/workspaces/[workspaceId]/support` | Known workspace entry; canonical detail lookup only with `platform_workspaces.manage` |
| `/platform/support/sessions/[sessionId]`     | Administrative locator; requires `support.sessions.read` before any detail fetch      |
| `/app/support`                               | Dedicated support landing outside StaffShell; validated current context required      |

The four independent action decisions are `support.sessions.start`, `support.sessions.read`, `support.sessions.end_own`, `support.sessions.revoke`. They are added only to support route decision batches. Existing default, workspace and user decision sets retain their previous permission requests. Platform navigation provides a console entry; it does not grant action authority.

Known-target operators without workspace management supply an already-known canonical workspace ID and type (`GYM` or `INDEPENDENT_TRAINER`). No directory/detail call occurs for them. Operators with workspace management can use the existing authorized directory and workspace detail entry. This is not a universal workspace selector.

## Start and idempotency

`POST /api/v1/platform/support/access-requests` uses a frozen body, endpoint, target, actor/authority identity and one `Idempotency-Key`. The fixed body includes `contextType: WORKSPACE_SUPPORT`, `sessionType: READ_ONLY`, target ID/type and both sensitive flags false. No user/effective membership target is sent.

Reason is trimmed and required, 3–500 characters. Reference is optional, trimmed, at most 120 characters when supplied. Duration is a whole number, 1–60 minutes. Privacy guidance forbids credentials and unnecessary sensitive personal/medical information. Confirmation shows the target, type, read-only workspace context, duration, reason and optional reference.

Network failure, unusable success, unknown server failure and unresolved idempotency completion retain the exact intent as uncertain. No automatic mutation retries or token-refresh replays occur. An explicit retry uses the same key and body. Known terminal policy, target, authority and key conflicts retire the intent; a future confirmation gets a new key. Drafts and intents are memory-only and clear on unmount/authority change.

An approved acknowledgement, including a replay, is historical. It never activates support. The session ID is selected in memory, then `GET /api/v1/me/support-context` sends `X-Support-Session-Id`. Strict decoding verifies the session and workspace IDs, ACTIVE status, fixed V1 context/type, safe versions, bounded text, enums, timestamps and unexpired deadline. Start also verifies the real actor's Platform membership and canonical target type. Bootstrap needs no session-read, workspace-management or native membership permission.

## Runtime boundary and cache

`SupportContextProvider` owns one `SupportRuntime` per React root/tab. There are no support query cache keys, persisted query data or storage writes. Context IDs, bodies, idempotency keys, tokens, reasons, references and DTOs never enter logs, analytics, localStorage, sessionStorage or selected-context URLs.

The explicitly required administrative detail route has a session ID locator in its path. That locator does not select runtime support; it is not an entry token. Runtime selection is never derived from it or copied into a URL, and start/entry navigation is always `/app/support`. Administrative session links must be handled as sensitive operational references.

Only the locked current-context read carries the support selector in this V1. There is no generic support runtime client. Platform bootstrap, decisions, workspace administration, support management, end/revoke, refresh and logout never receive it. All support calls use `cache: no-store` and disable automatic unauthorized refresh. Backend remains authoritative and returns `private, no-store`.

No failed support read is retried without its selector. While a context is selected, a route boundary prevents native StaffShell `/app` children from mounting outside `/app/support`; explicit leave retires support before normal native navigation can resume. StaffShell's membership semantics are unchanged.

## Retirement and stale safety

Identity binds principal, token/auth generation, Platform membership/accessVersion, the four support decisions, `validUntil`, target, local request epoch, session ID/version and runtime epoch. Permission ordering is normalized for comparison. None of these support identities becomes a query key.

Pending start/context/detail/termination responses are suppressed after unmount, target identity, auth identity or runtime epoch changes. Requests are aborted on relevant cleanup. Only one selected context per tab is exposed; another workspace requires explicit leave and a new start. Reload creates an empty runtime; tabs do not share a selected session.

Session expiry and Platform `validUntil` have separate deadlines. The earliest deadline immediately retires the runtime: abort validation, increment epoch, erase selected ID/DTO/authority, remove workspace data and banner, block reads and return from `/app/support` to the console. Start-authority loss or changed membership/accessVersion/decisions also retires it. Current policy/runtime validity is revalidated on focus and every 20 seconds while active, plus the explicit validate action. Any unusable current-context response fails closed, including malformed responses and all documented terminal policy/actor/parent/IP/workspace errors. Backend enforces every actual runtime request independently of this UI cadence.

No files, signed URLs, workspace business caches or write decisions exist on the narrow V1 landing. Retirement clears the entire displayed DTO. Management 403s retire only the affected action capability and request Platform authority refresh where applicable; they do not log out the user.

## End, revoke and CAS

Administrative `GET /api/v1/platform/support/sessions/:id` is strictly decoded and minimized for presentation. Parent session IDs, source IP, actor user ID, policy snapshots, credentials, reason/reference and raw grants are not displayed. ACTIVE administrative status is expressly not runtime proof.

`POST .../:id/end` requires `support.sessions.end_own` plus Backend ownership; `POST .../:id/revoke` independently requires `support.sessions.revoke`. Revoke has an accessible destructive confirmation. Both send only `{expectedVersion: session.version}`, never policy revision, workspace version or accessVersion. Neither sends an idempotency key or support selector. No automatic replay occurs.

On version conflict, fetch fresh detail (or fresh current context for the current banner after an authorized detail read) and require a new explicit action. Ownership failure removes end own. Uncertain current termination immediately retires support and performs read-only detail reconciliation when read authority exists; the banner never retries automatically. Administrative detail reconciles uncertainty before enabling any new explicit termination. Read reconciliation failure keeps actions blocked. Terminal states hide both actions. Revoking another session does not retire an unrelated selected context.

Exact states: ACTIVE, ENDED, EXPIRED, REVOKED, SECURITY_TERMINATED. Errors use localized safe categories; raw Backend messages/payloads are never rendered.

## Terminology and accessibility

| English                            | Arabic                                 |
| ---------------------------------- | -------------------------------------- |
| Support Access                     | وصول الدعم                             |
| Support Session                    | جلسة دعم                               |
| Start Support                      | بدء جلسة دعم                           |
| End Support                        | إنهاء جلسة الدعم                       |
| Revoke Support Access              | إلغاء وصول الدعم                       |
| Expires At                         | ينتهي في                               |
| Reason                             | سبب الوصول                             |
| Reference                          | المرجع                                 |
| Read Only                          | للقراءة فقط                            |
| Active / Ended / Revoked / Expired | نشطة / منتهية / ملغاة / انتهت صلاحيتها |
| Security Terminated                | أُنهِيت لأسباب أمنية                   |

Support is an explicit context, never identity replacement. EN/AR use the existing root locale/RTL infrastructure. Identifiers use bidi isolation, timestamps show UTC explicitly, status is text, and expiry is not a per-second live countdown. Native modal dialogs provide keyboard trapping/Escape and restore trigger focus. Controls have labels, validation associations and visible focus. Layouts wrap long content and are checked at 390/768/1280px.

## Validation

Focused unit/model/component tests cover strict decoders, independent permissions, form constraints, frozen retry identity, historical acknowledgement/bootstrap, denial without fetching, late responses, auth/authority changes, timer expiry, selector routing/no native fallback, CAS reconciliation, ownership and Arabic copy. Mocked Playwright tests exercise entry/end, uncertainty, revoked/expired/policy/IP failures, detail denial, revoke/conflict, expiry/validUntil, logout, keyboard/dialog focus, RTL/responsive widths and axe checks. These tests mock the locked API rather than reproducing Backend authorization internals.

Validation also runs the complete Web unit suite once, lint, formatting check, typecheck, production build and diff check. The build must preserve the pre-existing `next-env.d.ts` bytes. In this constrained workspace a temporary external Node preload suppresses only Next's generated write to that exact protected path; type generation, compilation and all other build writes proceed normally. No Next source or protected artifact is edited.
