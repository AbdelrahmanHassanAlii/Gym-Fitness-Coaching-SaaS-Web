import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const actor = "68e7a9d10d56fd2b98d4a100",
  workspace = "68e7a9d10d56fd2b98d4a101",
  sessionId = "68e7a9d10d56fd2b98d4a102";
interface Options {
  permissions?: string[];
  uncertain?: boolean;
  contextError?: string;
  startError?: string;
  conflict?: boolean;
  expiresMs?: number;
  authorityMs?: number;
  uncertainEnd?: boolean;
}
async function backend(page: Page, options: Options = {}) {
  const permissions = options.permissions ?? [
    "support.sessions.start",
    "support.sessions.read",
    "support.sessions.end_own",
    "support.sessions.revoke",
  ];
  const startTime = new Date(Date.now() - 1000).toISOString(),
    expiresAt = new Date(
      Date.now() + (options.expiresMs ?? 3_600_000),
    ).toISOString();
  const validUntil = options.authorityMs
    ? new Date(Date.now() + options.authorityMs).toISOString()
    : null;
  let version = 2,
    status = "ACTIVE",
    contextError = options.contextError ?? "";
  const calls: {
    path: string;
    method: string;
    selector?: string;
    key?: string;
    body?: unknown;
  }[] = [];
  const dto = () => ({
    id: sessionId,
    requestId: sessionId,
    policyId: sessionId,
    realActorPlatformMembershipId: actor,
    targetType: "GYM",
    targetWorkspaceId: workspace,
    contextType: "WORKSPACE_SUPPORT",
    sessionType: "READ_ONLY",
    startedAt: startTime,
    expiresAt,
    status,
    version,
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.replace("/api/v1", "");
    const call = {
      path,
      method: request.method(),
      selector: request.headers()["x-support-session-id"],
      key: request.headers()["idempotency-key"],
      body: request.postData() ? request.postDataJSON() : undefined,
    };
    calls.push(call);
    if (path !== "/me/support-context") expect(call.selector).toBeUndefined();
    let json: unknown,
      http = 200;
    if (path === "/auth/refresh")
      json = {
        data: {
          accessToken: "browser-support-token",
          restrictedUntilVerified: false,
          user: {
            id: actor,
            firstName: "Support",
            lastName: "Operator",
            emailVerified: true,
            phoneVerified: false,
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
            accessVersion: 7,
            updatedAt: startTime,
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
          validUntil,
          decisions: request
            .postDataJSON()
            .requests.map((r: { permission: string }) => ({
              ...r,
              allowed: permissions.includes(r.permission),
              effect: permissions.includes(r.permission) ? "ALLOW" : "DENY",
            })),
        },
      };
    else if (path === "/platform/support/access-requests") {
      if (
        options.uncertain &&
        calls.filter((c) => c.path === path).length === 1
      ) {
        await route.abort("failed");
        return;
      }
      if (options.startError) {
        http = 403;
        json = {
          error: { code: options.startError, message: "Private detail" },
        };
      } else json = { data: { decision: "APPROVED", supportSession: dto() } };
    } else if (path === "/me/support-context") {
      expect(call.selector).toBe(sessionId);
      if (contextError) {
        http = 403;
        json = { error: { code: contextError, message: "Private detail" } };
      } else
        json = {
          data: {
            supportSession: {
              id: sessionId,
              status: "ACTIVE",
              version,
              contextType: "WORKSPACE_SUPPORT",
              sessionType: "READ_ONLY",
              startedAt: startTime,
              expiresAt,
              policyRevision: 4,
            },
            workspace: {
              id: workspace,
              name: "Support Gym",
              type: "GYM",
              status: "ACTIVE",
              timezone: "Africa/Cairo",
              defaultLanguage: "en",
            },
          },
        };
    } else if (path.endsWith("/end") || path.endsWith("/revoke")) {
      expect(call.body).toEqual({ expectedVersion: version });
      expect(call.key).toBeUndefined();
      if (options.conflict && path.endsWith("/revoke")) {
        version = 5;
        http = 409;
        json = {
          error: {
            code: "SUPPORT_SESSION_VERSION_CONFLICT",
            message: "Private detail",
          },
        };
      } else {
        version++;
        status = path.endsWith("/end") ? "ENDED" : "REVOKED";
        if (options.uncertainEnd && path.endsWith("/end")) {
          await route.abort("failed");
          return;
        }
        json = { data: dto() };
      }
    } else if (path === `/platform/support/sessions/${sessionId}`)
      json = { data: dto() };
    else if (
      path === `/platform/workspaces/${workspace}` &&
      permissions.includes("platform_workspaces.manage")
    )
      json = {
        id: workspace,
        name: "Support Gym",
        type: "GYM",
        status: "ACTIVE",
        timezone: "Africa/Cairo",
        defaultLanguage: "en",
        createdAt: startTime,
      };
    else throw new Error("Unexpected support test API route");
    await route.fulfill({
      status: http,
      json,
      headers: { "Cache-Control": "private, no-store" },
    });
  });
  return {
    calls,
    setRuntimeError: (code: string) => {
      contextError = code;
    },
  };
}
async function start(page: Page, ar = false) {
  await page
    .getByLabel(ar ? "معرّف مساحة العمل" : "Workspace ID", { exact: true })
    .fill(workspace);
  await page
    .getByLabel(ar ? "سبب الوصول" : "Reason", { exact: true })
    .fill(ar ? "التحقق من العرض" : "Investigate support view");
  await page
    .getByRole("button", {
      name: ar ? "بدء جلسة دعم" : "Start Support",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(ar ? "للقراءة فقط" : "Read Only");
  await dialog
    .getByRole("button", { name: ar ? "تأكيد" : "Confirm", exact: true })
    .click();
}
test("read-only entry, safe selector routing, end cleanup and return", async ({
  page,
}) => {
  const mock = await backend(page);
  await page.goto("/platform/support");
  await start(page);
  await expect(page).toHaveURL(/\/app\/support$/);
  await expect(
    page.getByRole("region", { name: "Support Access" }),
  ).toContainText("Read Only");
  await expect(page.getByText("Support Gym", { exact: true })).toBeVisible();
  expect(mock.calls.filter((c) => c.path.includes("workspaces"))).toHaveLength(
    0,
  );
  const payload = mock.calls.find(
    (c) => c.path === "/platform/support/access-requests",
  )!.body;
  expect(payload).toMatchObject({
    targetWorkspaceId: workspace,
    targetType: "GYM",
    contextType: "WORKSPACE_SUPPORT",
    sessionType: "READ_ONLY",
    requestedDurationMinutes: 30,
    requestedSensitiveAccess: false,
    requestedSensitiveFileDownload: false,
  });
  expect(
    await page.evaluate(() =>
      JSON.stringify([localStorage, sessionStorage, location.href]),
    ),
  ).not.toContain(sessionId);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "End Support", exact: true }).click();
  await expect(page).toHaveURL(/\/platform\/support$/);
  await expect(
    page.getByRole("region", { name: "Support Access" }),
  ).toHaveCount(0);
  await expect(page.getByText("Support Gym", { exact: true })).toHaveCount(0);
  expect(mock.calls.filter((c) => c.path.endsWith("/end"))).toHaveLength(1);
});
test("uncertain start requires explicit same-key/body retry", async ({
  page,
}) => {
  const mock = await backend(page, { uncertain: true });
  await page.goto("/platform/support");
  await start(page);
  const retry = page.getByRole("button", {
    name: "Retry the same start request",
  });
  await expect(retry).toBeVisible();
  expect(
    mock.calls.filter((c) => c.path === "/platform/support/access-requests"),
  ).toHaveLength(1);
  await retry.click();
  await expect(page).toHaveURL(/\/app\/support$/);
  const writes = mock.calls.filter(
    (c) => c.path === "/platform/support/access-requests",
  );
  expect(writes).toHaveLength(2);
  expect(writes[1].key).toBe(writes[0].key);
  expect(writes[1].body).toEqual(writes[0].body);
});
test("start policy denial has no bootstrap or entry", async ({ page }) => {
  const mock = await backend(page, { startError: "POLICY_DISABLED" });
  await page.goto("/platform/support");
  await start(page);
  await expect(
    page.getByText(
      "Support access was denied. Check authority and policy with an administrator.",
    ),
  ).toBeVisible();
  expect(
    mock.calls.filter((c) => c.path === "/me/support-context"),
  ).toHaveLength(0);
});
for (const code of [
  "SUPPORT_SESSION_NOT_ACTIVE",
  "SUPPORT_SESSION_EXPIRED",
  "POLICY_DISABLED",
  "SUPPORT_SESSION_IP_MISMATCH",
])
  test(`acknowledgement fails closed on ${code}`, async ({ page }) => {
    const mock = await backend(page, { contextError: code });
    await page.goto("/platform/support");
    await start(page);
    await expect(
      page.getByText(
        "Support access could not be validated. Review the current state before trying again.",
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/platform\/support$/);
    expect(
      mock.calls.filter((c) => c.path === "/me/support-context"),
    ).toHaveLength(1);
    await expect(
      page.getByRole("region", { name: "Support Access" }),
    ).toHaveCount(0);
  });
test("current runtime failure retires without native fallback", async ({
  page,
}) => {
  const mock = await backend(page);
  await page.goto("/platform/support");
  await start(page);
  await expect(page).toHaveURL(/\/app\/support$/);
  mock.setRuntimeError("SUPPORT_SESSION_NOT_ACTIVE");
  await page.getByRole("button", { name: "Validate current context" }).click();
  await expect(page).toHaveURL(/\/platform\/support$/);
  await expect(page.getByText("Support Gym", { exact: true })).toHaveCount(0);
  expect(
    mock.calls
      .filter((c) => c.path === "/me/support-context")
      .every((c) => c.selector === sessionId),
  ).toBe(true);
});
test("administrative read denial never fetches detail", async ({ page }) => {
  const mock = await backend(page, { permissions: ["support.sessions.start"] });
  await page.goto(`/platform/support/sessions/${sessionId}`);
  await expect(
    page.getByText("Session detail requires separate session-read authority."),
  ).toBeVisible();
  expect(
    mock.calls.filter(
      (c) => c.path === `/platform/support/sessions/${sessionId}`,
    ),
  ).toHaveLength(0);
});
test("revoke confirmation and terminal state", async ({ page }) => {
  await backend(page, {
    permissions: ["support.sessions.read", "support.sessions.revoke"],
  });
  await page.goto(`/platform/support/sessions/${sessionId}`);
  await page.getByRole("button", { name: "Revoke Support Access" }).click();
  await expect(page.getByRole("dialog")).toContainText(sessionId);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke Support Access" })
    .click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revoke Support Access" }),
  ).toHaveCount(0);
});
test("revoke conflict refreshes CAS and never auto-replays", async ({
  page,
}) => {
  const mock = await backend(page, {
    conflict: true,
    permissions: ["support.sessions.read", "support.sessions.revoke"],
  });
  await page.goto(`/platform/support/sessions/${sessionId}`);
  await page.getByRole("button", { name: "Revoke Support Access" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke Support Access" })
    .click();
  await expect(page.getByText("5", { exact: true })).toBeVisible();
  await expect(page.getByText(/session changed/)).toBeVisible();
  expect(mock.calls.filter((c) => c.path.endsWith("/revoke"))).toHaveLength(1);
});
test("local expiry blocks, clears and redirects before job execution", async ({
  page,
}) => {
  await page.clock.install();
  await backend(page, { expiresMs: 30_000 });
  await page.goto("/platform/support");
  await start(page);
  await expect(page).toHaveURL(/\/app\/support$/);
  await page.clock.fastForward(30_001);
  await expect(page).toHaveURL(/\/platform\/support$/);
  await expect(page.getByText(/Support access expired/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Support Access" }),
  ).toHaveCount(0);
});
test("Platform validUntil expires independently of support expiresAt", async ({
  page,
}) => {
  await page.clock.install();
  await backend(page, { authorityMs: 30_000 });
  await page.goto("/platform/support");
  await start(page);
  await expect(page).toHaveURL(/\/app\/support$/);
  await page.clock.fastForward(30_001);
  await expect(
    page.getByRole("region", { name: "Support Access" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/platform\/support$/);
});
test("logout clears selected context and header remains absent", async ({
  page,
}) => {
  const mock = await backend(page);
  await page.goto("/platform/support");
  await start(page);
  await expect(page).toHaveURL(/\/app\/support$/);
  await page
    .getByRole("link", { name: "Return to support console", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Support Access" }),
  ).toHaveCount(0);
  expect(
    mock.calls
      .filter((c) => c.path === "/auth/logout")
      .every((c) => !c.selector),
  ).toBe(true);
});
test("Arabic, keyboard confirmation and responsive widths", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "hassan_locale", value: "ar", domain: "127.0.0.1", path: "/" },
  ]);
  await backend(page);
  await page.goto("/platform/support");
  // Locale cookie name is shared with the existing LocaleSwitcher contract.
  if ((await page.locator("html").getAttribute("lang")) !== "ar") {
    await page
      .getByRole("combobox")
      .filter({ has: page.locator('option[value="ar"]') })
      .selectOption("ar");
  }
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel("معرّف مساحة العمل", { exact: true }).fill(workspace);
  await page.getByLabel("سبب الوصول", { exact: true }).fill("التحقق من العرض");
  const trigger = page.getByRole("button", {
    name: "بدء جلسة دعم",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "تأكيد", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "إلغاء", exact: true }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await start(page, true);
  await expect(page).toHaveURL(/\/app\/support$/);
  await expect(page.getByRole("region", { name: "وصول الدعم" })).toContainText(
    "للقراءة فقط",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("workspace-specific entry uses canonical authorized metadata", async ({
  page,
}) => {
  const mock = await backend(page, {
    permissions: ["platform_workspaces.manage", "support.sessions.start"],
  });
  await page.goto(`/platform/workspaces/${workspace}/support`);
  await expect(page.getByText("Support Gym", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Workspace ID", { exact: true })).toHaveValue(
    workspace,
  );
  await expect(
    page.getByLabel("Workspace type", { exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Reason", { exact: true }).fill("Investigate view");
  await page
    .getByRole("button", { name: "Start Support", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/support$/);
  expect(
    mock.calls.filter((c) => c.path === `/platform/workspaces/${workspace}`),
  ).toHaveLength(1);
});
test("current selected revoke clears banner/data without selecting from admin URL", async ({
  page,
}) => {
  await backend(page);
  await page.goto("/platform/support");
  await start(page);
  await expect(page).toHaveURL(/\/app\/support$/);
  await page
    .getByRole("link", { name: "Return to support console", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Revoke Support Access", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke Support Access", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Support Access" }),
  ).toHaveCount(0);
  await expect(page.getByText("Support Gym", { exact: true })).toHaveCount(0);
  expect(page.url()).not.toContain(sessionId);
});
test("uncertain current end retires and reconciles, never replays", async ({
  page,
}) => {
  const mock = await backend(page, { uncertainEnd: true });
  await page.goto("/platform/support");
  await start(page);
  await expect(page).toHaveURL(/\/app\/support$/);
  await page.getByRole("button", { name: "End Support", exact: true }).click();
  await expect(page).toHaveURL(/\/platform\/support$/);
  await expect(page.getByText(/termination result is uncertain/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Support Access" }),
  ).toHaveCount(0);
  expect(mock.calls.filter((c) => c.path.endsWith("/end"))).toHaveLength(1);
  expect(
    mock.calls.filter(
      (c) => c.path === `/platform/support/sessions/${sessionId}`,
    ).length,
  ).toBeGreaterThan(0);
});
test("reload has no selected support; native navigation cannot mount under support", async ({
  page,
}) => {
  const mock = await backend(page);
  await page.goto("/platform/support");
  await start(page);
  await expect(page).toHaveURL(/\/app\/support$/);
  // Exercise an ordinary client navigation while preserving the memory-only root.
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "/app/training";
    document.body.append(link);
    history.pushState(null, "", "/app/training");
    window.dispatchEvent(new PopStateEvent("popstate"));
    link.remove();
  });
  await expect(page).toHaveURL(/\/app\/support$/);
  expect(
    mock.calls.filter(
      (c) =>
        c.path.startsWith("/training") || c.path === "/me/workspace-context",
    ),
  ).toHaveLength(0);
  await page.reload();
  await expect(page).toHaveURL(/\/platform\/support$/);
  await expect(
    page.getByRole("region", { name: "Support Access" }),
  ).toHaveCount(0);
});
