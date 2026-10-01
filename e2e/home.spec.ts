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

  test("switches language and updates document direction", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await page.getByLabel("Interface language").selectOption("ar");

    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("heading", { name: "منصة حسن للجيم والتدريب" }),
    ).toBeVisible();
  });

  test("switches theme and appearance preferences", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Theme", { exact: true }).selectOption("pulse");
    await page.getByLabel("Appearance", { exact: true }).selectOption("dark");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "pulse");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-resolved-appearance",
      "dark",
    );
  });
});
