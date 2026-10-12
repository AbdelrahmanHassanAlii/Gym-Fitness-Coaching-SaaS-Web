import { describe, expect, test, vi } from "vitest";
import { createApiClient } from "@/lib/api";
import {
  decodeManagementState,
  getManagementState,
  mutateLifecycle,
} from "./lifecycle";
const userId = "68e7a9d10d56fd2b98d4a101";
const at = "2026-10-11T10:00:00.000Z";
const fact = () => ({
  data: {
    userId,
    platformMembership: {
      id: userId,
      status: "ACTIVE",
      version: 0,
      suspendedAt: null,
      endedAt: null,
    },
  },
});
describe("Platform lifecycle strict responses", () => {
  test.each(["ACTIVE", "SUSPENDED", "ENDED"])(
    "accepts %s, zero/positive safe versions and nullable dates",
    (status) => {
      const value = fact();
      value.data.platformMembership.status = status;
      expect(
        decodeManagementState(value, userId).platformMembership.version,
      ).toBe(0);
      expect(
        decodeManagementState(
          {
            data: {
              ...value.data,
              platformMembership: {
                ...value.data.platformMembership,
                version: Number.MAX_SAFE_INTEGER,
                suspendedAt: at,
                endedAt: at,
              },
            },
          },
          userId,
        ),
      ).toBeDefined();
    },
  );
  test.each([
    { userId: "bad" },
    { userId: "68e7a9d10d56fd2b98d4a102" },
    { extra: true },
  ])("rejects invalid/mismatched target and extra data %j", (patch) =>
    expect(() =>
      decodeManagementState({ data: { ...fact().data, ...patch } }, userId),
    ).toThrow(),
  );
  test.each([
    { id: "bad" },
    { status: "DELETED" },
    { version: -1 },
    { version: 0.5 },
    { version: Number.MAX_SAFE_INTEGER + 1 },
    { version: "0" },
    { suspendedAt: "invalid" },
    { endedAt: "2026-02-30T00:00:00Z" },
    { endedAt: undefined },
    { suspendedAt: undefined },
    { accessVersion: 3 },
    { profiles: [] },
  ])("rejects malformed member %j", (patch) =>
    expect(() =>
      decodeManagementState(
        {
          data: {
            ...fact().data,
            platformMembership: { ...fact().data.platformMembership, ...patch },
          },
        },
        userId,
      ),
    ).toThrow(),
  );
  test.each(["suspendedAt", "endedAt"])(
    "requires nullable field %s",
    (field) => {
      const member: Record<string, unknown> = {
        ...fact().data.platformMembership,
      };
      delete member[field];
      expect(() =>
        decodeManagementState(
          { data: { userId, platformMembership: member } },
          userId,
        ),
      ).toThrow();
    },
  );
  test.each([null, [], {}, { ...fact(), extra: true }])(
    "rejects bad envelope %j",
    (value) => expect(() => decodeManagementState(value, userId)).toThrow(),
  );
  test.each(["suspend", "reactivate", "end"] as const)(
    "uses exact %s endpoint/body/header and strict response",
    async (command) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(fact()), {
          headers: { "content-type": "application/json" },
        }),
      );
      const api = createApiClient({
        baseUrl: "https://example.test/api/v1",
        fetch: fetchImpl as unknown as typeof fetch,
      });
      await mutateLifecycle(api, userId, command, 7, "intent-key");
      const [url, options] = fetchImpl.mock.calls[0];
      expect(url.toString()).toBe(
        `https://example.test/api/v1/platform/users/${userId}/${command}`,
      );
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({ expectedVersion: 7 });
      expect(new Headers(options.headers).get("Idempotency-Key")).toBe(
        "intent-key",
      );
      fetchImpl.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {} }), {
          headers: { "content-type": "application/json" },
        }),
      );
      await expect(
        mutateLifecycle(api, userId, command, 7, "intent-key"),
      ).rejects.toMatchObject({ kind: "malformed-response" });
    },
  );
  test("management GET validates requested identity", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fact()), {
        headers: { "content-type": "application/json" },
      }),
    );
    const api = createApiClient({
      baseUrl: "https://example.test/api/v1",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await getManagementState(api, userId);
    expect(fetchImpl.mock.calls[0][0].toString()).toContain(
      `/platform/users/${userId}/management-state`,
    );
    fetchImpl.mockResolvedValueOnce(
      new Response(JSON.stringify(fact()), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      getManagementState(api, "68e7a9d10d56fd2b98d4a102"),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });
});
