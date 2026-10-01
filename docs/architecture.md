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

## Future Issue Ownership

- WEB-003 owns semantic tokens, themes, and appearance modes.
- WEB-004 owns Arabic/English i18n and RTL behavior.
- WEB-005 owns test framework expansion and E2E/accessibility tooling.
- WEB-006 and WEB-007 own backend contracts and API client infrastructure.
- WEB-009 and WEB-010 own auth and permission/access UX.
- WEB-011 owns the Gym Staff shell.
