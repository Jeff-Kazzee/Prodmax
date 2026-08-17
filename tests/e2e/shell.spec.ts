/**
 * M2 app-shell e2e: auth screens (AT-001/002/003 shape), shell guard
 * (AT-007), command palette (AT-037/FM-041), theming + density
 * (AT-110/FM-085), shortcuts help and honest pending screens.
 * Login budget: the API rate-limits 10 attempts / 5 min / IP — this file
 * performs at most 6, keep it that way.
 */
import { expect, test } from "@playwright/test";

const DEMO = { email: "demo@prodmax.dev", password: "prodmax-demo" };

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#login-email").fill(DEMO.email);
  await page.locator("#login-password").fill(DEMO.password);
  await page.getByRole("button", { name: "Continue" }).click();
  // The URL flips to "/" before the shell mounts; wait for the real shell so
  // global keybindings (mounted with it) are live before any key press.
  await expect(page.getByRole("navigation", { name: "Workspace sections" })).toBeVisible();
}

test.describe.serial("app shell (M2)", () => {
  test("wrong credentials show the generic error, not a field hint (AT-002, FM-003)", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#login-email").fill(DEMO.email);
    await page.locator("#login-password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("valid login lands in the shell with landmarks (AT-002, §3.5)", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/localhost:4321\/$/);
    await expect(page.getByRole("navigation", { name: "Workspace sections" })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeAttached();
  });

  test("command palette opens with Ctrl+K, runs navigation, Esc closes (AT-037)", async ({ page }) => {
    await login(page);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await page.keyboard.type("Settings");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).not.toBeVisible();
  });

  test("theme cycles and persists; density flips html attribute (AT-110, FM-085)", async ({ page }) => {
    await login(page);
    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);

    const theme = page.getByRole("button", { name: /^Theme:/ });
    await expect(theme).toHaveAccessibleName("Theme: dark. Activate to switch to system");
    await theme.click();
    await expect(theme).toHaveAccessibleName("Theme: system. Activate to switch to light");
    expect(await page.evaluate(() => localStorage.getItem("pmx-theme"))).toBe("system");

    const density = page.getByRole("button", { name: /^Density:/ });
    await density.click();
    await expect(html).toHaveAttribute("data-density", "compact");
  });

  test("? opens searchable shortcut help; later-module routes stay honest (FM-028)", async ({ page }) => {
    await login(page);
    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(help).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).not.toBeVisible();

    await page.goto("/projects");
    await expect(page.locator("[data-screen='Projects']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  });
});
