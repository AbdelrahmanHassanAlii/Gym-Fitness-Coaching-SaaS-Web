import type { NotificationId } from "@/contracts/common/ids";
import type { CursorListQuery } from "@/contracts/common/pagination";
import { isOffsetTimestamp as isStrictOffsetTimestamp } from "@/lib/date-time";

export const notificationChannels = ["email", "push", "inApp"] as const;
export const notificationCategories = [
  "TRAINING",
  "WORKOUT",
  "NUTRITION",
  "CHECK_IN",
  "DOCUMENT",
  "RELATIONSHIP",
  "SECURITY",
  "SUBSCRIPTION",
] as const;
export const pushDevicePlatforms = ["IOS", "ANDROID", "WEB"] as const;

export type NotificationChannel = (typeof notificationChannels)[number];
export type NotificationCategory = (typeof notificationCategories)[number];
export type PushDevicePlatform = (typeof pushDevicePlatforms)[number];

export interface NotificationDto {
  id: NotificationId;
  workspaceId?: string;
  eventType: string;
  notificationType: string;
  category: NotificationCategory;
  title: string;
  body: string;
  payload: Record<string, string>;
  readAt: string | null;
  createdAt: string;
}

export interface ListNotificationsQueryDto extends CursorListQuery {
  unread?: boolean;
}

export interface NotificationPreferenceChannelsDto {
  email?: boolean;
  push?: boolean;
  inApp?: boolean;
}

export interface NotificationPreferencesDto {
  channels: Required<NotificationPreferenceChannelsDto>;
  eventPreferences: Record<string, NotificationPreferenceChannelsDto>;
  version: number;
  updatedAt: string;
}

export interface PutNotificationPreferencesRequestDto {
  expectedVersion: number;
  channels?: NotificationPreferenceChannelsDto;
  eventPreferences?: Record<string, NotificationPreferenceChannelsDto>;
}

export interface NotificationPageDto {
  data: NotificationDto[];
  page: { nextCursor: string | null };
}

export interface MarkAllNotificationsReadDto {
  affectedCount: number;
  cutoffAt: string;
}

export function isNotificationCategory(
  value: unknown,
): value is NotificationCategory {
  return (
    typeof value === "string" &&
    (notificationCategories as readonly string[]).includes(value)
  );
}

export function isNotificationDto(value: unknown): value is NotificationDto {
  if (!isRecord(value)) return false;
  const allowedFields = new Set([
    "id",
    "workspaceId",
    "eventType",
    "notificationType",
    "category",
    "title",
    "body",
    "payload",
    "readAt",
    "createdAt",
  ]);
  return (
    Object.keys(value).every((key) => allowedFields.has(key)) &&
    typeof value.id === "string" &&
    (value.workspaceId === undefined ||
      typeof value.workspaceId === "string") &&
    typeof value.eventType === "string" &&
    typeof value.notificationType === "string" &&
    isNotificationCategory(value.category) &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    isSafePayload(value.payload) &&
    (value.readAt === null || isOffsetTimestamp(value.readAt)) &&
    isOffsetTimestamp(value.createdAt)
  );
}

export function isNotificationPageDto(
  value: unknown,
): value is NotificationPageDto {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isNotificationDto) &&
    isRecord(value.page) &&
    (value.page.nextCursor === null ||
      typeof value.page.nextCursor === "string")
  );
}

export function isMarkAllNotificationsReadDto(
  value: unknown,
): value is MarkAllNotificationsReadDto {
  return (
    isRecord(value) &&
    Number.isInteger(value.affectedCount) &&
    (value.affectedCount as number) >= 0 &&
    isOffsetTimestamp(value.cutoffAt)
  );
}

function isOffsetTimestamp(value: unknown): value is string {
  return typeof value === "string" && isStrictOffsetTimestamp(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isSafePayload(value: unknown): value is Record<string, string> {
  const safeKeys = new Set([
    "relationshipId",
    "checkinId",
    "assignmentId",
    "templateId",
    "documentId",
  ]);
  return (
    isStringRecord(value) &&
    Object.keys(value).every((key) => safeKeys.has(key))
  );
}
