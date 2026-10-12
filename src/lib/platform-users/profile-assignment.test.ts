import { expect, test, vi } from "vitest";
import { createApiClient } from "@/lib/api";
import {
  decodeAssignment,
  decodeSelector,
  getSelector,
  replaceAssignment,
  selectorPagesValid,
} from "./profile-assignment";
const target = "68e7a9d10d56fd2b98d4a101";
const profile = { id: target, name: "Operations", status: "ACTIVE" };
const fact = () => ({
  data: {
    userId: target,
    platformMembership: { id: target, status: "ACTIVE", version: 4 },
    permissionProfiles: [profile],
  },
});
test.each(["ACTIVE", "SUSPENDED", "ENDED"])(
  "assignment accepts %s",
  (status) => {
    expect(
      decodeAssignment(
        {
          data: {
            ...fact().data,
            platformMembership: { ...fact().data.platformMembership, status },
          },
        },
        target,
      ).platformMembership.status,
    ).toBe(status);
  },
);
test.each([
  null,
  [],
  {},
  { ...fact(), extra: true },
  { data: { ...fact().data, extra: true } },
  { data: { ...fact().data, userId: "bad" } },
])("assignment rejects malformed envelope %j", (value) =>
  expect(() => decodeAssignment(value, target)).toThrow(),
);
test.each([
  { accessVersion: 2 },
  { version: -1 },
  { version: 1.5 },
  { version: "4" },
  { version: Number.MAX_SAFE_INTEGER + 1 },
  { status: "DELETED" },
  { id: "bad" },
])("assignment rejects malformed membership %j", (patch) =>
  expect(() =>
    decodeAssignment(
      {
        data: {
          ...fact().data,
          platformMembership: { ...fact().data.platformMembership, ...patch },
        },
      },
      target,
    ),
  ).toThrow(),
);
test.each([
  { extra: true },
  { id: "bad" },
  { status: "MISSING" },
  { name: null },
  { status: "UNAVAILABLE", name: "secret" },
])("assignment rejects malformed profile %j", (patch) =>
  expect(() =>
    decodeAssignment(
      {
        data: {
          ...fact().data,
          permissionProfiles: [{ ...profile, ...patch }],
        },
      },
      target,
    ),
  ).toThrow(),
);
test("archived and unavailable null names decode without resolution", () => {
  expect(
    decodeAssignment(
      {
        data: {
          ...fact().data,
          permissionProfiles: [
            { ...profile, status: "ARCHIVED" },
            { ...profile, status: "UNAVAILABLE", name: null },
          ],
        },
      },
      target,
    ).permissionProfiles.map((p) => p.status),
  ).toEqual(["ARCHIVED", "UNAVAILABLE"]);
});
test.each([
  { permissionProfiles: [{ id: "bad", name: "x" }], nextCursor: null },
  { permissionProfiles: [{ ...profile }], nextCursor: null },
  { permissionProfiles: [], nextCursor: 4 },
  { permissionProfiles: [], nextCursor: "" },
  { permissionProfiles: [], nextCursor: null, extra: true },
  {
    permissionProfiles: [
      { id: target, name: "x" },
      { id: target, name: "y" },
    ],
    nextCursor: null,
  },
])("selector strictness %j", (data) =>
  expect(() => decodeSelector({ data })).toThrow(),
);
test("selector passes opaque cursor and detects duplicate pages/cursor loops", async () => {
  const api = createApiClient({
    baseUrl: "https://example.test/api/v1",
    fetch: Object.assign(
      vi.fn(async (input: RequestInfo | URL) => {
        expect(new URL(input.toString()).searchParams.get("cursor")).toBe(
          "opaque+/==",
        );
        return Response.json({
          data: { permissionProfiles: [], nextCursor: null },
        });
      }),
      { preconnect: () => {} },
    ),
  });
  await getSelector(api, "opaque+/==");
  expect(api).toBeDefined();
  const page = {
    permissionProfiles: [{ id: target, name: "x" }],
    nextCursor: "cursor",
  };
  expect(selectorPagesValid([page, page])).toBe(false);
  expect(
    selectorPagesValid([
      { permissionProfiles: [], nextCursor: "cursor" },
      { permissionProfiles: [], nextCursor: "cursor" },
    ]),
  ).toBe(false);
});
test.each([
  new Response("not json", {
    status: 200,
    headers: { "content-type": "text/plain" },
  }),
  new Response("{", {
    status: 200,
    headers: { "content-type": "application/json" },
  }),
  Response.json({ data: { ...fact().data, accessVersion: 8 } }),
])("malformed successful PUT is uncertain with no replay", async (response) => {
  const fetcher = Object.assign(
    vi.fn(async () => response),
    { preconnect: () => {} },
  );
  const api = createApiClient({
    baseUrl: "https://example.test/api/v1",
    fetch: fetcher,
  });
  await expect(
    replaceAssignment(api, {
      target,
      path: `/platform/users/${target}/permission-profile-assignment`,
      key: "intent-key",
      body: { expectedVersion: 4, profileIds: [target] },
    }),
  ).rejects.toMatchObject({
    kind: expect.stringMatching(/non-json-response|malformed-response/),
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
