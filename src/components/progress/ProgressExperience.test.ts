import { describe, expect, test, vi } from "vitest";
import type { ApiClient, ApiRequestOptions } from "@/lib/api";
import {
  createCheckInTemplate,
  endCheckInAssignment,
  reviewCheckIn,
} from "@/lib/checkins";
import { createMeasurement } from "@/lib/progress";
import { messages } from "@/i18n/messages";
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

  test("classifies daily submit mode with the workspace date, not the browser date", () => {
    expect(
      progressCommandRegistryForTests.isHistoricalAtSubmission(
        "2026-10-05",
        new Date("2026-10-06T22:30:00.000Z"),
        "Africa/Cairo",
      ),
    ).toBe(true);
    expect(
      progressCommandRegistryForTests.isHistoricalAtSubmission(
        "2026-10-05",
        new Date("2026-10-06T22:30:00.000Z"),
        "America/New_York",
      ),
    ).toBe(false);
  });

  test("keeps retry-critical command keys and fails closed at capacity", () => {
    progressCommandRegistryForTests.reset();
    const logicalId = "measurement-create|workspace|relationship|body";
    const key = progressCommandRegistryForTests.commandKey(logicalId);

    progressCommandRegistryForTests.markCommandAmbiguous(logicalId);
    expect(progressCommandRegistryForTests.commandKey(logicalId)).toBe(key);

    progressCommandRegistryForTests.reset();

    for (
      let index = 0;
      index < progressCommandRegistryForTests.maxCommandRecords;
      index += 1
    ) {
      const filledId = `ambiguous-${index}`;
      progressCommandRegistryForTests.commandKey(filledId);
      progressCommandRegistryForTests.markCommandAmbiguous(filledId);
    }

    expect(() =>
      progressCommandRegistryForTests.commandKey("new-command"),
    ).toThrow(/capacity/i);
  });

  test("freezes measurement create body and outbound idempotency key across remount retry", async () => {
    progressCommandRegistryForTests.reset();
    const first = prepareMeasurementCreateCommand({
      accessContext: "user",
      membershipId: "membership_a" as never,
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      principalId: "user_a" as never,
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });
    const key = progressCommandRegistryForTests.commandKey(first.logicalId);
    progressCommandRegistryForTests.markCommandAmbiguous(first.logicalId);
    const retry = prepareMeasurementCreateCommand({
      accessContext: "user",
      membershipId: "membership_a" as never,
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      principalId: "user_a" as never,
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
      membershipId: "membership_a" as never,
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      principalId: "user_a" as never,
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });
    const changed = prepareMeasurementCreateCommand({
      accessContext: "user",
      membershipId: "membership_a" as never,
      metricDefinitionId: "metric_weight" as never,
      notes: "changed",
      principalId: "user_a" as never,
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });

    expect(changed.logicalId).not.toBe(first.logicalId);
    expect(
      progressCommandRegistryForTests.commandKey(changed.logicalId),
    ).not.toBe(progressCommandRegistryForTests.commandKey(first.logicalId));
  });

  test("measurement identity survives auth refresh but isolates membership and support context", () => {
    progressCommandRegistryForTests.reset();
    const first = prepareMeasurementCreateCommand({
      accessContext: "user",
      membershipId: "membership_a" as never,
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      principalId: "user_a" as never,
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });
    const key = progressCommandRegistryForTests.commandKey(first.logicalId);
    progressCommandRegistryForTests.markCommandAmbiguous(first.logicalId);

    const afterAuthRefresh = prepareMeasurementCreateCommand({
      accessContext: "user",
      membershipId: "membership_a" as never,
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      principalId: "user_a" as never,
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });
    const membershipChanged = prepareMeasurementCreateCommand({
      accessContext: "user",
      membershipId: "membership_b" as never,
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      principalId: "user_a" as never,
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });
    const supportContext = prepareMeasurementCreateCommand({
      accessContext: "support",
      membershipId: "membership_a" as never,
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      principalId: "user_a" as never,
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });
    const principalChanged = prepareMeasurementCreateCommand({
      accessContext: "user",
      membershipId: "membership_a" as never,
      metricDefinitionId: "metric_weight" as never,
      notes: "baseline",
      principalId: "user_b" as never,
      relationshipId: "relationship_a" as never,
      value: 91,
      workspaceId: "workspace_a" as never,
    });

    expect(afterAuthRefresh.body).toEqual(first.body);
    expect(
      progressCommandRegistryForTests.commandKey(afterAuthRefresh.logicalId),
    ).toBe(key);
    expect(
      progressCommandRegistryForTests.commandKey(membershipChanged.logicalId),
    ).not.toBe(key);
    expect(
      progressCommandRegistryForTests.commandKey(supportContext.logicalId),
    ).not.toBe(key);
    expect(
      progressCommandRegistryForTests.commandKey(principalChanged.logicalId),
    ).not.toBe(key);
  });

  test("check-in idempotent commands keep outbound keys across auth refresh and remount", async () => {
    progressCommandRegistryForTests.reset();
    const boundary = progressCommandRegistryForTests.stableBoundary({
      accessContext: "user",
      membershipId: "membership_a" as never,
      principalId: "user_a" as never,
      workspaceId: "workspace_a" as never,
    });
    const templateBody = {
      fields: [
        {
          fieldKey: "weekly_notes",
          label: "Notes",
          required: false,
          type: "LONG_TEXT" as const,
        },
      ],
      name: "Weekly",
    };
    const templateLogicalId = progressCommandRegistryForTests.logicalId({
      body: templateBody,
      boundary,
      params: { workspaceId: "workspace_a" },
      route: "POST /checkin-templates",
    });
    const templateKey =
      progressCommandRegistryForTests.commandKey(templateLogicalId);
    progressCommandRegistryForTests.markCommandAmbiguous(templateLogicalId);
    const templateApi = fakeCheckInApiClient();
    await createCheckInTemplate(
      templateApi,
      "workspace_a" as never,
      templateBody,
      progressCommandRegistryForTests.commandKey(templateLogicalId),
    );
    expect(templateApi.calls[0]?.idempotencyKey).toBe(templateKey);
    expect(templateApi.calls[0]?.body).toEqual(templateBody);

    const assignmentBody = { expectedVersion: 2 };
    const assignmentLogicalId = progressCommandRegistryForTests.logicalId({
      body: assignmentBody,
      boundary,
      params: {
        assignmentId: "assignment_a",
        relationshipId: "relationship_a",
        workspaceId: "workspace_a",
      },
      route: "POST /checkin-assignments/:id/end",
    });
    const assignmentKey =
      progressCommandRegistryForTests.commandKey(assignmentLogicalId);
    progressCommandRegistryForTests.markCommandAmbiguous(assignmentLogicalId);
    const assignmentApi = fakeCheckInApiClient();
    await endCheckInAssignment(
      assignmentApi,
      "workspace_a" as never,
      "relationship_a" as never,
      "assignment_a" as never,
      assignmentBody,
      progressCommandRegistryForTests.commandKey(assignmentLogicalId),
    );
    expect(assignmentApi.calls[0]?.idempotencyKey).toBe(assignmentKey);
    expect(assignmentApi.calls[0]?.body).toEqual(assignmentBody);

    const reviewBody = {
      expectedVersion: 3,
      trainerFeedback: { comment: "Good work" },
    };
    const reviewLogicalId = progressCommandRegistryForTests.logicalId({
      body: reviewBody,
      boundary,
      params: {
        checkinId: "checkin_a",
        relationshipId: "relationship_a",
        workspaceId: "workspace_a",
      },
      route: "POST /checkins/:id/review",
    });
    const reviewKey =
      progressCommandRegistryForTests.commandKey(reviewLogicalId);
    progressCommandRegistryForTests.markCommandAmbiguous(reviewLogicalId);
    const reviewApi = fakeCheckInApiClient();
    await reviewCheckIn(
      reviewApi,
      "workspace_a" as never,
      "relationship_a" as never,
      "checkin_a" as never,
      reviewBody,
      progressCommandRegistryForTests.commandKey(reviewLogicalId),
    );
    expect(reviewApi.calls[0]?.idempotencyKey).toBe(reviewKey);
    expect(reviewApi.calls[0]?.body).toEqual(reviewBody);
  });

  test("check-in command identity isolates changed fingerprint membership and support context", () => {
    progressCommandRegistryForTests.reset();
    const boundary = progressCommandRegistryForTests.stableBoundary({
      accessContext: "user",
      membershipId: "membership_a" as never,
      principalId: "user_a" as never,
      workspaceId: "workspace_a" as never,
    });
    const body = { expectedVersion: 3, trainerFeedback: { comment: "Ok" } };
    const first = progressCommandRegistryForTests.logicalId({
      body,
      boundary,
      params: {
        checkinId: "checkin_a",
        relationshipId: "relationship_a",
        workspaceId: "workspace_a",
      },
      route: "POST /checkins/:id/review",
    });
    const key = progressCommandRegistryForTests.commandKey(first);
    const changedBody = progressCommandRegistryForTests.logicalId({
      body: { ...body, trainerFeedback: { comment: "Changed" } },
      boundary,
      params: {
        checkinId: "checkin_a",
        relationshipId: "relationship_a",
        workspaceId: "workspace_a",
      },
      route: "POST /checkins/:id/review",
    });
    const changedMembership = progressCommandRegistryForTests.logicalId({
      body,
      boundary: progressCommandRegistryForTests.stableBoundary({
        accessContext: "user",
        membershipId: "membership_b" as never,
        principalId: "user_a" as never,
        workspaceId: "workspace_a" as never,
      }),
      params: {
        checkinId: "checkin_a",
        relationshipId: "relationship_a",
        workspaceId: "workspace_a",
      },
      route: "POST /checkins/:id/review",
    });
    const supportContext = progressCommandRegistryForTests.logicalId({
      body,
      boundary: progressCommandRegistryForTests.stableBoundary({
        accessContext: "support",
        membershipId: "membership_a" as never,
        principalId: "user_a" as never,
        workspaceId: "workspace_a" as never,
      }),
      params: {
        checkinId: "checkin_a",
        relationshipId: "relationship_a",
        workspaceId: "workspace_a",
      },
      route: "POST /checkins/:id/review",
    });
    const changedPrincipal = progressCommandRegistryForTests.logicalId({
      body,
      boundary: progressCommandRegistryForTests.stableBoundary({
        accessContext: "user",
        membershipId: "membership_a" as never,
        principalId: "user_b" as never,
        workspaceId: "workspace_a" as never,
      }),
      params: {
        checkinId: "checkin_a",
        relationshipId: "relationship_a",
        workspaceId: "workspace_a",
      },
      route: "POST /checkins/:id/review",
    });

    expect(progressCommandRegistryForTests.commandKey(changedBody)).not.toBe(
      key,
    );
    expect(
      progressCommandRegistryForTests.commandKey(changedMembership),
    ).not.toBe(key);
    expect(progressCommandRegistryForTests.commandKey(supportContext)).not.toBe(
      key,
    );
    expect(
      progressCommandRegistryForTests.commandKey(changedPrincipal),
    ).not.toBe(key);
  });

  test("keeps config or daily ambiguity distinct from normal saved success", () => {
    expect(messages.en.progress.status.stateMatchesIntent).not.toBe(
      messages.en.progress.status.saved,
    );
    expect(messages.ar.progress.status.stateMatchesIntent).not.toBe(
      messages.ar.progress.status.saved,
    );
    expect(
      progressCommandRegistryForTests.comparisons.adherenceConfigStateMatchesIntent(
        {
          body: { enabledMetrics: ["WATER", "STEPS"], expectedVersion: 4 },
          enabledMetrics: ["WATER", "STEPS"],
        },
        { enabledMetrics: ["STEPS", "WATER"], version: 4 },
      ),
    ).toBe(false);
    expect(
      progressCommandRegistryForTests.comparisons.adherenceConfigStateMatchesIntent(
        {
          body: { enabledMetrics: ["WATER", "STEPS"], expectedVersion: 4 },
          enabledMetrics: ["WATER", "STEPS"],
        },
        { enabledMetrics: ["STEPS", "WATER"], version: 5 },
      ),
    ).toBe(true);
    expect(
      progressCommandRegistryForTests.comparisons.dailyTrackingStateMatchesIntent(
        {
          body: {
            expectedVersion: 7,
            values: { WATER: { ml: 2000 } },
          },
          localDate: "2026-05-01",
        },
        { values: { WATER: { ml: 2000 } }, version: 7 },
      ),
    ).toBe(false);
    expect(
      progressCommandRegistryForTests.comparisons.dailyTrackingStateMatchesIntent(
        {
          body: {
            expectedVersion: 7,
            values: { WATER: { ml: 2000 } },
          },
          localDate: "2026-05-01",
        },
        { values: { WATER: { ml: 2000 } }, version: 2 },
      ),
    ).toBe(false);
    expect(
      progressCommandRegistryForTests.comparisons.dailyTrackingStateMatchesIntent(
        {
          body: {
            expectedVersion: 7,
            values: { WATER: { ml: 2000 } },
          },
          localDate: "2026-05-01",
        },
        { values: { WATER: { ml: 2000 } }, version: 8 },
      ),
    ).toBe(true);
  });

  test("keeps ambiguous create-without-version reconciliation conservative", () => {
    expect(
      progressCommandRegistryForTests.comparisons.adherenceConfigStateMatchesIntent(
        {
          body: { enabledMetrics: ["WATER", "STEPS"] },
          enabledMetrics: ["WATER", "STEPS"],
        },
        { enabledMetrics: ["STEPS", "WATER"], version: 1 },
      ),
    ).toBe(false);
    expect(
      progressCommandRegistryForTests.comparisons.dailyTrackingStateMatchesIntent(
        {
          body: { values: { WATER: { ml: 2000 } } },
          localDate: "2026-05-01",
        },
        { values: { WATER: { ml: 2000 } }, version: 1 },
      ),
    ).toBe(false);
  });

  test("classifies conflicting authoritative reconciliation as not applied", () => {
    expect(
      progressCommandRegistryForTests.comparisons.adherenceConfigStateMatchesIntent(
        {
          body: { enabledMetrics: ["WATER", "STEPS"], expectedVersion: 4 },
          enabledMetrics: ["WATER", "STEPS"],
        },
        { enabledMetrics: ["NUTRITION"], version: 5 },
      ),
    ).toBe(false);
    expect(
      progressCommandRegistryForTests.comparisons.dailyTrackingStateMatchesIntent(
        {
          body: {
            expectedVersion: 7,
            values: { WATER: { ml: 2000 } },
          },
          localDate: "2026-05-01",
        },
        { values: { WATER: { ml: 1500 } }, version: 8 },
      ),
    ).toBe(false);
  });

  test("compares versioned authoritative state for other safe ambiguous reconciliation", () => {
    expect(
      progressCommandRegistryForTests.comparisons.assignmentUpdateApplied(
        {
          assignment: {
            active: true,
            id: "assignment_a" as never,
            recurrence: {
              dayOfWeek: 1,
              frequency: "WEEKLY",
              timezone: "Africa/Cairo",
            },
            relationshipId: "relationship_a" as never,
            startedAt: "2026-05-01T00:00:00.000Z",
            templateId: "template_a" as never,
            version: 1,
            workspaceId: "workspace_a" as never,
          },
          body: {
            expectedVersion: 1,
            recurrence: {
              dayOfWeek: 2,
              frequency: "WEEKLY",
              timezone: "Africa/Cairo",
            },
          },
        },
        {
          active: true,
          id: "assignment_a" as never,
          recurrence: {
            dayOfWeek: 2,
            frequency: "WEEKLY",
            timezone: "Africa/Cairo",
          },
          relationshipId: "relationship_a" as never,
          startedAt: "2026-05-01T00:00:00.000Z",
          templateId: "template_a" as never,
          version: 2,
          workspaceId: "workspace_a" as never,
        },
      ),
    ).toBe(true);
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

function fakeCheckInApiClient(): ApiClient & { calls: ApiRequestOptions[] } {
  const calls: ApiRequestOptions[] = [];
  return {
    request: vi.fn(async (options: ApiRequestOptions) => {
      calls.push(options);
      if (options.path.includes("/review")) {
        return {
          data: {
            checkin: {
              assignmentId: "assignment_a",
              dayOfWeek: 1,
              dueAt: "2026-05-08T00:00:00.000Z",
              id: "checkin_a",
              opensAt: "2026-05-01T00:00:00.000Z",
              periodEndAt: "2026-05-08T00:00:00.000Z",
              periodKey: "2026-W18",
              periodStartAt: "2026-05-01T00:00:00.000Z",
              relationshipId: "relationship_a",
              responses: [],
              status: "REVIEWED",
              templateId: "template_a",
              templateRevisionId: "revision_a",
              timezone: "Africa/Cairo",
              trainerFeedback: { comment: "Good work" },
              version: 4,
              workspaceId: "workspace_a",
            },
          },
        };
      }
      if (options.path.includes("/checkin-assignments/")) {
        return {
          data: {
            assignment: {
              active: false,
              endedAt: "2026-05-02T00:00:00.000Z",
              id: "assignment_a",
              recurrence: {
                dayOfWeek: 1,
                frequency: "WEEKLY",
                timezone: "Africa/Cairo",
              },
              relationshipId: "relationship_a",
              startedAt: "2026-05-01T00:00:00.000Z",
              templateId: "template_a",
              version: 3,
              workspaceId: "workspace_a",
            },
          },
        };
      }
      return {
        data: {
          revision: {
            fields: [
              {
                fieldKey: "weekly_notes",
                label: "Notes",
                required: false,
                type: "LONG_TEXT",
              },
            ],
            id: "revision_a",
            revision: 1,
            templateId: "template_a",
          },
          template: {
            currentRevisionId: "revision_a",
            id: "template_a",
            name: "Weekly",
            ownerMembershipId: "membership_a",
            status: "ACTIVE",
            version: 1,
            workspaceId: "workspace_a",
          },
        },
      };
    }),
    calls,
  } as unknown as ApiClient & { calls: ApiRequestOptions[] };
}
