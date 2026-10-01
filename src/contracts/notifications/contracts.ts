import type { NotificationId } from "@/contracts/common/ids";
import type { CursorListQuery } from "@/contracts/common/pagination";

export const notificationChannels = ["email", "push", "inApp"] as const;
export const pushDevicePlatforms = ["IOS", "ANDROID", "WEB"] as const;

export type NotificationChannel = (typeof notificationChannels)[number];
export type PushDevicePlatform = (typeof pushDevicePlatforms)[number];

export interface NotificationDto {
  id: NotificationId;
  workspaceId?: string;
  eventType: string;
  notificationType: string;
  category: string;
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
