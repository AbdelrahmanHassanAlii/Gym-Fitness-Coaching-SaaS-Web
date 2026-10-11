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
  expired: vi.fn(),
  key: vi.fn(() => "intent-key"),
  principalId: "user-a",
  validUntil: "2030-01-01T00:00:00.000Z",
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => ({
    apiClient: { request: mocks.request },
    markSessionExpired: mocks.expired,
  }),
}));
vi.mock("@/lib/platform-access", () => ({
  usePlatformAuthority: () => ({
    accessVersion: 7,
    authorityValidUntil: mocks.validUntil,
    validUntil: mocks.validUntil,
    membershipId: "membership-a",
    principalId: mocks.principalId,
    sessionGeneration: 4,
    allows: () => true,
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/lib/api/idempotency", () => ({ createIdempotencyKey: mocks.key }));

const labels = getMessages("en").platformWorkspaceManagement;
const lifecycleCases = [
  ["activate", "PENDING_ACTIVATION", "ARCHIVED"],
  ["restrict", "ACTIVE", "RESTRICTED"],
  ["suspend", "ACTIVE", "SUSPENDED"],
  ["archive", "ACTIVE", "ARCHIVED"],
  ["restore", "ARCHIVED", "ACTIVE"],
] as const;
const lifecycleErrors = [
  ["WORKSPACE_VERSION_CONFLICT", "conflict"],
  ["INVALID_WORKSPACE_STATUS_TRANSITION", "invalidTransition"],
  ["FORBIDDEN", "forbidden"],
  ["IDEMPOTENCY_KEY_CONFLICT", "idempotency"],
] as const;

describe("Platform workspace management", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.refresh.mockClear();
    mocks.key.mockClear();
    mocks.key.mockReturnValue("intent-key");
    mocks.expired.mockReset();
    mocks.principalId = "user-a";
    mocks.validUntil = "2030-01-01T00:00:00.000Z";
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

  test("suppresses lifecycle side effects when authority expiry unmounts a pending mutation", async () => {
    const mutation = deferred<unknown>();
    mocks.request.mockImplementation((request: { method: string }) =>
      request.method === "GET"
        ? Promise.resolve(managementState("ACTIVE"))
        : mutation.promise,
    );
    const client = createClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = renderManagement(client);
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    view.unmount();

    await act(async () => {
      mutation.resolve({ data: managementState("ARCHIVED").data });
      await mutation.promise;
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  test("suppresses owner side effects when authority expiry unmounts a pending mutation", async () => {
    const mutation = deferred<unknown>();
    mocks.request.mockImplementation(
      (request: { method: string; path: string }) => {
        if (request.path === "/platform/workspace-owner-candidates")
          return Promise.resolve(
            candidatePage("68e7a9d10d56fd2b98d4a188", "New Owner"),
          );
        if (request.method === "GET")
          return Promise.resolve(managementState("ACTIVE"));
        return mutation.promise;
      },
    );
    const client = createClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = renderManagement(client);
    fireEvent.click(
      await screen.findByRole("button", { name: "Change owner" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /New Owner.*Select/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    view.unmount();

    await act(async () => {
      mutation.resolve({ data: managementState("ACTIVE").data });
      await mutation.promise;
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(
      mocks.request.mock.calls.filter(([request]) => request.method === "POST"),
    ).toHaveLength(1);
  });

  test("retires selected owner and dialog state when authority identity changes", async () => {
    mocks.request.mockImplementation((request: { path: string }) =>
      request.path === "/platform/workspace-owner-candidates"
        ? Promise.resolve(
            candidatePage("68e7a9d10d56fd2b98d4a188", "New Owner"),
          )
        : Promise.resolve(managementState("ACTIVE")),
    );
    const client = createClient();
    const view = render(managementTree(client));
    fireEvent.click(
      await screen.findByRole("button", { name: "Change owner" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /New Owner.*Select/ }),
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();

    mocks.principalId = "user-b";
    view.rerender(managementTree(client));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Change owner" }),
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  test("traps dialog focus, closes on Escape, and restores focus to its trigger", async () => {
    mocks.request.mockResolvedValue(managementState("ACTIVE"));
    renderManagement();
    const trigger = await screen.findByRole("button", { name: "Archive" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Archive" });
    const heading = screen.getByRole("heading", { name: "Archive" });
    await waitFor(() => expect(heading).toHaveFocus());

    const confirm = screen.getByRole("button", { name: "Confirm" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(confirm).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("renders a localized safe not-found state without logging out", async () => {
    mocks.request.mockRejectedValue(
      new ApiError({
        category: "not-found",
        kind: "backend",
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "missing",
      }),
    );
    renderManagement();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      labels.errors.notFound,
    );
    expect(
      screen.queryByRole("button", { name: "Change owner" }),
    ).not.toBeInTheDocument();
    expect(mocks.expired).not.toHaveBeenCalled();
  });

  test("retires rendered data, picker, and selection when validUntil changes", async () => {
    const replacement = deferred<unknown>();
    mocks.request.mockImplementation((request: { path: string }) => {
      if (request.path === "/platform/workspace-owner-candidates")
        return Promise.resolve(
          candidatePage("68e7a9d10d56fd2b98d4a188", "New Owner"),
        );
      if (mocks.validUntil === "2031-01-01T00:00:00.000Z")
        return replacement.promise;
      return Promise.resolve(managementState("ACTIVE"));
    });
    const client = createClient();
    const view = render(managementTree(client));
    fireEvent.click(
      await screen.findByRole("button", { name: "Change owner" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /New Owner.*Select/ }),
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();

    mocks.validUntil = "2031-01-01T00:00:00.000Z";
    view.rerender(managementTree(client));
    await waitFor(() =>
      expect(screen.queryByText(/owner@example\.com/)).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change owner" }),
    ).not.toBeInTheDocument();
  });

  test("suppresses a late management success from an obsolete authority", async () => {
    const stale = deferred<unknown>();
    mocks.request.mockImplementation(() =>
      mocks.principalId === "user-a"
        ? stale.promise
        : Promise.resolve(managementState("SUSPENDED")),
    );
    const client = createClient();
    const view = render(managementTree(client));
    mocks.principalId = "user-b";
    view.rerender(managementTree(client));
    expect(
      await screen.findByRole("button", { name: "Activate" }),
    ).toBeInTheDocument();
    await act(async () => {
      stale.resolve(managementState("ACTIVE"));
      await stale.promise;
    });
    expect(
      screen.queryByRole("button", { name: "Restrict" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Activate" }),
    ).toBeInTheDocument();
  });

  test("retires previously rendered data when a subsequent request returns 403", async () => {
    mocks.request.mockResolvedValueOnce(managementState("ACTIVE"));
    const client = createClient();
    renderManagement(client);
    expect(await screen.findByText(/owner@example\.com/)).toBeInTheDocument();
    mocks.request.mockRejectedValue(
      new ApiError({
        category: "forbidden",
        kind: "backend",
        status: 403,
        code: "FORBIDDEN",
        message: "denied",
      }),
    );
    await act(async () => {
      await client.invalidateQueries({
        predicate: (query) => query.queryKey[2] === "management-state",
      });
    });
    expect(
      await screen.findByText(labels.errors.forbidden),
    ).toBeInTheDocument();
    expect(screen.queryByText(/owner@example\.com/)).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.expired).not.toHaveBeenCalled();
  });

  test("invalid transition refetches status, removes the stale action, and never retries", async () => {
    mocks.request
      .mockResolvedValueOnce(managementState("ACTIVE"))
      .mockRejectedValueOnce(
        new ApiError({
          kind: "backend",
          status: 409,
          code: "INVALID_WORKSPACE_STATUS_TRANSITION",
          message: "stale",
        }),
      )
      .mockResolvedValueOnce(managementState("ARCHIVED"));
    renderManagement();
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(
      await screen.findByText(labels.errors.invalidTransition),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(
      mocks.request.mock.calls.filter(([request]) => request.method === "POST"),
    ).toHaveLength(1);
    expect(mocks.expired).not.toHaveBeenCalled();
  });

  test.each([
    ["activate", "PENDING_ACTIVATION", "ACTIVE"],
    ["restrict", "ACTIVE", "RESTRICTED"],
    ["suspend", "ACTIVE", "SUSPENDED"],
    ["archive", "ACTIVE", "ARCHIVED"],
    ["restore", "ARCHIVED", "PENDING_ACTIVATION"],
  ] as const)(
    "%s sends the exact command, version and key, stays pending, then reconciles",
    async (command, initialStatus, finalStatus) => {
      const mutation = deferred<unknown>();
      let resolved = false;
      mocks.request.mockImplementation((request: { method: string }) => {
        if (request.method === "POST") return mutation.promise;
        return Promise.resolve(
          managementState(resolved ? finalStatus : initialStatus),
        );
      });
      renderManagement();
      fireEvent.click(
        await screen.findByRole("button", { name: labels.actions[command] }),
      );
      const confirm = screen.getByRole("button", { name: "Confirm" });
      fireEvent.click(confirm);
      expect(confirm).toBeDisabled();
      expect(mocks.request).toHaveBeenCalledWith({
        method: "POST",
        path: `/platform/workspaces/${workspaceId}/${command}`,
        body: { expectedVersion: 3 },
        idempotencyKey: "intent-key",
      });
      resolved = true;
      await act(async () => {
        mutation.resolve({
          data: { workspace: managementState(finalStatus).data.workspace },
        });
        await mutation.promise;
      });
      expect(
        await screen.findByText(labels.success.lifecycle),
      ).toBeInTheDocument();
    },
  );

  test("owner idempotency conflict retires the intent and a new selection uses a fresh key", async () => {
    mocks.key
      .mockReturnValueOnce("owner-key-1")
      .mockReturnValueOnce("owner-key-2");
    let ownerPosts = 0;
    mocks.request.mockImplementation(
      (request: { method: string; path: string }) => {
        if (request.path === "/platform/workspace-owner-candidates")
          return Promise.resolve(
            candidatePage("68e7a9d10d56fd2b98d4a188", "New Owner"),
          );
        if (request.method === "GET")
          return Promise.resolve(managementState("ACTIVE"));
        ownerPosts += 1;
        if (ownerPosts === 1)
          return Promise.reject(
            new ApiError({
              category: "idempotency-conflict",
              kind: "backend",
              status: 409,
              code: "IDEMPOTENCY_KEY_CONFLICT",
              message: "conflict",
            }),
          );
        return Promise.resolve({
          data: { workspace: managementState("ACTIVE").data.workspace },
        });
      },
    );
    renderManagement();
    await chooseNewOwner();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(
      await screen.findByText(labels.errors.idempotency),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    await chooseNewOwner();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(ownerPosts).toBe(2));
    expect(
      mocks.request.mock.calls
        .filter(([request]) => request.method === "POST")
        .map(([request]) => request.idempotencyKey),
    ).toEqual(["owner-key-1", "owner-key-2"]);
  });

  test("lifecycle idempotency conflict retires the intent and a new confirmation uses a fresh key", async () => {
    mocks.key
      .mockReturnValueOnce("lifecycle-key-1")
      .mockReturnValueOnce("lifecycle-key-2");
    let posts = 0;
    mocks.request.mockImplementation((request: { method: string }) => {
      if (request.method === "GET")
        return Promise.resolve(managementState("ACTIVE"));
      posts += 1;
      if (posts === 1)
        return Promise.reject(
          new ApiError({
            category: "idempotency-conflict",
            kind: "backend",
            status: 409,
            code: "IDEMPOTENCY_KEY_CONFLICT",
            message: "conflict",
          }),
        );
      return Promise.resolve({
        data: { workspace: managementState("ARCHIVED").data.workspace },
      });
    });
    renderManagement();
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(
      await screen.findByText(labels.errors.idempotency),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(posts).toBe(2));
    expect(
      mocks.request.mock.calls
        .filter(([request]) => request.method === "POST")
        .map(([request]) => request.idempotencyKey),
    ).toEqual(["lifecycle-key-1", "lifecycle-key-2"]);
  });

  test("a mutation 403 retires rendered state and refreshes authority without logout", async () => {
    mocks.request
      .mockResolvedValueOnce(managementState("ACTIVE"))
      .mockRejectedValueOnce(
        new ApiError({
          category: "forbidden",
          kind: "backend",
          status: 403,
          code: "FORBIDDEN",
          message: "denied",
        }),
      );
    renderManagement();
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(
      await screen.findByText(labels.errors.forbidden),
    ).toBeInTheDocument();
    expect(screen.queryByText(/owner@example\.com/)).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.expired).not.toHaveBeenCalled();
  });

  test.each(
    lifecycleCases.flatMap(([command, initialStatus, nextStatus]) =>
      lifecycleErrors.map(
        ([code, label]) =>
          [command, initialStatus, nextStatus, code, label] as const,
      ),
    ),
  )(
    "%s from %s to %s handles %s (%s) without automatic retry",
    async (command, initialStatus, nextStatus, code, label) => {
      let gets = 0;
      const category =
        code === "IDEMPOTENCY_KEY_CONFLICT"
          ? "idempotency-conflict"
          : code === "FORBIDDEN"
            ? "forbidden"
            : "unknown";
      mocks.request.mockImplementation((request: { method: string }) => {
        if (request.method === "GET") {
          gets += 1;
          return Promise.resolve(
            managementState(gets === 1 ? initialStatus : nextStatus),
          );
        }
        return Promise.reject(
          new ApiError({
            category,
            kind: "backend",
            status: code === "FORBIDDEN" ? 403 : 409,
            code,
            message: "rejected",
          }),
        );
      });
      renderManagement();
      fireEvent.click(
        await screen.findByRole("button", { name: labels.actions[command] }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

      expect(await screen.findByText(labels.errors[label])).toBeInTheDocument();
      expect(
        mocks.request.mock.calls.filter(
          ([request]) => request.method === "POST",
        ),
      ).toHaveLength(1);
      expect(
        screen.queryByRole("button", { name: "Retry" }),
      ).not.toBeInTheDocument();
      if (
        code === "WORKSPACE_VERSION_CONFLICT" ||
        code === "INVALID_WORKSPACE_STATUS_TRANSITION"
      ) {
        expect(gets).toBeGreaterThan(1);
        expect(
          screen.queryByRole("button", { name: labels.actions[command] }),
        ).not.toBeInTheDocument();
      }
      if (code === "FORBIDDEN") expect(mocks.refresh).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mocks.expired).not.toHaveBeenCalled();
    },
  );
});

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderManagement(client = createClient()) {
  return render(managementTree(client));
}

function managementTree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <PlatformWorkspaceManagement labels={labels} workspaceId={workspaceId} />
    </QueryClientProvider>
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

async function chooseNewOwner() {
  fireEvent.click(await screen.findByRole("button", { name: "Change owner" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /New Owner.*Select/ }),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
