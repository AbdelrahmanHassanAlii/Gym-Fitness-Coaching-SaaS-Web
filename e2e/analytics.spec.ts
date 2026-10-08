import { expect, test } from "@playwright/test";

test("does not expose analytics to an unauthenticated browser", async ({
  page,
}) => {
  await page.goto("/app/analytics");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dashboards and analytics" }),
  ).not.toBeVisible();
});
