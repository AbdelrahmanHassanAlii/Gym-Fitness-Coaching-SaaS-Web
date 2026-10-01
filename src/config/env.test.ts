import { describe, expect, test } from "vitest";
import { createPublicEnv, createServerEnv } from "./env.shared";

describe("environment configuration", () => {
  test("uses safe defaults when optional values are omitted", () => {
    expect(createPublicEnv({})).toEqual({
      appEnv: "local",
      backendApiBaseUrl: null,
    });

    expect(createServerEnv({})).toEqual({
      appEnv: "local",
      nodeEnv: "development",
    });
  });

  test("accepts explicit public and server environment values", () => {
    expect(
      createPublicEnv({
        NEXT_PUBLIC_APP_ENV: "staging",
        NEXT_PUBLIC_BACKEND_API_BASE_URL: "https://api.example.test/api/v1",
      }),
    ).toEqual({
      appEnv: "staging",
      backendApiBaseUrl: "https://api.example.test/api/v1",
    });

    expect(
      createServerEnv({ APP_ENV: "production", NODE_ENV: "production" }),
    ).toEqual({
      appEnv: "production",
      nodeEnv: "production",
    });
  });

  test("rejects invalid environment names", () => {
    expect(() => createPublicEnv({ NEXT_PUBLIC_APP_ENV: "prod" })).toThrow(
      "Invalid application environment: prod",
    );
    expect(() => createServerEnv({ APP_ENV: "prod" })).toThrow(
      "Invalid application environment: prod",
    );
  });

  test("rejects invalid public backend URLs when provided", () => {
    expect(() =>
      createPublicEnv({
        NEXT_PUBLIC_BACKEND_API_BASE_URL: "localhost:3000/api/v1",
      }),
    ).toThrow(
      "NEXT_PUBLIC_BACKEND_API_BASE_URL must be an absolute HTTP(S) URL when provided",
    );
  });
});
