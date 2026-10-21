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

test("v1.3 formatting: credits, ratings, rating changes, the game's name from its recorded edition, public states and outcomes", () => {
  const { window: { LudumRecords: R } } = load(["records.js"]);
  eq([R.credits(500), R.credits(1340), R.credits(-48), R.credits(52, true), R.credits(0, true), R.credits(1.5), R.credits(null)], ["500", "1,340", "−48", "+52", "0", "—", "—"]);
  eq([R.rating(1500), R.rating(1468.3334), R.rating(1587.5)], ["1,500", "1,468", "1,588"]);
  eq([R.ratingChange(16), R.ratingChange(-5.3334), R.ratingChange(0), R.ratingChange(null)], ["+16.0", "−5.3", "0.0", "—"]);
  const game = (edition, key = "project-18xx", name = "Project 18XX") => ({ key, name, edition, source: "recorded" });
  eq([R.gameName(game("standard")), R.gameName(game("plus")), R.gameName(game("levelPlayingField")), R.gameName(game("steel-meridian", "steel-meridian", "18Heartland: Steel Meridian")), R.gameName(undefined)],
    ["18xx", "18xx+", "18xx+: LPF", "18Heartland: Steel Meridian", "Project 18XX"]);
  assert.equal(R.publicState({ state: "established", value: 163, games: 7 }), "Public");
  assert.equal(R.publicState({ state: "provisional", games: 3, needed: 5 }, "settled games"), "Private · 3 of 5 settled games");
  const fact = (value) => ({ value, provenance: "server-recorded" });
  eq([
    R.outcomeOf({ credits: { outcome: "void" }, table: fact("active") }).text,
    R.outcomeOf({ credits: { outcome: "foreclosed", defaulted: true }, table: fact("active") }).text,
    R.outcomeOf({ credits: { outcome: "foreclosed", defaulted: false }, table: fact("active") }).text,
    R.outcomeOf({ credits: { outcome: "scored" }, table: fact("completed") }).text,
    R.outcomeOf({ credits: null, table: fact("active") }).text,
    R.outcomeOf({ credits: null, history: fact("cancelled"), table: fact("archived") }).text,
  ], ["Voided", "Forfeited", "Won by forfeit", "Completed", "In play", "Cancelled"], "a clock-ended credit game is never shown as still in play");
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

test("the remembered DAO member: per ACCOUNT, ten minutes, malformed / expired / another account's / v1's ignored", () => {
  const { window, storage } = load(["records.js"]);
  const R = window.LudumRecords;
  const addr = "juno1" + "q".repeat(38);
  const now = Date.UTC(2026, 9, 9);
  assert.equal(R.rememberedMember(window.localStorage, now, "ann"), null);
  R.rememberMember(window.localStorage, addr, now, "ann");
  eq(R.rememberedMember(window.localStorage, now + 1000, "ann"), { checkedAt: now });
  assert.equal(R.rememberedMember(window.localStorage, now + 1000, "bob"), null, "another account never inherits it");
  assert.equal(R.rememberedMember(window.localStorage, now + 1000), null, "no account (signed out): nothing");
  assert.equal(R.rememberedMember(window.localStorage, now + 11 * 60000, "ann"), null, "ten minutes, then the chain is asked again");
  R.rememberMember(window.localStorage, addr, now, null);
  eq(R.rememberedMember(window.localStorage, now + 1000, "ann"), { checkedAt: now }, "signed out: nothing is written");
  storage.set(R.DAO_MEMBER_KEY, JSON.stringify({ account: "ann", member: true, keplr: "evil", checkedAt: now }));
  assert.equal(R.rememberedMember(window.localStorage, now, "ann"), null);
  storage.set(R.DAO_MEMBER_KEY, "not json");
  assert.equal(R.rememberedMember(window.localStorage, now, "ann"), null);
  /* v1's key (one wallet for whoever used the browser) is never read, and is removed on sight. */
  storage.delete(R.DAO_MEMBER_KEY);
  storage.set(R.LEGACY_DAO_MEMBER_KEY, JSON.stringify({ address: addr, checkedAt: now }));
  assert.equal(R.rememberedMember(window.localStorage, now, "ann"), null);
  assert.equal(storage.has(R.LEGACY_DAO_MEMBER_KEY), false);
  R.rememberMember(window.localStorage, addr, now, "ann");
  R.forgetMembership(window.localStorage);
  assert.equal(storage.has(R.DAO_MEMBER_KEY), false, "sign-out forgets it");
});

test("account menu entries: Your record and Your account; Moderation for reviewers; Appeals & Disputes for a DAO wallet; the current page marked", () => {
  const { window } = load(["records.js", "account-menu.js"], { LudumSession: { whoami: () => new Promise(() => {}) } });
  const M = window.LudumAccountMenu;
  const plain = (list) => list.map((e) => [e.text, e.href, e.current]);
  eq(plain(M.entries({ roles: { reviewer: false } }, null, "/")), [["Your record", "/me/", false], ["Your account", "/me/account/", false]]);
  eq(plain(M.entries({ roles: { reviewer: true } }, { address: "juno1x" }, "/moderation/case/")), [
    ["Your record", "/me/", false], ["Your account", "/me/account/", false], ["Moderation", "/moderation/", true], ["Appeals & Disputes", "/disputes/", false]]);
  eq(plain(M.entries({}, null, "/me/game/")), [["Your record", "/me/", true], ["Your account", "/me/account/", false]]);
  eq(plain(M.entries({}, null, "/me/account/")), [["Your record", "/me/", false], ["Your account", "/me/account/", true]]);
});

test("v1.3 Your record: a credit table's wager, net credits and rating change; a table before credits shows dashes, never a converted figure", () => {
  const { window } = load(["records.js", "me-record.js"]);
  const M = window.LudumMeRecord;
  const credit = (over) => ({ wager: 100, outcome: "scored", reason: null, defaulted: null, place: 1, payout: 152, net: 52, fronted: 0, ratingDelta: 16, ...over });
  eq(M.creditCells({ credits: credit({}) }), { wager: { text: "100", cls: "ld-amt" }, net: { text: "+52", cls: "ld-amt ld-amt--gain" }, rating: { text: "+16.0", cls: "ld-amt ld-amt--gain" }, note: null });
  eq(M.creditCells({ credits: credit({ net: -48, payout: 52 }) }).net, { text: "−48", cls: "ld-amt ld-amt--loss" });
  eq(M.creditCells({ credits: credit({ ratingDelta: -5.3334 }) }).rating, { text: "−5.3", cls: "ld-amt ld-amt--loss" });
  const voided = M.creditCells({ credits: credit({ outcome: "void", payout: null, net: 0, ratingDelta: null, place: null }) });
  eq([voided.net.text, voided.rating.text, voided.note], ["0", "—", "Returned"], "a void: the wager came back, nobody was rated");
  const open = M.creditCells({ credits: credit({ outcome: "open", payout: null, net: null, ratingDelta: null, place: null }) });
  eq([open.wager.text, open.net.text, open.rating.text, open.note], ["100", "—", "—", "In play"]);
  const free = M.creditCells({ credits: null, money: null });
  eq([free.wager.text, free.net.text, free.rating.text, free.note], ["—", "—", "—", null], "a free table: nothing invented");
  eq(M.creditCells({ credits: null, money: { chainGameId: "47" } }).note, "JUNOX table (retired)", "a real-money table: a historical label, no figure");
});

test("v1.3 Your record: the filters keep a game by its recorded game and its status; newest or oldest first", () => {
  const { window } = load(["records.js", "me-record.js"]);
  const M = window.LudumMeRecord;
  const g = (edition, at, credits = null) => ({ game: { key: "project-18xx", name: "Project 18XX", edition, source: "recorded" }, endedAt: at, credits, table: { value: "completed" } });
  const games = [g("plus", "2026-10-02T00:00:00.000Z"), g("levelPlayingField", "2026-10-05T00:00:00.000Z", { outcome: "void" }), g("standard", "2026-10-01T00:00:00.000Z")];
  eq(M.filtered(games, { game: "", outcome: "", oldest: false }).map((x) => M.facetsOf(x).game), ["18xx+: LPF", "18xx+", "18xx"]);
  eq(M.filtered(games, { game: "", outcome: "", oldest: true }).map((x) => M.facetsOf(x).game), ["18xx", "18xx+", "18xx+: LPF"]);
  eq(M.filtered(games, { game: "18xx+", outcome: "", oldest: false }).length, 1);
  eq(M.filtered(games, { game: "", outcome: "Voided", oldest: false }).map((x) => M.facetsOf(x).game), ["18xx+: LPF"]);
});

test("Phase 4: a cancelled table is never a completed game -- read from the server's `history`, else the table status", () => {
  const { window } = load(["records.js", "me-record.js"]);
  const M = window.LudumMeRecord;
  const fact = (value) => ({ value, provenance: "server-recorded" });
  const g = (table, extra = {}) => ({ gameId: "g_1", table: fact(table), startedAt: null, ...extra });
  /* The new server's field wins. */
  assert.equal(M.isCancelled(g("archived", { history: fact("cancelled") })), true);
  assert.equal(M.isCancelled(g("archived", { history: fact("completed"), startedAt: "2026-10-01T00:00:00.000Z" })), false);
  assert.equal(M.isCancelled(g("waiting", { history: fact("open") })), false);
  /* The deployed server (no `history`): the table's own status. */
  for (const t of ["cancelled", "expired"]) assert.equal(M.isCancelled(g(t)), true, t);
  assert.equal(M.isCancelled(g("archived")), true, "archived without ever starting");
  assert.equal(M.isCancelled(g("archived", { startedAt: "2026-10-01T00:00:00.000Z" })), false);
  for (const t of ["completed", "active", "waiting"]) assert.equal(M.isCancelled(g(t)), false, t);
});

test("Phase 4 / v1.3: a cancelled table is listed only when its escrow held money (its record keeps the refund)", () => {
  const { window } = load(["records.js", "me-record.js"]);
  const M = window.LudumMeRecord;
  assert.equal(M.keepsCancelled({ money: { chainGameId: "12" } }), true);
  assert.equal(M.keepsCancelled({ money: { chainGameId: null } }), false, "never funded: not listed");
  assert.equal(M.keepsCancelled({ money: null }), false);
});

test("Phase 4: the Finish cell -- your rank from the recorded result, ties shared as the game ranks them", () => {
  const { window } = load(["records.js", "me-record.js"]);
  const M = window.LudumMeRecord;
  const g = (rank, tied, playerCount = 3) => ({ playerCount, inGame: { rank: rank === null ? { value: null, provenance: "unavailable", reason: "x" } : { value: rank, provenance: "server-recorded" }, ...(tied === undefined ? {} : { tied: { value: tied, provenance: "server-recorded" } }) } });
  eq(M.finishOf(g(1, false, 2)), { text: "1st", sub: "of 2" });
  eq(M.finishOf(g(2, false, 2)), { text: "2nd", sub: "of 2" });
  eq(M.finishOf(g(1, true)), { text: "1st", sub: "of 3 · tied" });
  eq(M.finishOf(g(3, undefined)), { text: "3rd", sub: "of 3" }, "the deployed server sends no `tied`");
  eq(M.finishOf(g(null)), { text: "—", sub: null });
  eq(M.finishOf({ playerCount: 2 }), { text: "—", sub: null });
});

test("Your account: the name's change is offered only while it can still be used; every refusal in words", () => {
  const { window } = load(["records.js", "account-page.js"]);
  const A = window.LudumAccountPage;
  assert.equal(A.nameOffer({ state: "changeable" }), "change");
  assert.equal(A.nameOffer({ state: "locked-seated" }), "locked", "seated at a waiting table: shown, closed, with why");
  assert.equal(A.nameOffer({ state: "changed", changedAt: "2026-10-09T10:00:00.000Z" }), "none", "used: no control and no notice");
  assert.equal(A.nameOffer({ state: "locked-playing" }), "none", "a game has begun: no control and no notice");
  for (const detail of ["taken", "unchanged", "already-changed", "locked-playing", "locked-seated", "bad-name"]) assert.notEqual(A.refusalText({ error: "conflict", detail }), A.refusalText({}), detail);
  assert.match(A.refusalText({ error: "conflict", detail: "taken" }), /Another player/);
});

test("v1.3 Game record: a readable title (the game and its table code), how it ended, your figures and the players by place", () => {
  const { window } = load(["records.js", "game-record.js"]);
  const G = window.LudumGameRecord;
  const fact = (value) => (value === null ? { value: null, provenance: "unavailable", reason: "x" } : { value, provenance: "server-recorded" });
  const seat = (name, place, you = false, profileName = name) => ({ displayName: name, you, rank: fact(place), finalNetWorth: fact(place === null ? null : { dollars: 1000 * (5 - place) }), profileName });
  const d = { gameId: "g_3vh2qxaaaaaaaaaaaaaaaaaaqtsw", game: { key: "project-18xx", name: "Project 18XX", edition: "levelPlayingField", source: "recorded" }, tableCode: "JUNO-ABCD-EFGH", playerCount: 3,
    endedAt: "2026-10-11T00:58:00.000Z", startedAt: "2026-10-10T20:00:00.000Z", table: fact("completed"),
    credits: { wager: 100, outcome: "scored", reason: null, defaulted: null, place: 2, payout: 116, net: 16, fronted: 0, ratingDelta: 5.3333 },
    seats: [seat("Ann", 2, true), seat("Bo", 1), seat("Cy", null, false, null)] };
  assert.equal(G.titleOf(d), "18xx+: LPF — Table JUNO-ABCD-EFGH");
  assert.equal(G.titleOf({ ...d, tableCode: null }), "18xx+: LPF", "no code kept: never an internal id");
  assert.equal(G.dekOf(d), "Ended 11 Oct 2026. You finished 2nd of 3.");
  const meta = G.metaOf(d).map((m) => [m[0], typeof m[1] === "string" ? m[1] : m[1].textContent]);
  eq(meta.map((m) => m[0]), ["Your finish", "Wager", "Payout", "Net credits", "Rating change"]);
  eq([meta[0][1], meta[1][1], meta[2][1]], ["2nd of 3", "100", "116"]);
  eq(G.standingsOf(d).map((s) => s.displayName), ["Bo", "Ann", "Cy"], "by place; an unknown place last");
  eq(G.metaOf({ ...d, credits: null }).map((m) => m[0]), ["Your finish"], "a table not played for credits shows no credit figure");
  assert.match(G.dekOf({ ...d, credits: { ...d.credits, outcome: "void", reason: "clock-live-timeout-annul", payout: null, net: 0, ratingDelta: null, place: null } }), /^Voided: .*Every wager was returned; nobody was rated\.$/);
  assert.match(G.dekOf({ ...d, credits: { ...d.credits, outcome: "foreclosed", defaulted: true, reason: "clock-live-strike3-foreclosure" } }), /^You forfeited: a third missed action clock\.$/);
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
  for (const [rel, script] of [["me/index.html", "me-record.js"], ["me/account/index.html", "account-page.js"], ["me/game/index.html", "game-record.js"], ["moderation/index.html", "moderation-page.js"], ["moderation/case/index.html", "moderation-page.js"], ["players/index.html", "player-page.js"]]) {
    const html = readFileSync(resolve(ROOT, rel), "utf8");
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    /* PHASE 4: the account page also loads gov.js (Keplr), for "Forgot current password?" signed in. */
    const keplr = rel === "me/account/index.html" ? ["/platform/js/gov.js"] : [];
    eq(order, ["https://netadao.org/radio/radio.js", "/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", ...keplr, "/platform/js/auth.js", "/platform/js/account-menu.js", `/platform/js/${script}`, "/platform/js/page-init.js"], rel);
    assert.ok(html.indexOf("/design-system/css/ludum.css") < html.indexOf("/platform/css/records.css"), rel);
    assert.match(html, /<head>\n<meta http-equiv="Content-Security-Policy"/, rel);
    assert.doesNotMatch(html, /ld-specimen/, `${rel}: no Specimen band on a live page`);
  }
});

test("v1.3 a player's public page: the name asked for, and each public figure or how far it is from being shown", () => {
  const { window } = load(["records.js", "player-page.js"]);
  const P = window.LudumPlayerPage;
  assert.equal(P.nameOf("?name=Marlowe"), "Marlowe");
  assert.equal(P.nameOf("?name=%20Ada%20L.%20"), "Ada L.");
  assert.equal(P.nameOf("?name=a%2Fb%3Fc"), "a/b?c", "a name may hold / and ?");
  assert.equal(P.nameOf(""), null);
  assert.equal(P.nameOf("?name=%20%20"), null);
  assert.equal(P.nameOf("?name=" + "x".repeat(65)), null);
  eq(P.shown({ state: "established", value: 1340, games: 23 }, (v) => String(v), "settled games"), { value: "1340", small: null });
  eq(P.shown({ state: "provisional", games: 2, needed: 5 }, (v) => String(v), "rated games"), { value: "Not shown yet", small: "2 of 5 rated games" });
});

test("v1.3 the profile pages speak to players: no internal terminology in what they say (moved from Play's M2-E check)", () => {
  /* Comments are stripped: they may name anything. Strings are what a player can be shown. */
  const said = (file) => readFileSync(resolve(JS, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const file of ["me-record.js", "game-record.js", "player-page.js", "account-page.js"]) {
    const text = said(file);
    eq([file, (text.match(/Hybrid|Elo|game server|on this server|record_schema|protocol|C[123]|principal|ledger entr|ratingUnits/i) || [null])[0]], [file, null]);
  }
  /* The distinctions that matter are still said (in the tooltips): what others see, and when. */
  const record = said("me-record.js");
  assert.match(record, /Other players see this figure once you have 5 credit-settled games/);
  assert.match(record, /never below 0/);
  assert.match(record, /It counts activity, not skill/);
});

