export interface PaginationGuard {
  category: string | null;
  cursor: string | null;
  generation: number;
  identity: string;
}

export function createPaginationGuard(input: {
  category?: string | null;
  cursor?: string | null;
  generation: number;
  identity: string;
}): PaginationGuard {
  return {
    category: input.category ?? null,
    cursor: input.cursor ?? null,
    generation: input.generation,
    identity: input.identity,
  };
}

export function isCurrentPaginationRequest(
  captured: PaginationGuard,
  current: PaginationGuard,
) {
  return (
    captured.category === current.category &&
    captured.cursor === current.cursor &&
    captured.generation === current.generation &&
    captured.identity === current.identity
  );
}

export function appendCurrentPage<T>(
  current: readonly T[],
  incoming: readonly T[],
  identity: (item: T) => string,
): T[] {
  const seen = new Set(current.map(identity));
  return [
    ...current,
    ...incoming.filter((item) => {
      const key = identity(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}

export function calendarDateAfter(value: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || !Number.isSafeInteger(days)) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function localDateRangeWithinLimit(
  from: string,
  to: string,
  maximumDays = 366,
): boolean {
  const start = calendarOrdinal(from);
  const end = calendarOrdinal(to);
  return (
    start !== null && end !== null && end > start && end - start <= maximumDays
  );
}

function calendarOrdinal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return Math.floor(date.getTime() / 86_400_000);
}
