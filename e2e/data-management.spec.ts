import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const actor = "1234567890abcdef12345670",
  workspace = "1234567890abcdef12345671",
  deletionId = "1234567890abcdef12345672",
  exportId = "1234567890abcdef12345673";
interface Options {
  native?: boolean;
  permissions?: string[];
  exportStatus?: string;
  uncertainCreate?: boolean;
  uncertainApprove?: boolean;
  conflict?: boolean;
  deletionStatus?: string;
  expiryMs?: number;
  authorityState?: { version: number; permissions: string[] };
}
async function backend(page: Page, options: Options = {}) {
  const permissions = options.permissions ?? [
    "deletion.read",
    "deletion.approve",
    "deletion.postpone",
    "deletion.cancel",
    "exports.workspace.read",
    "exports.workspace.create",
    "exports.workspace.download",
  ];
  const at = new Date().toISOString(),
    expiresAt = new Date(
      Date.now() + (options.expiryMs ?? 3600000),
    ).toISOString();
  let version = 0,
    deletionStatus = options.deletionStatus ?? "PENDING_APPROVAL",
    created = false,
    exportStatus = options.exportStatus ?? "READY";
  const calls: {
    path: string;
    method: string;
    key?: string;
    body?: Record<string, unknown>;
    support?: string;
  }[] = [];
  const deletion = () => ({
    id: deletionId,
    workspaceId: workspace,
    subscriptionId: workspace,
    status: deletionStatus,
    eligibilityBasis: { expiredAt: at, eligibilityAt: at },
    version,
    createdAt: at,
    updatedAt: at,
  });
  const exported = () => ({
    id: exportId,
    workspaceId: workspace,
    requestedByUserId: actor,
    status: exportStatus,
    requestedAt: at,
    ...(exportStatus === "READY" ? { expiresAt, completedAt: at } : {}),
    format: "ZIP_JSON_V1",
    manifestVersion: 1,
    version: 1,
  });
  await page.route("**/api/v1/**", async (route) => {
    const r = route.request(),
      url = new URL(r.url()),
      path = url.pathname.replace("/api/v1", "");
    const authorityVersion = options.authorityState?.version ?? 1,
      allowedPermissions = options.authorityState?.permissions ?? permissions;
    const call = {
      path,
      method: r.method(),
      key: r.headers()["idempotency-key"],
      support: r.headers()["x-support-session-id"],
      body: r.postData() ? r.postDataJSON() : undefined,
    };
    calls.push(call);
    expect(call.support).toBeUndefined();
    let json: unknown,
      status = 200;
    if (path === "/auth/refresh")
      json = {
        data: {
          accessToken: "native-test-token",
          restrictedUntilVerified: false,
          user: {
            id: actor,
            firstName: "Data",
            lastName: "Operator",
            emailVerified: true,
            phoneVerified: true,
          },
        },
      };
    else if (path === "/auth/logout") {
      await route.fulfill({ status: 204 });
      return;
    } else if (path === "/me/platform-context")
      json = {
        data: {
          context: "PLATFORM",
          accessContext: "USER",
          membership: {
            id: actor,
            status: "ACTIVE",
            accessVersion: authorityVersion,
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
          accessVersion: authorityVersion,
          validUntil: null,
          decisions: call.body!.requests.map(
            (request: { permission: string }) => ({
              ...request,
              allowed: allowedPermissions.includes(request.permission),
              effect: allowedPermissions.includes(request.permission)
                ? "ALLOW"
                : "DENY",
            }),
          ),
        },
      };
    else if (path === "/me/workspaces")
      json = {
        data: options.native
          ? [
              {
                workspace: {
                  id: workspace,
                  ownerUserId: actor,
                  name: "Native Gym",
                  type: "GYM",
                  status: "ACTIVE",
                  timezone: "Africa/Cairo",
                  defaultLanguage: "en",
                },
                membership: {
                  id: actor,
                  workspaceId: workspace,
                  userId: actor,
                  roles: ["GYM_MANAGER"],
                  status: "ACTIVE",
                  permissionProfileIds: [],
                  accessVersion: 1,
                  joinedAt: at,
                  engagementPeriods: [{ startedAt: at }],
                },
              },
            ]
          : [],
      };
    else if (path.endsWith("/me/effective-access/decisions"))
      json = {
        data: {
          workspaceId: workspace,
          membershipId: actor,
          accessVersion: 1,
          context: "USER",
          decisions: call.body!.requests.map(
            (request: { permission: string }) => ({
              request,
              allowed: permissions.includes(request.permission),
              effect: permissions.includes(request.permission)
                ? "ALLOW"
                : "DENY",
            }),
          ),
        },
      };
    else if (path === "/platform/workspace-deletions")
      json = {
        items: url.searchParams.has("after") ? [] : [deletion()],
        ...(url.searchParams.has("after") ? {} : { nextCursor: deletionId }),
      };
    else if (path === `/platform/workspace-deletions/${deletionId}`)
      json = { deletion: deletion() };
    else if (path.startsWith(`/platform/workspace-deletions/${deletionId}/`)) {
      if (
        options.authorityState &&
        !allowedPermissions.includes(`deletion.${path.split("/").at(-1)}`)
      ) {
        await route.fulfill({
          status: 403,
          json: {
            error: { code: "PERMISSION_DENIED", message: "Permission denied" },
          },
        });
        return;
      }
      if (
        options.uncertainApprove &&
        path.endsWith("approve") &&
        calls.filter((c) => c.path === path).length === 1
      ) {
        await route.abort("failed");
        return;
      }
      if (options.conflict) {
        version++;
        status = 409;
        json = {
          error: {
            code: "WORKSPACE_DELETION_VERSION_CONFLICT",
            message: "private internals",
          },
        };
      } else {
        expect(call.body!.expectedVersion).toBe(version);
        expect(call.body!.reason).toBeTruthy();
        version++;
        deletionStatus = path.endsWith("approve")
          ? "APPROVED"
          : path.endsWith("postpone")
            ? "POSTPONED"
            : "CANCELLED";
        json = path.endsWith("approve")
          ? { data: { deletion: deletion() } }
          : { deletion: deletion() };
      }
    } else if (
      path === `/workspaces/${workspace}/exports` &&
      r.method() === "POST"
    ) {
      if (
        options.uncertainCreate &&
        calls.filter((c) => c.path === path && c.method === "POST").length === 1
      ) {
        await route.abort("failed");
        return;
      }
      created = true;
      exportStatus = "PENDING";
      json = { data: { export: exported() } };
    } else if (path === `/workspaces/${workspace}/exports`) {
      if (options.expiryMs && Date.now() >= Date.parse(expiresAt))
        exportStatus = "EXPIRED";
      json = {
        data:
          options.uncertainCreate && !created
            ? []
            : url.searchParams.has("cursor")
              ? []
              : [exported()],
        meta: {
          hasMore: false,
          nextCursor: url.searchParams.has("cursor") ? null : "older",
        },
      };
    } else if (path.endsWith(`/exports/${exportId}`))
      json = { export: exported() };
    else if (path.endsWith("/download-url"))
      json = {
        data: {
          url: "https://storage.example.test/archive?signed=private",
          expiresAt,
        },
      };
    else {
      status = 404;
      json = { error: { code: "NOT_FOUND", message: "unmocked endpoint" } };
    }
    await route.fulfill({ status, json });
  });
  return calls;
}
test("Platform queue/detail, independently gated navigation and typed approval", async ({
  page,
}) => {
  const calls = await backend(page);
  await page.goto("/platform/data-management");
  await expect(
    page.getByRole("heading", { name: "Data Management" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Data Management" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View details" }).click();
  await page.getByRole("button", { name: "Approve Deletion" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Complete the required fields",
  );
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Reviewed the eligibility basis");
  await page
    .getByLabel("Type the exact workspace ID to confirm")
    .fill(workspace);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Approved", exact: true }),
  ).toBeVisible();
  expect(calls.filter((c) => c.path.endsWith("/approve"))).toHaveLength(1);
  expect(calls.find((c) => c.path.endsWith("/approve"))!.key).toBeTruthy();
});
test("a deletion write grant does not authorize queue reads or navigation", async ({
  page,
}) => {
  const calls = await backend(page, { permissions: ["deletion.approve"] });
  await page.goto("/platform/data-management");
  await expect(
    page.getByText("You do not have permission for this operation."),
  ).toBeVisible();
  expect(calls.some((c) => c.path === "/platform/workspace-deletions")).toBe(
    false,
  );
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Data Management" }),
  ).toHaveCount(0);
});
test("real PlatformShell context/accessVersion rediscovery retires deletion write controls", async ({
  page,
}) => {
  const authorityState = {
    version: 1,
    permissions: [
      "deletion.read",
      "deletion.approve",
      "deletion.postpone",
      "deletion.cancel",
    ],
  };
  const calls = await backend(page, { authorityState });
  await page.goto(`/platform/data-management/deletions/${deletionId}`);
  await expect(
    page.getByRole("button", { name: "Approve Deletion" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve Deletion" }).click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Reviewed before authority changed");
  await page
    .getByLabel("Type the exact workspace ID to confirm")
    .fill(workspace);
  authorityState.version = 2;
  authorityState.permissions = ["deletion.read"];
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect
    .poll(() =>
      calls.some(
        (c) =>
          c.path === "/platform/me/effective-access/decisions" &&
          c.body?.expectedAccessVersion === 2,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("heading", { name: "Pending approval", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve Deletion" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Postpone Review" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cancel Request" }),
  ).toHaveCount(0);
});
for (const action of ["postpone", "cancel"] as const)
  test(`${action} uses fresh version and required reason without an idempotency key`, async ({
    page,
  }) => {
    const calls = await backend(page);
    await page.goto(`/platform/data-management/deletions/${deletionId}`);
    await page
      .getByRole("button", {
        name: action === "postpone" ? "Postpone Review" : "Cancel Request",
      })
      .click();
    await page.getByLabel("Reason", { exact: true }).fill("Reviewed request");
    if (action === "postpone")
      await page
        .getByLabel("Review After", { exact: true })
        .fill("2099-01-01T12:00");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(() => calls.filter((c) => c.path.endsWith(`/${action}`)).length)
      .toBe(1);
    expect(
      calls.find((c) => c.path.endsWith(`/${action}`))!.key,
    ).toBeUndefined();
  });
test("approval uncertainty retains exact request, reconciles, and requires explicit replay", async ({
  page,
}) => {
  const calls = await backend(page, { uncertainApprove: true });
  await page.goto(`/platform/data-management/deletions/${deletionId}`);
  await page.getByRole("button", { name: "Approve Deletion" }).click();
  await page.getByLabel("Reason", { exact: true }).fill("Reviewed");
  await page
    .getByLabel("Type the exact workspace ID to confirm")
    .fill(workspace);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Replay the same confirmed request" }),
  ).toBeVisible();
  expect(calls.filter((c) => c.path.endsWith("/approve"))).toHaveLength(1);
  await page
    .getByRole("button", { name: "Replay the same confirmed request" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Approved", exact: true }),
  ).toBeVisible();
  const posts = calls.filter((c) => c.path.endsWith("/approve"));
  expect(posts[1].key).toBe(posts[0].key);
  expect(posts[1].body).toEqual(posts[0].body);
});
test("version conflict refreshes and never retries automatically", async ({
  page,
}) => {
  const calls = await backend(page, { conflict: true });
  await page.goto(`/platform/data-management/deletions/${deletionId}`);
  await page.getByRole("button", { name: "Cancel Request" }).click();
  await page.getByLabel("Reason", { exact: true }).fill("Reviewed");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page
      .locator("main")
      .getByRole("status")
      .filter({ hasText: "version has changed" }),
  ).toContainText("version has changed");
  expect(calls.filter((c) => c.path.endsWith("/cancel"))).toHaveLength(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("native exports paginate despite hasMore false and require creation confirmation", async ({
  page,
}) => {
  const calls = await backend(page, { native: true });
  await page.goto("/app/data-management");
  await expect(
    page.getByRole("heading", { name: "Data Export" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load older exports" }).click();
  await expect(
    page.getByRole("button", { name: "Load older exports" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Request Export", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Uploaded binaries are excluded",
  );
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  expect(
    calls.filter((c) => c.path.endsWith("/exports") && c.method === "POST"),
  ).toHaveLength(1);
});
test("uncertain export creation explicitly replays the same stable key", async ({
  page,
}) => {
  const calls = await backend(page, { native: true, uncertainCreate: true });
  await page.goto("/app/data-management");
  await page
    .getByRole("button", { name: "Request Export", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page
    .getByRole("button", { name: "Replay the same confirmed request" })
    .click();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  const posts = calls.filter(
    (c) => c.path.endsWith("/exports") && c.method === "POST",
  );
  expect(posts).toHaveLength(2);
  expect(posts[1].key).toBe(posts[0].key);
});
test("download click hands off without API headers, referrer, persisted secrets", async ({
  page,
  context,
}) => {
  const calls = await backend(page, { native: true });
  let storageRequests = 0;
  await context.route("https://storage.example.test/**", async (route) => {
    storageRequests++;
    const headers = route.request().headers();
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-support-session-id"]).toBeUndefined();
    expect(headers.referer).toBeUndefined();
    await route.fulfill({ body: "archive" });
  });
  await page.goto("/app/data-management");
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeVisible();
  expect(calls.some((c) => c.path.endsWith("/download-url"))).toBe(false);
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect.poll(() => storageRequests).toBe(1);
  expect(
    await page.evaluate(() => JSON.stringify([localStorage, sessionStorage])),
  ).not.toContain("signed=private");
  await expect(page.locator("body")).not.toContainText("signed=private");
});
test("Platform membership cannot substitute for native workspace membership", async ({
  page,
}) => {
  const calls = await backend(page, { native: false });
  await page.goto("/app/data-management");
  await expect(
    page.getByRole("heading", { name: "No staff workspace available" }),
  ).toBeVisible();
  expect(calls.some((c) => c.path.includes("/exports"))).toBe(false);
});
test("independent native read permission does not enable create or download", async ({
  page,
}) => {
  await backend(page, {
    native: true,
    permissions: ["exports.workspace.read"],
  });
  await page.goto("/app/data-management");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request Export", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(0);
});
test("Arabic RTL mobile deletion detail and destructive dialog pass feature accessibility", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "hassan_locale", value: "ar", url: "http://127.0.0.1:3100" },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await backend(page);
  await page.goto(`/platform/data-management/deletions/${deletionId}`);
  await expect(
    page.getByRole("heading", { name: "طلب حذف البيانات" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "الموافقة على حذف البيانات", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include("dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
