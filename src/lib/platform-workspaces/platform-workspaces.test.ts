import { describe, expect, test, vi } from "vitest";
import type { MembershipId, UserId, WorkspaceId } from "@/contracts";
import type { ApiClient } from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  getPlatformWorkspace,
  listPlatformWorkspaces,
  platformWorkspaceDirectoryKeys,
  platformWorkspacePageLimit,
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
