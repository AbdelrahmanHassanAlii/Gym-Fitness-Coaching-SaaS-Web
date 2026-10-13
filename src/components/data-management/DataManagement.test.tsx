import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { getDataManagementLabels } from "@/i18n/data-management";
import { deletionRow, exportRow, id } from "@/lib/data-management/fixtures";
import {
  DeletionExperience,
  DeletionDetail,
  DeletionQueue,
} from "./DeletionExperience";
import { ExportExperience, NativeExports } from "./ExportExperience";
import { decodeExport } from "@/lib/data-management/decoders";
import { MemoryIntent, MemoryRows } from "@/lib/data-management/state";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  handoff: vi.fn(),
  expire: vi.fn(),
  refresh: vi.fn(),
  allowed: new Set<string>(),
  native: {} as Record<string, unknown>,
  generation: 1,
  principal: "principal",
  accessVersion: 1,
}));
vi.mock("@/lib/auth", () => {
  const apiClient = { request: mocks.request };
  return {
    useAuthSession: () => ({
      apiClient,
      generation: mocks.generation,
      markSessionExpired: mocks.expire.bind(null),
      state: {
        status: "authenticated",
        restrictedUntilVerified: false,
        user: { id: mocks.principal },
      },
    }),
  };
});
vi.mock("@/lib/staff-shell", () => ({
  useStaffWorkspaceContext: () => mocks.native,
}));
vi.mock("@/lib/platform-access", () => ({
  usePlatformAuthority: () => ({
    principalId: "principal",
    sessionGeneration: 1,
    membershipId: id,
    accessVersion: mocks.accessVersion,
    validUntil: null,
    deletionValidUntil: null,
    allows: (p: string) => mocks.allowed.has(p),
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/lib/data-management/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data-management/api")>()),
  handoffDownload: mocks.handoff,
}));
const en = getDataManagementLabels("en");
function mount(component: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {component}
    </QueryClientProvider>,
  );
}
function exportsPage(
  permissions = { read: true, create: true, download: true },
) {
  return mount(
    <NativeExports
      locale="en"
      labels={en}
      workspaceId={id}
      permissions={permissions}
    />,
  );
}
function list(
  items: unknown[] = [exportRow],
  nextCursor: string | null = null,
) {
  return { data: items, meta: { hasMore: false, nextCursor } };
}
beforeEach(() => {
  mocks.request.mockReset();
  mocks.handoff.mockReset();
  mocks.expire.mockReset();
  mocks.refresh.mockReset();
  mocks.generation = 1;
  mocks.principal = "principal";
  mocks.accessVersion = 1;
  mocks.allowed = new Set([
    "deletion.read",
    "deletion.approve",
    "deletion.postpone",
    "deletion.cancel",
  ]);
  mocks.native = {};
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("[autofocus]")?.focus();
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("native export behavior", () => {
  test("cursor remains available despite hasMore false and no total/completeness claim", async () => {
    mocks.request
      .mockResolvedValueOnce(list([exportRow], "older"))
      .mockResolvedValueOnce(list([]));
    exportsPage();
    await screen.findByText(en.olderExports);
    fireEvent.click(screen.getByText(en.olderExports));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(mocks.request.mock.calls[1][0].query.cursor).toBe("older");
    expect(screen.queryByText("All exports loaded")).toBeNull();
  });
  test("confirmation creates one key and locks out double submit", async () => {
    let resolve!: (value: unknown) => void;
    mocks.request.mockImplementation((r) =>
      r.method === "POST"
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve(list([])),
    );
    exportsPage();
    await screen.findByText(en.emptyExports);
    fireEvent.click(screen.getByText(en.create));
    expect(screen.getAllByText(en.exportCopy)).toHaveLength(2);
    const confirm = screen.getByText(en.confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    const posts = mocks.request.mock.calls.filter(([r]) => r.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0].idempotencyKey).toBeTruthy();
    await act(async () => resolve({ data: { export: exportRow } }));
  });
  test("uncertain create reconciles and exact explicit replay reuses original key", async () => {
    let posts = 0;
    mocks.request.mockImplementation(async (r) =>
      r.method === "POST"
        ? ++posts === 1
          ? Promise.reject(
              new ApiError({ kind: "network", message: "unknown" }),
            )
          : { data: { export: exportRow } }
        : list([]),
    );
    exportsPage();
    await screen.findByText(en.emptyExports);
    fireEvent.click(screen.getByText(en.create));
    fireEvent.click(screen.getByText(en.confirm));
    await screen.findByText(en.replay);
    expect(posts).toBe(1);
    fireEvent.click(screen.getByText(en.replay));
    await waitFor(() => expect(posts).toBe(2));
    const requests = mocks.request.mock.calls
      .filter(([r]) => r.method === "POST")
      .map(([r]) => r);
    expect(requests[1].idempotencyKey).toBe(requests[0].idempotencyKey);
    expect(requests[1].path).toBe(requests[0].path);
  });
  test("ACTIVE_EXPORT_EXISTS is localized safely and does not auto-retry", async () => {
    mocks.request.mockImplementation(async (r) =>
      r.method === "POST"
        ? Promise.reject(
            new ApiError({
              kind: "backend",
              code: "ACTIVE_EXPORT_EXISTS",
              status: 409,
              message: "raw private",
            }),
          )
        : r.path.endsWith(`/${id}`)
          ? { export: exportRow }
          : list([exportRow]),
    );
    exportsPage();
    await screen.findByText(en.statuses.PENDING);
    fireEvent.click(screen.getByText(en.create));
    fireEvent.click(screen.getByText(en.confirm));
    await screen.findByText(en.errors.active);
    expect(
      mocks.request.mock.calls.filter(([r]) => r.method === "POST"),
    ).toHaveLength(1);
    expect(screen.queryByText("raw private")).toBeNull();
  });
  test("download is explicit and transient; returned expiry used", async () => {
    const ready = {
      ...exportRow,
      status: "READY",
      version: 2,
      expiresAt: "2099-01-02T00:00:00Z",
    };
    mocks.request.mockImplementation(async (r) =>
      r.path.endsWith("download-url")
        ? {
            data: {
              url: "https://storage.test/file?secret=never-persist",
              expiresAt: "2099-01-01T00:00:00Z",
            },
          }
        : list([ready]),
    );
    const local = vi.spyOn(Storage.prototype, "setItem");
    exportsPage();
    await screen.findByText(en.download);
    expect(mocks.handoff).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(en.download));
    await waitFor(() =>
      expect(mocks.handoff).toHaveBeenCalledWith(
        "https://storage.test/file?secret=never-persist",
      ),
    );
    expect(screen.queryByText(/never-persist/)).toBeNull();
    expect(local).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("2099");
    local.mockRestore();
  });
  test("late signed URL after authority teardown is discarded", async () => {
    let resolve!: (v: unknown) => void;
    mocks.request.mockImplementation((r) =>
      r.path.endsWith("download-url")
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve(
            list([
              {
                ...exportRow,
                status: "READY",
                expiresAt: "2099-01-02T00:00:00Z",
              },
            ]),
          ),
    );
    const mounted = exportsPage();
    await screen.findByText(en.download);
    fireEvent.click(screen.getByText(en.download));
    mounted.unmount();
    await act(async () =>
      resolve({
        data: {
          url: "https://storage.test/file?secret=late",
          expiresAt: "2099-01-01T00:00:00Z",
        },
      }),
    );
    expect(mocks.handoff).not.toHaveBeenCalled();
  });
  test.each(["READY", "FAILED", "EXPIRED"])(
    "terminal %s does not continuously poll",
    async (status) => {
      mocks.request.mockResolvedValue(list([{ ...exportRow, status }]));
      exportsPage();
      await screen.findByText(en.statuses[status as "READY"]);
      vi.useFakeTimers();
      await act(async () => vi.advanceTimersByTimeAsync(15000));
      expect(mocks.request).toHaveBeenCalledTimes(1);
    },
  );
  test("active exports poll at five seconds, pause offline, and stop at READY", async () => {
    vi.useFakeTimers();
    let calls = 0;
    mocks.request.mockImplementation(async (r) =>
      r.path.endsWith(`/${id}`)
        ? {
            export: {
              ...exportRow,
              status: calls > 1 ? "READY" : "PROCESSING",
              version: calls,
            },
          }
        : list([
            {
              ...exportRow,
              status: ++calls > 1 ? "READY" : "PENDING",
              version: calls,
            },
          ]),
    );
    exportsPage();
    await act(async () => {});
    expect(screen.getByText(en.statuses.PENDING)).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText(en.statuses.READY)).toBeInTheDocument();
    const count = mocks.request.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(mocks.request).toHaveBeenCalledTimes(count);
  });
  test("read/create/download gates are independent", async () => {
    mocks.request.mockResolvedValue(
      list([
        { ...exportRow, status: "READY", expiresAt: "2099-01-02T00:00:00Z" },
      ]),
    );
    exportsPage({ read: true, create: false, download: false });
    await screen.findByText(en.statuses.READY);
    expect(screen.queryByText(en.create)).toBeNull();
    expect(screen.queryByText(en.download)).toBeNull();
  });
  test("create permission does not authorize inventory reads", async () => {
    exportsPage({ read: false, create: true, download: false });
    expect(screen.getByText(en.create)).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  test("support context never becomes native workspace authority", () => {
    mocks.native = {
      shellContext: { accessContext: "support" },
      workspace: { workspaceId: id },
    };
    mount(<ExportExperience locale="en" />);
    expect(screen.getByText(en.denied)).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  test("malformed refresh hides controls instead of defaulting statuses", async () => {
    mocks.request.mockResolvedValue(
      list([{ ...exportRow, status: "UNKNOWN" }]),
    );
    exportsPage();
    await screen.findByText(en.errors.malformed);
    expect(screen.queryByText(en.detail)).toBeNull();
    expect(screen.queryByText(en.create)).toBeNull();
  });
  test("hidden/offline tabs suppress active polling and visibility return refreshes", async () => {
    vi.useFakeTimers();
    const visibility = vi
        .spyOn(document, "visibilityState", "get")
        .mockReturnValue("hidden"),
      online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.request.mockImplementation(async (r) =>
      r.path.endsWith(`/${id}`) ? { export: exportRow } : list([exportRow]),
    );
    exportsPage();
    await act(async () => {});
    const count = mocks.request.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(mocks.request).toHaveBeenCalledTimes(count);
    visibility.mockReturnValue("visible");
    online.mockReturnValue(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(mocks.request.mock.calls.length).toBeGreaterThan(count);
  });
  test("READY expiry disables download locally and revalidates server status once", async () => {
    vi.useFakeTimers();
    const expiry = new Date(Date.now() + 5000).toISOString();
    let expired = false;
    mocks.request.mockImplementation(async (r) =>
      r.path.endsWith(`/${id}`)
        ? { export: { ...exportRow, status: "EXPIRED", version: 2 } }
        : list([
            {
              ...exportRow,
              status: expired ? "EXPIRED" : "READY",
              version: expired ? 2 : 1,
              ...(expired ? {} : { expiresAt: expiry }),
            },
          ]),
    );
    exportsPage();
    await act(async () => {});
    expect(screen.getByText(en.download)).toBeEnabled();
    expired = true;
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText(en.statuses.EXPIRED)).toBeInTheDocument();
    const count = mocks.request.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(mocks.request).toHaveBeenCalledTimes(count);
  });
  test("same-identity revalidation retains uncertain key and rejects lower versions", async () => {
    const memory = new MemoryIntent<{ key: string; reconciled: boolean }>();
    memory.set({ key: "original-confirmed-key", reconciled: false });
    const rows = new MemoryRows<ReturnType<typeof decodeExport>>();
    rows.merge([decodeExport({ ...exportRow, status: "READY", version: 4 })]);
    mocks.request.mockResolvedValue(
      list([{ ...exportRow, status: "FAILED", version: 2 }]),
    );
    mount(
      <NativeExports
        locale="en"
        labels={en}
        workspaceId={id}
        permissions={{ read: true, create: true, download: false }}
        intentMemory={memory}
        rowMemory={rows}
      />,
    );
    await screen.findByText(en.replay);
    expect(screen.getByText(en.statuses.READY)).toBeInTheDocument();
    expect(screen.getByText(en.create)).toBeDisabled();
    expect(memory.get()?.key).toBe("original-confirmed-key");
  });
  test("native membership loss retires late operational responses", async () => {
    const workspace = { membershipId: id, workspaceId: id, accessVersion: 1 };
    mocks.native = {
      workspace,
      shellContext: {
        accessContext: "user",
        sessionGeneration: 1,
        workspace,
        branch: { branchId: null },
      },
      accessFacts: {
        status: "ready",
        context: "WORKSPACE",
        accessContext: "user",
        sessionGeneration: 1,
        membershipId: id,
        workspaceId: id,
        decisions: [
          {
            permission: "exports.workspace.read",
            allowed: true,
            effect: "ALLOW",
            scope: { type: "WORKSPACE" },
            source: "NONE",
          },
        ],
      },
    };
    let resolve!: (value: unknown) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const mounted = mount(<ExportExperience locale="en" />);
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    mocks.native = {};
    mounted.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ExportExperience locale="en" />
      </QueryClientProvider>,
    );
    await act(async () => resolve(list([exportRow])));
    expect(screen.queryByText(en.statuses.PENDING)).toBeNull();
  });
});
describe("Platform deletion behavior", () => {
  function setupDetail() {
    mocks.request.mockImplementation(async (r) =>
      r.method === "POST"
        ? {
            data: {
              deletion: { ...deletionRow, status: "APPROVED", version: 1 },
            },
          }
        : { deletion: deletionRow },
    );
    return mount(<DeletionDetail locale="en" labels={en} deletionId={id} />);
  }
  test("write grants never imply read", () => {
    mocks.allowed.delete("deletion.read");
    mount(<DeletionExperience locale="en" deletionId={id} />);
    expect(screen.getByText(en.denied)).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  test("queue pagination uses after with truthful limited-history copy", async () => {
    mocks.request
      .mockResolvedValueOnce({ items: [deletionRow], nextCursor: id })
      .mockResolvedValueOnce({ items: [] });
    mount(<DeletionQueue locale="en" labels={en} />);
    await screen.findByText(en.older);
    fireEvent.click(screen.getByText(en.older));
    await waitFor(() =>
      expect(mocks.request.mock.calls[1][0].query.after).toBe(id),
    );
    expect(screen.getByText(en.queueCopy)).toBeInTheDocument();
  });
  test("approval fetches fresh detail, requires exact ID and reason, uses CAS/key", async () => {
    setupDetail();
    await screen.findByText(en.approve);
    fireEvent.click(screen.getByText(en.approve));
    await screen.findByLabelText(en.typeId);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText(en.confirm));
    expect(screen.getByText(en.invalid)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(en.reason), {
      target: { value: "Reviewed eligibility" },
    });
    fireEvent.change(screen.getByLabelText(en.typeId), {
      target: { value: id },
    });
    fireEvent.click(screen.getByText(en.confirm));
    await waitFor(() =>
      expect(mocks.request.mock.calls.some(([r]) => r.method === "POST")).toBe(
        true,
      ),
    );
    const request = mocks.request.mock.calls.find(
      ([r]) => r.method === "POST",
    )![0];
    expect(request.body).toEqual({
      expectedVersion: 0,
      reason: "Reviewed eligibility",
    });
    expect(request.idempotencyKey).toBeTruthy();
    expect(request.path).toContain("/approve");
  });
  test("conflict refreshes without retry and requires reviewing the new state", async () => {
    let version = 0;
    mocks.request.mockImplementation(async (r) => {
      if (r.method === "POST") {
        version++;
        throw new ApiError({
          kind: "backend",
          code: "WORKSPACE_DELETION_VERSION_CONFLICT",
          status: 409,
          message: "private",
        });
      }
      return { deletion: { ...deletionRow, version } };
    });
    mount(<DeletionDetail locale="en" labels={en} deletionId={id} />);
    await screen.findByText(en.cancel);
    fireEvent.click(screen.getByText(en.cancel));
    await screen.findByLabelText(en.reason);
    fireEvent.change(screen.getByLabelText(en.reason), {
      target: { value: "review" },
    });
    fireEvent.click(screen.getByText(en.confirm));
    await screen.findByText(en.errors.conflict);
    expect(
      mocks.request.mock.calls.filter(([r]) => r.method === "POST"),
    ).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  test("uncertain approval reconciles then explicitly replays exact body and key", async () => {
    let posts = 0;
    mocks.request.mockImplementation(async (r) => {
      if (r.method === "POST") {
        posts++;
        if (posts === 1)
          throw new ApiError({ kind: "network", message: "unknown" });
        return {
          data: {
            deletion: { ...deletionRow, status: "APPROVED", version: 1 },
          },
        };
      }
      return { deletion: deletionRow };
    });
    mount(<DeletionDetail locale="en" labels={en} deletionId={id} />);
    await screen.findByText(en.approve);
    fireEvent.click(screen.getByText(en.approve));
    await screen.findByLabelText(en.reason);
    fireEvent.change(screen.getByLabelText(en.reason), {
      target: { value: "review" },
    });
    fireEvent.change(screen.getByLabelText(en.typeId), {
      target: { value: id },
    });
    fireEvent.click(screen.getByText(en.confirm));
    await screen.findByText(en.replay);
    expect(posts).toBe(1);
    fireEvent.click(screen.getByText(en.replay));
    await waitFor(() => expect(posts).toBe(2));
    const requests = mocks.request.mock.calls
      .filter(([r]) => r.method === "POST")
      .map(([r]) => r);
    expect(requests[1].body).toEqual(requests[0].body);
    expect(requests[1].idempotencyKey).toEqual(requests[0].idempotencyKey);
    expect(requests[1].path).toEqual(requests[0].path);
  });
  test.each(["APPROVED", "PROCESSING", "FAILED", "COMPLETED", "CANCELLED"])(
    "terminal %s has no illegal deletion controls",
    async (status) => {
      mocks.request.mockResolvedValue({ deletion: { ...deletionRow, status } });
      mount(<DeletionDetail locale="en" labels={en} deletionId={id} />);
      await screen.findByText(en.statuses[status as "APPROVED"]);
      expect(screen.queryByText(en.approve)).toBeNull();
      expect(screen.queryByText(en.postpone)).toBeNull();
      expect(screen.queryByText(en.cancel)).toBeNull();
      if (status === "COMPLETED")
        expect(screen.getByText(en.completed)).toBeInTheDocument();
    },
  );
  test("independent mutation permissions hide only their own actions", async () => {
    mocks.allowed.delete("deletion.approve");
    mocks.allowed.delete("deletion.cancel");
    setupDetail();
    await screen.findByText(en.postpone);
    expect(screen.queryByText(en.approve)).toBeNull();
    expect(screen.queryByText(en.cancel)).toBeNull();
  });
  test("Arabic page uses RTL and isolated technical IDs", async () => {
    mocks.request.mockResolvedValue({ deletion: deletionRow });
    const ar = getDataManagementLabels("ar");
    const { container } = mount(
      <DeletionDetail locale="ar" labels={ar} deletionId={id} />,
    );
    await screen.findByText(ar.statuses.PENDING_APPROVAL);
    expect(container.querySelector("section")).toHaveAttribute("dir", "rtl");
    expect(container.querySelector('bdi[dir="ltr"]')).toBeInTheDocument();
  });
  test("dialog labels, focus trap and restoration support keyboard confirmation", async () => {
    setupDetail();
    const action = await screen.findByText(en.approve);
    action.focus();
    fireEvent.click(action);
    await screen.findByLabelText(en.typeId);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(en.approve);
    const confirm = screen.getByText(en.confirm);
    confirm.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText(en.reason));
    fireEvent.click(screen.getByText(en.close));
    expect(document.activeElement).toBe(action);
  });
  test("accessVersion change retires late detail response", async () => {
    let resolve!: (v: unknown) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const mounted = mount(<DeletionExperience locale="en" deletionId={id} />);
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    const old = resolve;
    mocks.accessVersion++;
    mounted.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DeletionExperience locale="en" deletionId={id} />
      </QueryClientProvider>,
    );
    await act(async () => old({ deletion: deletionRow }));
    expect(screen.queryByText(en.approve)).toBeNull();
  });
  test.each(["postpone", "cancel"] as const)(
    "uncertain %s reconciles without automatic retry or idempotency key",
    async (action) => {
      let version = 0;
      mocks.request.mockImplementation(async (r) => {
        if (r.method === "POST") {
          version++;
          throw new ApiError({ kind: "network", message: "unknown" });
        }
        return { deletion: { ...deletionRow, version } };
      });
      mount(<DeletionDetail locale="en" labels={en} deletionId={id} />);
      await screen.findByText(en[action]);
      fireEvent.click(screen.getByText(en[action]));
      await screen.findByLabelText(en.reason);
      fireEvent.change(screen.getByLabelText(en.reason), {
        target: { value: "Reviewed request" },
      });
      if (action === "postpone")
        fireEvent.change(screen.getByLabelText(en.reviewAfter), {
          target: { value: "2099-01-01T12:00" },
        });
      fireEvent.click(screen.getByText(en.confirm));
      await screen.findByText(en.uncertain);
      const posts = mocks.request.mock.calls.filter(
        ([r]) => r.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(posts[0][0].idempotencyKey).toBeUndefined();
      expect(posts[0][0].body.expectedVersion).toBe(0);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
  test("a changed version invalidates an open confirmation before submission", async () => {
    let version = 0;
    mocks.request.mockImplementation(async () => ({
      deletion: { ...deletionRow, version },
    }));
    mount(<DeletionDetail locale="en" labels={en} deletionId={id} />);
    await screen.findByText(en.approve);
    fireEvent.click(screen.getByText(en.approve));
    await screen.findByRole("dialog");
    version = 2;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.request.mock.calls.some(([r]) => r.method === "POST")).toBe(
      false,
    );
  });
  test("detail v8 survives a controlled late v7 refresh", async () => {
    let reads = 0,
      resolve!: (value: unknown) => void;
    mocks.request.mockImplementation(async () => {
      reads++;
      if (reads === 2)
        return new Promise((done) => {
          resolve = done;
        });
      return { deletion: { ...deletionRow, version: reads === 1 ? 7 : 8 } };
    });
    mount(<DeletionDetail locale="en" labels={en} deletionId={id} />);
    await screen.findByText("7");
    fireEvent.click(screen.getByText(en.refresh));
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.getByText("8")).toBeInTheDocument();
    await act(async () =>
      resolve({ deletion: { ...deletionRow, version: 7 } }),
    );
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.queryByText("7")).toBeNull();
  });
});
