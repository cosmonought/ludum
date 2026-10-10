#!/usr/bin/env node
// Ludum · check-scripts — the §2.4 script rule for the whole ludum.netadao.org origin, checked over every *.html here.
//
//   node platform/tools/check-scripts.mjs            exit 0: every page passes; exit 1: each problem is printed
//
// The rule (1830Juno docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md §2.4): only this repository's own files and the exact URL
// https://netadao.org/radio/radio.js may run on any Ludum page. So, in EVERY *.html:
//   - a <script src> must be that exact radio URL, or a root-relative path to a file in this repository
//     (no scheme, no `//host`, no `..`, no query or fragment);
//   - the same for <link rel="modulepreload"> and <link rel="preload" as="script">.
// And in the API pages -- me/, disputes/, governance/, moderation/ and everything under them -- also:
//   - no inline <script> at all (the CSP there has no 'unsafe-inline'), no on*= handler attribute, no javascript: URL;
//   - the §2.4 meta CSP is the FIRST element in <head>, exactly as written (whitespace aside). me/ may omit the two
//     chain read endpoints from connect-src (§2.4: "Lane C's /me/ may omit them"); nothing else may differ.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const RADIO_URL = "https://netadao.org/radio/radio.js";
export const API_DIRS = Object.freeze(["me", "disputes", "governance", "moderation"]);
/** The API pages that read no chain endpoint, and so may omit them from connect-src (§2.4 allowed this for /me/; v1.1
 *  adds /moderation/, which reads only Play). */
export const NO_CHAIN_DIRS = Object.freeze(["me", "moderation"]);

const CHAIN_READS = "https://juno.api.t.stavr.tech https://d3d68n2c5eingb.cloudfront.net";
/** §2.4, verbatim (one directive per line there). */
export const CSP_POLICY = [
  "default-src 'self';",
  "script-src 'self' https://netadao.org/radio/radio.js;",
  "style-src 'self' 'unsafe-inline';",
  "img-src 'self' data: https://netadao.org;",
  "font-src 'self';",
  "media-src https://s3.radio.co;",
  `connect-src 'self' https://play.netadao.org ${CHAIN_READS};`,
  "frame-src https://netadao.org https://www.netadao.org https://academy.netadao.org https://fork.netadao.org https://ludum.netadao.org https://play.netadao.org;",
  "object-src 'none';",
  "base-uri 'none';",
  "form-action 'self';",
  "upgrade-insecure-requests",
].join(" ");
/** /me/'s permitted variant: connect-src without the chain read endpoints. */
export const CSP_POLICY_ME = CSP_POLICY.replace(` ${CHAIN_READS};`, ";");

const normalise = (policy) => policy.replace(/\s+/g, " ").trim();

/** The attributes of one tag's text (`<script a="b" c>`), lower-cased names; values unquoted. */
function attributesOf(tag) {
  const out = new Map();
  const body = tag.replace(/^<\s*[a-zA-Z0-9-]+/, "").replace(/\/?>$/, "");
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(body)) !== null) out.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

/** Whether `src` is a root-relative path to a file in this repository. */
function isOwnFile(src, root) {
  if (!src.startsWith("/") || src.startsWith("//")) return false;
  if (/[?#\\]/.test(src) || src.split("/").some((part) => part === ".." || part === ".")) return false;
  let path;
  try {
    path = decodeURIComponent(src);
  } catch {
    return false;
  }
  const file = resolve(root, `.${path}`);
  if (!file.startsWith(resolve(root) + sep)) return false;
  return existsSync(file) && statSync(file).isFile();
}

const scriptSourceProblem = (src, root) => (src === RADIO_URL || isOwnFile(src, root) ? null : `script source ${JSON.stringify(src)} is not this repository's own file or ${RADIO_URL}`);

/** Every problem with one page (`rel`: its path from the repository root, `/`-separated). */
export function checkPage(rel, html, root) {
  const problems = [];
  const apiPage = API_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`));

  /* <script ...>...</script> (and an unterminated one: its body is the rest of the file). */
  const scriptRe = /<script\b[^>]*>([\s\S]*?)(?:<\/script\s*>|$)/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const open = m[0].slice(0, m[0].indexOf(">") + 1);
    const attrs = attributesOf(open);
    if (attrs.has("src")) {
      const problem = scriptSourceProblem(attrs.get("src"), root);
      if (problem !== null) problems.push(problem);
      if (apiPage && m[1].trim() !== "") problems.push("a <script src> with inline content");
    } else if (apiPage) {
      problems.push("an inline <script> (the API pages' CSP has no 'unsafe-inline': call Ludum.enhance() from /platform/js/page-init.js)");
    }
  }

  /* Script preloads load script too. */
  const linkRe = /<link\b[^>]*>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    const attrs = attributesOf(m[0]);
    const rels = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
    if (rels.includes("modulepreload") || (rels.includes("preload") && (attrs.get("as") ?? "").toLowerCase() === "script")) {
      const problem = scriptSourceProblem(attrs.get("href") ?? "", root);
      if (problem !== null) problems.push(`preload: ${problem}`);
    }
  }

  if (apiPage) {
    const tagRe = /<[a-zA-Z][^>]*>/g;
    while ((m = tagRe.exec(html)) !== null) {
      const attrs = attributesOf(m[0]);
      for (const [name, value] of attrs) {
        if (/^on[a-z]+$/.test(name)) problems.push(`an inline event handler (${name}=)`);
        if ((name === "href" || name === "src" || name === "action" || name === "formaction") && /^\s*javascript:/i.test(value)) problems.push(`a javascript: URL (${name}=)`);
      }
    }
    const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(html);
    if (head === null) problems.push("no <head>");
    else {
      const first = /^\s*(?:<!--[\s\S]*?-->\s*)*(<[a-zA-Z][^>]*>)/.exec(head[1]);
      const attrs = first === null ? null : attributesOf(first[1]);
      const isCsp = first !== null && /^<meta\b/i.test(first[1]) && (attrs.get("http-equiv") ?? "").toLowerCase() === "content-security-policy";
      if (!isCsp) problems.push("the §2.4 meta CSP is not the first element in <head>");
      else {
        const policy = normalise(attrs.get("content") ?? "");
        const allowed = NO_CHAIN_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`)) ? [CSP_POLICY, CSP_POLICY_ME] : [CSP_POLICY];
        if (!allowed.some((expected) => normalise(expected) === policy)) problems.push("the meta CSP differs from §2.4");
      }
    }
  }
  return problems;
}

/** Every *.html under `root` (not .git, not node_modules), as `/`-separated relative paths. */
export function htmlFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === ".git" || name === "node_modules") continue;
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (name.toLowerCase().endsWith(".html")) out.push(relative(root, path).split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

export function checkRepository(root) {
  const results = [];
  for (const rel of htmlFiles(root)) {
    for (const problem of checkPage(rel, readFileSync(join(root, rel), "utf8"), root)) results.push({ file: rel, problem });
  }
  return results;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const files = htmlFiles(root);
  const problems = checkRepository(root);
  for (const { file, problem } of problems) console.error(`${file}: ${problem}`);
  if (problems.length > 0) {
    console.error(`check-scripts: ${problems.length} problem(s) in ${new Set(problems.map((p) => p.file)).size} of ${files.length} page(s)`);
    process.exit(1);
  }
  console.log(`check-scripts: ${files.length} page(s) pass`);
}
