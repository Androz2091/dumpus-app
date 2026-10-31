import { FAKE_PACKAGE_LINK } from "./fixtures/dataset";
import { expect, test } from "./fixtures/test";

test("a package loads on a page a browser translated", async ({ page }) => {
  await page.goto("/onboarding/access/link/");
  // Google Translate puts each text node it translates in <font> elements
  // of its own. React keeps the original node, now out of the page, and
  // throws if it has to remove it.
  await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const texts: Text[] = [];
    while (walker.nextNode()) texts.push(walker.currentNode as Text);
    for (const text of texts) {
      if (!text.data.trim() || text.parentElement?.closest("script, style")) {
        continue;
      }
      const font = document.createElement("font");
      font.append(document.createElement("font"));
      font.firstChild!.textContent = text.data;
      text.replaceWith(font);
    }
  });

  await page.getByLabel("Discord link").fill(FAKE_PACKAGE_LINK);
  await page.getByRole("button", { name: "Explore!" }).click();
  await expect(page).toHaveURL(/\/overview\/$/);
});
