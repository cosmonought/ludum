// Ludum · /me/ (Lane C): pins platform/js/history.js's pure helpers against the mock's §5-shaped fixtures, and the
// §2.4 page rules for me/index.html (meta CSP first in <head>, exact; no inline script; script sources allow-listed).
// Run from the worktree root: node --test platform/tests/history.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

/* history.js and the mock, in a window-only context (no document: the module mounts nothing). */
const context = vm.createContext({ Promise, Object, String, Number, Math, isFinite });
context.window = context;
vm.runInContext(read('platform/tests/history-mock-session.js'), context);
vm.runInContext(read('platform/js/history.js'), context);
const H = context.LudumHistory;
const { games, details } = context.LudumSession._fixtures;
const [settled, disputed, withdrawn, free] = games;

test('JUNOX: integer ujunox strings, six decimals, never a JS number', () => {
  assert.equal(H.formatJunox('1336628'), '1.336628 JUNOX');
  assert.equal(H.formatJunox('1336628', { signed: true }), '+1.336628 JUNOX');
  assert.equal(H.formatJunox('-3000000'), '−3.000000 JUNOX');
  assert.equal(H.formatJunox('0', { signed: true }), '0.000000 JUNOX');
  assert.equal(H.formatJunox('7'), '0.000007 JUNOX');
  assert.equal(H.formatJunox('123456789012345678901234567890'), '123,456,789,012,345,678,901,234.567890 JUNOX');
  assert.equal(H.formatJunox(1.5), 'invalid');
  assert.equal(H.formatJunox('1e6'), 'invalid');
});

test('in-game dollars are formatted as in-game, never as JUNOX', () => {
  assert.equal(H.formatDollars(7400), '$7,400 in-game');
  assert.equal(H.formatDollars(-20), '−$20 in-game');
  assert.equal(H.formatDollars('7400'), 'invalid');
  assert.ok(!H.formatDollars(7400).includes('JUNOX'));
});

test('a provenance marker for every provenance; unavailable carries its reason', () => {
  const marks = ['chain-confirmed', 'chain-observed', 'server-recorded', 'pending', 'unavailable'].map((p) => H.provenanceOf({ value: p === 'unavailable' ? null : 1, provenance: p, reason: p === 'unavailable' ? 'why not' : undefined }).mark);
  assert.deepEqual(marks, ['C', 'O', 'S', 'P', '—']);
  assert.match(H.provenanceOf({ value: 1, provenance: 'chain-confirmed', height: '42' }).title, /height 42/);
  assert.match(H.provenanceOf({ value: null, provenance: 'unavailable', reason: 'not recorded; replay required' }).title, /replay required/);
  assert.equal(H.provenanceOf({ value: 1, provenance: 'made-up' }).provenance, 'unavailable');
  assert.equal(H.provenanceOf(undefined).provenance, 'unavailable');
});

test('every row value carries a marker; JUNOX and in-game cells never mix', () => {
  for (const g of games) {
    const m = H.rowModel(g);
    for (const c of [m.table, m.inGame.rank, m.inGame.worth, m.dispute]) assert.ok(c.prov, `${g.gameId}: a value without a marker`);
    if (g.money) for (const c of [m.escrow, m.junox.ante, m.junox.net]) assert.ok(c.prov, `${g.gameId}: a money value without a marker`);
    for (const c of [m.inGame.rank, m.inGame.worth]) assert.ok(!c.text.includes('JUNOX'), 'JUNOX in an in-game cell');
    for (const c of [m.junox.ante, m.junox.net]) assert.ok(!c.text.includes('in-game') && !c.text.includes('$'), 'dollars in a JUNOX cell');
  }
  const s = H.rowModel(settled);
  assert.equal(s.junox.net.text, '+1.336628 JUNOX');
  assert.equal(s.junox.ante.prov.provenance, 'chain-confirmed', 'the ante is a chain fact once the escrow is read');
  assert.equal(s.inGame.worth.text, '$7,400 in-game');
  assert.equal(s.inGame.rank.text, '#1 of 3');
});

test('pending, unavailable and no-money rows say so', () => {
  const d = H.rowModel(disputed);
  assert.equal(d.junox.net.prov.provenance, 'pending');
  assert.equal(d.dispute.href, '/disputes/case/?id=5', "a dispute links to B1's case page");
  const w = H.rowModel(withdrawn);
  assert.equal(w.junox.net.text, 'unavailable');
  assert.equal(w.junox.net.prov.provenance, 'unavailable');
  assert.match(w.junox.net.prov.title, /withdrew before Start/);
  const f = H.rowModel(free);
  assert.equal(f.junox.net.text, '—');
  assert.equal(f.escrow.text, 'No stake');
  assert.equal(f.inGame.rank.text, 'unavailable');
  assert.match(f.inGame.rank.prov.title, /not recorded; replay required/);
});

test('the ante is server-recorded terms until the chain confirms it', () => {
  assert.equal(H.anteFact({ anteGross: { amount: '1', denom: 'ujunox' }, escrow: { value: null, provenance: 'unavailable', reason: 'x' } }).provenance, 'server-recorded');
  assert.equal(H.anteFact({ anteGross: { amount: '1', denom: 'ujunox' }, escrow: { value: 'funding', provenance: 'chain-observed', observedAt: 't' } }).provenance, 'chain-observed');
});

test('drawer entries: signed by kind, informational in brackets, unknown amounts never shown as zero', () => {
  const lines = H.entryLines(details[settled.gameId].ledger);
  assert.deepEqual(JSON.parse(JSON.stringify(lines.map((l) => [l.kind, l.text, l.informational]))), [
    ['ante_gross', '−2.000000 JUNOX', false],
    ['subsidy', '(0.050000 JUNOX)', true],
    ['payout', '+3.336628 JUNOX', false],
  ]);
  const bond = H.entryLines(details[disputed.gameId].ledger);
  assert.equal(bond[2].text, '−1.000000 JUNOX');
  const gone = H.entryLines(details[withdrawn.gameId].ledger);
  assert.deepEqual([...gone.map((l) => l.text)], ['unavailable', 'unavailable']);
  assert.equal(H.entryLines(null).length, 0);
});

test('case links: digits only', () => {
  assert.equal(H.caseHref('12'), '/disputes/case/?id=12');
  for (const bad of ['5&x=1', '../', '', null, 5]) assert.equal(H.caseHref(bad), null);
});

test('the mock answers signed-out and not-found like the server', async () => {
  const s = context.LudumSession;
  assert.deepEqual(JSON.parse(JSON.stringify(await s.api('game', { gameId: 'g_nope' }))), { error: 'not-found' });
  s._setSignedIn(false);
  assert.equal((await s.whoami()).signedIn, false);
  assert.equal((await s.api('games', {})).error, 'signed-out');
  s._setSignedIn(true);
  assert.equal(H.errorText({ error: 'signed-out' }), 'You are signed out.');
});

/* §2.4, verbatim (docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md). */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://netadao.org/radio/radio.js",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://netadao.org",
  "font-src 'self'",
  'media-src https://s3.radio.co',
  "connect-src 'self' https://play.netadao.org https://juno.api.t.stavr.tech https://d3d68n2c5eingb.cloudfront.net",
  'frame-src https://netadao.org https://www.netadao.org https://academy.netadao.org https://fork.netadao.org https://ludum.netadao.org https://play.netadao.org',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
];

for (const page of ['me/index.html', 'platform/tests/history-harness.html']) {
  test(`${page}: the §2.4 meta CSP is the first element in <head>, exactly`, () => {
    const html = read(page);
    const head = html.slice(html.indexOf('<head>') + '<head>'.length).trimStart();
    const first = head.match(/^<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
    assert.ok(first, 'the first element of <head> is the CSP meta');
    /* §2.4 lets /me/ omit the two chain read endpoints (v1.1's records pages read only Play). */
    const allowed = [CSP, CSP.map((d) => (d.startsWith('connect-src') ? "connect-src 'self' https://play.netadao.org" : d))];
    assert.ok(allowed.some((policy) => first[1] === policy.join('; ')), 'the CSP is §2.4, or its /me/ variant');
  });

  test(`${page}: no inline script; every script source is the repo's own or the radio`, () => {
    const html = read(page);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0);
    for (const [, attrs, body] of scripts) {
      const src = attrs.match(/\bsrc="([^"]+)"/);
      assert.ok(src, 'an inline script');
      assert.equal(body.trim(), '', 'a script with a src and a body');
      assert.ok(src[1] === 'https://netadao.org/radio/radio.js' || /^\/(design-system|platform)\/[a-z0-9/_.-]+\.js$/.test(src[1]), `script source ${src[1]}`);
    }
    assert.ok(!/\son[a-z]+="/i.test(html), 'an inline event handler');
  });
}

/* v1.1: /me/ is the designed Your record (platform/js/me-record.js); history.js keeps its tested pure helpers and its
   development harness only. */
test('me/index.html loads the session, the records layer, the account menu, then Your record and page-init; never the mock', () => {
  const html = read('me/index.html');
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['https://netadao.org/radio/radio.js', '/design-system/js/ludum.js', '/platform/js/session.js', '/platform/js/records.js', '/platform/js/account-menu.js', '/platform/js/me-record.js', '/platform/js/page-init.js']);
  assert.ok(!html.includes('mock'));
});
