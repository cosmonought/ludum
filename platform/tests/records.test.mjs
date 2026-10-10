// The records pages' pure logic: formatting, the profile tabs' two-authorities rule, the account menu's entries, the
// record's results and head, the display name's sentences, the game docket and the moderation transitions.
// Run from the repository root: node --test platform/tests/records.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/** deepEqual across the sandbox's realm (its arrays and objects have other prototypes). */
const eq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
const JS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "js");

/** Load page scripts into one sandbox window (no DOM: each script's start() finds no root and does nothing). */
function load(files, extra = {}) {
  const storage = new Map();
  const window = {
    location: { pathname: "/me/", search: "", assign() {}, replace() {} },
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    ...extra,
  };
  const document = { readyState: "complete", querySelector: () => null, addEventListener() {} };
  const context = vm.createContext({ window, document, URLSearchParams, Date, JSON, Object, Array, String, Number, Math, BigInt, Promise, Error, encodeURIComponent, globalThis: undefined });
  context.globalThis = context;
  for (const f of files) vm.runInContext(readFileSync(resolve(JS, f), "utf8"), context, { filename: f });
  return { window, storage };
}

test("formatting: JUNOX from base units (never a float), ids, hashes, dates, places, in-game dollars", () => {
  const { window: { LudumRecords: R } } = load(["records.js"]);
  assert.equal(R.junox("11223333"), "11.223333");
  assert.equal(R.junox("10000000"), "10.00");
  assert.equal(R.junox("1223333", true), "+1.223333");
  assert.equal(R.junox("-250000"), "−0.25");
  assert.equal(R.junox("0", true), "0.00");
  assert.equal(R.junox("123456789000000"), "123,456,789.00");
  assert.equal(R.junox("1.5"), "—");
  assert.equal(R.amountClass("-1"), "ld-amt ld-amt--loss");
  assert.equal(R.amountClass("0"), "ld-amt ld-amt--zero");
  assert.equal(R.amountClass("5"), "ld-amt ld-amt--gain");
  assert.equal(R.shortId("g_xfqa37t6wt6ajvnbx5j3f5dn2g"), "g_xfqa37…dn2g");
  assert.equal(R.shortHash("51AD" + "0".repeat(56) + "07C3"), "51AD…07C3");
  assert.equal(R.day("2026-10-06T21:14:00.000Z"), "6 Oct 2026");
  assert.equal(R.clock("2026-10-06T21:04:00.000Z"), "21:04 UTC");
  assert.equal(R.month("2026-08"), "Aug 2026");
  eq([1, 2, 3, 4, 11, 12, 13, 21, 22].map(R.ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  assert.equal(R.dollars(6420), "$6,420");
  assert.equal(R.dollars(-30), "−$30");
});

test("profile tabs: Moderation only for a Play reviewer, Appeals & Disputes only for a remembered DAO wallet -- never merged", () => {
  const { window: { LudumRecords: R } } = load(["records.js"]);
  const keys = (session, member) => R.profileTabs(session, member, "record").map((t) => t.key);
  const player = { signedIn: true, roles: { reviewer: false } };
  const reviewer = { signedIn: true, roles: { reviewer: true } };
  eq(keys(player, null), ["record", "account"]);
  eq(keys(reviewer, null), ["record", "account", "moderation"]);
  eq(keys(player, { address: "juno1x" }), ["record", "account", "appeals"]);
  eq(keys(reviewer, { address: "juno1x" }), ["record", "account", "moderation", "appeals"]);
  eq(keys({ signedIn: true }, null), ["record", "account"], "an older server's session (no roles) draws no Moderation");
  assert.equal(R.profileTabs(player, null, "account").find((t) => t.current).key, "account");
});

test("the remembered DAO member: a convenience with a 30-day life, malformed or expired entries ignored", () => {
  const { window, storage } = load(["records.js"]);
  const R = window.LudumRecords;
  const addr = "juno1" + "q".repeat(38);
  const now = Date.UTC(2026, 9, 9);
  assert.equal(R.rememberedMember(window.localStorage, now), null);
  R.rememberMember(window.localStorage, addr, now);
  eq(R.rememberedMember(window.localStorage, now + 1000), { address: addr, checkedAt: now });
  assert.equal(R.rememberedMember(window.localStorage, now + 31 * 86400000), null);
  storage.set(R.DAO_MEMBER_KEY, '{"address":"evil","checkedAt":1}');
  assert.equal(R.rememberedMember(window.localStorage, now), null);
  storage.set(R.DAO_MEMBER_KEY, "not json");
  assert.equal(R.rememberedMember(window.localStorage, now), null);
  R.rememberMember(window.localStorage, null, now);
  assert.equal(storage.has(R.DAO_MEMBER_KEY), false);
});

test("account menu entries: Profile; Moderation for reviewers; Appeals & Disputes for a DAO wallet; the current page marked", () => {
  const { window } = load(["records.js", "account-menu.js"], { LudumSession: { whoami: () => new Promise(() => {}) } });
  const M = window.LudumAccountMenu;
  const plain = (list) => list.map((e) => [e.text, e.href, e.current]);
  eq(plain(M.entries({ roles: { reviewer: false } }, null, "/")), [["Profile", "/me/", false]]);
  eq(plain(M.entries({ roles: { reviewer: true } }, { address: "juno1x" }, "/moderation/case/")), [
    ["Profile", "/me/", false], ["Moderation", "/moderation/", true], ["Appeals & Disputes", "/disputes/", false]]);
  eq(plain(M.entries({}, null, "/me/game/")), [["Profile", "/me/", true]]);
});

test("Your record: the Result cell -- free, held, still playing, paid, refunded; the head never sums a held payout", () => {
  const { window } = load(["records.js", "me-record.js"]);
  const M = window.LudumMeRecord;
  const money = (escrow, net, ante = "10000000") => ({ chainGameId: "47", anteGross: { amount: ante, denom: "ujunox" }, escrow: { value: escrow, provenance: "chain-observed" }, net: net === null ? { value: null, provenance: "unavailable", reason: "x" } : { value: { amount: net, denom: "ujunox" }, provenance: "chain-observed" } });
  const g = (m, table = "completed", extra = {}) => ({ gameId: "g_1", money: m, table: { value: table }, createdAt: "2026-10-01T00:00:00.000Z", startedAt: "2026-10-01T00:05:00.000Z", endedAt: "2026-10-01T03:00:00.000Z", ...extra });
  eq(M.resultOf(g(null)), { text: "—", cls: "ld-amt ld-amt--zero", sub: "Free table" });
  eq(M.resultOf(g(money("disputed", null))), { text: "Held", cls: "ld-amt ld-amt--held", sub: "Disputed", caseId: "47" });
  assert.equal(M.resultOf(g(money("in_progress", null), "active")).sub, "Still playing");
  eq(M.resultOf(g(money("settled", "1223333"))), { text: "+1.223333", cls: "ld-amt ld-amt--gain", sub: "Paid 11.223333" });
  eq(M.resultOf(g(money("annulled", "-250000"))), { text: "−0.25", cls: "ld-amt ld-amt--loss", sub: "Annulled · 9.75 refunded" });
  const head = M.headOf([g(money("settled", "1223333")), g(money("disputed", "5000000")), g(null, "waiting", { startedAt: null, endedAt: null, createdAt: "2026-10-09T00:00:00.000Z" })]);
  eq(head, { played: 2, paid: "11.223333 JUNOX", last: "9 Oct 2026" });
});

test("Your account: the display name's sentences, and every refusal in words", () => {
  const { window } = load(["records.js", "account-page.js"]);
  const A = window.LudumAccountPage;
  assert.match(A.stateLine({ state: "changeable" }), /One change before your first game/);
  assert.match(A.stateLine({ state: "changed", changedAt: "2026-10-09T10:00:00.000Z" }), /Changed on 9 Oct 2026/);
  assert.match(A.stateLine({ state: "locked-playing" }), /first game began/);
  assert.match(A.stateLine({ state: "locked-seated" }), /Leave the table/);
  for (const detail of ["taken", "unchanged", "already-changed", "locked-playing", "locked-seated", "bad-name"]) assert.notEqual(A.refusalText({ error: "conflict", detail }), A.refusalText({}), detail);
  assert.match(A.refusalText({ error: "conflict", detail: "taken" }), /Another player/);
});

test("Game record: the docket is in time order, names relayed transactions by hash, and leaves checkpoints as one line", () => {
  const { window } = load(["records.js", "game-record.js"]);
  const tx = (op, at, hash, status = { value: "included", provenance: "chain-observed", height: "100" }) => ({ op, at, txHash: hash.repeat(64).slice(0, 64), status });
  const d = {
    createdAt: "2026-10-06T18:02:00.000Z", startedAt: "2026-10-06T18:11:00.000Z", endedAt: "2026-10-06T21:14:00.000Z", playerCount: 4,
    money: { anteGross: { amount: "10000000" } },
    transactions: { value: { relayed: [tx("start", "2026-10-06T18:11:30.000Z", "A"), tx("checkpoint", "2026-10-06T19:00:00.000Z", "B"), tx("checkpoint", "2026-10-06T20:00:00.000Z", "C"), tx("finalize", "2026-10-06T21:48:00.000Z", "E")], walletSigned: "not-server-recorded" }, provenance: "server-recorded" },
    dispute: null,
  };
  const items = window.LudumGameRecord.docketOf(d);
  eq(items.map((i) => i.what), ["Table created", "Started", "2 checkpoints recorded", "Game ended", "Paid"]);
  assert.equal(items[1].by[0], "Start · tx AAAA…AAAA");
  assert.equal(items[4].by[0], "Finalize · tx EEEE…EEEE");
});

test("Moderation: Play's transitions, and the filter counts", () => {
  const { window } = load(["records.js", "moderation-page.js"]);
  const M = window.LudumModeration;
  eq(M.TRANSITIONS["no-violation"], ["under-review"]);
  eq(M.TRANSITIONS.open, ["under-review", "no-violation", "conduct-confirmed", "escalated"]);
  const c = (status) => ({ status });
  eq(M.counts([c("open"), c("open"), c("under-review"), c("escalated"), c("no-violation"), c("conduct-confirmed")]), { all: 6, open: 2, review: 1, escalated: 1, closed: 2 });
});

test("the new pages load their scripts in order, with the §2.4 CSP first and the records layer after ludum.css", () => {
  const ROOT = resolve(JS, "..", "..");
  for (const [rel, script] of [["me/index.html", "me-record.js"], ["me/account/index.html", "account-page.js"], ["me/game/index.html", "game-record.js"], ["moderation/index.html", "moderation-page.js"], ["moderation/case/index.html", "moderation-page.js"]]) {
    const html = readFileSync(resolve(ROOT, rel), "utf8");
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    eq(order, ["https://netadao.org/radio/radio.js", "/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", "/platform/js/account-menu.js", `/platform/js/${script}`, "/platform/js/page-init.js"], rel);
    assert.ok(html.indexOf("/design-system/css/ludum.css") < html.indexOf("/platform/css/records.css"), rel);
    assert.match(html, /<head>\n<meta http-equiv="Content-Security-Policy"/, rel);
    assert.doesNotMatch(html, /ld-specimen/, `${rel}: no Specimen band on a live page`);
  }
});
