import type { RelationshipId, WorkspaceId } from "@/contracts/common/ids";

export const analyticsGranularities = ["day", "week"] as const;
export const progressAnalyticsGranularities = [
  "none",
  "day",
  "week",
  "month",
] as const;

export type AnalyticsGranularity = (typeof analyticsGranularities)[number];
export type ProgressAnalyticsGranularity =
  (typeof progressAnalyticsGranularities)[number];

export interface AnalyticsRangeDto {
  from: string;
  to: string;
  timezone: string;
}

export interface RelationshipAnalyticsParamsDto {
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
}

export interface AnalyticsQueryDto {
  from?: string;
  to?: string;
  granularity?: AnalyticsGranularity;
  metricDefinitionId?: string;
}

export interface ProgressAnalyticsQueryDto {
  from?: string;
  to?: string;
  granularity?: ProgressAnalyticsGranularity;
  metricDefinitionId?: string;
  limit?: number;
  cursor?: string;
}
