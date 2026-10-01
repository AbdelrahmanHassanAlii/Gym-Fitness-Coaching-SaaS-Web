# WEB-006 DTO Strategy

Issue: WEB-006 / #6

This document defines how the Web repo represents Backend wire contracts. It does not implement the API client, auth, permissions, forms, server state, or product screens.

## Decision

Use a hybrid DTO strategy.

Web V1 should not use a blind generated client as the integration boundary because the current OpenAPI artifact has proven stale and some important behaviors are not expressible in OpenAPI. Web also should not import Backend TypeScript source or create a shared fourth repository/package.

The hybrid rule:

- Use regenerated OpenAPI as an audited schema and route inventory input.
- Hand-curate Web-owned DTOs for stable wire shapes, enums, headers, error envelopes, pagination forms, idempotency, support context, auth refresh behavior, and time semantics.
- Keep behavioral contract evidence in docs.
- Let WEB-007 build the HTTP client against Web-owned DTOs and these docs.
- Let later feature issues add focused DTOs as they integrate each module.

## Folder Organization

Current WEB-006 structure:

```text
src/contracts/
  analytics/
  auth/
  common/
  files/
  notifications/
  support/
  index.ts
```

This is intentionally smaller than a full module tree. WEB-006 adds the reusable base types and the high-risk DTO surfaces that influence client design. Later feature work can add `workspace`, `relationships`, `training`, `workouts`, `nutrition`, `progress`, `checkins`, `exports`, and `audit` folders when those modules are implemented in Web.

## Naming Rules

- Request DTOs end with `RequestDto`.
- Response DTOs end with `ResponseDto` when the top-level response shape matters.
- Data DTOs end with `Dto`.
- Query DTOs end with `QueryDto`.
- Use `ApiDataEnvelope<T>` for `{ data: T }` routes.
- Use `ApiErrorEnvelope` for runtime errors.
- Use module-specific page types when backend response keys differ (`page`, `pageInfo`, `meta`).
- Use semantic ids: `WorkspaceId`, `RelationshipId`, `UserId`, `MembershipId`, `FileId`, `DocumentId`, `SupportSessionId`.

## Request / Response Separation

Do not assume frontend view models equal wire DTOs.

WEB-007 may transport DTOs as-is. Product features should transform them at module boundaries when UI needs richer state, display formatting, derived labels, local dates, or optimistic draft state.

Examples:

- Auth token DTO is a wire DTO. Auth state storage is WEB-009.
- `DocumentDto` is a wire DTO. A document card view model belongs in a future document feature.
- Analytics range DTO is wire truth. Chart bucket filling belongs to WEB-008 or feature code.

## Enum And Literal Strategy

Use `as const` arrays for verified API literals when the frontend needs runtime checks or tests. Derive union types from those arrays.

Do not copy every Backend enum into Web preemptively. Add literals when:

- frontend branches on the value;
- request DTOs need compile-time safety;
- runtime guards/tests prove invalid values fall back or fail;
- WEB-007 needs typed headers/errors/pagination behavior.

## Runtime Validation

WEB-006 does not add a runtime schema library. The repo has no such dependency, and WEB-007 has not implemented transport yet.

Runtime validation can be added later only where it earns its cost, for example:

- validating persisted client preferences;
- validating untrusted API payloads at the HTTP boundary;
- protecting optimistic cache transforms.

For now, WEB-006 provides lightweight guards for selected local literals and relies on TypeScript plus backend validation for request DTOs.

## OpenAPI Use

OpenAPI may provide:

- method/path inventory after regeneration;
- request/response schema hints;
- tags and operation ids for documentation and generated reference output.

OpenAPI must not be the sole source for:

- idempotency requirements;
- Web refresh cookie behavior;
- support session context;
- permission and scope semantics;
- sensitive support gates;
- provider upload headers;
- notification preference enforcement semantics;
- Stage 18 local-time semantics;
- exact error UX classification.

## Backend Source Isolation

Web must not import from Backend source. Reasons:

- Web and Backend are separate repositories.
- Backend internals are not Web's public dependency.
- Importing Backend TypeScript would couple bundling, test setup, release cadence, and secrets/runtime assumptions.
- Mobile has its own repository and should not be forced into a Web/Backend shared workspace.

If duplication later becomes costly, a versioned shared package can be evaluated as a future architecture decision. It is not part of WEB-006.

## API Client Boundary

WEB-007 should use this contract layer to implement:

- base URL handling;
- bearer auth header;
- Web refresh-cookie handling;
- `x-support-session-id` injection only when a support session is active;
- idempotency key generation for known idempotent commands;
- error envelope parsing;
- cursor query serialization;
- response envelope parsing.

WEB-006 intentionally does not implement any of those mechanics.

## Contract Update Checklist

When a Backend contract changes before Web implements a feature:

1. Regenerate OpenAPI from the locked Backend implementation.
2. Compare path count, operation count, and method distribution.
3. Inspect route and service implementation for behavioral metadata.
4. Update `docs/backend-contract.md` evidence and confidence labels.
5. Add or update focused DTOs under `src/contracts`.
6. Add tests for any runtime literals or guards.
7. Keep Backend source imports out of Web.

Fail the review if generated OpenAPI is stale, if implementation evidence is missing for behavior-critical metadata, or if a DTO claims verified fields that source evidence does not prove.

## WEB-006 Scope Guard

Implemented in this issue:

- contract evidence documentation;
- hybrid DTO strategy;
- shared wire primitives;
- selected verified module DTOs for auth, files, notifications, support, and analytics;
- focused tests for literals and guards.

Not implemented in this issue:

- HTTP client;
- auth/session persistence;
- permission hooks;
- data fetching/cache;
- forms;
- date utility layer;
- dashboards/charts;
- product UI;
- Backend or Mobile changes.
