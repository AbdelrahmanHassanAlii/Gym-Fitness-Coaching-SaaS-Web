# Web Testing And Quality Gates

WEB-005 establishes the web test foundation for the current Next.js application.
The stack is intentionally small:

- Vitest runs unit, component, and integration tests.
- React Testing Library renders React components in a JSDOM environment.
- Playwright runs browser smoke tests against a local Next.js production server.
- `@axe-core/playwright` provides automated accessibility checks for browser
  tests where the page exists today.
- Prettier provides a formatting check for repository source files.

Automated accessibility checks catch only a subset of accessibility issues. They
must complement manual keyboard, screen reader, focus order, contrast, and
localized/RTL checks as real product surfaces are added.

## Test Locations

- Pure unit tests should be colocated next to the module they cover as
  `*.test.ts` or `*.test.tsx`.
- Component tests should be colocated next to the component or route component
  they render as `*.test.tsx`.
- Integration tests should use `*.integration.test.ts` when they fit naturally
  beside the integration seam, or `tests/integration/**/*.test.ts` when multiple
  modules are involved.
- Browser E2E and smoke tests live in `e2e/**/*.spec.ts`.

Avoid a single global test directory for all test types. Keep tests near the
code until a cross-module integration or browser scenario needs a broader home.

## Mock Server Strategy

WEB-005 does not install a browser or API mock server because the repository has
no API client, server actions, or backend-facing UI yet. When WEB-006 or WEB-007
introduces HTTP contracts, integration and browser tests should use a
repository-local mock server seam such as MSW to model documented backend
responses without requiring real backend services, credentials, provider
integrations, or production data.

## Commands

```bash
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run test:e2e
bun run build
bun run validate
```

`bun run test:e2e` builds the app, then Playwright starts `next start` on
`127.0.0.1:3100`. The current smoke tests do not require backend services,
secrets, production data, or deployment.

Coverage thresholds are intentionally not enforced while the repository is still
at foundation scope. Add reporting once there is enough product code for the
numbers to be meaningful.
