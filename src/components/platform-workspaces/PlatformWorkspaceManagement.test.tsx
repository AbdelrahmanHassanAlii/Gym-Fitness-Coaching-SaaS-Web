import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { getMessages } from "@/i18n/messages";
import { PlatformWorkspaceManagement } from "./PlatformWorkspaceManagement";

const workspaceId = "68e7a9d10d56fd2b98d4a101";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  key: vi.fn(() => "intent-key"),
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => ({
    apiClient: { request: mocks.request },
    markSessionExpired: vi.fn(),
  }),
}));
vi.mock("@/lib/platform-access", () => ({
  usePlatformAuthority: () => ({
    accessVersion: 7,
    authorityValidUntil: "2030-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    membershipId: "membership-a",
    principalId: "user-a",
    sessionGeneration: 4,
    allows: () => true,
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/lib/api/idempotency", () => ({ createIdempotencyKey: mocks.key }));

const labels = getMessages("en").platformWorkspaceManagement;

describe("Platform workspace management", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.refresh.mockClear();
    mocks.key.mockClear();
  });

  test.each([
    ["PENDING_ACTIVATION", ["Activate", "Archive"]],
    ["ACTIVE", ["Restrict", "Suspend", "Archive"]],
    ["RESTRICTED", ["Activate", "Suspend", "Archive"]],
    ["SUSPENDED", ["Activate", "Archive"]],
    ["ARCHIVED", ["Restore"]],
  ] as const)("shows only exact %s actions", async (status, expected) => {
    mocks.request.mockResolvedValue(managementState(status));
    renderManagement();
    expect(await screen.findByText(/owner@example\.com/)).toBeInTheDocument();
    const lifecycle = ["Activate", "Restrict", "Suspend", "Archive", "Restore"];
    for (const action of lifecycle) {
      const button = screen.queryByRole("button", { name: action });
      expect(Boolean(button), action).toBe(expected.includes(action as never));
    }
    expect(screen.queryByText("version")).not.toBeInTheDocument();
  });

  test("sends server version and idempotency key, blocks duplicate clicks, then refetches", async () => {
    let resolveMutation!: (value: unknown) => void;
    mocks.request.mockImplementation(
      (request: { method: string; path: string }) => {
        if (request.method === "GET")
          return Promise.resolve(managementState("ACTIVE"));
        return new Promise((resolve) => {
          resolveMutation = resolve;
        });
      },
    );
    renderManagement();
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    const confirm = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        method: "POST",
        path: `/platform/workspaces/${workspaceId}/archive`,
        body: { expectedVersion: 3 },
        idempotencyKey: "intent-key",
      }),
    );
    expect(
      mocks.request.mock.calls.filter(([request]) => request.method === "POST"),
    ).toHaveLength(1);
    await act(async () =>
      resolveMutation({
        data: { workspace: managementState("ARCHIVED").data.workspace },
      }),
    );
    await waitFor(() =>
      expect(
        mocks.request.mock.calls.filter(([request]) => request.method === "GET")
          .length,
      ).toBeGreaterThan(1),
    );
  });

  test("version conflict refetches and never blindly retries", async () => {
    mocks.request
      .mockResolvedValueOnce(managementState("ACTIVE"))
      .mockRejectedValueOnce(
        new ApiError({
          kind: "backend",
          status: 409,
          code: "WORKSPACE_VERSION_CONFLICT",
          message: "conflict",
        }),
      )
      .mockResolvedValueOnce(managementState("SUSPENDED"));
    renderManagement();
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText(labels.errors.conflict)).toBeInTheDocument();
    expect(
      mocks.request.mock.calls.filter(([request]) => request.method === "POST"),
    ).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("reassigns from current management version with a fresh idempotency key", async () => {
    mocks.request.mockImplementation(
      (request: { method: string; path: string }) => {
        if (request.path === "/platform/workspace-owner-candidates")
          return Promise.resolve(
            candidatePage("68e7a9d10d56fd2b98d4a188", "New Owner"),
          );
        if (request.method === "GET")
          return Promise.resolve(managementState("ACTIVE"));
        return Promise.resolve({
          data: {
            workspace: {
              ...managementState("ACTIVE").data.workspace,
              version: 4,
            },
          },
        });
      },
    );
    renderManagement();
    fireEvent.click(
      await screen.findByRole("button", { name: "Change owner" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /New Owner.*Select/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        method: "POST",
        path: `/platform/workspaces/${workspaceId}/owner`,
        body: { ownerUserId: "68e7a9d10d56fd2b98d4a188", expectedVersion: 3 },
        idempotencyKey: "intent-key",
      }),
    );
  });

  test("suppresses same-owner confirmation", async () => {
    mocks.request.mockImplementation((request: { path: string }) =>
      request.path === "/platform/workspace-owner-candidates"
        ? Promise.resolve(candidatePage("68e7a9d10d56fd2b98d4a199", "Owner"))
        : Promise.resolve(managementState("ACTIVE")),
    );
    renderManagement();
    fireEvent.click(
      await screen.findByRole("button", { name: "Change owner" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Owner.*Select/ }),
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  test("403 retires management controls and refreshes Platform authority", async () => {
    mocks.request.mockRejectedValue(
      new ApiError({
        kind: "backend",
        status: 403,
        code: "FORBIDDEN",
        message: "denied",
      }),
    );
    renderManagement();
    expect(
      await screen.findByText(labels.errors.forbidden),
    ).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Change owner" }),
    ).not.toBeInTheDocument();
  });
});

function renderManagement() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlatformWorkspaceManagement labels={labels} workspaceId={workspaceId} />
    </QueryClientProvider>,
  );
}

function managementState(
  status:
    "PENDING_ACTIVATION" | "ACTIVE" | "RESTRICTED" | "SUSPENDED" | "ARCHIVED",
) {
  return {
    data: {
      workspace: {
        id: workspaceId,
        name: "Cairo Strength",
        type: "GYM",
        status,
        timezone: "Africa/Cairo",
        defaultLanguage: "en",
        createdAt: "2026-10-09T08:30:00.000Z",
        version: 3,
      },
      owner: {
        id: "68e7a9d10d56fd2b98d4a199",
        displayName: "Owner",
        email: "owner@example.com",
      },
    },
  };
}

function candidatePage(id: string, displayName: string) {
  return {
    data: [{ id, displayName, email: "owner@example.com" }],
    meta: { nextCursor: null, hasMore: false },
  };
}
