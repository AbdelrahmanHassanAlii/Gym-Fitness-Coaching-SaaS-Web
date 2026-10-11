import { describe, expect, test, vi } from "vitest";
import type { ApiClient } from "@/lib/api";
import type { WorkspaceId } from "@/contracts";
import { getPlatformSubscriptionSummary } from "./summaries";
const id = "68e7a9d10d56fd2b98d4a101" as WorkspaceId;
describe("Platform subscription summary contract", () => {
  test("uses the pure summary endpoint and accepts actual subscription absence", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ data: { workspaceId: id, subscription: null } });
    const signal = new AbortController().signal;
    expect(
      await getPlatformSubscriptionSummary(
        { request } as unknown as ApiClient,
        id,
        signal,
      ),
    ).toEqual({ workspaceId: id, subscription: null });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/platform/workspaces/${id}/subscription-summary`,
      signal,
    });
  });
});

describe("Platform counts contract", () => {
  test("uses the counts endpoint and preserves zero metrics", async () => {
    const counts = {
      branches: { active: 0 },
      trainees: { active: 0, needsReassignment: 0 },
      staff: { activeIncludingOwners: 0 },
    };
    const request = vi
      .fn()
      .mockResolvedValue({ data: { workspaceId: id, counts } });
    const { getPlatformWorkspaceCounts } = await import("./summaries");
    expect(
      await getPlatformWorkspaceCounts({ request } as unknown as ApiClient, id),
    ).toEqual({ workspaceId: id, counts });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/platform/workspaces/${id}/counts`,
      signal: undefined,
    });
  });
});

const subscription = {
  lifecycleStatus: "ACTIVE",
  startedAt: "2026-10-09T08:30:00.000Z",
  expiresAt: null,
  graceEndsAt: null,
  frozenAt: null,
  expiredAt: null,
  cancelledAt: null,
  currentTerms: {
    planId: "68e7a9d10d56fd2b98d4a102",
    planName: "Current plan",
    planVersionId: "68e7a9d10d56fd2b98d4a103",
    billingPeriod: "MONTHLY",
    effectiveFrom: "2026-10-09T08:30:00.000Z",
    effectiveTo: null,
  },
};
test("subscription decoder accepts terms and pending/no terms but rejects every missing field, internals and broken dates", async () => {
  const request = vi.fn();
  const api = { request } as unknown as ApiClient;
  for (const good of [
    subscription,
    {
      ...subscription,
      lifecycleStatus: "PENDING_ACTIVATION",
      currentTerms: null,
    },
  ]) {
    request.mockResolvedValue({
      data: { workspaceId: id, subscription: good },
    });
    expect(
      (await getPlatformSubscriptionSummary(api, id)).subscription,
    ).toEqual(good);
  }
  const invalid: unknown[] = [
    { ...subscription, version: 7 },
    { ...subscription, lifecycleStatus: "UNKNOWN" },
    { ...subscription, startedAt: "2026-02-30T00:00:00Z" },
    {
      ...subscription,
      currentTerms: { ...subscription.currentTerms, usage: 42 },
    },
    {
      ...subscription,
      currentTerms: { ...subscription.currentTerms, billingPeriod: "WEEKLY" },
    },
    {
      ...subscription,
      currentTerms: { ...subscription.currentTerms, effectiveFrom: "invalid" },
    },
  ];
  for (const key of Object.keys(subscription)) {
    const value: Record<string, unknown> = { ...subscription };
    delete value[key];
    invalid.push(value);
  }
  for (const key of Object.keys(subscription.currentTerms)) {
    const value: Record<string, unknown> = { ...subscription.currentTerms };
    delete value[key];
    invalid.push({ ...subscription, currentTerms: value });
  }
  for (const value of invalid) {
    request.mockResolvedValue({
      data: { workspaceId: id, subscription: value },
    });
    await expect(getPlatformSubscriptionSummary(api, id)).rejects.toMatchObject(
      { kind: "malformed-response" },
    );
  }
  for (const value of [
    { data: { workspaceId: "other", subscription: null } },
    { data: { workspaceId: id, subscription: null, usage: 1 } },
    { data: { workspaceId: id, subscription: null }, meta: {} },
  ]) {
    request.mockResolvedValue(value);
    await expect(getPlatformSubscriptionSummary(api, id)).rejects.toMatchObject(
      { kind: "malformed-response" },
    );
  }
});
test("counts decoder rejects negative, fractional, unsafe, missing, extra and wrong-workspace data", async () => {
  const { getPlatformWorkspaceCounts } = await import("./summaries");
  const request = vi.fn();
  const api = { request } as unknown as ApiClient;
  const counts = {
    branches: { active: 2 },
    trainees: { active: 3, needsReassignment: 1 },
    staff: { activeIncludingOwners: 4 },
  };
  request.mockResolvedValue({ data: { workspaceId: id, counts } });
  expect((await getPlatformWorkspaceCounts(api, id)).counts).toEqual(counts);
  for (const value of [
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "0",
    null,
    undefined,
  ]) {
    request.mockResolvedValue({
      data: {
        workspaceId: id,
        counts: { ...counts, branches: { active: value } },
      },
    });
    await expect(getPlatformWorkspaceCounts(api, id)).rejects.toMatchObject({
      kind: "malformed-response",
    });
  }
  for (const value of [
    { ...counts, trainees: { active: 3 } },
    { ...counts, staff: { activeIncludingOwners: 4, userId: "private" } },
    { ...counts, version: 4 },
    null,
  ]) {
    request.mockResolvedValue({ data: { workspaceId: id, counts: value } });
    await expect(getPlatformWorkspaceCounts(api, id)).rejects.toMatchObject({
      kind: "malformed-response",
    });
  }
  request.mockResolvedValue({ data: { workspaceId: "other", counts } });
  await expect(getPlatformWorkspaceCounts(api, id)).rejects.toMatchObject({
    kind: "malformed-response",
  });
});
