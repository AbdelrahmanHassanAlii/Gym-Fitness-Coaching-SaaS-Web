import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MyWorkspaceDto } from "@/contracts";
import type { AuthSessionContextValue } from "@/lib/auth";
import { appQueryKeys } from "@/lib/server-state";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import { StaffShell } from "@/components/staff-shell/StaffShell";
import { messages } from "@/i18n/messages";
import { getDataManagementLabels } from "@/i18n/data-management";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { exportRow, id } from "@/lib/data-management/fixtures";
import { ExportExperience } from "./ExportExperience";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  logout: vi.fn(),
  expire: vi.fn(),
}));
// Authentication and HTTP are the existing test seams. StaffShell discovery,
// decision decoding, workspace provider, access evaluation and handoff stay real.
vi.mock("@/lib/auth", () => {
  const apiClient = { request: mocks.request };
  return {
    useAuthSession: () =>
      ({
        apiClient,
        generation: 1,
        logout: mocks.logout,
        markSessionExpired: mocks.expire,
        state: {
          status: "authenticated",
          restrictedUntilVerified: false,
          accessToken: "test-token",
          user: {
            id,
            firstName: "Native",
            lastName: "Operator",
            emailVerified: true,
            phoneVerified: true,
          },
        },
      }) as unknown as AuthSessionContextValue,
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/data-management",
  useRouter: () => ({ refresh: vi.fn() }),
}));

const labels = getDataManagementLabels("en");
const workspace: MyWorkspaceDto = {
  workspace: {
    id: id as MyWorkspaceDto["workspace"]["id"],
    ownerUserId: id as MyWorkspaceDto["workspace"]["ownerUserId"],
    name: "Native Gym",
    type: "GYM",
    status: "ACTIVE",
    timezone: "Africa/Cairo",
    defaultLanguage: "en",
  },
  membership: {
    id: id as MyWorkspaceDto["membership"]["id"],
    workspaceId: id as MyWorkspaceDto["membership"]["workspaceId"],
    userId: id as MyWorkspaceDto["membership"]["userId"],
    roles: ["GYM_MANAGER"],
    status: "ACTIVE",
    accessVersion: 1,
    permissionProfileIds: [],
    joinedAt: exportRow.requestedAt,
    engagementPeriods: [],
  },
};
const ready = {
  ...exportRow,
  status: "READY",
  version: 1,
  completedAt: exportRow.requestedAt,
  expiresAt: "2099-01-02T00:00:00Z",
};
const workspaceKey = appQueryKeys.resource(
  ["staff-shell", "workspaces", 1],
  "current-user",
);
let client: QueryClient;

function NativeContextProbe() {
  const context = useStaffWorkspaceContext();
  return (
    <output aria-label="Native context">
      {JSON.stringify({
        workspaceId: context.workspace?.workspaceId,
        membershipId: context.workspace?.membershipId,
        accessContext: context.shellContext?.accessContext,
        accessStatus: context.accessFacts?.status,
      })}
    </output>
  );
}
function mountNative() {
  render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <StaffShell
          locale="en"
          labels={{
            ...messages.en.staffShell,
            themeControls: messages.en.themeControls,
          }}
        >
          <NativeContextProbe />
          <ExportExperience locale="en" />
        </StaffShell>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function backend(
  pending: ReturnType<typeof deferred>,
  operation: "detail" | "download",
) {
  let present = true;
  mocks.request.mockImplementation(
    async (request: {
      path: string;
      body?: { requests: { permission: string }[] };
    }) => {
      if (request.path === "/me/workspaces")
        return { data: present ? [workspace] : [] };
      if (request.path === `/workspaces/${id}/me/effective-access/decisions`)
        return {
          data: {
            context: "USER",
            workspaceId: id,
            membershipId: id,
            accessVersion: 1,
            decisions: request.body!.requests.map((r) => ({
              request: r,
              allowed: true,
              effect: "ALLOW",
            })),
          },
        };
      if (request.path.endsWith("/download-url")) {
        if (operation !== "download")
          throw new Error("Unexpected download issuance");
        return pending.promise;
      }
      if (request.path === `/workspaces/${id}/exports/${id}`) {
        if (operation !== "detail")
          throw new Error("Unexpected detail request");
        return pending.promise;
      }
      if (request.path === `/workspaces/${id}/exports`)
        return { data: [ready], meta: { hasMore: false, nextCursor: null } };
      throw new Error(`Unexpected API path: ${request.path}`);
    },
  );
  return async () => {
    present = false;
    // Exercise the same query invalidation/refetch path used by native authority
    // recovery. Only the HTTP discovery result changes; no hook/context injection.
    await act(async () => {
      await client.invalidateQueries({ queryKey: workspaceKey, exact: true });
    });
    await screen.findByRole("heading", {
      name: "No staff workspace available",
    });
    expect(client.getQueryData(workspaceKey)).toEqual([]);
    expect(
      mocks.request.mock.calls.filter(([r]) => r.path === "/me/workspaces"),
    ).toHaveLength(2);
    expect(screen.queryByLabelText("Native context")).toBeNull();
  };
}
function assertRetired() {
  expect(
    screen.queryByRole("heading", { name: labels.exportTitle }),
  ).toBeNull();
  expect(screen.queryByText(labels.statuses.READY)).toBeNull();
  for (const name of [
    labels.create,
    labels.newExport,
    labels.download,
    labels.detail,
  ])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
}
function exportCalls() {
  return mocks.request.mock.calls.filter(([r]) => r.path.includes("/exports"));
}

beforeEach(() => {
  mocks.request.mockReset();
  mocks.logout.mockReset();
  mocks.expire.mockReset();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

test("real StaffShell discovery retires exports and discards deferred detail after native membership loss", async () => {
  const pending = deferred(),
    retire = backend(pending, "detail");
  mountNative();
  await screen.findByRole("button", { name: labels.download });
  expect(screen.getByLabelText("Native context")).toHaveTextContent(
    JSON.stringify({
      workspaceId: id,
      membershipId: id,
      accessContext: "user",
      accessStatus: "ready",
    }),
  );
  const decisions = mocks.request.mock.calls.find(([r]) =>
    r.path.endsWith("/me/effective-access/decisions"),
  )![0];
  expect(
    decisions.body.requests.map((r: { permission: string }) => r.permission),
  ).toEqual(
    expect.arrayContaining([
      "exports.workspace.read",
      "exports.workspace.create",
      "exports.workspace.download",
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: labels.detail }));
  await waitFor(() => expect(exportCalls()).toHaveLength(2));
  await retire();
  assertRetired();
  const count = exportCalls().length;
  await act(async () => {
    pending.resolve({ export: { ...ready, version: 8 } });
  });
  assertRetired();
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(exportCalls()).toHaveLength(count);
  expect(
    mocks.request.mock.calls.some(
      ([r]) => r.path.startsWith("/platform/") || r.path.includes("/support"),
    ),
  ).toBe(false);
});

test("real StaffShell membership loss discards a deferred signed URL before storage handoff", async () => {
  const pending = deferred(),
    retire = backend(pending, "download");
  const navigation = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  mountNative();
  fireEvent.click(await screen.findByRole("button", { name: labels.download }));
  await waitFor(() => expect(exportCalls()).toHaveLength(2));
  expect(exportCalls()[1][0]).toMatchObject({
    method: "POST",
    supportSessionId: null,
    cache: "no-store",
  });
  await retire();
  assertRetired();
  const count = exportCalls().length;
  const secret =
    "https://storage.example.test/archive?signed=retired-native-secret";
  await act(async () => {
    pending.resolve({
      data: { url: secret, expiresAt: "2099-01-01T00:00:00Z" },
    });
  });
  expect(navigation).not.toHaveBeenCalled();
  assertRetired();
  expect(exportCalls()).toHaveLength(count);
  expect(document.body.textContent).not.toContain(secret);
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((q) => ({ key: q.queryKey, data: q.state.data })),
    ),
  ).not.toContain(secret);
  for (const storage of [localStorage, sessionStorage])
    for (let i = 0; i < storage.length; i++)
      expect(storage.getItem(storage.key(i)!)).not.toContain(secret);
  expect(
    mocks.request.mock.calls.some(
      ([r]) => r.path.startsWith("/platform/") || r.path.includes("/support"),
    ),
  ).toBe(false);
});
