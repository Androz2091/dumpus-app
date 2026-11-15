import { execFileSync } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import initSqlJs, { type Database } from "sql.js";
import { md5 } from "./fixtures/dataset";
import { buildPackageZip } from "./fixtures/package-zip";
import { closeRecap, expect, stat, test } from "./fixtures/test";

/** The inverse of `encryptPackageBlob()` in `src/utils/crypto.ts`. */
function decrypt(body: Buffer, iv: string, key: string) {
  const decipher = createDecipheriv(
    "aes-256-cbc",
    createHash("sha256").update(key).digest(),
    Buffer.from(iv, "hex"),
  );
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/**
 * A database's statements and rows, each value as SQLite quotes it, so that
 * the integer 1, the real 1.0 and the text '1' all differ.
 */
function dump(db: Database) {
  const [master] = db.exec(
    "SELECT type, name, sql FROM sqlite_master ORDER BY type, name",
  );
  const tables: Record<string, string[]> = {};
  for (const [type, name] of master.values) {
    if (type !== "table") continue;
    const [columns] = db.exec(`SELECT name FROM pragma_table_info('${name}')`);
    const quoted = columns.values.map(([column]) => `quote("${column}")`);
    const [rows] = db.exec(
      `SELECT ${quoted.join(" || ',' || ")} FROM "${name}"`,
    );
    tables[String(name)] = (rows?.values ?? []).map(String).sort();
  }
  return { schema: master.values, tables };
}

test("a package read from its file opens, and its copy is the database the server writes", async ({
  page,
  api,
}, testInfo) => {
  const zip = testInfo.outputPath("package.zip");
  fs.writeFileSync(zip, buildPackageZip());

  await page.goto("/onboarding/access/file/");
  await page.locator('input[type="file"]').setInputFiles(zip);
  await expect(page).toHaveURL(/\/overview\/$/, { timeout: 30_000 });
  await closeRecap(page);
  // The totals of the package in `fixtures/package-zip.ts`.
  await expect(stat(page, "messages sent")).toHaveText("6");
  await expect(stat(page, "joined servers")).toHaveText("2");
  await expect(stat(page, "known users")).toHaveText("2");
  await expect(stat(page, "Discord app started")).toHaveText("3");

  // The copy the app registered, which only its key opens.
  expect(api.uploads).toHaveLength(1);
  const [{ packageId, iv, body, key, version }] = api.uploads;
  expect(key && md5(key)).toBe(packageId);
  const SQL = await initSqlJs();
  const device = new SQL.Database(gunzipSync(decrypt(body, iv, key!)));
  const [packageData] = device.exec("SELECT package_version FROM package_data");
  expect(packageData.values).toEqual([[version]]);

  // CI builds the server's processor; elsewhere, `DUMPUS_PROCESSOR` names one.
  const processor = process.env.DUMPUS_PROCESSOR;
  if (!processor) {
    expect(process.env.CI, "DUMPUS_PROCESSOR, in CI").toBeFalsy();
    testInfo.annotations.push({
      type: "note",
      description:
        "Not compared with the server's database: no DUMPUS_PROCESSOR.",
    });
    return;
  }
  const output = testInfo.outputPath("server.sqlite");
  execFileSync(processor, [
    "--input",
    zip,
    "--output",
    output,
    "--package-id",
    packageId,
  ]);
  const server = new SQL.Database(fs.readFileSync(output));
  expect(dump(device)).toEqual(dump(server));
});
