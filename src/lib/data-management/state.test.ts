import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/api";
import { getDataManagementLabels } from "@/i18n/data-management";
import {
  activeExport,
  canReview,
  decisionAlive,
  errorMessage,
  isUncertain,
  mergeVersions,
} from "./state";
describe("data management state", () => {
  test("discards lower versions and deduplicates explicit older pages", () =>
    expect(
      mergeVersions(
        [{ id: "a", version: 4 }],
        [
          { id: "a", version: 2 },
          { id: "b", version: 1 },
        ],
      ),
    ).toEqual([
      { id: "a", version: 4 },
      { id: "b", version: 1 },
    ]));
  test("only active exports poll and only pending/postponed deletions allow actions", () => {
    for (const s of ["READY", "FAILED", "EXPIRED"])
      expect(activeExport(s)).toBe(false);
    expect(activeExport("PROCESSING")).toBe(true);
    for (const s of [
      "APPROVED",
      "PROCESSING",
      "FAILED",
      "COMPLETED",
      "CANCELLED",
    ])
      expect(canReview(s)).toBe(false);
    expect(canReview("POSTPONED")).toBe(true);
  });
  test("uncertainty and authority deadlines fail closed", () => {
    expect(
      isUncertain(new ApiError({ kind: "network", message: "unknown" })),
    ).toBe(true);
    expect(
      isUncertain(
        new ApiError({ kind: "backend", status: 409, message: "conflict" }),
      ),
    ).toBe(false);
    expect(decisionAlive("2020-01-01T00:00:00Z")).toBe(false);
  });
  test.each(["en", "ar"] as const)("safe localized error UX (%s)", (locale) => {
    const labels = getDataManagementLabels(locale);
    for (const code of [
      "ACTIVE_EXPORT_EXISTS",
      "EXPORT_NOT_ALLOWED_FOR_SUBSCRIPTION",
      "WORKSPACE_DELETION_VERSION_CONFLICT",
      "EXPORT_NOT_READY",
      "EXPORT_SUPPORT_FORBIDDEN",
      "INTERNAL_ERROR",
    ])
      expect(
        errorMessage(
          new ApiError({
            kind: "backend",
            code,
            message: "raw exception secret",
          }),
          labels,
        ),
      ).not.toContain("secret");
    expect(labels.fields.eligibilityAt).not.toContain("Scheduled");
    expect(labels.fields.reviewAfter).not.toContain("Execution");
  });
});
