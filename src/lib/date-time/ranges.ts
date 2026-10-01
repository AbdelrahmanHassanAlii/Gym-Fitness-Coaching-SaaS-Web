import { compareDateOnly, type DateOnly } from "./date-only";

export type HalfOpenDateRange = {
  readonly bounds: "[from,to)";
  readonly from: DateOnly;
  readonly to: DateOnly;
};

export function createHalfOpenDateRange(
  from: DateOnly,
  to: DateOnly,
): HalfOpenDateRange {
  if (compareDateOnly(from, to) >= 0) {
    throw new Error("Half-open date range requires from before exclusive to");
  }

  return {
    bounds: "[from,to)",
    from,
    to,
  };
}
