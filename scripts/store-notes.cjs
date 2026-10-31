#!/usr/bin/env node

// Writes the store notes of a release from its GitHub text, for the release
// workflows. The text before the release's first heading (GitHub's "What's
// Changed") is the notes:
//   - $STORE_NOTES_DIR/app-store.txt: all of it, at most 4,000 characters,
//     without the lines that name Android or Google Play (App Store
//     guideline 2.3.10).
//   - $STORE_NOTES_DIR/play/whatsnew-en-US: its first paragraph, at most
//     500 characters, Google Play's limit.
// Neither store renders Markdown: links keep their text, and "- " bullets
// become "• ".
//
// The release is $RELEASE_TAG, else the one of package.json's version.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { version } = require("../package.json");

const tag = process.env.RELEASE_TAG || `v${version}`;
const dir = process.env.STORE_NOTES_DIR;
if (!dir) {
  console.error("STORE_NOTES_DIR isn't set.");
  process.exit(1);
}

const body = execFileSync(
  "gh",
  ["release", "view", tag, "--json", "body", "--jq", ".body"],
  { encoding: "utf8" },
).replace(/\r\n/g, "\n");
const intro = body.split(/^## /m)[0];

/** @param text {string} */
function plain(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/^- /gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param text {string}
 * @param max {number}
 */
function cut(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

const appStore = cut(
  plain(
    intro
      .split("\n")
      .filter((line) => !/\bAndroid\b|Google Play/.test(line))
      .join("\n"),
  ),
  4000,
);
const play = cut(plain(intro.trim().split(/\n\s*\n/)[0]), 500);
if (!appStore || !play) {
  console.error(`The release ${tag} has no text before its first heading.`);
  process.exit(1);
}

fs.mkdirSync(path.join(dir, "play"), { recursive: true });
fs.writeFileSync(path.join(dir, "app-store.txt"), appStore);
fs.writeFileSync(path.join(dir, "play", "whatsnew-en-US"), play);
console.log(
  `Store notes of ${tag}: App Store ${appStore.length} characters, Google Play ${play.length}.`,
);
