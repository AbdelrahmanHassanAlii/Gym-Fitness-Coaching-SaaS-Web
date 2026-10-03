/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  MembershipId,
  PermissionDecisionDto,
  SafeAuthUserDto,
  UserId,
  WorkspaceId,
} from "@/contracts";
import { ApiError } from "@/lib/api";
import { accessFactsFromDecision } from "@/lib/access";
import type { AuthSessionContextValue, AuthState } from "@/lib/auth";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import { CommercialExperience } from "./CommercialExperience";

const mocks = vi.hoisted(() => ({
  authSession: {
    apiClient: {
      request: vi.fn(),
    },
    bootstrap: vi.fn(),
    generation: 1,
    getAccessToken: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    markSessionExpired: vi.fn(),
    state: {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        emailVerified: true,
        firstName: "Amina",
        id: "user_a",
        lastName: "Owner",
        phoneVerified: false,
      },
    } as AuthState,
    subscribe: vi.fn(),
    verifyMfaLogin: vi.fn(),
  },
  idempotencyKey: "payment-key-1",
  staffContext: {
    accessFacts: null,
    shellContext: {
      accessContext: "user",
      branch: { branchId: null, label: "All permitted branches" },
      portal: "gym-staff",
      sessionGeneration: 1,
      workspace: {
        membershipId: "membership_a" as MembershipId,
        roles: ["GYM_OWNER"],
        workspaceId: "workspace_a" as WorkspaceId,
        workspaceName: "Summit Gym",
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      membershipId: "membership_a" as MembershipId,
      roles: ["GYM_OWNER"],
      workspaceId: "workspace_a" as WorkspaceId,
      workspaceName: "Summit Gym",
      workspaceTimezone: "Africa/Cairo",
    },
  } as StaffWorkspaceContextValue,
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => mocks.authSession as unknown as AuthSessionContextValue,
}));

vi.mock("@/lib/staff-shell", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/staff-shell")>(
      "@/lib/staff-shell",
    );

  return {
    ...actual,
    useStaffWorkspaceContext: () => mocks.staffContext,
  };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    createIdempotencyKey: () => mocks.idempotencyKey,
  };
});

describe("commercial experience UI", () => {
  beforeEach(() => {
    mocks.authSession.apiClient.request.mockReset();
    mocks.authSession.generation = 1;
    mocks.authSession.logout.mockClear();
    mocks.authSession.state = {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: user("Amina", "Owner"),
    } as AuthState;
    mocks.idempotencyKey = "payment-key-1";
    mocks.staffContext = context("workspace_a", "Summit Gym", 1);
  });

  test("does not render protected commercial UI without selected workspace", () => {
    mocks.staffContext = {
      accessFacts: null,
      shellContext: null,
      workspace: null,
    };

    renderCommercial();

    expect(screen.getByText("No workspace selected")).toBeInTheDocument();
    expect(screen.queryByText("Subscription")).not.toBeInTheDocument();
  });

  test("renders workspace subscription, usage, payments, and deferred lead scope", async () => {
    mockCommercialData();

    renderCommercial();

    expect(await screen.findByText("TRIAL")).toBeInTheDocument();
    expect(screen.getByText("WITHIN_LIMIT")).toBeInTheDocument();
    expect(screen.getByText("2500 EGP")).toBeInTheDocument();
    expect(
      screen.getByText(/platform-scoped, not workspace staff routes/i),
    ).toBeInTheDocument();
  });

  test("manual payment command uses exact body and command-specific idempotency key", async () => {
    mockCommercialData();

    renderCommercial();

    await screen.findByLabelText("Amount");
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "3000" },
    });
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "egp" },
    });
    fireEvent.change(screen.getByLabelText("Payment method"), {
      target: { value: "cash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

    await waitFor(() =>
      expect(mocks.authSession.apiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            amount: 3000,
            currency: "EGP",
            paymentMethod: "cash",
          },
          idempotencyKey: "payment-key-1",
          method: "POST",
          path: "/workspaces/workspace_a/payments",
        }),
      ),
    );
  });

  test("missing access facts fail closed and do not submit payment command", async () => {
    mockCommercialData();
    mocks.staffContext = {
      ...context("workspace_a", "Summit Gym", 1),
      accessFacts: null,
    };

    renderCommercial();

    await screen.findByLabelText("Amount");
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "3000" },
    });
    fireEvent.change(screen.getByLabelText("Payment method"), {
      target: { value: "cash" },
    });
    const button = screen.getByRole("button", { name: "Record payment" });
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(
      mocks.authSession.apiClient.request.mock.calls.some(
        ([request]) =>
          request.method === "POST" &&
          request.path === "/workspaces/workspace_a/payments",
      ),
    ).toBe(false);
  });

  test("rapid payment submission issues only one command while pending", async () => {
    const pending = deferred<unknown>();
    mockCommercialData({
      afterInitial: (request) => {
        if (request.path === "/workspaces/workspace_a/payments") {
          return pending.promise;
        }

        return envelope([]);
      },
    });

    renderCommercial();

    await screen.findByLabelText("Amount");
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "3000" },
    });
    fireEvent.change(screen.getByLabelText("Payment method"), {
      target: { value: "cash" },
    });
    const button = screen.getByRole("button", { name: "Record payment" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() =>
      expect(
        mocks.authSession.apiClient.request.mock.calls.filter(
          ([request]) =>
            request.method === "POST" &&
            request.path === "/workspaces/workspace_a/payments",
        ),
      ).toHaveLength(1),
    );

    pending.resolve(envelope({ payment: payment("workspace_a") }));
  });

  test("Backend 403 is access denied UX and does not logout", async () => {
    mockCommercialData({
      afterInitial: (request) => {
        if (request.path === "/workspaces/workspace_a/payments") {
          throw new ApiError({
            category: "forbidden",
            code: "PERMISSION_DENIED",
            kind: "backend",
            message: "Forbidden",
            status: 403,
          });
        }

        return envelope([]);
      },
    });

    renderCommercial();

    await screen.findByLabelText("Amount");
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "3000" },
    });
    fireEvent.change(screen.getByLabelText("Payment method"), {
      target: { value: "cash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));

    expect(
      await screen.findByText(
        "The Backend rejected this action for the current access.",
      ),
    ).toBeInTheDocument();
    expect(mocks.authSession.logout).not.toHaveBeenCalled();
  });

  test("workspace A late commercial data cannot appear under workspace B", async () => {
    const workspaceA = deferred<unknown>();
    mocks.authSession.apiClient.request.mockImplementation(async (request) => {
      if (request.path === "/workspaces/workspace_a/subscription") {
        return workspaceA.promise;
      }

      if (request.path === "/workspaces/workspace_b/subscription") {
        return envelope(subscriptionReadModel("workspace_b", "ACTIVE"));
      }

      if (request.path === "/workspaces/workspace_b/subscription/usage") {
        return envelope(usageReadModel("workspace_b"));
      }

      if (request.path === "/workspaces/workspace_b/payments") {
        return envelope([payment("workspace_b")]);
      }

      return envelope([]);
    });
    const queryClient = createTestQueryClient();
    const { rerender } = render(commercialTree(queryClient));

    expect(screen.getByText("Loading commercial state...")).toBeInTheDocument();

    mocks.authSession.generation = 2;
    mocks.staffContext = context("workspace_b", "Pulse Gym", 2);
    rerender(commercialTree(queryClient));

    expect(await screen.findByText("Pulse Gym")).toBeInTheDocument();
    workspaceA.resolve(
      envelope(subscriptionReadModel("workspace_a", "FROZEN")),
    );

    await waitFor(() =>
      expect(screen.queryByText("FROZEN")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });
});

function renderCommercial() {
  return render(commercialTree());
}

function commercialTree(queryClient = createTestQueryClient()) {
  return (
    <QueryClientProvider client={queryClient}>
      <CommercialExperience labels={messages.en.commercial} />
    </QueryClientProvider>
  );
}

function mockCommercialData(input?: {
  afterInitial?: (request: { method?: string; path: string }) => unknown;
}) {
  mocks.authSession.apiClient.request.mockImplementation(async (request) => {
    if (input?.afterInitial && request.method !== "GET") {
      return input.afterInitial(request);
    }

    if (request.path === "/workspaces/workspace_a/subscription") {
      return envelope(subscriptionReadModel("workspace_a", "TRIAL"));
    }

    if (request.path === "/workspaces/workspace_a/subscription/usage") {
      return envelope(usageReadModel("workspace_a"));
    }

    if (request.path === "/workspaces/workspace_a/payments") {
      return request.method === "POST"
        ? envelope({ payment: payment("workspace_a") })
        : envelope([payment("workspace_a")]);
    }

    return envelope([]);
  });
}

function envelope<T>(data: T): { data: T } {
  return { data };
}

function subscriptionReadModel(workspaceId: string, status: string) {
  return {
    accessMode: status === "FROZEN" ? "READ_ONLY" : "WRITE",
    currentTerms: {
      billingPeriod: "MONTHLY",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      enabledFeatures: ["staff"],
      id: `terms_${workspaceId}`,
      limits: { activeStaff: 10, activeTrainees: 100, storageBytes: 1000 },
      planVersionId: "plan_version_a",
      source: "TRIAL",
      subscriptionId: `subscription_${workspaceId}`,
      workspaceId,
    },
    lifecycleStatus: status,
    limits: { activeStaff: 10, activeTrainees: 100, storageBytes: 1000 },
    subscription: {
      currentTermsId: `terms_${workspaceId}`,
      id: `subscription_${workspaceId}`,
      lifecycleStatus: status,
      version: 1,
      workspaceId,
    },
    usage: usage(workspaceId),
    usageCompliance: "WITHIN_LIMIT",
  };
}

function usageReadModel(workspaceId: string) {
  return {
    limits: { activeStaff: 10, activeTrainees: 100, storageBytes: 1000 },
    usage: usage(workspaceId),
    usageCompliance: "WITHIN_LIMIT",
  };
}

function usage(workspaceId: string) {
  return {
    activeStaff: 2,
    activeTrainees: 15,
    calculatedAt: "2026-01-01T00:00:00.000Z",
    reservedStorageBytes: 10,
    storageBytes: 25,
    workspaceId,
  };
}

function payment(workspaceId: string) {
  return {
    amount: 2500,
    createdAt: "2026-01-01T00:00:00.000Z",
    currency: "EGP",
    id: `payment_${workspaceId}`,
    paymentMethod: "cash",
    status: "PENDING",
    version: 1,
    workspaceId,
  };
}

function context(
  workspaceId: string,
  workspaceName: string,
  generation: number,
): StaffWorkspaceContextValue {
  return {
    accessFacts: accessFacts(workspaceId, generation),
    shellContext: {
      accessContext: "user",
      branch: { branchId: null, label: "All permitted branches" },
      portal: "gym-staff",
      sessionGeneration: generation,
      workspace: {
        membershipId: `membership_${workspaceId}` as MembershipId,
        roles: ["GYM_OWNER"],
        workspaceId: workspaceId as WorkspaceId,
        workspaceName,
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      membershipId: `membership_${workspaceId}` as MembershipId,
      roles: ["GYM_OWNER"],
      workspaceId: workspaceId as WorkspaceId,
      workspaceName,
      workspaceTimezone: "Africa/Cairo",
    },
  };
}

function accessFacts(workspaceId: string, generation: number) {
  return accessFactsFromDecision({
    decisions: [allow("billing.payments.create")],
    membershipId: `membership_${workspaceId}` as MembershipId,
    sessionGeneration: generation,
    workspaceId: workspaceId as WorkspaceId,
  });
}

function allow(
  permission: PermissionDecisionDto["permission"],
): PermissionDecisionDto {
  return {
    allowed: true,
    effect: "ALLOW",
    permission,
    source: "PROFILE",
  };
}

function user(firstName: string, lastName: string): SafeAuthUserDto {
  return {
    emailVerified: true,
    firstName,
    id: `user_${firstName.toLowerCase()}` as UserId,
    lastName,
    phoneVerified: false,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}
