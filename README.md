# Hassan Gym & Fitness Coaching SaaS Web

Web application for the Hassan Gym & Fitness Coaching SaaS.

This repository is intentionally separate from:

- Backend: `Gym-Fitness-Coaching-SaaS-Backend`
- Mobile: `Gym-Fitness-Coaching-SaaS-Mobile`

## Current Scope

WEB-002 defines the initial repository architecture and environment strategy. It
does not implement authentication, API clients, portal shells, permissions,
themes, i18n, or product screens.

## Technology Baseline

- Next.js App Router
- React
- TypeScript
- Bun package manager

## Prerequisites

- Node.js `>=20.9.0`
- Bun `>=1.4.0`

## Setup

```bash
bun install
```

Environment variables are documented in `.env.example`. Copy it to `.env.local`
for local development if you need to provide optional values. Real `.env` files
are ignored and must not be committed.

## Development

```bash
bun run dev
```

## Validation

```bash
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run test:e2e
bun run build
bun run validate
```

`bun run test` runs Vitest unit, component, and integration tests. `bun run
test:e2e` builds the app and runs the Playwright browser smoke and accessibility
checks against a local Next.js server. `bun run validate` runs the complete local
quality gate.

## Architecture

Repository conventions are documented in `docs/architecture.md`.
Testing conventions are documented in `docs/testing.md`.
