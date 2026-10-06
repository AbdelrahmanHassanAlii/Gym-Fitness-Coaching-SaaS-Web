import { describe, expect, test } from "vitest";
import { currentUserDecisionRequestsForPath } from "./StaffShell";

describe("progress shell decisions", () => {
  test("requests the exact frozen shell decision set for /app/progress", () => {
    const requests = currentUserDecisionRequestsForPath("/app/progress");
    const permissions = requests.map((request) => request.permission).sort();

    expect(requests).toHaveLength(17);
    expect(new Set(permissions).size).toBe(17);
    expect(permissions).toEqual(
      [
        "adherence.read",
        "analytics.adherence.read",
        "analytics.nutrition.read",
        "analytics.progress.read",
        "billing.subscription.read",
        "checkins.read",
        "foods.read",
        "health.food_allergies.read",
        "health.read",
        "measurements.read",
        "notes.read",
        "nutrition.plans.read",
        "programs.read",
        "progress_photos.read",
        "staff.read",
        "trainees.read",
        "workspace.read",
      ].sort(),
    );
    expect(permissions).not.toContain("checkins.submit");
  });
});
