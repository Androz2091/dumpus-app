import { expect, test } from "./fixtures/test";

// Safari lists only the region tag, as Playwright's browsers do.
test.use({ locale: "fr-FR" });

test("a browser listing only fr-FR gets French", async ({ page }) => {
  await page.goto("/onboarding/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});
