import { afterEach, describe, expect, test, vi } from "vitest";

describe("public environment module", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("reads browser-safe environment values from process env", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    vi.stubEnv(
      "NEXT_PUBLIC_BACKEND_API_BASE_URL",
      "https://api.example.test/api/v1",
    );

    const { publicEnv } = await import("./env.public");

    expect(publicEnv).toEqual({
      appEnv: "test",
      backendApiBaseUrl: "https://api.example.test/api/v1",
    });
  });
});
