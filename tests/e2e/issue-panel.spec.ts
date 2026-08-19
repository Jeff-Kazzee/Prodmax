/**
 * T-004 e2e: create via C, open the panel from a row, edit priority, Esc
 * restores row focus. One login (suite budget).
 */
import { expect, test } from "@playwright/test";

const DEMO = { email: "demo@prodmax.dev", password: "prodmax-demo" };

test("create issue, open panel, edit priority, Esc restores focus", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-email").fill(DEMO.email);
  await page.locator("#login-password").fill(DEMO.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("navigation", { name: "Workspace sections" })).toBeVisible();

  await page.goto("/issues");
  await expect(page.getByRole("heading", { name: "All issues" })).toBeVisible();
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "New issue" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Team")).not.toHaveValue("");
  const titleText = `T004-e2e-create-${Date.now()}`;
  await dialog.getByLabel("Issue title").fill(titleText);
  await expect(dialog.getByRole("button", { name: "Create issue" })).toBeEnabled();
  const createPost = page.waitForResponse(
    (res) => res.request().method() === "POST" && /\/api\/issues(\?|$)/.test(new URL(res.url()).pathname),
  );
  await dialog.getByRole("button", { name: "Create issue" }).click();
  const created = await createPost;
  if (!created.ok()) {
    throw new Error(`create POST ${created.status()}: ${await created.text()}`);
  }
  await expect(dialog).toBeHidden();
  const row = page.locator("[data-identifier]").filter({ hasText: titleText }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("link").first().click();
  const panel = page.getByRole("complementary", { name: "Issue details" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Priority").selectOption("1");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(row.locator("a").first()).toBeFocused();
});
