// The records pages' pure logic: formatting, the profile tabs' two-authorities rule, the account menu's entries, the
// record's results and head, the display name's sentences, the game docket and the moderation transitions.
// Run from the repository root: node --test platform/tests/records.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

test("profile tabs: Moderation only for a Play reviewer, Disputes only for a DAO member or the Appeals team (or while on it) -- never merged, never counted", () => {
  /* pass.js draws the row: a small DOM is enough to read its links. */
  class N {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.className = ""; this._text = null; }
    get firstChild() { return this.children[0] || null; }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
    set textContent(v) { this.children = []; this._text = String(v); }
    get textContent() { return (this._text ?? "") + this.children.map((c) => c.textContent).join(""); }
    set innerHTML(_) { this.children = []; }
  }
  const document = { createElement: (tag) => new N(tag), createTextNode: (v) => ({ textContent: String(v) }) };
  const context = vm.createContext({ window: {}, document, Date, JSON, Object, Array, String, Number, Math, Intl, isFinite, globalThis: undefined });
  context.globalThis = context;
  vm.runInContext(readFileSync(resolve(JS, "pass.js"), "utf8"), context, { filename: "pass.js" });
  const P = context.window.LudumPass || context.LudumPass;
  const links = (session, current, opts) => P.tabsRow(session, current, opts).children[0].children;
  const tabs = (session, current, opts) => links(session, current, opts).map((a) => a.textContent.trim());
  const player = { signedIn: true, roles: { reviewer: false } };
  const reviewer = { signedIn: true, roles: { reviewer: true } };
  /* LUDUM RESULT REVIEW: appeals are open, so Disputes -- where each player follows their own -- is every signed-in
     account's tab; Moderation stays a reviewer's. */
  eq(tabs(player, "games", {}), ["Games", "Account", "Disputes"]);
  eq(tabs(reviewer, "games", {}), ["Games", "Account", "Moderation", "Disputes"]);
  eq(tabs(player, "games", { daoMember: { checkedAt: 1 } }), ["Games", "Account", "Disputes"], "DAO membership adds nothing now");
  eq(tabs({ signedIn: true }, "games", {}), ["Games", "Account", "Disputes"], "an older server's session (no roles) draws no Moderation");
  eq(tabs({ signedIn: false }, "games", {}), ["Games", "Account"], "a signed-out session has no Disputes of its own");
  eq(tabs(reviewer, "moderation", { moderation: 3, disputes: 0 }), ["Games", "Account", "Moderation 3", "Disputes"], "a count only when there is something to do");
  const appeals = { signedIn: true, roles: { reviewer: false }, staff: { roles: ["appeals"], permissions: ["appeal.review", "staff.view"] } };
  eq(tabs(appeals, "games", {}), ["Games", "Account", "Disputes"]);
  eq(tabs(player, "disputes", { disputes: 4 }), ["Games", "Account", "Disputes"], "no count beside Disputes, whatever is passed");
  const current = links(reviewer, "moderation", {}).filter((a) => a.getAttribute("aria-current") === "page");
  eq(current.map((a) => a.getAttribute("href")), ["/moderation/"]);
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

test("account menu (the pass, owner 2026-10-22): one entry, Sign out; the name is a link to your profile, marked on your own pages; nothing opens on hover", () => {
  const { window } = load(["records.js", "account-menu.js"], { LudumSession: { whoami: () => new Promise(() => {}) } });
  const M = window.LudumAccountMenu;
  eq(M.entries(), [{ action: "sign-out", text: "Sign out" }]);
  for (const own of ["/me/", "/me/account/"]) assert.equal(M.isOwnProfile(own), true, own);
  for (const other of ["/", "/players/", "/moderation/", "/disputes/", "/me/sign-in/", "/me/recover/"]) assert.equal(M.isOwnProfile(other), false, other);
  const src = readFileSync(resolve(JS, "account-menu.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(src, /class: 'ld-nav__who', href: '\/me\/'/, "the name is an ordinary link to /me/");
  assert.match(src, /'aria-controls': 'ld-out', 'aria-label': 'Account menu'/, "a separate arrow button controls the menu");
  assert.match(src, /e\.detail === 0/, "opened from the keyboard, Sign out takes the focus");
  assert.match(src, /e\.key === 'Escape'/);
  assert.doesNotMatch(src, /mouseover|mouseenter|:hover/, "nothing opens on hover");
  assert.doesNotMatch(src, /Your record|Your account|Appeals/, "Games, Account and Disputes are reached from the profile");
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

test("v1.7: a cancelled table is never listed -- the retired escrow's money tables included", () => {
  const { window } = load(["records.js", "me-record.js"]);
  const M = window.LudumMeRecord;
  assert.equal(M.keepsCancelled, undefined, "no escrow exception to the rule");
  const src = readFileSync(resolve(JS, "me-record.js"), "utf8");
  assert.match(src, /var listed = all\.filter\(function \(g\) \{ return !isCancelled\(g\); \}\);/);
  assert.doesNotMatch(src, /chainGameId/);
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

test("Your account (v1.6): four rows -- the Player Name (no change by the player: v1.7, staff may), the wallet, the password's date, the sessions", () => {
  const { window } = load(["records.js", "pass.js", "ticket.js", "account-page.js"]);
  const A = window.LudumAccountPage;
  const rows = A.rowsOf({ account: { name: "Caspian", authorizationWallet: { address: "juno1q8dk3lmn2p4r6t8v0x2z4b6d8f0h2j4lx7q2k", since: "2026-10-14T09:00:00.000Z" }, passwordSetAt: "2026-10-15T09:00:00.000Z" } });
  eq(rows, { name: "Caspian", wallet: { address: "juno1q8dk3lmn2p4r6t8v0x2z4b6d8f0h2j4lx7q2k", short: "juno1q8dk…x7q2k", since: "14 Oct 2026" }, password: "Changed 15 Oct 2026" });
  eq(A.rowsOf({ account: { name: "Bo", authorizationWallet: null } }), { name: "Bo", wallet: null, password: "Set" });
  assert.equal(A.sessionsText(0), "No other session was signed in.");
  assert.equal(A.sessionsText(2), "Signed out 2 other sessions.");
  const src = readFileSync(resolve(JS, "account-page.js"), "utf8");
  assert.doesNotMatch(src, /display-name|Change name|change it once|Sign-in username/, "no ordinary name change and no separate username");
  assert.match(src, /Your Player Name cannot be changed by you after registration\. Ludum staff may change it when necessary\./);
  assert.match(src, /Confirm with your current password, or with Keplr\./);
  assert.match(src, /Nothing changes until the new wallet accepts\./);
  assert.match(src, /released it less than 24 hours ago/, "wallet exclusivity's cooldown, named");
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
  const { window } = load(["records.js", "pass.js", "work.js", "moderation-page.js"]);
  const M = window.LudumModeration;
  eq(M.TRANSITIONS["no-violation"], ["under-review"]);
  eq(M.TRANSITIONS.open, ["under-review", "no-violation", "conduct-confirmed", "escalated"]);
  const c = (status) => ({ status });
  eq(M.counts([c("open"), c("open"), c("under-review"), c("escalated"), c("no-violation"), c("conduct-confirmed")]), { all: 6, open: 2, review: 1, escalated: 1, closed: 2 });
});

test("the new pages load their scripts in order, with the §2.4 CSP first and the records layer after ludum.css (v1.6: the pass after it)", () => {
  const ROOT = resolve(JS, "..", "..");
  const pass = ["/platform/js/pass.js"];
  for (const [rel, before, script] of [
    ["me/index.html", pass, "me-record.js"],
    ["me/account/index.html", [...pass, "/platform/js/ticket.js", "/platform/js/gov.js"], "account-page.js"],
    ["me/game/index.html", [], "game-record.js"],
    ["moderation/index.html", [...pass, "/platform/js/work.js", "/platform/js/gov.js"], "moderation-page.js"],
    ["moderation/case/index.html", [...pass, "/platform/js/work.js", "/platform/js/gov.js"], "moderation-page.js"],
    ["players/index.html", [...pass, "/platform/js/work.js", "/platform/js/staff-manage.js", "/platform/js/gov.js"], "player-page.js"],
  ]) {
    /* Read as the site serves it, line ends normalised (a Windows checkout writes CRLF; the published file is LF). */
    const html = readFileSync(resolve(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    eq(order, ["https://netadao.org/radio/radio.js", "/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", ...before, "/platform/js/auth.js", "/platform/js/account-menu.js", `/platform/js/${script}`, "/platform/js/page-init.js"], rel);
    assert.ok(html.indexOf("/design-system/css/ludum.css") < html.indexOf("/platform/css/records.css"), rel);
    if (before.length) assert.ok(html.indexOf("/platform/css/records.css") < html.indexOf("/platform/css/pass.css"), `${rel}: the pass's stylesheet after the records layer`);
    assert.match(html, /<head>\n<meta http-equiv="Content-Security-Policy"/, rel);
    assert.doesNotMatch(html, /ld-specimen/, `${rel}: no Specimen band on a live page`);
  }
});

test("v1.5/v1.6 the pass: every figure from the first day; a Skill Rating Provisional until five, one plate per game in its own field; names stepped by length; the directory's search", () => {
  const { window } = load(["records.js", "pass.js", "player-page.js"]);
  const P = window.LudumPlayerPage;
  const L = window.LudumPass;
  assert.equal(P.nameOf("?name=Marlowe"), "Marlowe");
  assert.equal(P.nameOf("?name=%20Ada%20L.%20"), "Ada L.");
  assert.equal(P.nameOf("?name=a%2Fb%3Fc"), "a/b?c", "a name may hold / and ?");
  assert.equal(P.nameOf(""), null);
  assert.equal(P.nameOf("?name=%20%20"), null);
  assert.equal(P.nameOf("?name=" + "x".repeat(65)), null);
  const rating = (domain, state, value, games) => ({ domain, name: domain, rating: state === "established" ? { state, value, games } : { state, value, games, needed: 5 } });
  /* A first-day account: every figure shown at once; no rank yet. */
  const fresh = L.figuresOfPlayer({ name: "Ann", memberSince: "2026-10", completedGames: 0, uniqueOpponents: 0, activityRank: null, credits: { state: "established", value: 500, games: 0 }, lifetimeEarnings: { state: "established", value: 0, games: 0 }, ratings: [rating("project-18xx", "provisional", 1500, 0)] });
  eq(fresh, { name: "Ann", credits: 500, earnings: 0, rank: null, completed: 0, opponents: 0, memberSince: "2026-10", ratings: [{ domain: "project-18xx", name: "project-18xx", value: 1500, established: false, games: 0, needed: 5 }] });
  /* Four rated games: still provisional; the fifth establishes it -- each game its own rating. */
  const four = L.figuresOfPlayer({ name: "Bo", activityRank: { rank: 12, of: 40 }, completedGames: 4, credits: { state: "established", value: 1340, games: 4 }, lifetimeEarnings: { state: "established", value: 52, games: 4 }, ratings: [rating("project-18xx", "provisional", 1523.4, 4)] });
  eq([four.rank, four.ratings[0].established, four.ratings[0].games], [{ rank: 12, of: 40 }, false, 4]);
  const five = L.figuresOfPlayer({ name: "Bo", credits: { state: "established", value: 1340, games: 5 }, lifetimeEarnings: { state: "established", value: 52, games: 5 }, ratings: [rating("project-18xx", "established", 1531, 5), rating("steel-meridian", "provisional", 1500, 0)] });
  eq(five.ratings.map((r) => [r.domain, r.established]), [["project-18xx", true], ["steel-meridian", false]]);
  /* An older server's answer (no experience, a figure without its value): nulls, drawn as dashes, never a guess. */
  const old = L.figuresOfPlayer({ name: "Cy", credits: { state: "provisional", games: 2, needed: 5 }, lifetimeEarnings: { state: "provisional", games: 2, needed: 5 }, ratings: [] });
  eq([old.credits, old.earnings, old.completed, old.opponents, old.memberSince, old.rank], [null, null, null, null, null, null]);
  /* Your own pass reads exactly the public figures of `profile` (never the private breakdown) and its standing. */
  const own = L.figuresOfProfile({ credits: { holdings: 653, available: 403 }, publicCredits: { state: "established", value: 653, games: 3 }, lifetimeEarnings: -10, publicLifetimeEarnings: { state: "established", value: 0, games: 3 },
    ratings: [{ domain: "project-18xx", name: "Project 18XX", rating: 1505.3, games: 3, established: false, public: { state: "provisional", value: 1505, games: 3, needed: 5 } }], gamesPlayed: { count: 6, rank: 4, of: 37 },
    standing: { memberSince: "2026-10", completedGames: 6, uniqueOpponents: 5, activityRank: { rank: 4, of: 37 } } }, { account: { name: "Caspian", memberSince: "2026-10" } });
  eq([own.name, own.credits, own.earnings, own.completed, own.opponents, own.rank, own.ratings[0].value], ["Caspian", 653, 0, 6, 5, { rank: 4, of: 37 }, 1505], "the signed Lifetime Earnings never appear");
  /* The design's steps. */
  eq(["Caspian", "Marlowe Fitzgerald", "Marlowe Fitzgerald-Quill", "x".repeat(64)].map(L.nameSize), ["", "m", "s", "s"]);
  eq([0, 1, 2, 3, 4, 6].map(L.platesLayout), ["", "", "stack", "stack", "dense", "dense"]);
  eq(L.plateOf("steel-meridian").modifier, "ld-plate--sm");
  eq(L.plateOf("20-cosmos").modifier, "ld-plate--c20");
  eq(L.plateOf("project-18xx").lockup, ["Project ", ["b", "18XX"]]);
  const seven = [1, 9, 3, 9, 2, 0, 5].map((games, i) => ({ domain: "g" + i, games }));
  eq(L.platesOrder(seven).map((r) => r.domain), ["g1", "g3", "g6", "g2", "g4", "g0"], "the six most played; ties keep the server's order");
  /* The directory: the search, the count line, the marked match at the start of a word only. */
  eq(P.directoryOf("?q=%20Mar%20&page=2"), { query: "Mar", page: 2 });
  eq(P.directoryOf("?page=0"), { query: "", page: 1 });
  eq([P.matchOf("Marlowe", "mar"), P.matchOf("Ann Marsh", "mar"), P.matchOf("Hamar", "mar"), P.matchOf("Mary Ann", "ann")], [[0, 3], [4, 7], null, [5, 8]]);
  assert.equal(P.countLine(1, "Mar"), "1 player matching “Mar”");
  assert.equal(P.countLine(3, ""), "All 3 players, A to Z");
});

test("v1.3 the profile pages speak to players: no internal terminology in what they say (moved from Play's M2-E check)", () => {
  /* Comments are stripped: they may name anything. Strings are what a player can be shown. */
  const said = (file) => readFileSync(resolve(JS, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const file of ["me-record.js", "game-record.js", "player-page.js", "account-page.js", "pass.js", "auth-page.js", "ticket.js"]) {
    /* `autocomplete: 'username'` is the approved markup for the Player Name field, never shown. */
    const text = said(file).replace(/autocomplete: 'username'/g, "");
    eq([file, (text.match(/Hybrid|Elo\b|game server|on this server|record_schema|protocol|\bC[123]\b|principal|ledger entr|ratingUnits|username/i) || [null])[0]], [file, null]);
    /* §17: no player-facing technical record, escrow ledger, internal game id or repeated notice about the retired escrow. */
    eq([file, (text.match(/Technical record|Escrow ledger|Escrow game|Escrow state|Game id|JUNOX table|retired real-money|Not readable now|Ante\b|escrow/i) || [null])[0]], [file, null]);
  }
  /* The distinctions that matter are said once, under the pass ("How these figures are counted"). Owner policy
     2026-10-22: nothing is withheld until a game count, so no page says a figure is private or "not shown yet". */
  const pass = said("pass.js");
  assert.match(pass, /Never shown below 0/);
  assert.match(pass, /It measures activity, not skill/);
  assert.match(pass, /Provisional until five rated games in that game/);
  assert.match(pass, /'Unique Opponents'/);
  /* Owner decision 2026-10-23 (1830Juno permanent results): a clock-forced ending counts as a game played, so the figure
     is Games Played -- never 'Completed Games' -- and says which endings count. */
  assert.match(pass, /'Games Played', 'Games played to the end, and games the table clock ended after a player ran out of time./);
  assert.doesNotMatch(pass, /Completed Games|by completed games/);
  assert.match(pass, /Not ranked yet/);
  for (const file of ["me-record.js", "player-page.js", "account-page.js", "records.js", "pass.js"]) {
    eq([file, (said(file).match(/Not shown yet|Private ·|once you have 5|once a player has 5|Players met/) || [null])[0]], [file, null]);
  }
  /* In-game dollars are never called credits, and credits never dollars. */
  const record = said("me-record.js");
  assert.match(record, /in in-game dollars/);
  assert.doesNotMatch(record, /\$[^{]*credits|credits[^']*\$/);
});

/* ---------- /me/'s cold start (owner performance review 2026-10-23) ---------- */

/** A DOM small enough for the profile page's first moments: elements, text, attributes, children. */
class FakeNode {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.children = []; this.className = ""; this.classList = { toggle() {}, add() {}, remove() {}, contains: () => false }; this.style = {}; this.hidden = false; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c, ref) { const at = ref ? this.children.indexOf(ref) : -1; if (at < 0) this.children.push(c); else this.children.splice(at, 0, c); c.parentNode = this; return c; }
  replaceChildren(...nodes) { this.children = []; nodes.forEach((n) => this.appendChild(n)); }
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.children = v === "" ? [] : [new FakeText(String(v))]; }
  set innerHTML(v) { this.children = [new FakeNode("svg")]; }
  addEventListener() {}
  querySelector(selector) { return this.find((n) => selector === "[data-pass-slot]" ? n.hasAttribute && n.hasAttribute("data-pass-slot") : false); }
  querySelectorAll() { return []; }
  find(test) { for (const c of this.children) { if (c instanceof FakeNode) { if (test(c)) return c; const deeper = c.find(test); if (deeper) return deeper; } } return null; }
  all(test, out = []) { for (const c of this.children) if (c instanceof FakeNode) { if (test(c)) out.push(c); c.all(test, out); } return out; }
}
class FakeText { constructor(text) { this.textContent = text; } }

function loadDom(files) {
  const storage = new Map();
  const window = {
    location: { pathname: "/me/", search: "", assign() {}, replace() {} },
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    LudumSession: { signInUrl: (p) => "/me/sign-in/?return=" + encodeURIComponent(p || "/me/") },
  };
  const document = { readyState: "complete", querySelector: () => null, addEventListener() {}, createElement: (tag) => new FakeNode(tag), createTextNode: (text) => new FakeText(text) };
  const context = vm.createContext({ window, document, URLSearchParams, Date, JSON, Object, Array, String, Number, Math, BigInt, Promise, Error, encodeURIComponent, setTimeout, clearTimeout, globalThis: undefined });
  context.globalThis = context;
  for (const f of files) vm.runInContext(readFileSync(resolve(JS, f), "utf8"), context, { filename: f });
  const root = new FakeNode("main");
  const slot = new FakeNode("div");
  slot.setAttribute("data-pass-slot", "");
  slot.textContent = "Reading your profile…";
  root.appendChild(slot);
  return { window, root, slot };
}

/** A session whose answer the case gives when it chooses; every read it is asked for, in order. */
function heldSession() {
  const asked = [];
  let answer;
  const who = new Promise((resolve) => (answer = resolve));
  return { asked, answer: (w) => answer(w), session: { whoami: () => { asked.push("session"); return who; }, api: (route) => { asked.push(route); return new Promise(() => {}); } } };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("/me/ cold start: the pass's shell at once -- no name, no figure, no tab; the session and the figures first; the games only once signed in", async () => {
  const { window, root, slot } = loadDom(["records.js", "pass.js", "me-record.js"]);
  const held = heldSession();
  window.LudumMeRecord.mount(root, held.session);
  /* Before the session answers: the shell, the same for every visitor. */
  const shell = slot.find((n) => n.className === "ld-pass");
  assert.ok(shell, "the pass's shell is drawn at once");
  assert.equal(shell.getAttribute("aria-busy"), "true");
  assert.equal(shell.find((n) => n.tagName === "H1").textContent.trim(), "", "no name");
  assert.ok(!/Reading your profile/.test(slot.textContent), "the placeholder is gone");
  assert.ok(!slot.find((n) => n.className === "ld-tabsrow"), "no private tab before the session");
  assert.ok(!/[0-9]/.test(shell.all((n) => n.tagName === "DD").map((n) => n.textContent).join("")), "no figure");
  eq(held.asked, ["session", "profile"], "the games wait for the session");
  /* Signed out: the games are never asked for. */
  held.answer({ signedIn: false });
  await settle();
  eq(held.asked, ["session", "profile"]);
  assert.match(slot.textContent, /Signed out/);
  /* Signed in: the name, the private tabs, and only now the games. */
  const again = loadDom(["records.js", "pass.js", "me-record.js"]);
  const signedIn = heldSession();
  again.window.LudumMeRecord.mount(again.root, signedIn.session);
  signedIn.answer({ signedIn: true, account: { name: "Ann Player", authorizationWallet: null }, roles: {} });
  await settle();
  eq(signedIn.asked, ["session", "profile", "games"]);
  assert.equal(again.slot.find((n) => n.tagName === "H1").textContent, "Ann Player");
  assert.ok(again.slot.find((n) => n.className === "ld-tabsrow"), "the private tabs, once signed in");
});

test("/me/ opens the connections to play.netadao.org early: credentialed (the reads) and anonymous (their preflights)", () => {
  const html = readFileSync(resolve(JS, "..", "..", "me", "index.html"), "utf8");
  const hints = [...html.matchAll(/<link rel="preconnect" href="([^"]+)"( crossorigin)?>/g)].map((m) => [m[1], m[2] !== undefined]);
  eq(hints, [["https://play.netadao.org", false], ["https://play.netadao.org", true]]);
  assert.ok(html.indexOf('rel="preconnect"') > html.indexOf("Content-Security-Policy"), "after the CSP, which stays the first child of <head>");
});

/** One top-level rule's declarations in a stylesheet, by its exact selector (null when there is none). */
function ruleOf(css, selector) {
  const line = css.split(/\r?\n/).find((l) => l.startsWith(selector + " { "));
  return line ? line.slice(selector.length + 3, line.lastIndexOf(" }")).trim() : null;
}

test("/me/ Games: no second rule under the tab row -- its states start 4px down, as Account's first row does; .ld-none keeps its rule elsewhere", async () => {
  const signedIn = { signedIn: true, account: { name: "Ann Player", authorizationWallet: null }, roles: {} };
  const panelWith = async (games) => {
    const page = loadDom(["records.js", "pass.js", "me-record.js"]);
    page.window.LudumMeRecord.mount(page.root, { whoami: () => Promise.resolve(signedIn), api: (route) => (route === "games" ? games() : new Promise(() => {})) });
    await settle();
    return page.slot.find((n) => n.tagName === "SECTION");
  };
  /* Reading, no games yet and unreadable are each drawn inside the Games panel, which carries the modifier. */
  const reading = await panelWith(() => new Promise(() => {}));
  assert.equal(reading.className, "ld-panel ld-panel--games");
  assert.ok(reading.find((n) => n.className === "ld-games__muted" && n.getAttribute("role") === "status" && n.textContent === "Reading your games…"));
  const empty = await panelWith(() => Promise.resolve({ games: [], nextCursor: null }));
  assert.match(empty.find((n) => n.className === "ld-none").textContent, /^No games yet/);
  const failed = await panelWith(() => Promise.reject({ error: "unavailable" }));
  assert.match(failed.find((n) => n.className === "ld-none").textContent, /^Your games can’t be read right now/);

  const css = readFileSync(resolve(JS, "..", "css", "pass.css"), "utf8");
  assert.equal(ruleOf(css, ".ld-panel--games .ld-none"), "margin-top: 0; padding-top: 4px; border-top: 0;");
  assert.equal(ruleOf(css, '.ld-panel--games p.ld-games__muted[role="status"]'), "margin: 0; padding-top: 4px;");
  assert.match(ruleOf(css, ".ld-account > div:first-child"), /padding-top: 4px;/, "level with Account's first row");
  assert.equal(ruleOf(css, ".ld-none"), "margin-top: 16px; padding: 22px 0 6px; border-top: 2px solid var(--rule-strong);", "everywhere else .ld-none keeps its rule");
  assert.match(ruleOf(css, ".ld-tabsrow"), /border-bottom: 2px solid var\(--rule-strong\);/, "the tab row's rule stays");
  assert.equal(ruleOf(css, ".ld-ptabs > a[aria-current]::after"), "transform: scaleX(1); background: var(--ink);", "and the current tab's bar");
  for (const file of readdirSync(JS).filter((f) => f.endsWith(".js") && f !== "me-record.js")) {
    assert.ok(!readFileSync(resolve(JS, file), "utf8").includes("ld-panel--games"), `${file}: only the Games panel carries the modifier`);
  }
});
