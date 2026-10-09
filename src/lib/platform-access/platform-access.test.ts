import { describe, expect, test, vi } from "vitest";
import type { ApiDataEnvelope, MembershipId, UserId } from "@/contracts";
import { ApiError, type ApiClient } from "@/lib/api";
import {
  isPlatformAccessVersionConflict,
  platformAccessKeys,
  platformDecisionRequests,
  requestPlatformContext,
  requestPlatformEffectiveAccessDecisions,
} from "./index";

const membershipId = "platform_membership_a" as MembershipId;
const principalId = "user_a" as UserId;

describe("Platform access contracts", () => {
  test("discovers the real actor Platform context through the exact self route", async () => {
    const apiClient = fakeApiClient({
      data: {
        accessContext: "USER",
        context: "PLATFORM",
        membership: {
          accessVersion: 7,
          id: membershipId,
          status: "ACTIVE",
          updatedAt: "2026-10-09T08:30:00.000Z",
        },
      },
    });

    await expect(requestPlatformContext(apiClient)).resolves.toEqual({
      accessContext: "USER",
      context: "PLATFORM",
      membership: {
        accessVersion: 7,
        id: membershipId,
        status: "ACTIVE",
        updatedAt: "2026-10-09T08:30:00.000Z",
      },
    });
    expect(apiClient.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/me/platform-context",
      signal: undefined,
    });
  });

  test.each([
    {
      name: "missing required membership field",
      value: {
        accessContext: "USER",
        context: "PLATFORM",
        membership: {
          id: membershipId,
          status: "ACTIVE",
          updatedAt: "2026-10-09T08:30:00.000Z",
        },
      },
    },
    {
      name: "unknown lifecycle state",
      value: {
        accessContext: "USER",
        context: "PLATFORM",
        membership: {
          accessVersion: 7,
          id: membershipId,
          status: "ARCHIVED",
          updatedAt: "2026-10-09T08:30:00.000Z",
        },
      },
    },
    {
      name: "non-UTC timestamp",
      value: {
        accessContext: "USER",
        context: "PLATFORM",
        membership: {
          accessVersion: 7,
          id: membershipId,
          status: "ACTIVE",
          updatedAt: "2026-10-09T10:30:00+02:00",
        },
      },
    },
    {
      name: "access internals",
      value: {
        accessContext: "USER",
        context: "PLATFORM",
        membership: {
          accessVersion: 7,
          id: membershipId,
          profileId: "profile_a",
          status: "ACTIVE",
          updatedAt: "2026-10-09T08:30:00.000Z",
        },
      },
    },
  ])(
    "fails closed for malformed Platform context: $name",
    async ({ value }) => {
      await expect(
        requestPlatformContext(fakeApiClient({ data: value })),
      ).rejects.toMatchObject({ kind: "malformed-response" });
    },
  );

  test("requests the exact normalized Platform batch and validates the authoritative response", async () => {
    const apiClient = fakeApiClient({
      data: {
        accessContext: "USER",
        accessVersion: 7,
        context: "PLATFORM",
        decisions: [
          {
            allowed: true,
            effect: "ALLOW",
            permission: "audit.platform.read",
          },
          {
            allowed: false,
            effect: "DENY",
            permission: "platform_users.read",
          },
          {
            allowed: true,
            effect: "ALLOW",
            permission: "platform_workspaces.manage",
          },
        ],
        membershipId,
        membershipStatus: "ACTIVE",
        validUntil: "2026-10-09T09:30:00.000Z",
      },
    });

    await expect(
      requestPlatformEffectiveAccessDecisions(
        apiClient,
        { accessVersion: 7, membershipId },
        platformDecisionRequests,
      ),
    ).resolves.toMatchObject({ accessVersion: 7, membershipId });
    expect(apiClient.request).toHaveBeenCalledWith({
      body: {
        expectedAccessVersion: 7,
        requests: [
          { permission: "audit.platform.read" },
          { permission: "platform_users.read" },
          { permission: "platform_workspaces.manage" },
        ],
      },
      method: "POST",
      path: "/platform/me/effective-access/decisions",
      signal: undefined,
    });
  });

  test.each([
    {
      name: "mismatched membership",
      patch: { membershipId: "platform_membership_b" },
    },
    { name: "mismatched version", patch: { accessVersion: 8 } },
    {
      name: "missing requested decision",
      patch: {
        decisions: [
          {
            allowed: true,
            effect: "ALLOW",
            permission: "audit.platform.read",
          },
        ],
      },
    },
    {
      name: "duplicate decision",
      patch: {
        decisions: [
          {
            allowed: true,
            effect: "ALLOW",
            permission: "audit.platform.read",
          },
          {
            allowed: false,
            effect: "DENY",
            permission: "audit.platform.read",
          },
          {
            allowed: false,
            effect: "DENY",
            permission: "platform_users.read",
          },
        ],
      },
    },
    {
      name: "extra response material",
      patch: { profileId: "profile_a" },
    },
  ])("fails closed for malformed decisions: $name", async ({ patch }) => {
    const data = {
      accessContext: "USER",
      accessVersion: 7,
      context: "PLATFORM",
      decisions: platformDecisionRequests.map(({ permission }) => ({
        allowed: true,
        effect: "ALLOW",
        permission,
      })),
      membershipId,
      membershipStatus: "ACTIVE",
      validUntil: null,
      ...patch,
    };

    await expect(
      requestPlatformEffectiveAccessDecisions(
        fakeApiClient({ data }),
        { accessVersion: 7, membershipId },
        platformDecisionRequests,
      ),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });

  test("isolates context and decision cache identity without secrets", () => {
    const contextKey = platformAccessKeys.context({
      principalId,
      sessionGeneration: 3,
    });
    const decisionsKey = platformAccessKeys.decisions({
      accessVersion: 7,
      membershipId,
      principalId,
      requests: platformDecisionRequests,
      sessionGeneration: 3,
    });

    expect(JSON.stringify(contextKey)).toContain("platform-context");
    expect(JSON.stringify(decisionsKey)).toContain(membershipId);
    expect(JSON.stringify(decisionsKey)).toContain("audit.platform.read");
    expect(JSON.stringify(decisionsKey)).not.toMatch(
      /token|authorization|cookie|supportSessionId|signedUrl|secret/i,
    );
    expect(
      platformAccessKeys.context({
        principalId,
        sessionGeneration: 4,
      }),
    ).not.toEqual(contextKey);
    expect(
      platformAccessKeys.decisions({
        accessVersion: 8,
        membershipId,
        principalId,
        requests: platformDecisionRequests,
        sessionGeneration: 3,
      }),
    ).not.toEqual(decisionsKey);
    expect(
      platformAccessKeys.decisions({
        accessVersion: 7,
        membershipId: "platform_membership_b" as MembershipId,
        principalId,
        requests: platformDecisionRequests,
        sessionGeneration: 3,
      }),
    ).not.toEqual(decisionsKey);
  });

  test("recognizes only the locked Platform access-version conflict", () => {
    expect(
      isPlatformAccessVersionConflict(
        new ApiError({
          code: "PLATFORM_MEMBERSHIP_ACCESS_VERSION_CONFLICT",
          kind: "backend",
          message: "Conflict",
          status: 409,
        }),
      ),
    ).toBe(true);
    expect(
      isPlatformAccessVersionConflict(
        new ApiError({
          code: "WORKSPACE_MEMBERSHIP_ACCESS_VERSION_CONFLICT",
          kind: "backend",
          message: "Conflict",
          status: 409,
        }),
      ),
    ).toBe(false);
  });
});

function fakeApiClient(
  envelope: ApiDataEnvelope<unknown>,
): ApiClient & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async () => envelope),
  } as ApiClient & { request: ReturnType<typeof vi.fn> };
}
