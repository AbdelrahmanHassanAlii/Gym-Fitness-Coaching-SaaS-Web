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
  isPermissionKey,
  mandatorySensitiveDocumentCategories,
  notificationCategories,
  isNotificationDto,
  isNotificationPageDto,
  permissionContexts,
  permissionEffects,
  permissionKeys,
  permissionScopeTypes,
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

  test("keeps notification categories and public DTOs aligned with Stage 14", () => {
    expect(notificationCategories).toEqual([
      "TRAINING",
      "WORKOUT",
      "NUTRITION",
      "CHECK_IN",
      "DOCUMENT",
      "RELATIONSHIP",
      "SECURITY",
      "SUBSCRIPTION",
    ]);
    const notification = {
      id: "notification_a",
      eventType: "CheckInDue",
      notificationType: "CHECK_IN_DUE",
      category: "CHECK_IN",
      title: "Check-in due",
      body: "Your check-in is due.",
      payload: { checkinId: "checkin_a" },
      readAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(isNotificationDto(notification)).toBe(true);
    expect(
      isNotificationPageDto({
        data: [notification],
        page: { nextCursor: null },
      }),
    ).toBe(true);
    expect(isNotificationDto({ ...notification, category: "DELIVERY" })).toBe(
      false,
    );
    expect(
      isNotificationDto({ ...notification, payload: { attempts: 2 } }),
    ).toBe(false);
    expect(
      isNotificationDto({ ...notification, deliveryStatus: "RETRYING" }),
    ).toBe(false);
    expect(
      isNotificationDto({ ...notification, payload: { providerError: "x" } }),
    ).toBe(false);
    expect(
      isNotificationDto({ ...notification, createdAt: "2026-01-01" }),
    ).toBe(false);
    expect(isNotificationDto({ ...notification, readAt: "yesterday" })).toBe(
      false,
    );
  });

  test("keeps audited permission identifiers explicit and role-free", () => {
    expect(permissionContexts).toEqual(["PLATFORM", "WORKSPACE"]);
    expect(permissionEffects).toEqual(["ALLOW", "DENY"]);
    expect(permissionScopeTypes).toEqual([
      "SELF",
      "ASSIGNED_TRAINEES",
      "SPECIFIC_TRAINEES",
      "BRANCH",
      "MULTIPLE_BRANCHES",
      "WORKSPACE",
    ]);
    expect(permissionKeys).toContain("staff.permissions.manage");
    expect(permissionKeys).toContain("platform_permissions.manage");
    expect(permissionKeys).toContain("dashboard.relationship.read");
    expect(isPermissionKey("support.sensitive_files.read")).toBe(true);
    expect(isPermissionKey("GYM_MANAGER")).toBe(false);
    expect(isPermissionKey("canEditUser")).toBe(false);
  });
});
