import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const actor = "68e7a9d10d56fd2b98d4a100",
  target = "68e7a9d10d56fd2b98d4a101",
  membership = "68e7a9d10d56fd2b98d4a199",
  at = "2026-10-11T10:00:00.000Z";
async function platform(page: Page, initial = "ACTIVE", manage = true) {
  let status = initial,
    version = 4;
  const posts: { path: string; body: unknown; key: string | undefined }[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.replace("/api/v1", "");
    const member = {
      id: membership,
      status,
      version,
      suspendedAt: status === "SUSPENDED" ? at : null,
      endedAt: status === "ENDED" ? at : null,
    };
    const account = {
      id: target,
      displayName: "Existing Platform member",
      status: "ACTIVE",
      createdAt: at,
      platformMembership: { status },
    };
    let json: unknown;
    if (path === "/auth/refresh")
      json = {
        data: {
          accessToken: "browser-test-token",
          restrictedUntilVerified: false,
          user: {
            id: actor,
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
          membership: {
            id: actor,
            status: "ACTIVE",
            accessVersion: 7,
            updatedAt: at,
          },
        },
      };
    else if (path === "/platform/me/effective-access/decisions")
      json = {
        data: {
          context: "PLATFORM",
          accessContext: "USER",
          membershipId: actor,
          membershipStatus: "ACTIVE",
          accessVersion: 7,
          validUntil: null,
          decisions: request
            .postDataJSON()
            .requests.map((r: { permission: string }) => ({
              ...r,
              allowed:
                r.permission === "platform_users.read" ||
                (r.permission === "platform_users.manage" && manage),
              effect:
                r.permission === "platform_users.read" ||
                (r.permission === "platform_users.manage" && manage)
                  ? "ALLOW"
                  : "DENY",
            })),
        },
      };
    else if (path === "/platform/users")
      json = { data: [account], meta: { nextCursor: null, hasMore: false } };
    else if (path === `/platform/users/${target}`)
      json = {
        data: {
          ...account,
          updatedAt: at,
          platformMembership: {
            id: membership,
            status,
            createdAt: at,
            updatedAt: at,
            ...(member.suspendedAt ? { suspendedAt: at } : {}),
            ...(member.endedAt ? { endedAt: at } : {}),
          },
        },
      };
    else if (path === `/platform/users/${target}/management-state`)
      json = { data: { userId: target, platformMembership: member } };
    else if (/\/(suspend|reactivate|end)$/.test(path)) {
      posts.push({
        path,
        body: request.postDataJSON(),
        key: request.headers()["idempotency-key"],
      });
      expect(request.postDataJSON()).toEqual({ expectedVersion: version });
      expect(request.headers()["idempotency-key"]).toBeTruthy();
      status = path.endsWith("suspend")
        ? "SUSPENDED"
        : path.endsWith("end")
          ? "ENDED"
          : "ACTIVE";
      version++;
      json = {
        data: {
          userId: target,
          platformMembership: {
            ...member,
            status,
            version,
            suspendedAt: status === "SUSPENDED" ? at : null,
            endedAt: status === "ENDED" ? at : null,
          },
        },
      };
    } else throw new Error(`Unexpected API path ${path}`);
    await route.fulfill({
      json,
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:3100",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  });
  return posts;
}
for (const [status, action] of [
  ["ACTIVE", "Suspend access"],
  ["ACTIVE", "End access"],
  ["SUSPENDED", "Reactivate access"],
  ["SUSPENDED", "End access"],
  ["ENDED", "Reactivate access"],
]) {
  test(`${status}: ${action} confirms, refreshes and preserves filtered return`, async ({
    page,
  }) => {
    const posts = await platform(page, status);
    await page.goto(
      `/platform/users/${target}?q=member%40example.com&platformMembershipStatus=${status}`,
    );
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(posts).toHaveLength(0);
    await expect(
      page.getByRole("button", { name: action, exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: action, exact: true }).click();
    await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Access changed.");
    await expect(
      page.getByRole("heading", { name: "Lifecycle management" }),
    ).toBeFocused();
    expect(posts).toHaveLength(1);
    await expect(
      page.getByRole("button", {
        name: /Add user|Invite|Assign|Edit grants|Create account/i,
      }),
    ).toHaveCount(0);
    await expect(page.getByText(membership, { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to users" }).click();
    expect(new URL(page.url()).searchParams.get("q")).toBe(
      "member@example.com",
    );
    expect(
      new URL(page.url()).searchParams.get("platformMembershipStatus"),
    ).toBe(status);
    await expect(page.getByText("Existing Platform member")).toBeVisible();
  });
}
test("read-only authority exposes no lifecycle card", async ({ page }) => {
  await platform(page, "ACTIVE", false);
  await page.goto(`/platform/users/${target}`);
  await expect(page.getByText("Existing Platform member")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Lifecycle management" }),
  ).toHaveCount(0);
});
test("Arabic narrow lifecycle dialog is RTL, keyboard accessible and has no overflow", async ({
  page,
}) => {
  await platform(page);
  await page
    .context()
    .addCookies([
      { name: "hassan_locale", value: "ar", domain: "127.0.0.1", path: "/" },
    ]);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/platform/users/${target}`);
  // The locale switcher is the established cookie writer for the application.
  if (await page.getByRole("button", { name: "Suspend access" }).count()) {
    await page
      .getByRole("combobox", { name: "Interface language" })
      .selectOption("ar");
  }
  await page.getByRole("button", { name: "تعليق الوصول" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("h3")).toBeFocused();
  await expect(dialog.locator("xpath=ancestor::section")).toHaveAttribute(
    "dir",
    "rtl",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "تعليق الوصول" }),
  ).toBeFocused();
});
