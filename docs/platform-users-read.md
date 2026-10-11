# Platform Members read experience

`/platform/users` and `/platform/users/[userId]` display only accounts with a
Platform membership. This is a read-only experience, not an all-system directory.

Both pages use the existing PlatformShell `platform_users.read` effective decision.
The shell owns validUntil expiry; unmount and query cancellation retire protected
data and pending results. A domain 403 removes data and refreshes authority without
logout. Query identity includes principal, authentication generation, membership,
accessVersion, validUntil, the read decision, and applicable target/filter/page size.
No persistent query cache or secret-bearing key is introduced.

Search submits explicitly by button or Enter and stores committed `q` in the URL.
Only exact full email and exact user ObjectId are supported. Membership status
filters ACTIVE/SUSPENDED/ENDED use `platformMembershipStatus` in the URL. Clear,
search/filter changes and authority changes reset pagination. Cursors remain opaque
and internal; the client sends nextCursor unchanged. Duplicate page rows fail closed.
Invalid search has a localized validation state; invalid cursors retire pagination
and offer a fresh first page. Empty/no-match states differ from unavailable errors.

Strict allowlisted decoders reject extra fields, malformed IDs/dates/statuses,
invalid membership structures and inconsistent pagination metadata. Account status
and Platform membership status have separate labels. Display name/email are optional
with localized fallbacks. Dates use existing locale formatting with explicit UTC.

Detail 404 and malformed-ID responses use a generic member-not-found message.
Return navigation preserves only q and membership status, never cursor.
EN/AR, RTL, responsive stacked tables, semantic forms/tables/description lists,
text status badges, loading/error announcements and retry controls are included.

No phone, normalized identifiers, verification/security metadata, workspace or
coaching data, profiles/grants/effective permissions/accessVersion is rendered.
There are no management controls or management API calls. Locked Workspace code,
Operations, Backend and Mobile remain unchanged.

All-system directory, user/account/access management, credentials/MFA/session
actions, workspace membership management, Platform Operations, WEB-022 and WEB-023
remain deferred.

Browser tests mock the API and the Playwright server builds with a configured
API origin, so authenticated checks need no live Backend. Browser verification
also found an existing native-fetch receiver error in the shared API client;
the default fetch is now bound to globalThis, with a focused regression test.
Injected test transports are unchanged.
