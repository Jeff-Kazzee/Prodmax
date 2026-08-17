import { expect, test } from "@playwright/test";

test("home page renders the Prodmax island", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Prodmax" })).toBeVisible();
});

test("island hydrates: the counter button increments", async ({ page }) => {
  await page.goto("/");

  const button = page.getByRole("button", { name: /hydration check/i });
  await expect(button).toBeVisible();
  await expect(button).toHaveText("Hydration check: 0");
  await button.click();
  await expect(button).toHaveText("Hydration check: 1");
});
