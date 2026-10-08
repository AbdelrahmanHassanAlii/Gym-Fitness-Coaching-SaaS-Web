import { expect, test } from "@playwright/test";

test.describe("notification center route", () => {
  test("does not expose the staff notification inbox to an unauthenticated browser", async ({
    page,
  }) => {
    await page.goto("/app/notifications");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Notifications" }),
    ).not.toBeVisible();
  });
});
