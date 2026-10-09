import { describe, expect, test } from "vitest";
import {
  appendCurrentPage,
  calendarDateAfter,
  createPaginationGuard,
  isCurrentPaginationRequest,
  localDateRangeWithinLimit,
} from "./pagination";

describe("analytics pagination", () => {
  test("deduplicates IDs while preserving Backend order", () => {
    const first = Array.from({ length: 500 }, (_, index) => ({
      id: `point-${index}`,
      measuredAt: `2026-01-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
    }));
    const next = [
      first[499]!,
      { id: "point-500", measuredAt: "2026-02-01T00:00:00.000Z" },
    ];
    const merged = appendCurrentPage(first, next, (point) => point.id);

    expect(merged).toHaveLength(501);
    expect(merged[0]?.id).toBe("point-0");
    expect(merged.at(-1)?.id).toBe("point-500");
  });

  test("matches category, cursor, identity, and generation guards", () => {
    const captured = createPaginationGuard({
      category: "CHECKIN_OVERDUE",
      cursor: "cursor-a",
      generation: 2,
      identity: "workspace-a|relationship-a",
    });
    expect(isCurrentPaginationRequest(captured, captured)).toBe(true);
    expect(
      isCurrentPaginationRequest(captured, {
        ...captured,
        category: "NO_ACTIVE_PROGRAM",
      }),
    ).toBe(false);
    expect(
      isCurrentPaginationRequest(captured, { ...captured, generation: 3 }),
    ).toBe(false);
    expect(
      isCurrentPaginationRequest(captured, { ...captured, cursor: "cursor-b" }),
    ).toBe(false);
  });

  test("uses inclusive Backend calendar-day limits without fixed-hour arithmetic", () => {
    expect(calendarDateAfter("2026-03-08", 1)).toBe("2026-03-09");
    expect(calendarDateAfter("2026-11-01", 1)).toBe("2026-11-02");
    expect(calendarDateAfter("2026-02-29", 1)).toBeNull();
    expect(localDateRangeWithinLimit("2026-01-01", "2027-01-01")).toBe(true);
    expect(localDateRangeWithinLimit("2026-01-01", "2027-01-02")).toBe(false);
    expect(localDateRangeWithinLimit("2026-03-08", "2027-03-08")).toBe(true);
    expect(localDateRangeWithinLimit("2026-03-08", "2027-03-09")).toBe(false);

    const shortDay =
      Date.parse("2026-03-09T04:00:00.000Z") -
      Date.parse("2026-03-08T05:00:00.000Z");
    const longDay =
      Date.parse("2026-11-02T05:00:00.000Z") -
      Date.parse("2026-11-01T04:00:00.000Z");
    expect(shortDay).toBe(23 * 60 * 60 * 1000);
    expect(longDay).toBe(25 * 60 * 60 * 1000);
  });
});
