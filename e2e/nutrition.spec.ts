import { expect, test } from "@playwright/test";

test.describe("nutrition route smoke", () => {
  test("does not expose nutrition to an unauthenticated browser session", async ({
    page,
  }) => {
    await page.goto("/app/nutrition");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nutrition" }),
    ).not.toBeVisible();
  });
});
