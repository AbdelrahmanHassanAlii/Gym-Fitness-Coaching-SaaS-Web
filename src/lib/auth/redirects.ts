const defaultAuthenticatedPath = "/app";

export function getSafeReturnPath(
  value: string | null | undefined,
  fallback = defaultAuthenticatedPath,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  let decoded = value;

  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(decoded, "https://app.local");

    if (parsed.origin !== "https://app.local") {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
