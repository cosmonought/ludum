// node --test platform/tools/tests/*.test.mjs  — build-site: only the site is published, and nothing it needs is missing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, publishedFiles, referencesOf } from "../build-site.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("no test, harness, mock, tool, build input, Markdown or dotfile is published", () => {
  const files = publishedFiles(ROOT);
  for (const f of files) {
    assert.doesNotMatch(f, /^platform\/(tests|tools)\//, f);
    assert.doesNotMatch(f, /^platform\/vendor\/build\//, f);
    assert.doesNotMatch(f, /harness|mock|\.test\.|\.md$|(^|\/)\./i, f);
    assert.doesNotMatch(f, /^design-system\/(components|README|tokens\.json)/, f);
  }
  assert.ok(!files.includes("README.md") && !files.includes("platform/README.md"));
});

test("every page and what it uses is published", () => {
  const files = publishedFiles(ROOT);
  for (const page of ["index.html", "404.html", "about/index.html", "projects/index.html", "me/index.html", "me/account/index.html", "me/game/index.html",
    "moderation/index.html", "moderation/case/index.html", "disputes/index.html", "disputes/case/index.html", "governance/index.html",
    "platform/css/records.css", "platform/js/account-menu.js", "platform/vendor/cosmjs-0.32.4.min.js", "design-system/fonts/Anton-Regular.woff2", "CNAME"]) {
    assert.ok(files.includes(page), page);
  }
  const out = mkdtempSync(join(tmpdir(), "ludum-site-"));
  try {
    const result = buildSite(ROOT, out);
    assert.deepEqual(result.problems, []);
    assert.ok(existsSync(join(out, "me", "account", "index.html")));
    assert.ok(!existsSync(join(out, "platform", "tests")));
    assert.equal(readFileSync(join(out, "CNAME"), "utf8").trim(), "ludum.netadao.org");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("references: scripts, stylesheets, preloads and images on this origin; never another origin's", () => {
  assert.deepEqual(referencesOf('<script src="/a.js"></script><link rel="stylesheet" href="/b.css"><img src="/c.webp" alt=""><script src="https://netadao.org/radio/radio.js"></script><a href="/not-a-resource/">x</a>').sort(), ["/a.js", "/b.css", "/c.webp"]);
});
