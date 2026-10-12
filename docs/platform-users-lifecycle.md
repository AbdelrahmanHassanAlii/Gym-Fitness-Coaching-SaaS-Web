# Platform Users lifecycle Web

Existing Platform member lifecycle management is integrated into the locked user detail page. Directory and detail visibility still require `platform_users.read`. The independent `platform_users.manage` decision is requested on detail routes and exclusively gates the lifecycle card and management-state query. Support context gains no capability.

Only management-state, suspend, reactivate and end access are implemented. Member creation, invitations, candidates, profile assignment, grants, profile CRUD, security administration, Platform Operations, WEB-022, WEB-023 and Mobile remain deferred.

## Contracts and intent

The management GET and all command responses strictly decode the minimized management-state envelope, including target consistency, canonical IDs, status, safe nonnegative revision and required nullable offset timestamps. Extra fields fail closed. CAS uses the target membership's management `version`; actor `accessVersion` is only part of authority cache identity.

Commands send only `{ expectedVersion }` and a generated Idempotency-Key. Intent state is held only in memory, scoped to authority identity, target, command and revision. Uncertain outcomes and in-progress responses permit an explicit retry with the same key and body; competing commands remain disabled. Success discards the key. Definitive errors discard the intent and refetch state; conflicts never automatically resubmit against a new revision.

Success uses the returned snapshot, cancels older management/READ requests, synchronizes authoritative lifecycle fields in the target READ cache, then refetches management and target READ and invalidates only Platform Users directories. Existing search/filter return navigation remains unchanged.

## Authority, failure and presentation

Principal, auth generation, actor membership, authority accessVersion, validUntil, management decision and target identify management queries. Identity changes unmount the card and cancel/remove its query. Existing PlatformShell expiration retires controls; there is no additional timer. Async epoch, request generation and deadline checks suppress late mutation responses. Cancellation prevents older GETs from overwriting a command/refetch result.

Management 403 retires the card and refreshes Platform authority without logging out or removing independently authorized READ detail. The self-mutation error is localized without logout. Only authentication failures use existing session recovery. Generic unavailable/not-found presentation avoids global account distinctions. Lockout, inactive-account, safe-evaluation and idempotency errors have localized non-sensitive copy.

The action matrix is ACTIVE: suspend/end; SUSPENDED: reactivate/end; ENDED: reactivate. Reliable real-actor identity suppresses self controls. Confirmations describe retained assignments and recoverability, never deletion. Reactivation explains current unexpired grants and ACTIVE-account eligibility.

The EN/AR card uses locale/timezone date helpers, logical CSS, wrapping buttons, modal focus trapping/restoration, Escape cancellation, labeled explicit command buttons, busy states and live results. IDs, revisions, profiles, grants and session/security data are not displayed.

## Verification

Focused decoder/API/component and actual PlatformShell timer tests cover strict decoding, permission separation, action matrix, confirmation, intent retry, conflicts, domain denial, success/cache consistency, privacy and stale/expired responses. Browser tests cover lifecycle confirmations, RTL/narrow layout and accessibility.

The known `next-env.d.ts` artifact is excluded. Validation uses Next's compile then generate production build modes (with separate TypeScript validation) to avoid Next's default build rewriting that locked artifact. No package/configuration change is needed.
