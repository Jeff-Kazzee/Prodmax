/**
 * T-006 e2e: create a project, put an issue in it, complete the issue, and
 * watch the materialized progress bar move. One login (suite budget).
 *
 * The project and the issue are both created inside the test rather than taken
 * from the demo seed. That buys two things: a fresh project gets a current
 * four-field progress cache, so the write path increments rather than falling
 * back to the repair path, and the run does not mutate the seeded bench on a
 * `data/prodmax.db` the suite cannot reset.
 */
import { expect, test } from "@playwright/test";

const DEMO = { email: "demo@prodmax.dev", password: "prodmax-demo" };

test("project progress follows the issue that lands in it", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-email").fill(DEMO.email);
  await page.locator("#login-password").fill(DEMO.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("navigation", { name: "Workspace sections" })).toBeVisible();

  // Create the project (R-17).
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  const projectName = `T006-e2e-${Date.now()}`;
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Project name").fill(projectName);
  await dialog.getByRole("button", { name: "Create project" }).click();

  // Creation navigates to R-18, and a fresh project reads zero from its cache.
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
  const bar = page.getByRole("progressbar", { name: "Project progress" });
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByTestId("pj-progress-label")).toHaveText("0% · 0/0 issues");
  const projectUrl = page.url();

  // Create an issue directly into the project (PJ-08).
  await page.getByRole("button", { name: "Add issues" }).first().click();
  const picker = page.getByRole("dialog", { name: "Add issues" });
  await expect(picker).toBeVisible();
  const issueTitle = `T006-e2e-issue-${Date.now()}`;
  await picker.getByLabel("New issue title").fill(issueTitle);
  const createIssue = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && /\/api\/issues(\?|$)/.test(new URL(res.url()).pathname),
  );
  await picker.getByRole("button", { name: "Create in project" }).click();
  const created = await createIssue;
  if (!created.ok()) {
    throw new Error(`create issue POST ${created.status()}: ${await created.text()}`);
  }
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(picker).toBeHidden();

  // One issue in, none complete. The counter moved, the percent has not.
  await expect(page.getByTestId("pj-progress-label")).toHaveText("0% · 0/1 issues");

  // Complete it from the issue panel, whose State control is a real select.
  await page.getByRole("link", { name: /^Issues/ }).click();
  const row = page.locator("[data-identifier]").filter({ hasText: issueTitle }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("link").first().click();
  const panel = page.getByRole("complementary", { name: "Issue details" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("State").selectOption({ label: "Done" });

  // Back to the overview: the cache the server incremented now reads 100.
  await page.goto(projectUrl);
  await expect(page.getByRole("progressbar", { name: "Project progress" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await expect(page.getByTestId("pj-progress-label")).toHaveText("100% · 1/1 issues");
});
