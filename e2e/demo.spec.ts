import { expect, loadPackage, stat, test } from "./fixtures/test";

test("the demo, from the access page and back", async ({ page }) => {
  await page.goto("/onboarding/access/");
  await page.getByRole("link", { name: /No package yet/ }).click();

  await expect(page).toHaveURL(/\/overview\/$/);
  // `.first()`: the share image renders the name again, off-screen.
  await expect(page.getByText("Wumpus", { exact: true }).first()).toBeVisible();
  // The lifetime total of the demo in `fixtures/dataset.ts`.
  await expect(stat(page, "messages sent")).toHaveText("42,393");

  await page
    .getByRole("button", { name: "Exit demo and get started!" })
    .click();
  await expect(page).toHaveURL(/\/onboarding\/access\/$/);
});

test("exiting the demo opens the package that is left", async ({ page }) => {
  await loadPackage(page);
  await page.goto("/settings/");
  await page.getByRole("link", { name: "Add a new package" }).click();
  await page.getByRole("link", { name: /No package yet/ }).click();
  await expect(stat(page, "messages sent")).toHaveText("42,393");

  await page
    .getByRole("button", { name: "Exit demo and get started!" })
    .click();
  // The lifetime total of the package `loadPackage` opens.
  await expect(stat(page, "messages sent")).toHaveText("109,734");
});
