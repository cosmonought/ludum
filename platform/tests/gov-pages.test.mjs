// The governance pages: the §2.4 meta CSP, exactly, as the first <head> child; no inline script; only allowed scripts.
// Run from the repository root: node --test platform/tests/gov-pages.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// §2.4 of LUDUM_PLATFORM_ARCHITECTURE.md, its lines joined with one space.
const CSP_24 = [
  "default-src 'self';",
  "script-src 'self' https://netadao.org/radio/radio.js;",
  "style-src 'self' 'unsafe-inline';",
  "img-src 'self' data: https://netadao.org;",
  "font-src 'self';",
  "media-src https://s3.radio.co;",
  "connect-src 'self' https://play.netadao.org https://juno.api.t.stavr.tech https://d3d68n2c5eingb.cloudfront.net;",
  "frame-src https://netadao.org https://www.netadao.org https://academy.netadao.org https://fork.netadao.org https://ludum.netadao.org https://play.netadao.org;",
  "object-src 'none';",
  "base-uri 'none';",
  "form-action 'self';",
  "upgrade-insecure-requests",
].join(" ");

const ALLOWED_SCRIPTS = new Set(["https://netadao.org/radio/radio.js", "/design-system/js/ludum.js", "/platform/js/gov.js", "/platform/js/gov-page.js"]);

function htmlUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? htmlUnder(p) : name.endsWith(".html") ? [p] : [];
  });
}
const PAGES = [...htmlUnder(path.join(ROOT, "disputes")), ...htmlUnder(path.join(ROOT, "governance"))];

test("the three B1 pages exist", () => {
  const rel = PAGES.map((p) => path.relative(ROOT, p).split(path.sep).join("/")).sort();
  assert.deepEqual(rel, ["disputes/case/index.html", "disputes/index.html", "governance/index.html"]);
});

for (const file of PAGES) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const html = readFileSync(file, "utf8");

  test(`${rel}: the meta CSP equals §2.4 exactly and is the first element in <head>`, () => {
    const head = html.match(/<head>([\s\S]*?)<\/head>/);
    assert.ok(head, "has a <head>");
    const first = head[1].trimStart().match(/^<([a-z]+)\b[^>]*>/i);
    assert.ok(first, "head has a first element");
    const tag = first[0];
    assert.match(tag, /^<meta http-equiv="Content-Security-Policy" content="[^"]*">$/);
    const content = tag.match(/content="([^"]*)"/)[1];
    assert.equal(content, CSP_24);
    assert.equal((html.match(/Content-Security-Policy/g) || []).length, 1, "exactly one CSP meta");
    assert.ok(html.indexOf("<meta charset") < 1024, "the charset still falls inside the first 1024 bytes");
  });

  test(`${rel}: no inline script, no inline handlers, only allow-listed script sources, radio kept`, () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0);
    for (const [, attrs, body] of scripts) {
      const src = attrs.match(/\bsrc="([^"]+)"/);
      assert.ok(src, "every script has a src");
      assert.equal(body.trim(), "", "no inline script body");
      assert.ok(ALLOWED_SCRIPTS.has(src[1]), `allowed script: ${src[1]}`);
    }
    assert.ok(scripts.some(([, a]) => a.includes('src="https://netadao.org/radio/radio.js"')), "the radio include stays");
    assert.ok(scripts.some(([, a]) => a.includes('src="/platform/js/gov-page.js"')), "Ludum.enhance() comes from gov-page.js");
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "no inline event handlers");
    assert.doesNotMatch(html, /javascript:/i);
    assert.doesNotMatch(html, /Ludum\.enhance\(\)/, "enhance is called from gov-page.js, not inline");
  });

  test(`${rel}: uses the design system stylesheet`, () => {
    assert.match(html, /<link rel="stylesheet" href="\/design-system\/css\/ludum\.css">/);
  });
}

test("gov-page.js calls Ludum.enhance(); the vendored cosmjs is self-hosted", () => {
  const js = readFileSync(path.join(ROOT, "platform/js/gov-page.js"), "utf8");
  assert.match(js, /Ludum\.enhance\(\)/);
  const gov = readFileSync(path.join(ROOT, "platform/js/gov.js"), "utf8");
  assert.match(gov, /VENDOR_SRC = '\/platform\/vendor\/cosmjs-0\.32\.4\.min\.js'/);
  assert.doesNotMatch(gov + js, /total_juno_pool/);
});
