import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const actor = "68e7a9d10d56fd2b98d4a100",
  target = "68e7a9d10d56fd2b98d4a101",
  member = "68e7a9d10d56fd2b98d4a199",
  alpha = "68e7a9d10d56fd2b98d4a110",
  beta = "68e7a9d10d56fd2b98d4a111",
  at = "2026-10-11T10:00:00.000Z";
async function platform(page: Page, failure?: "conflict" | "denied") {
  let version = 4,
    assigned = [alpha],
    retired = false;
  const writes: { body: unknown; key?: string }[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.replace("/api/v1", "");
    let json: unknown,
      status = 200;
    const assignment = () => ({
      data: {
        userId: target,
        platformMembership: { id: member, status: "ACTIVE", version },
        permissionProfiles: assigned.map((id) => ({
          id,
          name: id === alpha ? "Alpha" : "Beta",
          status: "ACTIVE",
        })),
      },
    });
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
            .requests.map((r: { permission: string }) => {
              const allowed =
                r.permission === "platform_users.read" ||
                r.permission === "platform_users.manage" ||
                (r.permission === "platform_permissions.manage" && !retired);
              return { ...r, allowed, effect: allowed ? "ALLOW" : "DENY" };
            }),
        },
      };
    else if (path === `/platform/users/${target}`)
      json = {
        data: {
          id: target,
          displayName: "Readable member",
          status: "ACTIVE",
          createdAt: at,
          updatedAt: at,
          platformMembership: {
            id: member,
            status: "ACTIVE",
            createdAt: at,
            updatedAt: at,
          },
        },
      };
    else if (path.endsWith("/management-state"))
      json = {
        data: {
          userId: target,
          platformMembership: {
            id: member,
            status: "ACTIVE",
            version,
            suspendedAt: null,
            endedAt: null,
          },
        },
      };
    else if (path === "/platform/permission-profile-selector")
      json = {
        data: {
          permissionProfiles: [
            { id: alpha, name: "Alpha" },
            { id: beta, name: "Beta" },
          ],
          nextCursor: null,
        },
      };
    else if (path.endsWith("/permission-profile-assignment")) {
      if (request.method() === "PUT") {
        writes.push({
          body: request.postDataJSON(),
          key: request.headers()["idempotency-key"],
        });
        if (failure) {
          status = failure === "conflict" ? 409 : 403;
          if (failure === "conflict") version = 10;
          else retired = true;
          json = {
            error: {
              code:
                failure === "conflict"
                  ? "PLATFORM_MEMBERSHIP_VERSION_CONFLICT"
                  : "PERMISSION_DENIED",
              message: "Private backend detail",
            },
          };
        } else {
          assigned = request.postDataJSON().profileIds;
          version++;
          json = assignment();
        }
      } else json = assignment();
    } else throw new Error(`Unexpected path ${path}`);
    await route.fulfill({
      status,
      json,
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:3100",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  });
  return writes;
}
test("replacement requires confirmation and updates profiles without stale lifecycle version", async ({
  page,
}) => {
  const writes = await platform(page);
  await page.goto(`/platform/users/${target}`);
  await page.getByRole("button", { name: "Edit assignment" }).click();
  await page.getByRole("checkbox", { name: "Beta" }).check();
  await page.getByRole("button", { name: "Save assignment" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(writes).toHaveLength(0);
  await expect(
    dialog.getByRole("heading", { name: "Confirm profile replacement" }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("button", { name: "Save assignment" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Save assignment" }).click();
  await dialog.getByRole("button", { name: "Save assignment" }).click();
  await expect(
    page.getByText("Permission-profile assignment updated."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Permission profiles", exact: true }),
  ).toBeFocused();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toEqual({
    expectedVersion: 4,
    profileIds: [alpha, beta],
  });
  expect(writes[0].key).toBeTruthy();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText("Beta", { exact: true })).toBeVisible();
});
for (const failure of ["conflict", "denied"] as const)
  test(`${failure} retires intent while READ remains`, async ({ page }) => {
    const writes = await platform(page, failure);
    await page.goto(`/platform/users/${target}`);
    await page.getByRole("button", { name: "Edit assignment" }).click();
    await page.getByRole("checkbox", { name: "Beta" }).check();
    await page.getByRole("button", { name: "Save assignment" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save assignment" })
      .click();
    if (failure === "conflict")
      await expect(
        page.getByText(
          "The assignment changed. Review the latest profiles before confirming a new change.",
        ),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("heading", { name: "Permission profiles", exact: true }),
      ).toHaveCount(0);
    await expect(
      page.getByText("Readable member", { exact: true }),
    ).toBeVisible();
    expect(writes).toHaveLength(1);
    await expect(page.getByText("Private backend detail")).toHaveCount(0);
  });
test("Arabic RTL keyboard, a11y and responsive widths", async ({ page }) => {
  await platform(page);
  await page.goto(`/platform/users/${target}?lang=ar`);
  // Locale is selected through the established shell switcher.
  await page
    .getByRole("combobox", { name: "Interface language" })
    .selectOption("ar");
  await page.getByRole("button", { name: "تعديل التعيين" }).click();
  await page.getByRole("checkbox", { name: "Beta" }).check();
  await page.getByRole("button", { name: "حفظ التعيين" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { level: 3 }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "إلغاء" }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "حفظ التعيين" })).toBeFocused();
});
