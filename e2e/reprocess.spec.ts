import type { Page } from "@playwright/test";
import type { FakeApi } from "./fixtures/api";
import { FAKE_PACKAGE_LINK, buildMainDataset } from "./fixtures/dataset";
import { buildDatabase, packBlob } from "./fixtures/sqlite";
import { expect, loadPackage, stat, test } from "./fixtures/test";

const TITLE = "A newer version can read more from your package";

/** Ends the run with the package it makes, with a server less to tell it by. */
async function finishRun(api: FakeApi) {
  const dataset = buildMainDataset();
  const [gone, ...guilds] = dataset.tables.guilds;
  dataset.tables.guilds = guilds;
  // Its joins too, or it would count as a server the account left.
  dataset.tables.activity = dataset.tables.activity.filter(
    (row) =>
      row.event_name !== "guild_joined" ||
      row.associated_guild_id !== gone.guild_id,
  );
  dataset.tables.package_data = dataset.tables.package_data.map((row) => ({
    ...row,
    package_version: "0.4.0",
  }));
  api.finishRun(
    dataset.packageId,
    packBlob(await buildDatabase(dataset), dataset.upn),
  );
}

/** Reloads, as an app start, until the banner has had its answer. */
async function restartApp(page: Page) {
  const answered = page.waitForResponse(/\/status$/);
  await page.reload();
  await answered;
  await expect(stat(page, "messages sent")).toHaveText("109,734");
  // Long enough for that answer to reach the page, or a hidden banner says nothing.
  await page.waitForTimeout(250);
}

function savedPackages(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("config")!).state.config.packages as {
        package_version: string;
      }[],
  );
}

test("the banner reads the package again and replaces it in place", async ({
  page,
  api,
}) => {
  const nav = (name: string) =>
    page
      .getByRole("link", { name, exact: true })
      .filter({ visible: true })
      .click();

  api.currentVersion = "0.4.0";
  await loadPackage(page);
  await expect(page.getByText(TITLE)).toBeVisible();

  // Opening the overview again doesn't ask again.
  const checks = api.statusChecks;
  await nav("Stats");
  await expect(page).toHaveURL(/\/stats\/$/);
  await nav("Overview");
  await expect(page.getByText(TITLE)).toBeVisible();
  expect(api.statusChecks).toBe(checks);

  // In the session that imported the package, with its old download cached.
  api.runStep = "ANALYZING";
  await page.getByRole("button", { name: "Update my stats" }).click();
  await expect(page.getByText("Analyzing")).toBeVisible();
  expect(api.reprocessLinks).toEqual([FAKE_PACKAGE_LINK]);

  await finishRun(api);
  await expect(page).toHaveURL(/\/overview\/$/);
  await expect(stat(page, "joined servers")).toHaveText("7");
  await expect(page.getByText(TITLE)).toBeHidden();
  expect((await savedPackages(page)).map((pkg) => pkg.package_version)).toEqual(
    ["0.4.0"],
  );

  await page.reload();
  await expect(stat(page, "joined servers")).toHaveText("7");
  await expect(page.getByText(TITLE)).toBeHidden();

  // A 0.4.0 database lists its groups with the DMs, each with a page.
  await nav("Top");
  await page
    .getByRole("link", { name: /Brindle Fox, Pixel Otter and 3 others/ })
    .filter({ visible: true })
    .click();
  await expect(stat(page, "total messages sent")).toHaveText("4,929");
});

test("a reload during the run stays on the run", async ({ page, api }) => {
  api.currentVersion = "0.4.0";
  await loadPackage(page);

  api.runStep = "ANALYZING";
  await page.getByRole("button", { name: "Update my stats" }).click();
  await expect(page.getByText("Analyzing")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Analyzing")).toBeVisible();

  await finishRun(api);
  await expect(page).toHaveURL(/\/overview\/$/);
  await expect(stat(page, "joined servers")).toHaveText("7");
});

test("an expired link says what to do and leaves the stats alone", async ({
  page,
  api,
}) => {
  api.currentVersion = "0.4.0";
  api.reprocessError = "EXPIRED_LINK";
  await loadPackage(page);

  await page.getByRole("button", { name: "Update my stats" }).click();
  await expect(page.getByText(/request a new export/)).toBeVisible();

  await page.getByRole("button", { name: "Back to my stats" }).click();
  await expect(page).toHaveURL(/\/overview\/$/);
  await expect(stat(page, "joined servers")).toHaveText("8");
  // The link won't work again, so it isn't offered again.
  await expect(page.getByText(TITLE)).toBeHidden();
});

test("a patch doesn't prompt, and a dismissed version stays dismissed", async ({
  page,
  api,
}) => {
  // The fixture's database is from 0.1.0.
  api.currentVersion = "0.1.5";
  await loadPackage(page);
  await restartApp(page);
  await expect(page.getByText(TITLE)).toBeHidden();

  // Asked once per app start.
  const checks = api.statusChecks;
  api.currentVersion = "0.4.0";
  await restartApp(page);
  expect(api.statusChecks).toBe(checks + 1);
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText(TITLE)).toBeHidden();

  await restartApp(page);
  await expect(page.getByText(TITLE)).toBeHidden();

  // A patch doesn't bring it back.
  api.currentVersion = "0.4.1";
  await restartApp(page);
  await expect(page.getByText(TITLE)).toBeHidden();

  // A newer version offers it again.
  api.currentVersion = "0.5.0";
  await restartApp(page);
  await expect(page.getByText(TITLE)).toBeVisible();
});
