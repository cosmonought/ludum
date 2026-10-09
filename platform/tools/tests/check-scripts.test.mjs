// node --test platform/tools/tests/*.test.mjs  — the §2.4 script checker.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkPage, checkRepository, CSP_POLICY, CSP_POLICY_ME, RADIO_URL } from "../check-scripts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CSP = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}">`;
const page = (head, body = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const OWN = `<script src="/design-system/js/ludum.js"></script><script src="/platform/js/page-init.js"></script>`;

test("main's pages, as they are, pass", () => {
  assert.deepEqual(checkRepository(ROOT), []);
});

test("every page: <script src> only from this repository or the exact radio URL", () => {
  assert.deepEqual(checkPage("index.html", page(`<script src="${RADIO_URL}" defer></script>`, `${OWN}<script>Ludum.enhance();</script>`), ROOT), []);
  for (const src of [
    "https://cdn.example/x.js",
    "//netadao.org/radio/radio.js",
    "http://netadao.org/radio/radio.js",
    "https://netadao.org/radio/radio.js?v=2",
    "https://netadao.org/radio/other.js",
    "https://evil.example/radio/radio.js",
    "/design-system/js/missing.js",
    "/design-system/../design-system/js/ludum.js",
    "design-system/js/ludum.js",
    "data:text/javascript,alert(1)",
  ]) {
    const problems = checkPage("projects/index.html", page(`<script src="${src}"></script>`), ROOT);
    assert.equal(problems.length, 1, src);
  }
  assert.equal(checkPage("about/index.html", page(`<SCRIPT SRC='https://cdn.example/a.js'></SCRIPT>`), ROOT).length, 1, "any case, any quotes");
  assert.equal(checkPage("about/index.html", page(`<link rel="modulepreload" href="https://cdn.example/m.js">`), ROOT).length, 1);
  assert.equal(checkPage("about/index.html", page(`<link rel="preload" as="script" href="https://cdn.example/m.js">`), ROOT).length, 1);
});

test("the API pages: no inline script, no handler attribute, no javascript: URL; the meta CSP first and exact", () => {
  for (const dir of ["me", "disputes", "governance", "disputes/case"]) {
    const rel = `${dir}/index.html`;
    assert.deepEqual(checkPage(rel, page(`${CSP}<title>x</title><script src="${RADIO_URL}" defer></script>`, OWN), ROOT), [], rel);
    assert.equal(checkPage(rel, page(`${CSP}`, `${OWN}<script>Ludum.enhance();</script>`), ROOT).length, 1, `${rel}: inline`);
    assert.equal(checkPage(rel, page(`${CSP}`, `<button onclick="x()">x</button>`), ROOT).length, 1, `${rel}: onclick`);
    assert.equal(checkPage(rel, page(`${CSP}`, `<a href="javascript:x()">x</a>`), ROOT).length, 1, `${rel}: javascript:`);
    assert.equal(checkPage(rel, page(`<title>x</title>${CSP}`), ROOT).length, 1, `${rel}: CSP not first`);
    assert.equal(checkPage(rel, page(""), ROOT).length, 1, `${rel}: no CSP`);
    assert.equal(checkPage(rel, page(CSP.replace("'self';", "'self' 'unsafe-inline';")), ROOT).length, 1, `${rel}: a looser CSP`);
    assert.deepEqual(checkPage(rel, page(`<!-- policy -->\n  ${CSP.replace(/; /g, ";\n  ")}`), ROOT), [], `${rel}: whitespace and a leading comment aside`);
  }
  /* /me/ alone may drop the chain read endpoints. */
  const meCsp = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY_ME}">`;
  assert.deepEqual(checkPage("me/index.html", page(meCsp), ROOT), []);
  assert.equal(checkPage("governance/index.html", page(meCsp), ROOT).length, 1);
  /* Outside the API directories an inline script is the marketing pages' business. */
  assert.deepEqual(checkPage("index.html", page("", "<script>Ludum.enhance();</script>"), ROOT), []);
  assert.deepEqual(checkPage("member/index.html", page("", "<script>Ludum.enhance();</script>"), ROOT), [], "not me/");
});
