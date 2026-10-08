import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthState } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import { notificationCommandRegistry } from "@/lib/notifications";
import { NotificationsExperience } from "./NotificationsExperience";

const mocks = vi.hoisted(() => ({
  auth: {
    apiClient: { request: vi.fn() },
    generation: 1,
    state: {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        emailVerified: true,
        firstName: "A",
        id: "user_a",
        lastName: "User",
        phoneVerified: false,
      },
    } as AuthState,
  },
  staff: null as StaffWorkspaceContextValue | null,
}));

vi.mock("@/lib/auth", () => ({ useAuthSession: () => mocks.auth }));
vi.mock("@/lib/staff-shell", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/staff-shell")>(
      "@/lib/staff-shell",
    );
  return { ...actual, useStaffWorkspaceContext: () => mocks.staff };
});

const firstPage = {
  data: [
    notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
    notification("older", "2026-01-02T00:00:00Z", null, "DOCUMENT_UPLOADED"),
  ],
  page: { nextCursor: "next" },
};

describe("notification center", () => {
  beforeEach(() => {
    notificationCommandRegistry.resetForTests();
    mocks.auth.generation = 1;
    mocks.auth.apiClient.request.mockReset();
    mocks.staff = staffContext("user", "ready");
  });

  test("does not fetch unresolved or support identities, but fetches when every base decision is denied and current", async () => {
    mocks.staff = staffContext("support", "ready");
    const support = renderExperience();
    expect(
      screen.getByText(messages.en.notifications.errors.support),
    ).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).not.toHaveBeenCalled();
    support.unmount();

    mocks.staff = staffContext("user", "unresolved");
    const unresolved = renderExperience();
    expect(mocks.auth.apiClient.request).not.toHaveBeenCalled();
    unresolved.unmount();

    mocks.staff = staffContext("user", "ready");
    mocks.auth.apiClient.request.mockResolvedValueOnce({
      data: [],
      page: { nextCursor: null },
    });
    renderExperience();
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1),
    );
  });

  test("retains a loaded page-one record displaced by a new arrival", async () => {
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("a", "2026-01-06T00:00:00Z", null, "CHECK_IN_DUE"),
          notification("b", "2026-01-05T00:00:00Z", null, "CHECK_IN_DUE"),
          notification("c", "2026-01-04T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: "next" },
      })
      .mockResolvedValueOnce({
        data: [
          notification("d", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
          notification("e", "2026-01-02T00:00:00Z", null, "CHECK_IN_DUE"),
          notification("f", "2026-01-01T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({
        data: [
          notification("x", "2026-01-07T00:00:00Z", null, "CHECK_IN_DUE"),
          notification("a", "2026-01-06T00:00:00Z", null, "CHECK_IN_DUE"),
          notification("b", "2026-01-05T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: "next" },
      });
    renderExperience();
    await screen.findByText("a title");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("f title");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("x title");
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      expect(screen.getAllByText(`${id} title`)).toHaveLength(1);
    }
    expect(
      screen
        .getAllByRole("listitem")
        .map((item) => item.querySelector("strong")?.textContent),
    ).toEqual([
      "x title",
      "a title",
      "b title",
      "c title",
      "d title",
      "e title",
      "f title",
    ]);
  });

  test("preserves Backend instant ordering when timestamps use different offsets", async () => {
    mocks.auth.apiClient.request.mockResolvedValueOnce({
      data: [
        notification("later", "2026-01-01T01:00:00Z", null, "CHECK_IN_DUE"),
        notification(
          "earlier",
          "2026-01-01T03:00:00+03:00",
          null,
          "CHECK_IN_DUE",
        ),
      ],
      page: { nextCursor: null },
    });
    renderExperience();
    await screen.findByText("later title");
    expect(
      screen
        .getAllByRole("listitem")
        .map((item) => item.querySelector("strong")?.textContent),
    ).toEqual(["later title", "earlier title"]);
  });

  test("reconciles a successful mark-one for a notification from an older page", async () => {
    const unreadOlder = notification(
      "older-page",
      "2026-01-01T00:00:00Z",
      null,
      "CHECK_IN_DUE",
    );
    mocks.auth.apiClient.request
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({
        data: [unreadOlder],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({
        data: { ...unreadOlder, readAt: "2026-01-04T00:00:00Z" },
      })
      .mockResolvedValueOnce(firstPage);
    renderExperience();
    await screen.findByText("new title");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    const row = (await screen.findByText("older-page title")).closest("li");
    fireEvent.click(row!.querySelector("button")!);
    await waitFor(() => expect(row).toHaveTextContent("Check-in · Read"));
    expect(row!.querySelector("button")).toBeNull();
  });

  test("removes an older notification from the unread chain after mark-one", async () => {
    const unreadOlder = notification(
      "older-unread",
      "2026-01-01T00:00:00Z",
      null,
      "CHECK_IN_DUE",
    );
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({ data: [], page: { nextCursor: null } })
      .mockResolvedValueOnce({
        data: [
          notification("current", "2026-01-02T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: "older" },
      })
      .mockResolvedValueOnce({
        data: [unreadOlder],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({
        data: { ...unreadOlder, readAt: "2026-01-03T00:00:00Z" },
      })
      .mockResolvedValueOnce({
        data: [
          notification("current", "2026-01-02T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      });
    renderExperience();
    await screen.findByText(messages.en.notifications.empty.all);
    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    await screen.findByText("current title");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    const row = (await screen.findByText("older-unread title")).closest("li");
    fireEvent.click(row!.querySelector("button")!);
    await waitFor(() =>
      expect(screen.queryByText("older-unread title")).not.toBeInTheDocument(),
    );
  });

  test("removes a not-found notification from the entire loaded chain", async () => {
    const stale = notification(
      "stale-older",
      "2026-01-01T00:00:00Z",
      null,
      "CHECK_IN_DUE",
    );
    mocks.auth.apiClient.request
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({ data: [stale], page: { nextCursor: null } })
      .mockRejectedValueOnce(
        new ApiError({
          category: "not-found",
          code: "NOTIFICATION_NOT_FOUND",
          kind: "backend",
          message: "gone",
          status: 404,
        }),
      )
      .mockResolvedValueOnce(firstPage);
    renderExperience();
    await screen.findByText("new title");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    const row = (await screen.findByText("stale-older title")).closest("li");
    fireEvent.click(row!.querySelector("button")!);
    await waitFor(() =>
      expect(screen.queryByText("stale-older title")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(messages.en.notifications.errors.notFound),
    ).toBeInTheDocument();
  });

  test("shows only safe existing top-level links for allowed matching-workspace notifications", async () => {
    mocks.staff = staffContext("user", "ready", true);
    mocks.auth.apiClient.request.mockResolvedValueOnce({
      data: [
        notification(
          "training",
          "2026-01-03T00:00:00Z",
          null,
          "PROGRAM_ACTIVATED",
        ),
        {
          ...notification(
            "cross",
            "2026-01-02T00:00:00Z",
            null,
            "DOCUMENT_UPLOADED",
          ),
          workspaceId: "workspace_b",
        },
        notification("unknown", "2026-01-01T00:00:00Z", null, "UNKNOWN"),
      ],
      page: { nextCursor: null },
    });
    renderExperience();
    expect(
      await screen.findByRole("link", { name: "Open destination" }),
    ).toHaveAttribute("href", "/app/training");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(document.body.innerHTML).not.toContain("relationshipId=");
  });

  test("mark-one has no fake success or automatic replay after ambiguity", async () => {
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      })
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      });
    renderExperience();
    fireEvent.click(await screen.findByRole("button", { name: "Mark read" }));
    expect(
      await screen.findByText(
        messages.en.notifications.errors.markOneAmbiguous,
      ),
    ).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Check-in · Unread/)).toBeInTheDocument();
  });

  test("mark-all requires confirmation and ambiguity never automatically establishes a second cutoff", async () => {
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      })
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      });
    renderExperience();
    await screen.findByText("new title");
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm mark all" }));
    expect(
      await screen.findByText(
        messages.en.notifications.errors.markAllAmbiguous,
      ),
    ).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(3);
  });

  test("QA-023 keeps read state independent from failed-retryable and cancelled delivery fixtures", async () => {
    const failedRetryable = {
      ...notification(
        "failed_retryable",
        "2026-01-03T00:00:00Z",
        null,
        "CHECK_IN_DUE",
      ),
      body: "A check-in needs attention.",
      title: "First fixture notification",
    };
    const cancelled = {
      ...notification(
        "cancelled",
        "2026-01-02T00:00:00Z",
        null,
        "CHECK_IN_DUE",
      ),
      body: "Another check-in needs attention.",
      title: "Second fixture notification",
    };
    const failedRead = {
      ...failedRetryable,
      readAt: "2026-01-04T00:00:00Z",
    };
    const cancelledRead = {
      ...cancelled,
      readAt: "2026-01-05T00:00:00Z",
    };
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [failedRetryable, cancelled],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({ data: failedRead })
      .mockResolvedValueOnce({
        data: [failedRead, cancelled],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({ data: cancelledRead })
      .mockResolvedValueOnce({
        data: [failedRead, cancelledRead],
        page: { nextCursor: null },
      });
    renderExperience();
    const failedRow = (
      await screen.findByText("First fixture notification")
    ).closest("li");
    const cancelledRow = screen
      .getByText("Second fixture notification")
      .closest("li");
    fireEvent.click(failedRow!.querySelector("button")!);
    await waitFor(() => expect(failedRow).toHaveTextContent("Check-in · Read"));
    fireEvent.click(cancelledRow!.querySelector("button")!);
    await waitFor(() =>
      expect(cancelledRow).toHaveTextContent("Check-in · Read"),
    );
    expect(
      screen.getByText(messages.en.notifications.deliveryExplanation),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /SENT|FAILED|CANCELLED|RETRYING|retry status|provider error|attempt count|cancellation reason/i,
    );
  });

  test("refreshes page one on visible resume but pauses while hidden", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility,
    );
    mocks.auth.apiClient.request.mockResolvedValue({
      data: [],
      page: { nextCursor: null },
    });
    renderExperience();
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1),
    );

    now.mockReturnValue(61_000);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1);

    visibility = "visible";
    window.dispatchEvent(new Event("focus"));
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(2),
    );
    expect(mocks.auth.apiClient.request.mock.calls[1][0].path).toBe(
      "/me/notifications?limit=50",
    );
  });

  test("uses authoritative post-cutoff data after confirmed mark-all and guards double submit", async () => {
    let resolveMarkAll!: (value: unknown) => void;
    const pendingMarkAll = new Promise((resolve) => {
      resolveMarkAll = resolve;
    });
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("old", "2026-01-01T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      })
      .mockReturnValueOnce(pendingMarkAll)
      .mockResolvedValueOnce({
        data: [
          notification(
            "old",
            "2026-01-01T00:00:00Z",
            "2026-01-02T00:00:00Z",
            "CHECK_IN_DUE",
          ),
          notification("newer", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      });
    renderExperience();
    await screen.findByText("old title");
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    const confirm = screen.getByRole("button", { name: "Confirm mark all" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(2);
    resolveMarkAll({
      data: { affectedCount: 1, cutoffAt: "2026-01-02T00:00:00Z" },
    });
    expect(await screen.findByText("newer title")).toBeInTheDocument();
    expect(
      screen.getByText("Unread among loaded notifications: 1"),
    ).toBeInTheDocument();
  });

  test("reconciles mark-all cutoff across older loaded rows without marking newer notifications", async () => {
    let resolveRefetch!: (value: unknown) => void;
    const pendingRefetch = new Promise((resolve) => {
      resolveRefetch = resolve;
    });
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("newer", "2026-01-05T00:00:00Z", null, "CHECK_IN_DUE"),
          notification("covered", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: "older" },
      })
      .mockResolvedValueOnce({
        data: [
          notification(
            "covered-older",
            "2026-01-01T00:00:00Z",
            null,
            "CHECK_IN_DUE",
          ),
        ],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({
        data: { affectedCount: 2, cutoffAt: "2026-01-04T00:00:00Z" },
      })
      .mockReturnValueOnce(pendingRefetch);
    renderExperience();
    await screen.findByText("newer title");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("covered-older title");
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm mark all" }));
    await screen.findByText(/Notifications updated by the server: 2/);
    expect(screen.getByText("newer title").closest("li")).toHaveTextContent(
      "Check-in · Unread",
    );
    for (const id of ["covered", "covered-older"]) {
      expect(screen.getByText(`${id} title`).closest("li")).toHaveTextContent(
        "Check-in · Read",
      );
    }
    resolveRefetch({
      data: [
        notification("newer", "2026-01-05T00:00:00Z", null, "CHECK_IN_DUE"),
      ],
      page: { nextCursor: null },
    });
  });

  test("removes only cutoff-covered rows from the loaded unread chain", async () => {
    let resolveRefetch!: (value: unknown) => void;
    const pendingRefetch = new Promise((resolve) => {
      resolveRefetch = resolve;
    });
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({ data: [], page: { nextCursor: null } })
      .mockResolvedValueOnce({
        data: [
          notification(
            "post-cutoff",
            "2026-01-05T00:00:00Z",
            null,
            "CHECK_IN_DUE",
          ),
        ],
        page: { nextCursor: "older" },
      })
      .mockResolvedValueOnce({
        data: [
          notification(
            "cutoff-covered",
            "2026-01-01T00:00:00Z",
            null,
            "CHECK_IN_DUE",
          ),
        ],
        page: { nextCursor: null },
      })
      .mockResolvedValueOnce({
        data: { affectedCount: 1, cutoffAt: "2026-01-04T00:00:00Z" },
      })
      .mockReturnValueOnce(pendingRefetch);
    renderExperience();
    await screen.findByText(messages.en.notifications.empty.all);
    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    await screen.findByText("post-cutoff title");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("cutoff-covered title");
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm mark all" }));
    await waitFor(() =>
      expect(
        screen.queryByText("cutoff-covered title"),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("post-cutoff title").closest("li"),
    ).toHaveTextContent("Check-in · Unread");
    resolveRefetch({
      data: [
        notification(
          "post-cutoff",
          "2026-01-05T00:00:00Z",
          null,
          "CHECK_IN_DUE",
        ),
      ],
      page: { nextCursor: null },
    });
  });

  test("does not let a late pre-mutation page-one refresh revert mark-one", async () => {
    let resolveOldPoll!: (value: unknown) => void;
    const oldPoll = new Promise((resolve) => {
      resolveOldPoll = resolve;
    });
    const unreadItem = notification(
      "race",
      "2026-01-03T00:00:00Z",
      null,
      "CHECK_IN_DUE",
    );
    const readItem = {
      ...unreadItem,
      readAt: "2026-01-04T00:00:00Z",
    };
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({ data: [unreadItem], page: { nextCursor: null } })
      .mockReturnValueOnce(oldPoll)
      .mockResolvedValueOnce({ data: readItem })
      .mockResolvedValueOnce({ data: [readItem], page: { nextCursor: null } });
    renderExperience();
    const row = (await screen.findByText("race title")).closest("li");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(row!.querySelector("button")!);
    await waitFor(() => expect(row).toHaveTextContent("Check-in · Read"));
    await act(async () => {
      resolveOldPoll({ data: [unreadItem], page: { nextCursor: null } });
      await oldPoll;
    });
    expect(screen.getByText("race title").closest("li")).toHaveTextContent(
      "Check-in · Read",
    );
  });

  test("does not let a late pre-mutation page-one refresh revert mark-all", async () => {
    let resolveOldPoll!: (value: unknown) => void;
    const oldPoll = new Promise((resolve) => {
      resolveOldPoll = resolve;
    });
    const unreadItem = notification(
      "mark-all-race",
      "2026-01-03T00:00:00Z",
      null,
      "CHECK_IN_DUE",
    );
    const readItem = {
      ...unreadItem,
      readAt: "2026-01-04T00:00:00Z",
    };
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({ data: [unreadItem], page: { nextCursor: null } })
      .mockReturnValueOnce(oldPoll)
      .mockResolvedValueOnce({
        data: { affectedCount: 1, cutoffAt: "2026-01-04T00:00:00Z" },
      })
      .mockResolvedValueOnce({ data: [readItem], page: { nextCursor: null } });
    renderExperience();
    const row = (await screen.findByText("mark-all-race title")).closest("li");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm mark all" }));
    await waitFor(() => expect(row).toHaveTextContent("Check-in · Read"));
    await act(async () => {
      resolveOldPoll({ data: [unreadItem], page: { nextCursor: null } });
      await oldPoll;
    });
    expect(
      screen.getByText("mark-all-race title").closest("li"),
    ).toHaveTextContent("Check-in · Read");
  });

  test("does not let a late All response replace the Unread filter", async () => {
    let resolveAll!: (value: unknown) => void;
    const allRequest = new Promise((resolve) => {
      resolveAll = resolve;
    });
    mocks.auth.apiClient.request.mockImplementation(
      (request: { path: string }) =>
        request.path.includes("unread=true")
          ? Promise.resolve({
              data: [
                notification(
                  "unread-filter",
                  "2026-01-02T00:00:00Z",
                  null,
                  "CHECK_IN_DUE",
                ),
              ],
              page: { nextCursor: null },
            })
          : allRequest,
    );
    renderExperience();
    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    await screen.findByText("unread-filter title");
    await act(async () => {
      resolveAll({
        data: [
          notification(
            "all-filter",
            "2026-01-03T00:00:00Z",
            null,
            "CHECK_IN_DUE",
          ),
        ],
        page: { nextCursor: null },
      });
      await allRequest;
    });
    expect(screen.queryByText("all-filter title")).not.toBeInTheDocument();
    expect(screen.getByText("unread-filter title")).toBeInTheDocument();
  });

  test("does not render a late USER response after switching to SUPPORT", async () => {
    let resolveUser!: (value: unknown) => void;
    const userRequest = new Promise((resolve) => {
      resolveUser = resolve;
    });
    mocks.auth.apiClient.request.mockReturnValueOnce(userRequest);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = renderExperience(queryClient);
    mocks.staff = staffContext("support", "ready");
    view.rerender(experienceTree(queryClient));
    expect(
      screen.getByText(messages.en.notifications.errors.support),
    ).toBeInTheDocument();
    await act(async () => {
      resolveUser({
        data: [
          notification(
            "late-user",
            "2026-01-03T00:00:00Z",
            null,
            "CHECK_IN_DUE",
          ),
        ],
        page: { nextCursor: null },
      });
      await userRequest;
    });
    expect(screen.queryByText("late-user title")).not.toBeInTheDocument();
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1);
  });

  test("restores an ambiguity warning after the notification experience remounts", async () => {
    const page = {
      data: [
        notification("ambiguous", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
      ],
      page: { nextCursor: null },
    };
    mocks.auth.apiClient.request
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(page);
    const first = renderExperience();
    fireEvent.click(await screen.findByRole("button", { name: "Mark read" }));
    await screen.findByText(messages.en.notifications.errors.markOneAmbiguous);
    first.unmount();
    renderExperience();
    expect(
      await screen.findByText(
        messages.en.notifications.errors.markOneAmbiguous,
      ),
    ).toBeInTheDocument();
  });

  test("fails closed when ambiguity-critical command capacity is exhausted", async () => {
    mocks.auth.apiClient.request.mockResolvedValueOnce({
      data: [
        notification("capacity", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
      ],
      page: { nextCursor: null },
    });
    for (
      let index = 0;
      index < notificationCommandRegistry.capacity;
      index += 1
    ) {
      const id = `ambiguous-capacity-${index}`;
      expect(notificationCommandRegistry.begin(id)).toBe("started");
      notificationCommandRegistry.ambiguous(id);
    }
    renderExperience();
    fireEvent.click(await screen.findByRole("button", { name: "Mark read" }));
    expect(
      await screen.findByText(messages.en.notifications.errors.capacity),
    ).toBeInTheDocument();
    expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(1);
  });

  test("discards a late mark-one callback after auth identity changes", async () => {
    let resolveMarkOne!: (value: unknown) => void;
    const pendingMarkOne = new Promise((resolve) => {
      resolveMarkOne = resolve;
    });
    mocks.auth.apiClient.request
      .mockResolvedValueOnce({
        data: [
          notification("new", "2026-01-03T00:00:00Z", null, "CHECK_IN_DUE"),
        ],
        page: { nextCursor: null },
      })
      .mockReturnValueOnce(pendingMarkOne)
      .mockResolvedValueOnce({ data: [], page: { nextCursor: null } });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = renderExperience(queryClient);
    fireEvent.click(await screen.findByRole("button", { name: "Mark read" }));

    mocks.auth.generation = 2;
    mocks.staff = staffContext("user", "ready", false, 2);
    view.rerender(experienceTree(queryClient));
    await waitFor(() =>
      expect(mocks.auth.apiClient.request).toHaveBeenCalledTimes(3),
    );
    resolveMarkOne({
      data: notification(
        "new",
        "2026-01-03T00:00:00Z",
        "2026-01-04T00:00:00Z",
        "CHECK_IN_DUE",
      ),
    });
    await Promise.resolve();
    expect(
      screen.queryByText(messages.en.notifications.success.markedOne),
    ).not.toBeInTheDocument();
  });
});

function renderExperience(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  return render(experienceTree(queryClient));
}

function experienceTree(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationsExperience labels={messages.en.notifications} locale="en" />
    </QueryClientProvider>
  );
}

function staffContext(
  accessContext: "support" | "user",
  status: "ready" | "unresolved",
  allowTraining = false,
  generation = 1,
): StaffWorkspaceContextValue {
  const decisions = [
    "billing.subscription.read",
    "adherence.read",
    "analytics.nutrition.read",
    "documents.read",
    "foods.read",
    "nutrition.plans.read",
    "programs.read",
    "staff.read",
    "trainees.read",
    "workspace.read",
  ].map((permission) => ({
    allowed: allowTraining && permission === "programs.read",
    effect:
      allowTraining && permission === "programs.read"
        ? ("ALLOW" as const)
        : ("DENY" as const),
    permission: permission as never,
    scope: { type: "WORKSPACE" as const },
    source: "NONE" as const,
  }));
  return {
    accessFacts: {
      accessContext,
      context: "WORKSPACE",
      decisions,
      membershipId: "membership_a" as never,
      sessionGeneration: generation,
      status,
      workspaceId: "workspace_a" as never,
    },
    shellContext: {
      accessContext,
      branch: { branchId: null, label: "All" },
      portal: "gym-staff",
      sessionGeneration: generation,
      workspace: {
        accessVersion: 7,
        membershipId: "membership_a" as never,
        roles: ["TRAINER"],
        workspaceId: "workspace_a" as never,
        workspaceName: "Gym",
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      accessVersion: 7,
      membershipId: "membership_a" as never,
      roles: ["TRAINER"],
      workspaceId: "workspace_a" as never,
      workspaceName: "Gym",
      workspaceTimezone: "Africa/Cairo",
    },
  };
}

function notification(
  id: string,
  createdAt: string,
  readAt: string | null,
  notificationType: string,
) {
  return {
    id,
    workspaceId: "workspace_a",
    eventType: notificationType,
    notificationType,
    category: notificationType.includes("DOCUMENT") ? "DOCUMENT" : "CHECK_IN",
    title: `${id} title`,
    body: `${id} body`,
    payload: {},
    readAt,
    createdAt,
  };
}
