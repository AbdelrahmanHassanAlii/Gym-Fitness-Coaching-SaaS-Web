/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getMessages } from "@/i18n/messages";
import { ApiError } from "@/lib/api";
import { PlatformWorkspaceCreate } from "./PlatformWorkspaceCreate";

const owner = {
  id: "68e7a9d10d56fd2b98d4a199",
  displayName: "Owner",
  email: "owner@example.com",
};
const workspaceId = "68e7a9d10d56fd2b98d4a101";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  allows: vi.fn(() => true),
  key: vi.fn(),
  principalId: "user-a",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("q=Alpha&status=ACTIVE"),
}));
vi.mock("@/lib/auth", () => ({
  useAuthSession: () => ({ apiClient: { request: mocks.request } }),
}));
vi.mock("@/lib/platform-access", () => ({
  usePlatformAuthority: () => ({
    accessVersion: 7,
    validUntil: "2030-01-01T00:00:00.000Z",
    membershipId: "membership-a",
    principalId: mocks.principalId,
    sessionGeneration: 4,
    allows: mocks.allows,
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createIdempotencyKey: mocks.key,
}));
vi.mock("./OwnerPicker", () => ({
  OwnerPicker: ({
    onSelect,
  }: {
    onSelect: (value: {
      id: string;
      displayName: string;
      email: string;
    }) => void;
  }) => (
    <button onClick={() => onSelect(owner)} type="button">
      Pick owner
    </button>
  ),
}));

const labels = getMessages("en").platformWorkspaceManagement;

describe("Platform workspace create", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.allows.mockReturnValue(true);
    mocks.key.mockReset();
    mocks.principalId = "user-a";
    mocks.key
      .mockReturnValueOnce("create-key-1")
      .mockReturnValueOnce("create-key-2");
  });

  test("gates the route with shared Platform authority", () => {
    mocks.allows.mockReturnValue(false);
    renderCreate();
    expect(screen.getByRole("alert")).toHaveTextContent(
      labels.errors.forbidden,
    );
    expect(
      screen.queryByRole("heading", { name: labels.createTitle }),
    ).not.toBeInTheDocument();
  });

  test("requires fields and an owner without sending a request", () => {
    renderCreate();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      labels.validation.required,
    );
    expect(mocks.request).not.toHaveBeenCalled();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      labels.validation.owner,
    );
  });

  test("sends exact payload, stable retry key, invalidates, and navigates", async () => {
    mocks.request
      .mockRejectedValueOnce(new TypeError("transport"))
      .mockResolvedValueOnce(success());
    const queryClient = renderCreate();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Pick owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(
      await screen.findByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        `/platform/workspaces/${workspaceId}?q=Alpha&status=ACTIVE`,
      ),
    );
    const posts = mocks.request.mock.calls.map(([request]) => request);
    expect(posts).toEqual([
      expectedCreate("create-key-1"),
      expectedCreate("create-key-1"),
    ]);
    expect(mocks.key).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalled();
  });

  test("a new submit after a failed intent gets a new key", async () => {
    mocks.request.mockRejectedValue(
      new ApiError({
        kind: "backend",
        status: 400,
        code: "VALIDATION_FAILED",
        message: "invalid",
      }),
    );
    renderCreate();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Pick owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(
      mocks.request.mock.calls.map(([request]) => request.idempotencyKey),
    ).toEqual(["create-key-1", "create-key-2"]);
  });

  test("403 retires the form, refreshes authority, and never navigates", async () => {
    mocks.request.mockRejectedValue(
      new ApiError({
        kind: "backend",
        status: 403,
        code: "FORBIDDEN",
        message: "denied",
      }),
    );
    renderCreate();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Pick owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(
      await screen.findByText(labels.errors.forbidden),
    ).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("suppresses a late create result after authority identity changes", async () => {
    const mutation = deferred<ReturnType<typeof success>>();
    mocks.request.mockReturnValue(mutation.promise);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(tree(client));
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Pick owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    mocks.principalId = "user-b";
    view.rerender(tree(client));
    mutation.resolve(success());
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: labels.createTitle }),
      ).toBeInTheDocument(),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

function renderCreate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PlatformWorkspaceCreate labels={labels} locale="en" />
    </QueryClientProvider>,
  );
  return client;
}
function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <PlatformWorkspaceCreate labels={labels} locale="en" />
    </QueryClientProvider>
  );
}
function fillRequired() {
  fireEvent.change(screen.getByLabelText("Workspace type"), {
    target: { value: "GYM" },
  });
  fireEvent.change(screen.getByLabelText("Workspace name"), {
    target: { value: "Cairo Strength" },
  });
  fireEvent.change(screen.getByLabelText("Timezone"), {
    target: { value: "UTC" },
  });
  fireEvent.change(screen.getByLabelText("Default language"), {
    target: { value: "en" },
  });
}
function expectedCreate(idempotencyKey: string) {
  return {
    method: "POST",
    path: "/platform/workspaces",
    body: {
      type: "GYM",
      name: "Cairo Strength",
      ownerUserId: owner.id,
      timezone: "UTC",
      defaultLanguage: "en",
    },
    idempotencyKey,
  };
}
function success() {
  return {
    data: {
      workspace: {
        id: workspaceId,
        name: "Cairo Strength",
        type: "GYM",
        status: "PENDING_ACTIVATION",
        timezone: "UTC",
        defaultLanguage: "en",
        createdAt: "2026-10-09T08:30:00.000Z",
        version: 0,
      },
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
