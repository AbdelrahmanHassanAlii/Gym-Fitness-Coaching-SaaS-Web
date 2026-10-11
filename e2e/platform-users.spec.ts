import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const id = "68e7a9d10d56fd2b98d4a101",
  secondId = "68e7a9d10d56fd2b98d4a102",
  at = "2026-10-11T10:00:00.000Z";
const member = (userId = id, name = "Member One") => ({
  id: userId,
  displayName: name,
  email: `${"long".repeat(15)}@example.com`,
  status: "LOCKED",
  createdAt: at,
  platformMembership: { status: "SUSPENDED" },
});
async function mockPlatform(page: Page) {
  const reads: URL[] = [];
  const methods: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    let json: unknown;
    if (path === "/auth/refresh")
      json = {
        data: {
          accessToken: "browser-test-token",
          restrictedUntilVerified: false,
          user: {
            id,
            firstName: "Platform",
            lastName: "Admin",
            emailVerified: true,
            phoneVerified: false,
          },
        },
      };
    else if (path === "/me/platform-context")
      json = {
        data: {
          context: "PLATFORM",
          accessContext: "USER",
          membership: { id, status: "ACTIVE", accessVersion: 7, updatedAt: at },
        },
      };
    else if (path === "/platform/me/effective-access/decisions") {
      const body = request.postDataJSON();
      json = {
        data: {
          context: "PLATFORM",
          accessContext: "USER",
          membershipId: id,
          membershipStatus: "ACTIVE",
          accessVersion: 7,
          validUntil: null,
          decisions: body.requests.map((r: { permission: string }) => ({
            ...r,
            allowed: r.permission === "platform_users.read",
            effect: r.permission === "platform_users.read" ? "ALLOW" : "DENY",
          })),
        },
      };
    } else if (path === "/platform/users") {
      reads.push(url);
      methods.push(request.method());
      json = url.searchParams.has("cursor")
        ? {
            data: [member(secondId, "Member Two")],
            meta: { nextCursor: null, hasMore: false },
          }
        : {
            data: [member()],
            meta: { nextCursor: "opaque-browser-cursor", hasMore: true },
          };
    } else if (path === `/platform/users/${id}`) {
      methods.push(request.method());
      json = {
        data: {
          ...member(),
          updatedAt: at,
          platformMembership: {
            id,
            status: "SUSPENDED",
            createdAt: at,
            updatedAt: at,
            suspendedAt: at,
          },
        },
      };
    } else throw new Error(`Unexpected API contract: ${path}`);
    await route.fulfill({
      json,
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:3100",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  });
  return { reads, methods };
}

test("protects direct Platform Users directory and detail deep links", async ({
  page,
}) => {
  for (const path of ["/platform/users", `/platform/users/${id}`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("next")).toBe(path);
  }
});

test("browser commits Enter search, filters, paginates and activates safe detail return", async ({
  page,
}) => {
  const { reads, methods } = await mockPlatform(page);
  await page.goto("/platform/users");
  await expect(
    page.getByRole("heading", { name: "Platform Members" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Member One/ })).toBeVisible();
  const search = page.getByRole("searchbox");
  await search.fill("member@example.com");
  expect(reads).toHaveLength(1);
  await search.press("Enter");
  await expect(page).toHaveURL(/q=member%40example.com/);
  await page
    .getByRole("combobox", { name: "Platform membership status", exact: true })
    .selectOption("SUSPENDED");
  await expect(page).toHaveURL(/platformMembershipStatus=SUSPENDED/);
  await expect(page.getByRole("link", { name: /Member One/ })).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("link", { name: /Member Two/ })).toBeVisible();
  expect(reads.at(-1)?.searchParams.get("cursor")).toBe(
    "opaque-browser-cursor",
  );
  expect(new URL(page.url()).searchParams.has("cursor")).toBe(false);
  await page.getByRole("link", { name: /Member One/ }).click();
  await expect(
    page.getByRole("heading", { name: "User details" }),
  ).toBeVisible();
  await expect(page.getByText("Suspended at", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to users" }).click();
  await expect(
    page.getByRole("heading", { name: "Platform Members" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("q")).toBe("member@example.com");
  expect(new URL(page.url()).searchParams.get("platformMembershipStatus")).toBe(
    "SUSPENDED",
  );
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page).not.toHaveURL(/q=/);
  expect(methods.every((method) => method === "GET")).toBe(true);
  await expect(
    page.getByRole("button", { name: /invite|reactivate|reset|grant/i }),
  ).toHaveCount(0);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("Arabic narrow directory/detail wrap long identity and use RTL", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "hassan_locale", value: "ar", url: "http://127.0.0.1:3100" },
  ]);
  await page.setViewportSize({ width: 375, height: 812 });
  await mockPlatform(page);
  await page.goto("/platform/users");
  await expect(page.getByRole("link", { name: /Member One/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: /Member One/ }).click();
  await expect(
    page.getByRole("heading", { name: "تفاصيل المستخدم" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
