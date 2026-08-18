/**
 * T-003 e2e: open issues, add a filter chip, URL reflects `?f=` (FB-06).
 * One login — keep the suite's login count at 1 (shell.spec uses 5).
 */
import { expect, test } from "@playwright/test";

const DEMO = { email: "demo@prodmax.dev", password: "prodmax-demo" };

test("filter chip writes ?f= on the issues view", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-email").fill(DEMO.email);
  await page.locator("#login-password").fill(DEMO.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("navigation", { name: "Workspace sections" })).toBeVisible();

  await page.goto("/issues");
  await expect(page.getByRole("search", { name: "Issue filters" })).toBeVisible();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByLabel("Filter value").fill("4");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page).toHaveURL(/f=/);
  const url = new URL(page.url());
  const f = url.searchParams.get("f");
  expect(f).toBeTruthy();
  const parsed = JSON.parse(f ?? "{}") as { children?: Array<{ field?: string; value?: unknown }> };
  expect(parsed.children?.[0]?.field).toBe("priority");
  expect(parsed.children?.[0]?.value).toBe(4);
});
