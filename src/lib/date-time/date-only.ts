export type DateOnly = string & { readonly __dateOnlyBrand: unique symbol };

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(value: string): value is DateOnly {
  return parseDateParts(value) !== null;
}

export function parseDateOnly(value: string): DateOnly {
  if (!isDateOnly(value)) {
    throw new Error("DateOnly must use a valid YYYY-MM-DD calendar date");
  }

  return value;
}

export function compareDateOnly(a: DateOnly, b: DateOnly): number {
  return a.localeCompare(b);
}

export function formatDateOnlyForLocale(
  dateOnly: DateOnly,
  locale: string,
): string {
  const parts = parseDateParts(dateOnly);

  if (parts === null) {
    throw new Error("Invalid DateOnly");
  }

  const displayDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(displayDate);
}

function parseDateParts(
  value: string,
): { day: number; month: number; year: number } | null {
  const match = dateOnlyPattern.exec(value);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const testDate = new Date(Date.UTC(year, month - 1, day));

  if (
    testDate.getUTCFullYear() !== year ||
    testDate.getUTCMonth() !== month - 1 ||
    testDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year };
}
