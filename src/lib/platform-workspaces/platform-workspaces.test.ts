import { describe, expect, test, vi } from "vitest";
import type { MembershipId, UserId, WorkspaceId } from "@/contracts";
import type { ApiClient } from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  createPlatformWorkspace,
  getPlatformWorkspace,
  getPlatformWorkspaceManagementState,
  listPlatformWorkspaceOwnerCandidates,
  listPlatformWorkspaces,
  platformWorkspaceDirectoryKeys,
  platformWorkspaceLifecycleActions,
  platformWorkspacePageLimit,
  reassignPlatformWorkspaceOwner,
  transitionPlatformWorkspaceLifecycle,
} from "./index";

const workspace = {
  id: "68e7a9d10d56fd2b98d4a101",
  name: "Cairo Strength",
  status: "ACTIVE",
  createdAt: "2026-10-09T08:30:00.000Z",
} as const;

describe("Platform workspace directory contract", () => {
  test("requests only the frozen cursor and limit contract", async () => {
    const request = vi.fn().mockResolvedValue(page());
    const apiClient = { request } as unknown as ApiClient;

    await expect(listPlatformWorkspaces(apiClient)).resolves.toEqual(page());
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/platform/workspaces",
      query: { limit: platformWorkspacePageLimit },
      signal: undefined,
    });

    await listPlatformWorkspaces(apiClient, {
      cursor: "opaque:next:+/=",
      q: "Alpha Gym",
      status: "ACTIVE",
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "GET",
      path: "/platform/workspaces",
      query: {
        cursor: "opaque:next:+/=",
        limit: platformWorkspacePageLimit,
        q: "Alpha Gym",
        status: "ACTIVE",
      },
      signal: undefined,
    });
  });

  test("builds a secret-free root identity without a cursor", () => {
    const identity = {
      accessVersion: 7,
      authorityValidUntil: "2026-10-10T08:00:00.000Z",
      limit: 50,
      membershipId: "membership-a" as MembershipId,
      principalId: "user-a" as UserId,
      q: "alpha",
      sessionGeneration: 4,
      status: "ACTIVE" as const,
    } as const;
    const key = platformWorkspaceDirectoryKeys.list(identity);
    expect(key).toEqual([
      "hassan-web",
      "platform-workspaces",
      "directory",
      {
        accessVersion: 7,
        authorityValidUntil: "2026-10-10T08:00:00.000Z",
        limit: 50,
        membershipId: "membership-a",
        principalId: "user-a",
        q: "alpha",
        sessionGeneration: 4,
        status: "ACTIVE",
      },
    ]);
    for (const changed of [
      { ...identity, principalId: "user-b" as UserId },
      { ...identity, sessionGeneration: 5 },
      { ...identity, membershipId: "membership-b" as MembershipId },
      { ...identity, accessVersion: 8 },
      { ...identity, authorityValidUntil: "2026-10-10T09:00:00.000Z" },
      { ...identity, q: "beta" },
      { ...identity, status: "ARCHIVED" as const },
    ]) {
      expect(platformWorkspaceDirectoryKeys.list(changed)).not.toEqual(key);
    }
  });

  test.each([
    ["extra envelope field", { ...page(), extra: true }],
    ["missing data", { meta: page().meta }],
    ["missing meta", { data: [workspace] }],
    ["extra row field", page({ ...workspace, ownerUserId: "user-a" })],
    ["uppercase id", page({ ...workspace, id: workspace.id.toUpperCase() })],
    ["empty name", page({ ...workspace, name: " " })],
    ["unknown status", page({ ...workspace, status: "DELETED" })],
    ["invalid timestamp", page({ ...workspace, createdAt: "2026-10-09" })],
    [
      "extra meta field",
      { data: [workspace], meta: { ...page().meta, count: 1 } },
    ],
    [
      "contradictory terminal meta",
      { data: [workspace], meta: { hasMore: false, nextCursor: workspace.id } },
    ],
    [
      "missing continuation cursor",
      { data: [workspace], meta: { hasMore: true, nextCursor: null } },
    ],
    [
      "empty continuation cursor",
      { data: [workspace], meta: { hasMore: true, nextCursor: "" } },
    ],
    [
      "duplicate row",
      {
        data: [workspace, workspace],
        meta: { hasMore: false, nextCursor: null },
      },
    ],
  ])("fails closed for %s", async (_name, response) => {
    const apiClient = {
      request: vi.fn().mockResolvedValue(response),
    } as unknown as ApiClient;

    await expect(listPlatformWorkspaces(apiClient)).rejects.toMatchObject<
      Partial<ApiError>
    >({ kind: "malformed-response" });
  });

  test("accepts all five closed statuses and offset timestamps", async () => {
    const statuses = [
      "PENDING_ACTIVATION",
      "ACTIVE",
      "RESTRICTED",
      "SUSPENDED",
      "ARCHIVED",
    ] as const;
    const response = {
      data: statuses.map((status, index) => ({
        ...workspace,
        id: `68e7a9d10d56fd2b98d4a10${index}`,
        status,
        createdAt: "2026-10-09T10:30:00+02:00",
      })),
      meta: { hasMore: false, nextCursor: null },
    };
    const apiClient = {
      request: vi.fn().mockResolvedValue(response),
    } as unknown as ApiClient;

    await expect(listPlatformWorkspaces(apiClient)).resolves.toEqual(response);
  });

  test("accepts and replays a non-ObjectId opaque continuation token unchanged", async () => {
    const cursor = "opaque:workspace-page:AZ_+/=";
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: [workspace],
        meta: { hasMore: true, nextCursor: cursor },
      })
      .mockResolvedValueOnce(page());
    const apiClient = { request } as unknown as ApiClient;

    const firstPage = await listPlatformWorkspaces(apiClient);
    await listPlatformWorkspaces(apiClient, {
      cursor: firstPage.meta.nextCursor!,
    });

    expect(request).toHaveBeenNthCalledWith(2, {
      method: "GET",
      path: "/platform/workspaces",
      query: { cursor, limit: platformWorkspacePageLimit },
      signal: undefined,
    });
  });

  test("strictly decodes the minimized Platform workspace detail", async () => {
    const detail = {
      id: workspace.id,
      name: workspace.name,
      type: "GYM",
      status: workspace.status,
      timezone: "Africa/Cairo",
      defaultLanguage: "en",
      createdAt: workspace.createdAt,
      country: "EG",
      governorate: "Cairo",
      city: "Nasr City",
    } as const;
    const request = vi.fn().mockResolvedValue(detail);
    const apiClient = { request } as unknown as ApiClient;

    await expect(
      getPlatformWorkspace(apiClient, workspace.id as WorkspaceId),
    ).resolves.toEqual(detail);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/platform/workspaces/${workspace.id}`,
      signal: undefined,
    });
  });

  test.each([
    ["missing field", { ...detailFixture(), timezone: undefined }],
    ["invalid type", { ...detailFixture(), type: "FRANCHISE" }],
    ["invalid status", { ...detailFixture(), status: "DELETED" }],
    ["invalid timestamp", { ...detailFixture(), createdAt: "2026-10-09" }],
    ["internal field", { ...detailFixture(), ownerUserId: "user-a" }],
    ["search field", { ...detailFixture(), nameSearchPrefixes: ["a"] }],
    ["commercial field", { ...detailFixture(), subscription: {} }],
    ["counts field", { ...detailFixture(), counts: { staff: 1 } }],
  ])("fails closed for malformed detail: %s", async (_name, response) => {
    const apiClient = {
      request: vi.fn().mockResolvedValue(response),
    } as unknown as ApiClient;

    await expect(
      getPlatformWorkspace(apiClient, workspace.id as WorkspaceId),
    ).rejects.toMatchObject<Partial<ApiError>>({ kind: "malformed-response" });
  });

  test("separates detail cache identity by workspace and authority", () => {
    const identity = {
      accessVersion: 7,
      authorityValidUntil: "2026-10-10T08:00:00.000Z",
      membershipId: "membership-a" as MembershipId,
      principalId: "user-a" as UserId,
      sessionGeneration: 4,
      workspaceId: workspace.id as WorkspaceId,
    } as const;
    const key = platformWorkspaceDirectoryKeys.detail(identity);
    for (const changed of [
      {
        ...identity,
        workspaceId: "68e7a9d10d56fd2b98d4a102" as WorkspaceId,
      },
      { ...identity, principalId: "user-b" as UserId },
      { ...identity, sessionGeneration: 5 },
      { ...identity, membershipId: "membership-b" as MembershipId },
      { ...identity, accessVersion: 8 },
      { ...identity, authorityValidUntil: null },
    ]) {
      expect(platformWorkspaceDirectoryKeys.detail(changed)).not.toEqual(key);
    }
  });
});

describe("Platform workspace management contract", () => {
  test("strictly decodes management-state and keeps owner/version separate from detail", async () => {
    const response = managementState();
    const request = vi.fn().mockResolvedValue(response);
    await expect(
      getPlatformWorkspaceManagementState(
        { request } as unknown as ApiClient,
        workspace.id as WorkspaceId,
      ),
    ).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/platform/workspaces/${workspace.id}/management-state`,
      signal: undefined,
    });
    for (const malformed of [
      { ...response, extra: true },
      {
        data: {
          ...response.data,
          owner: { ...response.data.owner, roles: ["GYM_OWNER"] },
        },
      },
      {
        data: {
          ...response.data,
          workspace: { ...response.data.workspace, version: -1 },
        },
      },
      { data: { workspace: response.data.workspace } },
    ]) {
      const client = {
        request: vi.fn().mockResolvedValue(malformed),
      } as unknown as ApiClient;
      await expect(
        getPlatformWorkspaceManagementState(
          client,
          workspace.id as WorkspaceId,
        ),
      ).rejects.toMatchObject({ kind: "malformed-response" });
    }
  });

  test("uses minimized owner candidates, exact q, bounded pages, and opaque cursor replay", async () => {
    const opaque = "opaque:+/owner-token=";
    const first = {
      data: [
        {
          id: "68e7a9d10d56fd2b98d4a199",
          displayName: "Owner",
          email: "owner@example.com",
        },
      ],
      meta: { hasMore: true, nextCursor: opaque },
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({
        data: [],
        meta: { hasMore: false, nextCursor: null },
      });
    const client = { request } as unknown as ApiClient;
    const page = await listPlatformWorkspaceOwnerCandidates(client, {
      q: "owner@example.com",
    });
    await listPlatformWorkspaceOwnerCandidates(client, {
      q: "owner@example.com",
      cursor: page.meta.nextCursor!,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "GET",
      path: "/platform/workspace-owner-candidates",
      query: { cursor: opaque, limit: 50, q: "owner@example.com" },
      signal: undefined,
    });
    const internal = {
      ...first,
      data: [{ ...first.data[0], memberships: [] }],
    };
    await expect(
      listPlatformWorkspaceOwnerCandidates({
        request: vi.fn().mockResolvedValue(internal),
      } as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });

  test("sends exact create, owner, and lifecycle mutations with idempotency and expectedVersion", async () => {
    const response = { data: { workspace: managementState().data.workspace } };
    const request = vi.fn().mockResolvedValue(response);
    const client = { request } as unknown as ApiClient;
    const createBody = {
      type: "GYM" as const,
      name: "Cairo Strength",
      ownerUserId: "68e7a9d10d56fd2b98d4a199",
      timezone: "Africa/Cairo",
      defaultLanguage: "en" as const,
    };
    await createPlatformWorkspace(client, createBody, "create-key");
    await reassignPlatformWorkspaceOwner(
      client,
      workspace.id as WorkspaceId,
      { ownerUserId: createBody.ownerUserId, expectedVersion: 3 },
      "owner-key",
    );
    await transitionPlatformWorkspaceLifecycle(
      client,
      workspace.id as WorkspaceId,
      "archive",
      4,
      "archive-key",
    );
    expect(request.mock.calls.map(([value]) => value)).toEqual([
      {
        method: "POST",
        path: "/platform/workspaces",
        body: createBody,
        idempotencyKey: "create-key",
      },
      {
        method: "POST",
        path: `/platform/workspaces/${workspace.id}/owner`,
        body: { ownerUserId: createBody.ownerUserId, expectedVersion: 3 },
        idempotencyKey: "owner-key",
      },
      {
        method: "POST",
        path: `/platform/workspaces/${workspace.id}/archive`,
        body: { expectedVersion: 4 },
        idempotencyKey: "archive-key",
      },
    ]);
  });

  test("isolates management and picker query identity by every authority dimension", () => {
    const base = {
      accessVersion: 7,
      authorityValidUntil: "2030-01-01T00:00:00.000Z",
      membershipId: "membership-a" as MembershipId,
      principalId: "user-a" as UserId,
      sessionGeneration: 4,
    };
    const management = platformWorkspaceDirectoryKeys.management({
      ...base,
      workspaceId: workspace.id as WorkspaceId,
    });
    const picker = platformWorkspaceDirectoryKeys.ownerCandidates({
      ...base,
      limit: 50,
      q: "owner@example.com",
    });
    for (const changed of [
      { ...base, principalId: "user-b" as UserId },
      { ...base, sessionGeneration: 5 },
      { ...base, membershipId: "membership-b" as MembershipId },
      { ...base, accessVersion: 8 },
      { ...base, authorityValidUntil: null },
    ]) {
      expect(
        platformWorkspaceDirectoryKeys.management({
          ...changed,
          workspaceId: workspace.id as WorkspaceId,
        }),
      ).not.toEqual(management);
      expect(
        platformWorkspaceDirectoryKeys.ownerCandidates({
          ...changed,
          limit: 50,
          q: "owner@example.com",
        }),
      ).not.toEqual(picker);
    }
  });

  test.each([
    ["PENDING_ACTIVATION", ["activate", "archive"]],
    ["ACTIVE", ["restrict", "suspend", "archive"]],
    ["RESTRICTED", ["activate", "suspend", "archive"]],
    ["SUSPENDED", ["activate", "archive"]],
    ["ARCHIVED", ["restore"]],
  ] as const)("exposes the exact %s lifecycle matrix", (status, expected) => {
    expect(platformWorkspaceLifecycleActions(status)).toEqual(expected);
  });
});

function detailFixture() {
  return {
    id: workspace.id,
    name: workspace.name,
    type: "GYM",
    status: workspace.status,
    timezone: "Africa/Cairo",
    defaultLanguage: "en",
    createdAt: workspace.createdAt,
  };
}

function page(row: unknown = workspace) {
  return {
    data: [row],
    meta: { hasMore: false, nextCursor: null },
  };
}

function managementState() {
  return {
    data: {
      workspace: { ...detailFixture(), version: 3 },
      owner: {
        id: "68e7a9d10d56fd2b98d4a199",
        displayName: "Owner",
        email: "owner@example.com",
      },
    },
  };
}
