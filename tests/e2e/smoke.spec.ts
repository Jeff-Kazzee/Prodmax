import { expect, test } from "@playwright/test";

test("island hydrates and the shell gate redirects anon users (AT-007)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  // Hydration proof: the login form responds to input.
  const email = page.locator("#login-email");
  await expect(email).toBeVisible();
  await email.fill("hydrate@prodmax.dev");
  await expect(email).toHaveValue("hydrate@prodmax.dev");
});
