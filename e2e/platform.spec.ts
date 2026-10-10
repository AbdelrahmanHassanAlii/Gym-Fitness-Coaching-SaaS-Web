import { expect, test } from "@playwright/test";

test("does not expose the Platform Portal to an unauthenticated browser", async ({
  page,
}) => {
  await page.goto("/platform");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Platform Portal foundation" }),
  ).not.toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=%2Fplatform$/);
});

test("protects a direct Platform workspace-directory deep link", async ({
  page,
}) => {
  await page.goto("/platform/workspaces");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workspaces" }),
  ).not.toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=%2Fplatform%2Fworkspaces$/);
});
