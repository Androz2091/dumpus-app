import { FAKE_PACKAGE_LINK } from "./fixtures/dataset";
import { expect, stat, test } from "./fixtures/test";

test("onboarding, from the welcome screen to the overview", async ({
  page,
  api,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding\/$/);
  for (const name of [
    "Let's go",
    "Got it!",
    "Awesome!",
    "Let's get my package!",
    "Got it!",
  ]) {
    await page.getByRole("link", { name, exact: true }).click();
  }
  await expect(page).toHaveURL(/\/onboarding\/access\/$/);
  await page.getByRole("link", { name: /Method 1/ }).click();

  api.step = "LOCKED";
  await page.getByLabel("Discord link").fill(FAKE_PACKAGE_LINK);
  await page.getByRole("button", { name: "Explore!" }).click();
  await expect(
    page.getByRole("heading", { name: "You're in the queue!" }),
  ).toBeVisible();

  api.step = "PROCESSED";
  await expect(page).toHaveURL(/\/overview\/$/);
  // The lifetime totals of the package in `fixtures/dataset.ts`.
  await expect(stat(page, "messages sent")).toHaveText("109,734");
  await expect(stat(page, "joined servers")).toHaveText("8");
  await expect(stat(page, "received calls")).toHaveText("71");
  await expect(stat(page, "top hour")).toHaveText("10 PM");
  await expect(stat(page, "known users")).toHaveText("28");
  await expect(stat(page, "Discord app started")).toHaveText("4,802");
});

test("a failed download says which step failed, and reports it without the key", async ({
  page,
  api,
}) => {
  api.downloadStatus = 403;
  await page.goto("/onboarding/access/link/");
  await page.getByLabel("Discord link").fill(FAKE_PACKAGE_LINK);
  await page.getByRole("button", { name: "Explore!" }).click();

  // Past the app's retries, which take 7 seconds.
  await expect(page.getByText("download-403")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("An unknown error occurred.")).toBeVisible();
  await expect.poll(() => api.clientErrors).toHaveLength(1);
  expect(api.clientErrors[0]).toMatchObject({
    step: "download",
    status: 403,
    path: "/onboarding/loading/",
  });
  const upn = new URL(FAKE_PACKAGE_LINK).searchParams.get("upn")!;
  expect(JSON.stringify(api.clientErrors)).not.toContain(upn);
});

test("a download that gets no answer reports what the device can still reach", async ({
  page,
  api,
}) => {
  api.downloadBlocked = true;
  await page.goto("/onboarding/access/link/");
  await page.getByLabel("Discord link").fill(FAKE_PACKAGE_LINK);
  await page.getByRole("button", { name: "Explore!" }).click();

  await expect(page.getByText("download-TypeError")).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(() => api.clientErrors).toHaveLength(1);
  const details = String(api.clientErrors[0].details);
  expect(details).toMatch(/link=TypeError:\d+ms/);
  expect(details).toMatch(/s3-region=opaque:0:\d+ms/);
  expect(details).toMatch(/s3-us=opaque:0:\d+ms/);
  expect(details).toMatch(/ec2=opaque:0:\d+ms/);
  expect(details).toMatch(/api=cors:200:\d+ms/);
  const upn = new URL(FAKE_PACKAGE_LINK).searchParams.get("upn")!;
  expect(JSON.stringify(api.clientErrors)).not.toContain(upn);
});
