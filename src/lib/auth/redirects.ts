const defaultAuthenticatedPath = "/app";

export function getSafeReturnPath(
  value: string | null | undefined,
  fallback = defaultAuthenticatedPath,
): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value !== value.trim()
  ) {
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
    decoded.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(decoded) ||
    decoded !== decoded.trim()
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
