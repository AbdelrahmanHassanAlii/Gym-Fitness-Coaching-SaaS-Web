import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("public home smoke", () => {
  test("renders the current foundation page", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Hassan Gym & Fitness Coaching SaaS" }),
    ).toBeVisible();
    await expect(page.getByText("Web foundation")).toBeVisible();
  });

  test("has no automatically detectable WCAG A/AA violations on the current page", async ({
    page,
  }) => {
    await page.goto("/");

    const scanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(scanResults.violations).toEqual([]);
  });
});
