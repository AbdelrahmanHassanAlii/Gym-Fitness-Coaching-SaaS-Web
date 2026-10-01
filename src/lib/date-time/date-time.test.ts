import { describe, expect, test } from "vitest";
import {
  createHalfOpenDateRange,
  formatDateOnlyForLocale,
  formatInstantInTimeZone,
  isDateOnly,
  isOffsetTimestamp,
  parseDateOnly,
  parseIanaTimeZone,
  parseOffsetTimestamp,
} from ".";

describe("date and time infrastructure", () => {
  test("preserves valid DateOnly values as YYYY-MM-DD strings", () => {
    const dateOnly = parseDateOnly("2026-10-01");

    expect(dateOnly).toBe("2026-10-01");
    expect(isDateOnly(dateOnly)).toBe(true);
  });

  test("rejects invalid DateOnly values", () => {
    expect(() => parseDateOnly("2026-02-30")).toThrow("valid YYYY-MM-DD");
    expect(() => parseDateOnly("2026-2-3")).toThrow("valid YYYY-MM-DD");
  });

  test("formats DateOnly for display without exposing UTC instant conversion", () => {
    const dateOnly = parseDateOnly("2026-03-29");

    expect(formatDateOnlyForLocale(dateOnly, "en-US")).toContain("2026");
    expect(dateOnly).toBe("2026-03-29");
  });

  test("requires explicit offsets for instant timestamps", () => {
    expect(isOffsetTimestamp("2026-10-01T10:15:00Z")).toBe(true);
    expect(isOffsetTimestamp("2026-10-01T12:15:00+02:00")).toBe(true);
    expect(isOffsetTimestamp("2026-10-01T12:15:00")).toBe(false);
    expect(() => parseOffsetTimestamp("2026-10-01T12:15:00")).toThrow(
      "explicit Z or numeric offset",
    );
  });

  test("formats instants with an explicit IANA timezone", () => {
    const timestamp = parseOffsetTimestamp("2026-10-01T10:15:00Z");
    const cairo = parseIanaTimeZone("Africa/Cairo");

    expect(
      formatInstantInTimeZone(timestamp, "en-US", cairo, {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    ).toContain("GMT");
  });

  test("preserves half-open [from,to) date ranges", () => {
    const from = parseDateOnly("2026-10-01");
    const to = parseDateOnly("2026-11-01");

    expect(createHalfOpenDateRange(from, to)).toEqual({
      bounds: "[from,to)",
      from: "2026-10-01",
      to: "2026-11-01",
    });
    expect(() => createHalfOpenDateRange(to, from)).toThrow(
      "from before exclusive to",
    );
  });
});
