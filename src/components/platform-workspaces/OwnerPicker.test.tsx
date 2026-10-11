/** @vitest-environment jsdom */
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
import { OwnerPicker } from "./OwnerPicker";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
  expired: vi.fn(),
  principalId: "user-a",
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
    validUntil: "2030-01-01T00:00:00.000Z",
    membershipId: "membership-a",
    principalId: mocks.principalId,
    sessionGeneration: 4,
    allows: () => true,
    refresh: mocks.refresh,
  }),
}));
const labels = getMessages("en").platformWorkspaceManagement.ownerPicker;

describe("Owner picker", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.refresh.mockReset();
    mocks.expired.mockReset();
    mocks.principalId = "user-a";
  });

  test("loads initial candidates, exact email search, clear, and opaque continuation", async () => {
    mocks.request
      .mockResolvedValueOnce(page("Owner A", "opaque:+/=", true))
      .mockResolvedValueOnce(page("Owner B", null, false))
      .mockResolvedValueOnce(page("Exact", null, false))
      .mockResolvedValueOnce(page("Owner A", null, false));
    renderPicker();
    expect(await screen.findByText(/Owner A/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText(/Owner B/)).toBeInTheDocument();
    expect(mocks.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ query: { cursor: "opaque:+/=", limit: 50 } }),
    );
    fireEvent.change(screen.getByLabelText("Search owner by email"), {
      target: { value: "Exact@Example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/Exact/)).toBeInTheDocument();
    expect(mocks.request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ query: { limit: 50, q: "Exact@Example.com" } }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(4));
  });

  test("selects accessibly and renders only minimized identity", async () => {
    mocks.request.mockResolvedValue(page("Owner A", null, false));
    const onSelect = vi.fn();
    renderPicker(onSelect);
    const button = await screen.findByRole("button", {
      name: /Owner A.*Select/,
    });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Owner A",
        email: "owner@example.com",
      }),
    );
    expect(document.body.textContent).not.toContain("membership");
  });

  test("403 retires picker data and refreshes authority without logout", async () => {
    mocks.request.mockRejectedValue(
      new ApiError({
        kind: "backend",
        status: 403,
        code: "FORBIDDEN",
        message: "denied",
      }),
    );
    const onForbidden = vi.fn();
    renderPicker(vi.fn(), onForbidden);
    expect(await screen.findByText(labels.forbidden)).toBeInTheDocument();
    expect(onForbidden).toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.expired).not.toHaveBeenCalled();
  });

  test("suppresses a late candidate response after authority identity changes", async () => {
    const stale = deferred<unknown>();
    mocks.request
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(page("Current", null, false));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(tree(client));
    mocks.principalId = "user-b";
    view.rerender(tree(client));
    expect(await screen.findByText(/Current/)).toBeInTheDocument();
    await act(async () => {
      stale.resolve(page("Stale", null, false));
      await Promise.resolve();
    });
    expect(screen.queryByText(/Stale/)).not.toBeInTheDocument();
  });

  test("shows an empty initial candidate list", async () => {
    mocks.request.mockResolvedValue(emptyPage());
    renderPicker();
    expect(await screen.findByText(labels.empty)).toBeInTheDocument();
  });

  test("shows an empty exact-email search result", async () => {
    mocks.request
      .mockResolvedValueOnce(page("Owner A", null, false))
      .mockResolvedValueOnce(emptyPage());
    renderPicker();
    await screen.findByText(/Owner A/);
    fireEvent.change(screen.getByLabelText(labels.search), {
      target: { value: "missing@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: labels.apply }));
    expect(await screen.findByText(labels.empty)).toBeInTheDocument();
  });

  test("shows and retries an initial request error", async () => {
    mocks.request
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(page("Recovered", null, false));
    renderPicker();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      labels.unavailable,
    );
    fireEvent.click(screen.getByRole("button", { name: labels.retry }));
    expect(await screen.findByText(/Recovered/)).toBeInTheDocument();
  });

  test("keeps loaded owners visible and retries a continuation error", async () => {
    mocks.request
      .mockResolvedValueOnce(page("Owner A", "continuation-token", true))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(page("Owner B", null, false));
    renderPicker();
    await screen.findByText(/Owner A/);
    fireEvent.click(screen.getByRole("button", { name: labels.loadMore }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      labels.unavailable,
    );
    expect(screen.getByText(/Owner A/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: labels.retry }));
    expect(await screen.findByText(/Owner B/)).toBeInTheDocument();
    expect(mocks.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: { cursor: "continuation-token", limit: 50 },
      }),
    );
  });
});

function renderPicker(onSelect = vi.fn(), onForbidden = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OwnerPicker
        labels={labels}
        onForbidden={onForbidden}
        onSelect={onSelect}
      />
    </QueryClientProvider>,
  );
}
function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <OwnerPicker labels={labels} onForbidden={vi.fn()} onSelect={vi.fn()} />
    </QueryClientProvider>
  );
}
function page(name: string, nextCursor: string | null, hasMore: boolean) {
  return {
    data: [
      {
        id:
          name === "Owner B"
            ? "68e7a9d10d56fd2b98d4a198"
            : "68e7a9d10d56fd2b98d4a199",
        displayName: name,
        email: "owner@example.com",
      },
    ],
    meta: { nextCursor, hasMore },
  };
}
function emptyPage() {
  return { data: [], meta: { nextCursor: null, hasMore: false } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
