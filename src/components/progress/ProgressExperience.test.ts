import { describe, expect, test } from "vitest";
import {
  localDateInWorkspaceTimeZone,
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

  test("keeps retry-critical command keys and fails closed at capacity", () => {
    progressCommandRegistryForTests.reset();
    const logicalId = "measurement-create|workspace|relationship|body";
    const key = progressCommandRegistryForTests.commandKey(logicalId);

    progressCommandRegistryForTests.markCommandAmbiguous(logicalId);
    expect(progressCommandRegistryForTests.commandKey(logicalId)).toBe(key);

    progressCommandRegistryForTests.reset();
  });
});
