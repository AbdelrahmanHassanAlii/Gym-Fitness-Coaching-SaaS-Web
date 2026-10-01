# Web Architecture

This document records repository conventions for the Hassan Gym & Fitness
Coaching SaaS Web application. It is intentionally concise: future issues should
add code where the first real implementation needs it instead of creating empty
directories in advance.

## App Routes

Next.js App Router route groups separate top-level experiences without creating
extra URL segments:

- `src/app/(public)` contains the public web surface. WEB-001's placeholder root
  page lives here.
- Future auth routes should live under `src/app/(auth)` when WEB-009 implements
  authentication.
- Future Gym Staff routes should live under `src/app/(staff)` when WEB-011
  introduces the staff shell.
- Future Platform Portal routes should live under `src/app/(platform)` when
  WEB-021 introduces platform navigation.

Each route group may later own its own layout, loading, and error files. Do not
share Gym Staff and Platform navigation through a root layout unless the behavior
is genuinely global.

## Code Organization

Use the smallest module that gives callers a stable interface:

- `src/app` is for route files and route-group layouts.
- `src/config` is the environment/configuration seam. Direct `process.env` reads
  should stay here.
- Future feature code should live under `src/features/<feature-name>` once the
  feature exists. Feature-local UI belongs with its feature.
- Future shared UI primitives may live under `src/components/ui`, and shared
  composition/layout pieces may live under `src/components/layout`, when WEB-003
  or later issues create real components.
- Future infrastructure modules such as API clients, query/cache integration,
  or contract helpers should live under focused modules rather than global
  catch-all files. WEB-006 and WEB-007 own those decisions.
- Future shared TypeScript-only domain shapes may live under `src/types` when
  they are not better owned by a feature or generated contract workflow.

Avoid a large global components directory. If a module only serves one feature,
keep it feature-local until a second caller proves it should be shared.

## Environment Strategy

Environment values are split by exposure:

- `src/config/env.server.ts` is server-only. It may read server environment
  values and must not be imported by Client Components.
- `src/config/env.public.ts` exposes only values that are safe for browser code.
  Browser-visible variables must use `NEXT_PUBLIC_*`.
- `src/config/env.shared.ts` contains pure parsing helpers used by both modules
  and tests.

The optional `NEXT_PUBLIC_BACKEND_API_BASE_URL` value is a placeholder for later
API work. WEB-006 and WEB-007 still own the final API transport and contract
strategy.

Real `.env` files are ignored. Use `.env.example` as the documented shape.

## Server And Client Components

Use Server Components by default. Add `"use client"` only to leaf modules that
need browser APIs, event handlers, or client-side state. Keep server-only config
and future secrets behind server modules so they cannot be bundled into browser
code.

## Themes And Appearance

WEB-003 defines a compact semantic token foundation in `src/app/globals.css`.
Product code should consume semantic variables such as `--color-background`,
`--color-foreground`, `--color-surface`, `--color-primary`, `--color-danger`,
and `--color-focus` instead of raw palette colors.

Theme and appearance are separate local preferences:

- Theme key: `hassan-web-theme`
- Appearance key: `hassan-web-appearance`

The valid V1 themes are `summit`, `pulse`, and `forge`. The valid appearances
are `light`, `dark`, and `system`. Invalid or stale stored values fall back to
safe defaults. Preferences are local-only browser settings; no backend
preference API is assumed.

Root layout remains a Server Component. A small inline bootstrap script applies
the stored theme and resolved appearance before hydration, while the client
provider owns browser-only storage, OS color-scheme listeners, and interactive
preference updates.

## Internationalization And Direction

WEB-004 supports Arabic and English through `src/i18n`. The locale model defines
supported identifiers, the fallback locale, validation, labels, and the
locale-to-direction mapping in one place so a future third language can be added
without scattering Arabic/English-specific branching through components.

V1 does not use locale-prefixed routes. The App Router route groups created by
WEB-002 stay intact, and future public, auth, staff, and platform URLs are not
locked to `/ar` or `/en` before real route and deep-link requirements exist.
Locale is resolved on the server from the first-party `hassan_locale` cookie and
falls back to English when the cookie is absent or invalid. This gives SSR the
same locale that the browser will hydrate, while keeping language independent
from future theme, light/dark/system appearance, auth, and workspace state.

The root layout sets `html lang` and `dir` from the resolved locale. Arabic maps
to `rtl`; English maps to `ltr`. Feature code should prefer logical CSS
properties and direction-neutral layout conventions such as `inline-start`,
`inline-end`, `padding-inline`, `margin-inline`, and flex/grid alignment instead
of hardcoded left/right assumptions.

Translation messages are organized by surface/namespace in `src/i18n/messages.ts`.
Only real strings for existing surfaces should be added. Do not create speculative
translation keys for screens that do not exist.

## Future Issue Ownership

- WEB-003 owns semantic tokens, themes, and appearance modes.
- WEB-004 owns Arabic/English i18n and RTL behavior.
- WEB-005 owns test framework expansion and E2E/accessibility tooling.
- WEB-006 and WEB-007 own backend contracts and API client infrastructure.
- WEB-009 and WEB-010 own auth and permission/access UX.
- WEB-011 owns the Gym Staff shell.
