const fsp = require("fs/promises");
const path = require("node:path");

// Crowdin writes every string into every language's file, in English until
// someone translates it, so a language nobody has translated yet still has a
// file. Under this share of `en.json`'s strings translated, the app doesn't
// offer the language: its users get English, labelled as English.
const MIN_TRANSLATED = 0.1;

/**
 * @param str {string}
 * @returns {string}
 */
function getTemplate(str) {
  return str.replace(/(\r\n|\n|\r)/gm, "");
}

/**
 * The strings of a locale file by key, for eg. "nav.top".
 * @param value {unknown}
 * @param prefix {string}
 * @param found {Map<string, string>}
 * @returns {Map<string, string>}
 */
function strings(value, prefix = "", found = new Map()) {
  if (typeof value === "string") found.set(prefix, value);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      strings(child, prefix ? `${prefix}.${key}` : key, found);
    }
  }
  return found;
}

/**
 * @param fileName {string}
 * @returns {Promise<Map<string, string>>}
 */
async function readStrings(fileName) {
  const file = path.resolve("./locales/", fileName);
  return strings(JSON.parse(await fsp.readFile(file, "utf-8")));
}

async function main() {
  const fileNames = await fsp.readdir(path.resolve("./locales/"));
  const english = await readStrings("en.json");
  const locales = [];
  const untranslated = [];
  for (const fileName of fileNames) {
    const locale = fileName.split(".")[0];
    if (locale === "en") continue;
    const translations = await readStrings(fileName);
    const translated = [...english].filter(([key, text]) => {
      const translation = translations.get(key);
      return translation !== undefined && translation !== text;
    }).length;
    if (translated / english.size < MIN_TRANSLATED) untranslated.push(locale);
    else locales.push(locale);
  }
  if (untranslated.length > 0) {
    console.log(
      `Under ${MIN_TRANSLATED * 100}% translated, not offered: ${untranslated.join(", ")}`,
    );
  }

  const content = `export const _locales = ${JSON.stringify(locales)};`;
  const template = getTemplate(content);

  await fsp.writeFile(
    path.resolve("./src/i18n/_locales.ts"),
    template,
    "utf-8",
  );
}

main();
