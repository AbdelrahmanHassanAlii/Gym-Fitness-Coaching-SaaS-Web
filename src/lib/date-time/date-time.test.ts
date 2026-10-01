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
    expect(parseDateOnly("2026-01-01")).toBe("2026-01-01");
    expect(parseDateOnly("2024-02-29")).toBe("2024-02-29");
    expect(parseDateOnly("2026-12-31")).toBe("2026-12-31");
  });

  test("rejects invalid DateOnly values", () => {
    expect(() => parseDateOnly("")).toThrow("valid YYYY-MM-DD");
    expect(() => parseDateOnly("01-01-2026")).toThrow("valid YYYY-MM-DD");
    expect(() => parseDateOnly("2026-00-10")).toThrow("valid YYYY-MM-DD");
    expect(() => parseDateOnly("2026-13-01")).toThrow("valid YYYY-MM-DD");
    expect(() => parseDateOnly("2026-02-30")).toThrow("valid YYYY-MM-DD");
    expect(() => parseDateOnly("2026-02-29")).toThrow("valid YYYY-MM-DD");
    expect(() => parseDateOnly("2026-04-31")).toThrow("valid YYYY-MM-DD");
    expect(() => parseDateOnly("2026-1-01")).toThrow("valid YYYY-MM-DD");
  });

  test("formats DateOnly for display without exposing UTC instant conversion", () => {
    const dateOnly = parseDateOnly("2026-03-29");

    expect(formatDateOnlyForLocale(dateOnly, "en-US")).toContain("2026");
    expect(dateOnly).toBe("2026-03-29");
  });

  test("requires explicit offsets for instant timestamps", () => {
    expect(isOffsetTimestamp("2026-10-01T10:15:00Z")).toBe(true);
    expect(isOffsetTimestamp("2026-10-01T12:15:00+02:00")).toBe(true);
    expect(isOffsetTimestamp("2026-10-01T05:15:00-05:00")).toBe(true);
    expect(isOffsetTimestamp("2026-10-01T12:15:00.123+02:00")).toBe(true);
    expect(isOffsetTimestamp("2026-10-01T12:15:00")).toBe(false);
    expect(isOffsetTimestamp("2026-02-30T12:15:00Z")).toBe(false);
    expect(isOffsetTimestamp("2026-10-01")).toBe(false);
    expect(isOffsetTimestamp("garbage")).toBe(false);
    expect(isOffsetTimestamp("2026-10-01T24:00:00Z")).toBe(false);
    expect(isOffsetTimestamp("2026-10-01T23:60:00Z")).toBe(false);
    expect(() => parseOffsetTimestamp("2026-10-01T12:15:00")).toThrow(
      "explicit Z or numeric offset",
    );
  });

  test("formats instants with an explicit IANA timezone", () => {
    const timestamp = parseOffsetTimestamp("2026-10-01T10:15:00Z");
    const cairo = parseIanaTimeZone("Africa/Cairo");
    const utc = parseIanaTimeZone("UTC");
    const newYork = parseIanaTimeZone("America/New_York");

    expect(
      formatInstantInTimeZone(timestamp, "en-US", cairo, {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    ).toContain("GMT");
    expect(
      formatInstantInTimeZone(timestamp, "en-US", utc, {
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
      }),
    ).toBe("10:15");
    expect(
      formatInstantInTimeZone(timestamp, "en-US", newYork, {
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
      }),
    ).toBe("06:15");
    expect(() => parseIanaTimeZone("Not/AZone")).toThrow("IANA timezone");
  });

  test("formats DST-sensitive instants with explicit timezones", () => {
    const newYork = parseIanaTimeZone("America/New_York");
    const cairo = parseIanaTimeZone("Africa/Cairo");
    const beforeSpringForward = parseOffsetTimestamp("2026-03-08T06:30:00Z");
    const afterSpringForward = parseOffsetTimestamp("2026-03-08T07:30:00Z");

    const timeOptions = {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
    } satisfies Intl.DateTimeFormatOptions;

    expect(
      formatInstantInTimeZone(
        beforeSpringForward,
        "en-US",
        newYork,
        timeOptions,
      ),
    ).toBe("01:30");
    expect(
      formatInstantInTimeZone(
        afterSpringForward,
        "en-US",
        newYork,
        timeOptions,
      ),
    ).toBe("03:30");
    expect(
      formatInstantInTimeZone(beforeSpringForward, "en-US", cairo, timeOptions),
    ).toBe("08:30");
  });

  test("preserves half-open [from,to) date ranges", () => {
    const from = parseDateOnly("2026-10-01");
    const to = parseDateOnly("2026-11-01");

    expect(createHalfOpenDateRange(from, to)).toEqual({
      bounds: "[from,to)",
      from: "2026-10-01",
      to: "2026-11-01",
    });
    expect(() => createHalfOpenDateRange(from, from)).toThrow(
      "from before exclusive to",
    );
    expect(() => createHalfOpenDateRange(to, from)).toThrow(
      "from before exclusive to",
    );
  });
});
