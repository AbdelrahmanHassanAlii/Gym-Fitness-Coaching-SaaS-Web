import type {
  ApiDataEnvelope,
  ListNotificationsQueryDto,
  MarkAllNotificationsReadDto,
  NotificationDto,
  NotificationPageDto,
} from "@/contracts";
import {
  isMarkAllNotificationsReadDto,
  isNotificationDto,
  isNotificationPageDto,
} from "@/contracts";
import { ApiError, serializeQueryParams, type ApiClient } from "@/lib/api";
import {
  appQueryKeys,
  type AuthorizationCacheContext,
} from "@/lib/server-state";

export const notificationsPageLimit = 50;

export interface NotificationQueryIdentity {
  accessContext: AuthorizationCacheContext;
  accessVersion: number | null;
  cursor: string | null;
  limit: number;
  membershipId: string;
  principalId: string;
  sessionGeneration: number;
  unread: boolean;
  workspaceId: string;
}

export const notificationKeys = {
  list: (identity: NotificationQueryIdentity) =>
    appQueryKeys.workspaceList(
      identity.workspaceId,
      "notifications",
      {
        accessVersion: identity.accessVersion,
        cursor: identity.cursor,
        limit: identity.limit,
        membershipId: identity.membershipId,
        principalId: identity.principalId,
        sessionGeneration: identity.sessionGeneration,
        unread: identity.unread,
      },
      identity.accessContext,
    ),
};

export async function listNotifications(
  apiClient: ApiClient,
  query: ListNotificationsQueryDto,
  signal?: AbortSignal,
): Promise<NotificationPageDto> {
  const queryString = serializeQueryParams({
    cursor: query.cursor,
    limit: query.limit,
    unread: query.unread,
  });
  const page = await apiClient.request<unknown>({
    method: "GET",
    path: `/me/notifications${queryString ? `?${queryString}` : ""}`,
    signal,
  });
  return requireShape(page, isNotificationPageDto, "notification page");
}

export async function markNotificationRead(
  apiClient: ApiClient,
  notificationId: string,
): Promise<NotificationDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "POST",
    path: `/me/notifications/${notificationId}/read`,
  });
  return requireShape(envelope.data, isNotificationDto, "notification");
}

export async function markAllNotificationsRead(
  apiClient: ApiClient,
): Promise<MarkAllNotificationsReadDto> {
  const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
    method: "POST",
    path: "/me/notifications/read-all",
  });
  return requireShape(
    envelope.data,
    isMarkAllNotificationsReadDto,
    "mark-all response",
  );
}

function requireShape<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  label: string,
): T {
  if (!guard(value)) {
    throw new ApiError({
      kind: "malformed-response",
      message: `Malformed ${label} response.`,
    });
  }
  return value;
}
