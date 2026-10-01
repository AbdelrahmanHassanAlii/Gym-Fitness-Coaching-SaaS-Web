export type AppEnvironment =
  "local" | "development" | "test" | "staging" | "production";

const appEnvironments = new Set<AppEnvironment>([
  "local",
  "development",
  "test",
  "staging",
  "production",
]);

export type RawPublicEnv = {
  NEXT_PUBLIC_APP_ENV?: string;
  NEXT_PUBLIC_BACKEND_API_BASE_URL?: string;
};

export type RawServerEnv = {
  APP_ENV?: string;
  NODE_ENV?: string;
};

export type PublicEnv = {
  appEnv: AppEnvironment;
  backendApiBaseUrl: string | null;
};

export type ServerEnv = {
  appEnv: AppEnvironment;
  nodeEnv: string;
};

function parseAppEnvironment(
  value: string | undefined,
  fallback: AppEnvironment,
): AppEnvironment {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  if (appEnvironments.has(value as AppEnvironment)) {
    return value as AppEnvironment;
  }

  throw new Error(`Invalid application environment: ${value}`);
}

function parseOptionalUrl(
  value: string | undefined,
  name: string,
): string | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }

    return url.toString();
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL when provided`);
  }
}

export function createPublicEnv(rawEnv: RawPublicEnv): PublicEnv {
  return {
    appEnv: parseAppEnvironment(rawEnv.NEXT_PUBLIC_APP_ENV, "local"),
    backendApiBaseUrl: parseOptionalUrl(
      rawEnv.NEXT_PUBLIC_BACKEND_API_BASE_URL,
      "NEXT_PUBLIC_BACKEND_API_BASE_URL",
    ),
  };
}

export function createServerEnv(rawEnv: RawServerEnv): ServerEnv {
  return {
    appEnv: parseAppEnvironment(rawEnv.APP_ENV, "local"),
    nodeEnv: rawEnv.NODE_ENV ?? "development",
  };
}
