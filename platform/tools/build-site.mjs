#!/usr/bin/env node
// Ludum · build-site — the published site, by ALLOW-LIST. Development files never reach ludum.netadao.org.
//
//   node platform/tools/build-site.mjs [outDir]       default outDir: _site
//
// The repository holds more than the site: tests and harnesses (platform/tests/), tools (platform/tools/), the design
// system's documentation (design-system/components/, *.md, tokens.json) and READMEs. GitHub Pages deployed from the
// branch publishes ALL of it (the repository has .nojekyll). This script copies only what the pages use, refuses any
// test, harness, mock or Markdown file inside an allowed directory, and then checks that every root-relative script,
// stylesheet, image and font a published page references is itself published -- so a missing file fails the build
// instead of the page. .github/workflows/pages.yml runs it and deploys its output.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** What is published: files, or whole directories (filtered by DENY). */
export const ALLOW = Object.freeze([
  "CNAME", "index.html", "404.html",
  "about", "projects", "assets",
  "design-system/css", "design-system/js", "design-system/fonts",
  "me", "disputes", "governance", "moderation",
  "platform/css", "platform/js", "platform/vendor/cosmjs-0.32.4.min.js",
]);
/** Never published, even inside an allowed directory. */
export const DENY = Object.freeze([/\.test\.[cm]?js$/i, /harness/i, /mock/i, /\.md$/i, /(^|\/)\./, /\.map$/i]);
/** Files the pages no longer use but the repository keeps for its tests. */
export const UNUSED = Object.freeze(["me/me.css", "platform/js/history.js"]);

const posix = (p) => p.split(sep).join("/");

function walk(dir, root, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, root, out);
    else out.push(posix(relative(root, full)));
  }
  return out;
}

/** Every repository file that will be published (sorted). */
export function publishedFiles(root) {
  const files = [];
  for (const entry of ALLOW) {
    const full = join(root, entry);
    if (!existsSync(full)) continue;
    if (statSync(full).isDirectory()) walk(full, root, files);
    else files.push(entry);
  }
  return files.filter((f) => !DENY.some((re) => re.test(f)) && !UNUSED.includes(f)).sort();
}

/** Root-relative references a page makes to this origin (scripts, stylesheets, preloads, images, icons). */
export function referencesOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/<(?:script|link|img|source)\b[^>]*?\s(?:src|href|srcset)="([^"]+)"/gi)) {
    for (const part of m[1].split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url.startsWith("/") && !url.startsWith("//")) out.add(url.split(/[?#]/)[0]);
    }
  }
  return [...out];
}

/** Problems with a published set: a referenced own file that is not published. */
export function missingReferences(root, files) {
  const set = new Set(files);
  const problems = [];
  for (const f of files.filter((x) => x.endsWith(".html"))) {
    for (const ref of referencesOf(readFileSync(join(root, f), "utf8"))) {
      const path = decodeURIComponent(ref).replace(/^\//, "");
      const target = path.endsWith("/") ? path + "index.html" : path;
      if (!set.has(target)) problems.push(`${f} references ${ref}, which is not published`);
    }
  }
  return problems;
}

export function buildSite(root, outDir) {
  const files = publishedFiles(root);
  const problems = missingReferences(root, files);
  if (problems.length) return { ok: false, problems, files };
  rmSync(outDir, { recursive: true, force: true });
  for (const f of files) {
    mkdirSync(dirname(join(outDir, f)), { recursive: true });
    cpSync(join(root, f), join(outDir, f));
  }
  return { ok: true, problems: [], files };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const out = resolve(root, process.argv[2] ?? "_site");
  const result = buildSite(root, out);
  if (!result.ok) {
    for (const p of result.problems) console.error(p);
    process.exit(1);
  }
  console.log(`build-site: ${result.files.length} file(s) published to ${posix(relative(root, out)) || "."}`);
}
