export type OffsetTimestamp = string & {
  readonly __offsetTimestampBrand: unique symbol;
};

export type IanaTimeZone = string & {
  readonly __ianaTimeZoneBrand: unique symbol;
};

const offsetTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

export function isOffsetTimestamp(value: string): value is OffsetTimestamp {
  return parseOffsetTimestampParts(value) !== null;
}

export function parseOffsetTimestamp(value: string): OffsetTimestamp {
  if (!isOffsetTimestamp(value)) {
    throw new Error("Timestamp must include an explicit Z or numeric offset");
  }

  return value;
}

function parseOffsetTimestampParts(value: string): {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
} | null {
  const match = offsetTimestampPattern.exec(value);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);

  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const testDate = new Date(Date.UTC(year, month - 1, day));
  if (
    testDate.getUTCFullYear() !== year ||
    testDate.getUTCMonth() !== month - 1 ||
    testDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, hour, minute, month, second, year };
}

export function parseIanaTimeZone(value: string): IanaTimeZone {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value as IanaTimeZone;
  } catch {
    throw new Error("Expected a valid IANA timezone identifier");
  }
}

export function formatInstantInTimeZone(
  timestamp: OffsetTimestamp,
  locale: string,
  timeZone: IanaTimeZone,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const hasCallerOptions = Object.keys(options).length > 0;

  return new Intl.DateTimeFormat(locale, {
    ...(hasCallerOptions ? {} : { dateStyle: "medium", timeStyle: "short" }),
    ...options,
    timeZone,
  }).format(new Date(timestamp));
}
