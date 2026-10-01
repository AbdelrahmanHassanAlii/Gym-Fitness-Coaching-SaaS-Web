# Hassan Gym & Fitness Coaching SaaS Web

Web application for the Hassan Gym & Fitness Coaching SaaS.

This repository is intentionally separate from:

- Backend: `Gym-Fitness-Coaching-SaaS-Backend`
- Mobile: `Gym-Fitness-Coaching-SaaS-Mobile`

## Current Scope

WEB-001 bootstraps the Web application foundation only. It does not implement
authentication, API clients, portal shells, permissions, themes, i18n, or product
screens.

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

## Development

```bash
bun run dev
```

## Validation

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

`bun run test` is currently a placeholder quality gate for WEB-001 and runs the
TypeScript check. A dedicated test stack belongs to WEB-005.
