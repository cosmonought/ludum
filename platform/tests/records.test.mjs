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
  /* Owner policy 2026-10-22: no figure is private until a game count, so there is no "Private · n of 5" state to say. */
  assert.equal(R.publicState, undefined);
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
  eq([open.wager.text, open.net.text, open.rating.text, open.note], ["100", "—", "—", null], "in play: the Status says so, once");
  const free = M.creditCells({ credits: null, money: null });
  eq([free.wager.text, free.net.text, free.rating.text, free.note], ["—", "—", "—", null], "a free table: nothing invented");
  const junox = M.creditCells({ credits: null, money: { chainGameId: "47" } });
  eq([junox.wager.text, junox.net.text, junox.rating.text, junox.note], ["—", "—", "—", null], "§17: a retired real-money table: dashes, and no repeated notice about the escrow");
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

test("§17 a game's playing time: from the deal to its last moment, in days, hours and minutes -- never estimated", () => {
  const { window: { LudumRecords: R } } = load(["records.js"]);
  const at = (h, m = 0, d = 0) => new Date(Date.UTC(2026, 9, 12 + d, h, m)).toISOString();
  eq([R.duration(at(1, 11), at(3, 43)), R.duration(at(0, 0), at(4, 12, 1)), R.duration(at(0, 0), at(8, 5, 3)), R.duration(at(1, 0), at(1, 47)), R.duration(at(1, 0), at(1, 0))],
    ["2h 32m", "1d 4h 12m", "3d 8h 05m", "47m", "0m"]);
  eq([R.duration(null, at(1)), R.duration(at(1), null), R.duration("not a time", at(1)), R.duration(at(3), at(1))], [null, null, null, null], "a missing or unreadable time, or an end before the start: no duration");
});

test("§17 Your record: a game's result in place -- the time from the deal (never the table's opening), and only what the row does not say", () => {
  const { window } = load(["records.js", "me-record.js"]);
  const M = window.LudumMeRecord;
  const fact = (value) => ({ value, provenance: "server-recorded" });
  const base = { gameId: "g_aaaaaaaaaaaaaaaaaaaaaaaaaa", createdAt: "2026-10-12T00:40:00.000Z", startedAt: "2026-10-12T01:11:00.000Z", endedAt: "2026-10-12T03:43:00.000Z", playerCount: 3, table: fact("completed"), history: fact("completed"), credits: null, clockEnd: null };
  eq(M.playedOf(base), { start: base.startedAt, end: base.endedAt, text: "2h 32m" }, "the deal to the board's end; the table's opening (31 minutes earlier) is never the start");
  eq(M.factsOf(base), [["Played", "2h 32m"]], "a free game: its playing time, nothing invented");
  eq(M.playedOf({ ...base, startedAt: null }), null, "no deal recorded: no duration");
  eq(M.playedOf({ ...base, table: fact("active"), history: fact("open"), endedAt: null }), null, "still being played: no duration");
  eq(M.factsOf({ ...base, table: fact("active"), history: fact("open"), endedAt: null }), [["Began", "12 Oct 2026"]]);
  eq(M.factsOf({ ...base, table: fact("waiting"), history: fact("open"), startedAt: null, endedAt: null }), [], "waiting for players: nothing to say");
  /* A credit game: the pool, your payout, an advance, how it was settled -- never its wager, net or rating again (the row has them). */
  const credit = { wager: 50, outcome: "scored", reason: null, defaulted: null, place: 1, payout: 90, net: 40, fronted: 20, ratingDelta: 16, pool: 150 };
  eq(M.factsOf({ ...base, credits: credit }), [["Played", "2h 32m"], ["Pool", "150 credits"], ["Your payout", "90 credits"], ["Ludum advanced", "20 credits"], ["Ended", "Settled."]]);
  const voided = { ...credit, outcome: "void", reason: "clock-live-timeout-annul", payout: null, net: 0, ratingDelta: null, place: null, fronted: 0 };
  const annulled = { ...base, table: fact("active"), history: fact("open"), endedAt: null, credits: voided, clockEnd: { how: "annulled", at: "2026-10-12T02:20:00.000Z", defaulted: null } };
  eq(M.factsOf(annulled), [["Played", "1h 09m"], ["Pool", "150 credits"], ["Your payout", "Wager returned"], ["Ended", "Voided: an overdue turn the other players did not all vote to foreclose. Every wager was returned; nobody was rated."]],
    "a clock-ended game: played until the clock's own end");
  for (const [label] of M.factsOf({ ...base, credits: credit })) assert.ok(!["Wager", "Net credits", "Rating change", "Game", "Table", "Date"].includes(label), `${label}: the row already says it`);
  assert.doesNotMatch(JSON.stringify(M.factsOf({ ...base, credits: credit })), /\$/, "credits are never written in dollars");
});

test("§17 a game the clock ended: its status says how, from the server's clock (never \"In play\"); settled games keep the competition's words", () => {
  const { window } = load(["records.js", "me-record.js"]);
  const R = window.LudumRecords, M = window.LudumMeRecord;
  const fact = (value) => ({ value, provenance: "server-recorded" });
  const free = (clockEnd) => ({ table: fact("active"), history: fact("open"), credits: null, clockEnd });
  eq([R.outcomeOf(free({ how: "annulled", at: "x", defaulted: null })).text, R.outcomeOf(free({ how: "forfeit", at: "x", defaulted: true })).text, R.outcomeOf(free({ how: "forfeit", at: "x", defaulted: false })).text, R.outcomeOf(free(null)).text],
    ["Annulled", "Forfeited", "Ended by forfeit", "In play"]);
  eq(R.outcomeOf({ ...free({ how: "forfeit", at: "x", defaulted: false }), credits: { outcome: "foreclosed", defaulted: false } }).text, "Won by forfeit", "a credit game: C2's result first");
  assert.equal(M.endingOf(free({ how: "forfeit", at: "x", defaulted: true })), "You forfeited on the clock (an overdue turn).");
  assert.equal(M.endingOf(free(null)), null);
  assert.equal(M.dateOf({ ...free({ how: "annulled", at: "2026-10-13T00:00:00.000Z" }), startedAt: "2026-10-12T00:00:00.000Z", createdAt: "2026-10-11T00:00:00.000Z" }), "2026-10-13T00:00:00.000Z", "the row's date is when the clock ended it");
});

test("§17 the players by place; a game opened by its address; the old game-record page leads to it", () => {
  const { window } = load(["records.js", "me-record.js", "game-record.js"]);
  const M = window.LudumMeRecord, G = window.LudumGameRecord;
  const fact = (value) => (value === null ? { value: null, provenance: "unavailable", reason: "x" } : { value, provenance: "server-recorded" });
  const seat = (name, place) => ({ displayName: name, rank: fact(place) });
  eq(M.standingsOf([seat("Ann", 2), seat("Bo", 1), seat("Cy", null), seat("Di", 3)]).map((x) => x.displayName), ["Bo", "Ann", "Di", "Cy"], "by place; an unknown place last, in seat order");
  assert.equal(M.openedIn("?game=g_3vh2qxaaaaaaaaaaaaaaaaaaqtsw"), "g_3vh2qxaaaaaaaaaaaaaaaaaaqtsw");
  for (const bad of ["", "?game=", "?game=../x", "?game=G_ABC123", "?game=g_<script>", "?id=g_3vh2qxaaaaaaaaaaaaaaaaaaqtsw"]) assert.equal(M.openedIn(bad), null, bad);
  assert.equal(G.targetOf("?id=g_3vh2qxaaaaaaaaaaaaaaaaaaqtsw"), "/me/?game=g_3vh2qxaaaaaaaaaaaaaaaaaaqtsw", "an old link opens that game in Your record");
  for (const bad of ["", "?id=", "?id=//evil.example", "?id=g_x%22onload", "?id=https://evil.example/"]) assert.equal(G.targetOf(bad), "/me/", `${bad}: Your record, never elsewhere`);
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

test("v1.5 a player's public page: the name asked for; Identity, Experience and Performance from the first day, a Skill Rating labelled Provisional until 5", () => {
  const { window } = load(["records.js", "player-page.js"]);
  const P = window.LudumPlayerPage;
  assert.equal(P.nameOf("?name=Marlowe"), "Marlowe");
  assert.equal(P.nameOf("?name=%20Ada%20L.%20"), "Ada L.");
  assert.equal(P.nameOf("?name=a%2Fb%3Fc"), "a/b?c", "a name may hold / and ?");
  assert.equal(P.nameOf(""), null);
  assert.equal(P.nameOf("?name=%20%20"), null);
  assert.equal(P.nameOf("?name=" + "x".repeat(65)), null);
  const rows = (stats) => stats.map((s) => [s.label, s.value, s.small]);
  const rating = (state, value, games) => ({ domain: "project-18xx", name: "Project 18XX", rating: state === "established" ? { state, value, games } : { state, value, games, needed: 5 } });
  /* A new account: every figure shown at once. */
  const fresh = P.profileOf({ name: "Ann", memberSince: "2026-10", completedGames: 0, uniqueOpponents: 0, activityRank: null, credits: { state: "established", value: 500, games: 0 }, lifetimeEarnings: { state: "established", value: 0, games: 0 }, ratings: [rating("provisional", 1500, 0)] });
  assert.equal(fresh.memberSince, "Oct 2026");
  eq(rows(fresh.experience), [["Completed Games", "0", null], ["Unique Opponents", "0", null], ["Activity Rank", "—", "Not ranked yet"]]);
  eq(rows(fresh.performance), [["Credits", "500", null], ["Lifetime Earnings", "0", null], ["Skill Rating · Project 18XX", "1,500", "Provisional · 0 of 5"]]);
  /* Four rated games: still provisional; the fifth removes the label. */
  const four = P.profileOf({ name: "Bo", memberSince: "2026-09", completedGames: 4, uniqueOpponents: 3, activityRank: { rank: 12, of: 40 }, credits: { state: "established", value: 1340, games: 4 }, lifetimeEarnings: { state: "established", value: 52, games: 4 }, ratings: [rating("provisional", 1523.4, 4)] });
  eq(rows(four.experience), [["Completed Games", "4", null], ["Unique Opponents", "3", null], ["Activity Rank", "#12", "of 40"]]);
  eq(rows(four.performance).slice(2), [["Skill Rating · Project 18XX", "1,523", "Provisional · 4 of 5"]]);
  const five = P.profileOf({ name: "Bo", completedGames: 5, credits: { state: "established", value: 1340, games: 5 }, lifetimeEarnings: { state: "established", value: 52, games: 5 }, ratings: [rating("established", 1531, 5), { domain: "steel-meridian", name: "Steel Meridian", rating: { state: "provisional", value: 1500, games: 0, needed: 5 } }] });
  eq(rows(five.performance).slice(2), [["Skill Rating · Project 18XX", "1,531", null], ["Skill Rating · Steel Meridian", "1,500", "Provisional · 0 of 5"]], "each game its own rating; established: no label");
  /* An older server's answer (no experience, a figure without its value): dashes, never a guess. */
  const old = P.profileOf({ name: "Cy", credits: { state: "provisional", games: 2, needed: 5 }, lifetimeEarnings: { state: "provisional", games: 2, needed: 5 }, ratings: [] });
  assert.equal(old.memberSince, null);
  eq(rows(old.experience), [["Completed Games", "—", null], ["Unique Opponents", "—", null], ["Activity Rank", "—", null]]);
  eq(rows(old.performance), [["Credits", "—", null], ["Lifetime Earnings", "—", null]]);
  for (const s of [...fresh.experience, ...fresh.performance]) assert.ok(typeof s.tip === "string" && s.tip.length > 0 && s.tip.length <= 120, `a short tooltip for ${s.label}`);
});

test("v1.3 the profile pages speak to players: no internal terminology in what they say (moved from Play's M2-E check)", () => {
  /* Comments are stripped: they may name anything. Strings are what a player can be shown. */
  const said = (file) => readFileSync(resolve(JS, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const file of ["me-record.js", "game-record.js", "player-page.js", "account-page.js"]) {
    const text = said(file);
    eq([file, (text.match(/Hybrid|Elo\b|game server|on this server|record_schema|protocol|\bC[123]\b|principal|ledger entr|ratingUnits/i) || [null])[0]], [file, null]);
    /* §17: no player-facing technical record, escrow ledger, internal game id or repeated notice about the retired escrow. */
    eq([file, (text.match(/Technical record|Escrow ledger|Escrow game|Escrow state|Game id|JUNOX table|retired real-money|Not readable now|Ante\b/) || [null])[0]], [file, null]);
  }
  /* The distinctions that matter are still said (in the tooltips): what others see. Owner policy 2026-10-22: nothing
     is withheld until a game count, so no page says a figure is private or "not shown yet". */
  const record = said("me-record.js");
  assert.match(record, /Other players see this total on your public profile/);
  assert.match(record, /never below 0/);
  assert.match(record, /It counts activity, not skill/);
  for (const file of ["me-record.js", "player-page.js", "account-page.js", "records.js"]) {
    eq([file, (said(file).match(/Not shown yet|Private ·|once you have 5|once a player has 5|Players met/) || [null])[0]], [file, null]);
  }
  assert.match(said("player-page.js"), /'Unique Opponents'/);
  assert.match(said("account-page.js"), /'Unique opponents'/);
});

