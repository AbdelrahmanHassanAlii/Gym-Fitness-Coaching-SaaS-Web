import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type {
  PlatformContextDto,
  PlatformEffectiveAccessDecisionsDto,
  UserId,
  MembershipId,
} from "@/contracts";
import type { SupportAuthority } from "@/lib/platform-support/runtime";
import { platformAccessKeys } from "./query-keys";
import {
  normalizePlatformDecisionRequests,
  platformDecisionRequests,
  platformSupportManagementDecisionRequests,
  platformSupportStartDecisionRequests,
} from "./api";
import { publishSupportAuthority } from "./support-authority-sync";

const principal = { principalId: "actor" as UserId, sessionGeneration: 1 };
const captured: SupportAuthority = {
  ...principal,
  membershipId: "membership" as MembershipId,
  accessVersion: 7,
  permissions: ["support.sessions.start"],
  validUntil: null,
  startValidUntil: null,
};
const canonicalKey = platformAccessKeys.context(principal);
let client: QueryClient;
afterEach(() => {
  client?.clear();
  vi.restoreAllMocks();
});
function context(version: number): PlatformContextDto {
  return {
    context: "PLATFORM",
    accessContext: "USER",
    membership: {
      id: captured.membershipId,
      status: "ACTIVE",
      accessVersion: version,
      updatedAt: "2026-10-13T08:00:00.000Z",
    },
  };
}
function publish(version: number) {
  const decision = (
    requests:
      | typeof platformSupportStartDecisionRequests
      | typeof platformSupportManagementDecisionRequests,
  ): PlatformEffectiveAccessDecisionsDto => ({
    context: "PLATFORM",
    accessContext: "USER",
    membershipId: captured.membershipId,
    membershipStatus: "ACTIVE",
    accessVersion: version,
    validUntil: null,
    decisions: normalizePlatformDecisionRequests(requests).map(
      ({ permission }) => ({ permission, allowed: true, effect: "ALLOW" }),
    ),
  });
  return publishSupportAuthority(
    client,
    captured,
    context(version),
    decision(platformSupportManagementDecisionRequests),
    decision(platformSupportStartDecisionRequests),
    () => true,
  );
}
it("publishes and cancels the canonical context entry despite extra runtime identity fields", async () => {
  client = new QueryClient();
  client.setQueryData(canonicalKey, context(7));
  const unrelatedKey = platformAccessKeys.decisions({
    ...principal,
    membershipId: captured.membershipId,
    membershipStatus: "ACTIVE",
    accessVersion: 8,
    requests: platformDecisionRequests,
  });
  client.setQueryData(unrelatedKey, "unrelated decision batch");
  const cancel = vi.spyOn(client, "cancelQueries");
  expect(await publish(8)).toBe(true);
  expect(client.getQueryData(canonicalKey)).toEqual(context(8));
  expect(cancel).toHaveBeenCalledWith({ exact: true, queryKey: canonicalKey });
  const contextQueries = client.getQueryCache().findAll({
    queryKey: ["hassan-web", "platform-access", "platform-context"],
  });
  expect(contextQueries).toHaveLength(1);
  expect(contextQueries[0].queryKey).toEqual(canonicalKey);
  expect(client.getQueryData(unrelatedKey)).toBe("unrelated decision batch");
});
it("rejects a delayed v7 publication after v8 reaches the canonical context entry", async () => {
  client = new QueryClient();
  client.setQueryData(canonicalKey, context(7));
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  }).then(() => publish(7));
  expect(await publish(8)).toBe(true);
  release();
  expect(await delayed).toBe(false);
  expect(client.getQueryData(canonicalKey)).toEqual(context(8));
});
it("rechecks the canonical newest version after cancellation yields", async () => {
  client = new QueryClient();
  client.setQueryData(canonicalKey, context(7));
  let release!: () => void;
  const cancellation = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(client, "cancelQueries").mockImplementation(() => cancellation);
  const pending = publish(8);
  client.setQueryData(canonicalKey, context(9));
  release();
  expect(await pending).toBe(false);
  expect(client.getQueryData(canonicalKey)).toEqual(context(9));
});
