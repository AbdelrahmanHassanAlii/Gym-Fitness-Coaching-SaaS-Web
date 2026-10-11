import { describe, expect, test, vi } from "vitest";
import type { ApiClient } from "@/lib/api";
import {
  accountStatuses,
  membershipStatuses,
  getPlatformUser,
  listPlatformUsers,
  platformUserAuthorityIdentity,
  platformUserKeys,
} from ".";

const id = "68e7a9d10d56fd2b98d4a101";
const at = "2026-10-11T10:00:00.000Z";
function row() {
  return {
    id,
    displayName: "Member",
    email: "member@example.com",
    status: "ACTIVE",
    createdAt: at,
    platformMembership: { status: "SUSPENDED" },
  };
}
function detail() {
  return {
    data: {
      ...row(),
      updatedAt: at,
      platformMembership: {
        id,
        status: "ENDED",
        createdAt: at,
        updatedAt: at,
        suspendedAt: at,
        endedAt: at,
      },
    },
  };
}
function client(value: unknown) {
  const request = vi.fn().mockResolvedValue(value);
  return { api: { request } as unknown as ApiClient, request };
}
describe("Platform member read decoders", () => {
  test.each(accountStatuses)(
    "directory accepts account %s independently of membership",
    async (status) => {
      for (const member of membershipStatuses) {
        const { api, request } = client({
          data: [{ ...row(), status, platformMembership: { status: member } }],
          meta: { nextCursor: null, hasMore: false },
        });
        expect((await listPlatformUsers(api)).data[0].status).toBe(status);
        expect(request).toHaveBeenCalledWith({
          method: "GET",
          path: "/platform/users",
          query: { limit: 50 },
          signal: undefined,
        });
      }
    },
  );
  test("accepts optional identity, empty pages and opaque continuation", async () => {
    const minimal = {
      id,
      status: "ACTIVE",
      createdAt: at,
      platformMembership: { status: "SUSPENDED" },
    };
    expect(
      (
        await listPlatformUsers(
          client({
            data: [minimal],
            meta: { nextCursor: "opaque", hasMore: true },
          }).api,
        )
      ).data,
    ).toEqual([minimal]);
    expect(
      (
        await listPlatformUsers(
          client({ data: [], meta: { nextCursor: null, hasMore: false } }).api,
        )
      ).data,
    ).toEqual([]);
    const { api, request } = client({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });
    await listPlatformUsers(api, {
      q: "Member@example.com",
      platformMembershipStatus: "ENDED",
      cursor: "opaque",
    });
    expect(request.mock.calls[0][0].query).toEqual({
      q: "Member@example.com",
      platformMembershipStatus: "ENDED",
      cursor: "opaque",
      limit: 50,
    });
  });
  test.each([
    { id: "bad" },
    { createdAt: "2026-02-30T10:00:00Z" },
    { createdAt: "yesterday" },
    { status: "ARCHIVED" },
    { phone: "secret" },
    { normalizedEmail: "secret" },
    { email: null },
    { displayName: "" },
    { platformMembership: null },
    { platformMembership: { status: "UNKNOWN" } },
    { platformMembership: { status: "ACTIVE", accessVersion: 7 } },
  ])("rejects malformed or expanded directory row %j", async (patch) => {
    await expect(
      listPlatformUsers(
        client({
          data: [{ ...row(), ...patch }],
          meta: { nextCursor: null, hasMore: false },
        }).api,
      ),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });
  test.each([
    { hasMore: "yes", nextCursor: null },
    { hasMore: true, nextCursor: null },
    { hasMore: false, nextCursor: "opaque" },
    { hasMore: true, nextCursor: "" },
    { hasMore: false, nextCursor: null, extra: 1 },
  ])("rejects invalid meta %j", async (meta) => {
    await expect(
      listPlatformUsers(client({ data: [row()], meta }).api),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });
  test("rejects expanded envelopes, duplicate rows and empty continuation", async () => {
    for (const response of [
      {
        data: [row()],
        meta: { hasMore: false, nextCursor: null },
        secret: true,
      },
      { data: [row(), row()], meta: { hasMore: false, nextCursor: null } },
      { data: [], meta: { hasMore: true, nextCursor: "opaque" } },
    ])
      await expect(
        listPlatformUsers(client(response).api),
      ).rejects.toMatchObject({ kind: "malformed-response" });
  });
  test.each(accountStatuses)(
    "detail accepts account %s and all membership statuses",
    async (status) => {
      for (const member of membershipStatuses) {
        const value = detail();
        value.data.status = status;
        value.data.platformMembership.status = member;
        expect(await getPlatformUser(client(value).api, id)).toEqual(
          value.data,
        );
      }
    },
  );
  test("detail accepts absent optional identity/timestamps", async () => {
    const value = detail();
    const account = {
      id: value.data.id,
      status: value.data.status,
      createdAt: at,
      updatedAt: at,
    };
    const member = { id, status: "ENDED", createdAt: at, updatedAt: at };
    expect(
      await getPlatformUser(
        client({ data: { ...account, platformMembership: member } }).api,
        id,
      ),
    ).toEqual({ ...account, platformMembership: member });
  });
  test.each([
    { id: "bad" },
    { updatedAt: "not-date" },
    { updatedAt: "2026-02-30T10:00:00Z" },
    { status: "UNKNOWN" },
    { phone: "secret" },
    { passwordHash: "secret" },
    { permissionProfileIds: [] },
    { platformMembership: null },
    { platformMembership: { status: "ACTIVE" } },
  ])("rejects invalid detail %j", async (patch) => {
    await expect(
      getPlatformUser(client({ data: { ...detail().data, ...patch } }).api, id),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });
  test("rejects malformed nested ID/date/lifecycle and extra fields", async () => {
    for (const patch of [
      { id: "bad" },
      { createdAt: "bad" },
      { updatedAt: "bad" },
      { suspendedAt: "bad" },
      { endedAt: "bad" },
      { status: "ARCHIVED" },
      { grants: [] },
    ]) {
      const value = detail();
      await expect(
        getPlatformUser(
          client({
            data: {
              ...value.data,
              platformMembership: {
                ...value.data.platformMembership,
                ...patch,
              },
            },
          }).api,
          id,
        ),
      ).rejects.toMatchObject({ kind: "malformed-response" });
    }
    await expect(
      getPlatformUser(client({ data: detail().data, extra: 1 }).api, id),
    ).rejects.toMatchObject({ kind: "malformed-response" });
    await expect(
      getPlatformUser(client(detail()).api, "68e7a9d10d56fd2b98d4a102"),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });
  test("query identity contains authority and filters without secret material", () => {
    const authority = platformUserAuthorityIdentity({
      principalId: id as never,
      membershipId: id as never,
      accessVersion: 7,
      sessionGeneration: 4,
      validUntil: at,
      allows: () => true,
      refresh: async () => {},
    });
    const key = platformUserKeys.list({
      ...authority,
      q: "member@example.com",
      platformMembershipStatus: "ACTIVE",
      limit: 50,
    });
    expect(JSON.stringify(key)).toContain("platform_users.read");
    for (const field of [
      "accessVersion",
      "authorityValidUntil",
      "membershipId",
      "principalId",
      "sessionGeneration",
      "allowed",
      "q",
      "platformMembershipStatus",
      "limit",
    ])
      expect(JSON.stringify(key)).toContain(field);
    expect(JSON.stringify(key)).not.toMatch(/token|secret|supportSession/i);
  });
});
