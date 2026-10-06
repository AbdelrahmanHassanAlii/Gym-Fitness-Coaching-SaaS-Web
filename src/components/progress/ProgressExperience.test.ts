import { describe, expect, test, vi } from "vitest";
import type { ApiClient, ApiRequestOptions } from "@/lib/api";
import { createMeasurement } from "@/lib/progress";
import {
  localDateInWorkspaceTimeZone,
  prepareMeasurementCreateCommand,
  progressCommandRegistryForTests,
  progressDecisionSetsForTests,
} from "./ProgressExperience";

describe("progress experience safety helpers", () => {
  test("freezes WEB-017 decision batch sizes without checkins.submit", () => {
    expect(progressDecisionSetsForTests.progressReadPermissions).toHaveLength(
      9,
    );
    expect(progressDecisionSetsForTests.progressActionPermissions).toHaveLength(
      8,
    );
    expect(progressDecisionSetsForTests.checkInPermissions).toHaveLength(10);
    expect(progressDecisionSetsForTests.checkInPermissions).not.toContain(
      "checkins.submit",
    );
  });

  test("uses workspace timezone for local dates instead of UTC slicing", () => {
    const instant = new Date("2026-01-01T23:30:00.000Z");

    expect(localDateInWorkspaceTimeZone(instant, "Africa/Cairo")).toBe(
      "2026-01-02",
    );
    expect(localDateInWorkspaceTimeZone(instant, "America/New_York")).toBe(
      "2026-01-01",
    );
  });

  test("covers calendar boundaries in the workspace timezone", () => {
    expect(
      localDateInWorkspaceTimeZone(
        new Date("2026-03-29T00:30:00.000Z"),
        "Europe/Berlin",
      ),
    ).toBe("2026-03-29");
    expect(
      localDateInWorkspaceTimeZone(
        new Date("2026-01-31T22:30:00.000Z"),
        "Africa/Cairo",
      ),
    ).toBe("2026-02-01");
    expect(
      localDateInWorkspaceTimeZone(
        new Date("2026-12-31T22:30:00.000Z"),
        "Africa/Cairo",
      ),
    ).toBe("2027-01-01");
  });

  test("keeps retry-critical command keys and fails closed at capacity", () => {
    progressCommandRegistryForTests.reset();
    const logicalId = "measurement-create|workspace|relationship|body";
    const key = progressCommandRegistryForTests.commandKey(logicalId);

    progressCommandRegistryForTests.markCommandAmbiguous(logicalId);
    expect(progressCommandRegistryForTests.commandKey(logicalId)).toBe(key);

    progressCommandRegistryForTests.reset();
  });

  test("freezes measurement create body and outbound idempotency key across remount retry", async () => {
    progressCommandRegistryForTests.reset();
    const first = prepareMeasurementCreateCommand({
      accessContext: "user",
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });
    const key = progressCommandRegistryForTests.commandKey(first.logicalId);
    progressCommandRegistryForTests.markCommandAmbiguous(first.logicalId);
    const retry = prepareMeasurementCreateCommand({
      accessContext: "user",
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });
    const api = fakeApiClient();

    await createMeasurement(
      api,
      retry.params.workspaceId,
      retry.params.relationshipId,
      retry.body,
      progressCommandRegistryForTests.commandKey(retry.logicalId),
    );

    expect(retry.body).toEqual(first.body);
    expect(retry.body.measuredAt).toBe(first.body.measuredAt);
    expect(progressCommandRegistryForTests.commandKey(retry.logicalId)).toBe(
      key,
    );
    expect(api.calls[0]?.body).toEqual(first.body);
    expect(api.calls[0]?.idempotencyKey).toBe(key);
  });

  test("changed measurement create command gets a new key", () => {
    progressCommandRegistryForTests.reset();
    const first = prepareMeasurementCreateCommand({
      accessContext: "user",
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });
    const changed = prepareMeasurementCreateCommand({
      accessContext: "user",
      metricDefinitionId: "metric_weight" as never,
      notes: "changed",
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });

    expect(changed.logicalId).not.toBe(first.logicalId);
    expect(
      progressCommandRegistryForTests.commandKey(changed.logicalId),
    ).not.toBe(progressCommandRegistryForTests.commandKey(first.logicalId));
  });
});

function fakeApiClient(): ApiClient & { calls: ApiRequestOptions[] } {
  const calls: ApiRequestOptions[] = [];
  return {
    request: vi.fn(async (options: ApiRequestOptions) => {
      calls.push(options);
      return {
        data: {
          measurement: {
            id: "measurement_a",
            measuredAt: "2026-05-01T08:00:00.000Z",
            metricDefinitionId: "metric_weight",
            notes: "baseline",
            source: "TRAINER",
            value: 91,
            version: 1,
            workspaceId: "workspace_a",
          },
        },
      };
    }),
    calls,
  } as unknown as ApiClient & { calls: ApiRequestOptions[] };
}
