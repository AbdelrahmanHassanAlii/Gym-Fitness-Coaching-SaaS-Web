import { describe, expect, test, vi } from "vitest";
import type {
  ApiDataEnvelope,
  ManualPaymentDto,
  WorkspaceId,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import type { ApiClient, ApiRequestOptions } from "@/lib/api";
import {
  commercialKeys,
  createManualPayment,
  getWorkspaceSubscription,
  getWorkspaceUsage,
  listWorkspacePayments,
} from ".";

const workspaceId = "workspace_a" as WorkspaceId;

describe("commercial API", () => {
  test("uses exact workspace commercial routes and explicit command idempotency", async () => {
    const apiClient = fakeApiClient([
      { data: subscriptionReadModel() },
      { data: usageReadModel() },
      { data: [payment()] },
      { data: { payment: payment({ id: "payment_b" }) } },
    ]);

    await getWorkspaceSubscription(apiClient, workspaceId);
    await getWorkspaceUsage(apiClient, workspaceId);
    await listWorkspacePayments(apiClient, workspaceId);
    await createManualPayment(
      apiClient,
      workspaceId,
      {
        amount: 2500,
        currency: "EGP",
        paymentMethod: "cash",
      },
      "payment-command-key",
    );

    expect(apiClient.calls).toEqual([
      { method: "GET", path: "/workspaces/workspace_a/subscription" },
      {
        method: "GET",
        path: "/workspaces/workspace_a/subscription/usage",
      },
      { method: "GET", path: "/workspaces/workspace_a/payments" },
      {
        body: { amount: 2500, currency: "EGP", paymentMethod: "cash" },
        idempotencyKey: "payment-command-key",
        method: "POST",
        path: "/workspaces/workspace_a/payments",
      },
    ]);
  });

  test("fails closed on malformed or cross-workspace commercial responses", async () => {
    await expect(
      getWorkspaceSubscription(
        fakeApiClient([{ data: { subscription: { workspaceId } } }]),
        workspaceId,
      ),
    ).rejects.toMatchObject({
      kind: "malformed-response",
    } satisfies Partial<ApiError>);

    await expect(
      listWorkspacePayments(
        fakeApiClient([
          { data: [payment({ workspaceId: "workspace_b" as WorkspaceId })] },
        ]),
        workspaceId,
      ),
    ).rejects.toMatchObject({
      kind: "malformed-response",
    } satisfies Partial<ApiError>);
  });

  test("query keys are deterministic, context-scoped, and credential-free", () => {
    const userKey = commercialKeys.subscription(workspaceId, 1, "user");
    const supportKey = commercialKeys.subscription(workspaceId, 1, "support");
    const workspaceBKey = commercialKeys.subscription(
      "workspace_b" as WorkspaceId,
      1,
      "user",
    );

    expect(userKey).toEqual(
      commercialKeys.subscription(workspaceId, 1, "user"),
    );
    expect(userKey).not.toEqual(supportKey);
    expect(userKey).not.toEqual(workspaceBKey);
    expect(JSON.stringify(userKey)).not.toMatch(
      /accessToken|refresh|cookie|supportSessionId|x-support-session-id/i,
    );
  });
});

function fakeApiClient(responses: ApiDataEnvelope<unknown>[]) {
  const calls: ApiRequestOptions[] = [];
  const request = vi.fn(async (options: ApiRequestOptions) => {
    calls.push(stripVolatile(options));
    return responses.shift();
  });

  return {
    calls,
    request,
  } as unknown as ApiClient & { calls: ApiRequestOptions[] };
}

function stripVolatile(options: ApiRequestOptions): ApiRequestOptions {
  const rest = { ...options };
  delete rest.signal;
  return rest;
}

function subscriptionReadModel() {
  return {
    accessMode: "WRITE",
    currentTerms: {
      billingPeriod: "MONTHLY",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      enabledFeatures: ["staff"],
      id: "terms_a",
      limits: { activeStaff: 10, activeTrainees: 100, storageBytes: 1000 },
      planVersionId: "plan_version_a",
      source: "TRIAL",
      subscriptionId: "subscription_a",
      workspaceId,
    },
    lifecycleStatus: "TRIAL",
    limits: { activeStaff: 10, activeTrainees: 100, storageBytes: 1000 },
    subscription: {
      currentTermsId: "terms_a",
      id: "subscription_a",
      lifecycleStatus: "TRIAL",
      version: 1,
      workspaceId,
    },
    usage: usage(),
    usageCompliance: "WITHIN_LIMIT",
  };
}

function usageReadModel() {
  return {
    limits: { activeStaff: 10, activeTrainees: 100, storageBytes: 1000 },
    usage: usage(),
    usageCompliance: "WITHIN_LIMIT",
  };
}

function usage() {
  return {
    activeStaff: 2,
    activeTrainees: 15,
    calculatedAt: "2026-01-01T00:00:00.000Z",
    reservedStorageBytes: 10,
    storageBytes: 25,
    workspaceId,
  };
}

function payment(input: Partial<ManualPaymentDto> = {}): ManualPaymentDto {
  return {
    amount: 2500,
    createdAt: "2026-01-01T00:00:00.000Z",
    currency: "EGP",
    id: "payment_a",
    paymentMethod: "cash",
    status: "PENDING",
    version: 1,
    workspaceId,
    ...input,
  };
}
