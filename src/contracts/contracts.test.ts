import { describe, expect, test } from "vitest";
import {
  API_BASE_PATH,
  authClientTypes,
  contractConfidenceLevels,
  documentCategories,
  idempotentCommandRouteGroups,
  isAuthClientType,
  isContractConfidenceLevel,
  isIdempotentCommandRouteGroup,
  isMandatorySensitiveDocumentCategory,
  mandatorySensitiveDocumentCategories,
  progressAnalyticsGranularities,
  supportContextTypes,
  supportSessionTypes,
  uploadMimeTypes,
  uploadPurposes,
} from ".";

describe("backend contract DTO foundation", () => {
  test("keeps verified API base and confidence classifications explicit", () => {
    expect(API_BASE_PATH).toBe("/api/v1");
    expect(contractConfidenceLevels).toEqual([
      "VERIFIED_FROM_IMPLEMENTATION",
      "VERIFIED_FROM_OPENAPI_AND_IMPLEMENTATION",
      "DOCUMENTED_BEHAVIOR_NOT_FULLY_EXPRESSED_IN_OPENAPI",
      "PROVIDER_DEPENDENT",
      "UNVERIFIED_FOLLOW_UP",
    ]);
    expect(isContractConfidenceLevel("PROVIDER_DEPENDENT")).toBe(true);
    expect(isContractConfidenceLevel("ASSUMED")).toBe(false);
  });

  test("captures verified auth and support literals", () => {
    expect(authClientTypes).toEqual(["WEB", "MOBILE", "API"]);
    expect(isAuthClientType("WEB")).toBe(true);
    expect(isAuthClientType("BROWSER")).toBe(false);
    expect(supportContextTypes).toEqual(["USER_CONTEXT", "WORKSPACE_SUPPORT"]);
    expect(supportSessionTypes).toEqual(["READ_ONLY", "WRITE_SUPPORT"]);
  });

  test("keeps file and document literals aligned with implementation evidence", () => {
    expect(uploadPurposes).toEqual(["DOCUMENT", "PROGRESS_PHOTO", "GENERIC"]);
    expect(uploadMimeTypes).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(documentCategories).toContain("MEDICAL_REPORT");
    expect(mandatorySensitiveDocumentCategories).toEqual([
      "INBODY",
      "BLOOD_TEST",
      "MEDICAL_REPORT",
      "INJURY_REPORT",
    ]);
    expect(isMandatorySensitiveDocumentCategory("INBODY")).toBe(true);
    expect(isMandatorySensitiveDocumentCategory("OTHER")).toBe(false);
  });

  test("documents idempotent command groups without treating every mutation as idempotent", () => {
    expect(idempotentCommandRouteGroups).toContain(
      "file-upload-confirm-delete-restore-document-commands",
    );
    expect(isIdempotentCommandRouteGroup("support-access-request")).toBe(true);
    expect(isIdempotentCommandRouteGroup("every-post-patch-delete")).toBe(
      false,
    );
  });

  test("keeps analytics pagination granularity route-specific", () => {
    expect(progressAnalyticsGranularities).toEqual([
      "none",
      "day",
      "week",
      "month",
    ]);
  });
});
