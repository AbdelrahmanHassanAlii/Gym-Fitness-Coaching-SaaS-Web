import { describe, expect, test, vi } from "vitest";
import type { ApiClient } from "@/lib/api";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
} from "./api";

const notification = {
  id: "notification_a",
  eventType: "CheckInDue",
  notificationType: "CHECK_IN_DUE",
  category: "CHECK_IN" as const,
  title: "Check-in due",
  body: "Your check-in is due.",
  payload: { checkinId: "checkin_a" },
  readAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("notification API", () => {
  test("lists the global current-user inbox with the exact cursor query", async () => {
    const request = vi.fn().mockResolvedValue({
      data: [notification],
      page: { nextCursor: "opaque-next" },
    });
    const result = await listNotifications(
      { request } as unknown as ApiClient,
      { cursor: "opaque-current", limit: 50, unread: true },
    );

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/me/notifications?cursor=opaque-current&limit=50&unread=true",
      signal: undefined,
    });
    expect(result.page.nextCursor).toBe("opaque-next");
  });

  test("mark-one and mark-all send no body or idempotency key", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ...notification, readAt: "2026-01-02T00:00:00Z" },
      })
      .mockResolvedValueOnce({
        data: { cutoffAt: "2026-01-02T00:00:00Z", affectedCount: 4 },
      });
    const apiClient = { request } as unknown as ApiClient;

    await markNotificationRead(apiClient, "notification_a");
    await markAllNotificationsRead(apiClient);

    expect(request.mock.calls).toEqual([
      [{ method: "POST", path: "/me/notifications/notification_a/read" }],
      [{ method: "POST", path: "/me/notifications/read-all" }],
    ]);
  });

  test("rejects malformed public responses and isolates every query identity dimension", async () => {
    const apiClient = {
      request: vi.fn().mockResolvedValue({
        data: [{ ...notification, payload: { retryCount: 2 } }],
        page: { nextCursor: null },
      }),
    } as unknown as ApiClient;

    await expect(
      listNotifications(apiClient, { limit: 50 }),
    ).rejects.toMatchObject({
      kind: "malformed-response",
    });

    const key = notificationKeys.list({
      accessContext: "user",
      accessVersion: 7,
      cursor: null,
      limit: 50,
      membershipId: "membership_a",
      principalId: "user_a",
      sessionGeneration: 3,
      unread: false,
      workspaceId: "workspace_a",
    });
    expect(JSON.stringify(key)).toContain("user_a");
    expect(JSON.stringify(key)).toContain("membership_a");
    expect(JSON.stringify(key)).toContain("workspace_a");
    expect(JSON.stringify(key)).toContain('"accessVersion":7');
    expect(JSON.stringify(key)).not.toMatch(/token|cookie|supportSessionId/i);
  });
});
