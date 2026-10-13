import { describe, expect, test } from "vitest";
import {
  decodeApproval,
  decodeCancel,
  decodeDeletion,
  decodeDeletionDetail,
  decodeDeletionList,
  decodeDownload,
  decodeError,
  decodeExport,
  decodeExportCreate,
  decodeExportDetail,
  decodeExportList,
  decodePostpone,
} from "./decoders";
import { id, at, exportRow, deletionRow } from "./fixtures";
describe("locked Stage 17 decoders", () => {
  test("decodes each export envelope independently", () => {
    expect(decodeExportCreate({ data: { export: exportRow } })).toEqual(
      exportRow,
    );
    expect(decodeExportDetail({ export: exportRow })).toEqual(exportRow);
    expect(
      decodeExportList({
        data: [exportRow],
        meta: { hasMore: false, nextCursor: "older" },
      }),
    ).toEqual({ items: [exportRow], nextCursor: "older" });
    expect(() => decodeExportDetail({ data: { export: exportRow } })).toThrow();
    expect(() => decodeExportCreate({ export: exportRow })).toThrow();
  });
  test.each([
    "status",
    "id",
    "workspaceId",
    "requestedByUserId",
    "requestedAt",
    "format",
    "manifestVersion",
    "version",
  ])("rejects malformed export %s", (key) => {
    expect(() =>
      decodeExport({ ...exportRow, [key]: key === "version" ? -1 : "invalid" }),
    ).toThrow();
    const missing = { ...exportRow } as Record<string, unknown>;
    delete missing[key];
    expect(() => decodeExport(missing)).toThrow();
  });
  test("rejects invalid optional timestamps, fractional versions and private failure text", () => {
    for (const patch of [
      { expiresAt: "tomorrow" },
      { failedAt: null },
      { version: 1.5 },
      { failure: { code: "FAILED", retryable: true } },
      {
        failure: {
          code: "FAILED",
          retryable: false,
          message: "private worker details",
        },
      },
      { storageKey: "secret" },
    ])
      expect(() => decodeExport({ ...exportRow, ...patch })).toThrow();
    expect(
      decodeExport({
        ...exportRow,
        status: "FAILED",
        failure: { code: "EXPORT_GENERATION_FAILED", retryable: false },
      }).failure?.retryable,
    ).toBe(false);
  });
  test.each([
    "status",
    "id",
    "subscriptionId",
    "workspaceId",
    "version",
    "createdAt",
    "updatedAt",
  ])("rejects malformed deletion %s", (key) =>
    expect(() =>
      decodeDeletion({ ...deletionRow, [key]: "invalid" }),
    ).toThrow(),
  );
  test("validates eligibility and lifecycle timestamps", () => {
    for (const patch of [
      { eligibilityBasis: {} },
      { eligibilityBasis: { expiredAt: at, eligibilityAt: "later" } },
      { reviewAfter: null },
      { currentStep: 2 },
      { version: NaN },
    ])
      expect(() => decodeDeletion({ ...deletionRow, ...patch })).toThrow();
  });
  test("decodes all deletion operation envelopes", () => {
    expect(
      decodeDeletionList({ items: [deletionRow], nextCursor: id }),
    ).toEqual({ items: [deletionRow], nextCursor: id });
    expect(decodeDeletionList({ items: [] }).nextCursor).toBeNull();
    expect(decodeApproval({ data: { deletion: deletionRow } })).toEqual(
      deletionRow,
    );
    for (const decoder of [
      decodeDeletionDetail,
      decodePostpone,
      decodeCancel,
    ]) {
      expect(decoder({ deletion: deletionRow })).toEqual(deletionRow);
      expect(() => decoder({ data: { deletion: deletionRow } })).toThrow();
    }
    expect(() => decodeApproval({ deletion: deletionRow })).toThrow();
  });
  test("validates download transport and strips error details from public result", () => {
    expect(
      decodeDownload({
        data: {
          url: "https://storage.example.test/archive?secret=transient",
          expiresAt: at,
        },
      }).expiresAt,
    ).toBe(at);
    expect(() =>
      decodeDownload({ data: { url: "javascript:alert(1)", expiresAt: at } }),
    ).toThrow();
    expect(() =>
      decodeDownload({ data: { url: "https://x.test", expiresAt: "bad" } }),
    ).toThrow();
    expect(
      decodeError({
        error: {
          code: "INTERNAL_ERROR",
          message: "private",
          details: { secret: 1 },
        },
      }),
    ).toEqual({ code: "INTERNAL_ERROR" });
    expect(() => decodeError({ error: { code: 1, message: "bad" } })).toThrow();
  });
});
