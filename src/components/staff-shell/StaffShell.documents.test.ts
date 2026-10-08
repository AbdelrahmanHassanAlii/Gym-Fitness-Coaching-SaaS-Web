import { describe, expect, test } from "vitest";
import { currentUserDecisionRequestsForPath } from "./StaffShell";

describe("documents shell decisions", () => {
  test("requests exact frozen WEB-018 Route A set for /app/documents", () => {
    const requests = currentUserDecisionRequestsForPath("/app/documents");
    const permissions = requests.map((request) => request.permission).sort();

    expect(requests).toHaveLength(16);
    expect(new Set(permissions).size).toBe(16);
    expect(permissions).toEqual(
      [
        "adherence.read",
        "analytics.nutrition.read",
        "billing.subscription.read",
        "documents.delete",
        "documents.read",
        "documents.upload",
        "files.download",
        "foods.read",
        "medical_documents.download",
        "medical_documents.read",
        "medical_documents.upload",
        "nutrition.plans.read",
        "programs.read",
        "staff.read",
        "trainees.read",
        "workspace.read",
      ].sort(),
    );
    expect(permissions).not.toContain("files.restore");
    expect(permissions).not.toContain("files.delete");
  });
});
