export type OffsetTimestamp = string & {
  readonly __offsetTimestampBrand: unique symbol;
};

export type IanaTimeZone = string & {
  readonly __ianaTimeZoneBrand: unique symbol;
};

const offsetTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isOffsetTimestamp(value: string): value is OffsetTimestamp {
  return offsetTimestampPattern.test(value) && !Number.isNaN(Date.parse(value));
}

export function parseOffsetTimestamp(value: string): OffsetTimestamp {
  if (!isOffsetTimestamp(value)) {
    throw new Error("Timestamp must include an explicit Z or numeric offset");
  }

  return value;
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
