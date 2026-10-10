// The dispute case page's B2 server record (architecture §5 `case`): platform/js/gov-case.js unit by unit, then the real
// case page (gov.js + gov-case.js + gov-page.js) driven in a minimal fake DOM with a mocked chain REST endpoint and a
// mocked LudumSession -- no network, no wallet.
// Run from the repository root: node --test platform/tests/gov-case.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const LudumGovMod = (() => { const c = vm.createContext({ TextEncoder, TextDecoder, atob, btoa, Promise, setTimeout, clearTimeout }); c.window = c; vm.runInContext(src("platform/js/gov.js"), c); return c.LudumGov; })();
const LudumCase = (() => { const c = vm.createContext({ Promise }); c.window = c; vm.runInContext(src("platform/js/gov-case.js"), c); return c.LudumCase; })();
const P = LudumGovMod.PINS;

/* ---- Fixtures in the §5 / contract shapes ---- */
const W0 = "juno1" + "q".repeat(38);
const W1 = "juno1" + "p".repeat(38);
const W9 = "juno1" + "z".repeat(38);
const EV = "ab".repeat(32), LOG = "cd".repeat(32), BOARD = "ef".repeat(32);
const NOW = Math.floor(Date.now() / 1000);
const ns = (secs) => String(secs) + "000000000";
const READ = "2026-10-09T12:00:00.000Z";
const chainFact = (value) => ({ value, provenance: "chain-observed", observedAt: READ });
const none = (reason) => ({ value: null, provenance: "unavailable", reason });

function record(over = {}) {
  return {
    chainGameId: "7", contract: P.escrow, chainId: P.chainId,
    escrow: chainFact("disputed"),
    seats: [{ chainSeatIndex: 0, wallet: W0, isChallenger: false }, { chainSeatIndex: 1, wallet: W1, isChallenger: true }],
    dispute: chainFact({ challenger: W1, bond: { amount: "2437500", denom: "ujunox" }, evidenceHash: EV, disputedAt: "2026-10-01T00:00:00.000Z", resolverTimeoutAt: "2026-10-31T00:00:00.000Z" }),
    chainSettlement: chainFact({ seq: "12", logHash: LOG, appraisalStateHash: BOARD, weights: ["7400", "2600"] }),
    serverTerminal: { value: { logLen: 412, logHash: LOG, appraisalStateHash: BOARD, reason: "BankBroken", totalsBySeat: [{ chainSeatIndex: 0, dollars: 7400 }, { chainSeatIndex: 1, dollars: 2600 }] }, provenance: "server-recorded" },
    evidenceMatches: { value: "neither", provenance: "server-recorded" },
    ...over,
  };
}
const EXPECT = { chainGameId: "7", contract: P.escrow, chainId: P.chainId };

function chainGame(over = {}) {
  return {
    game: { chain_game_id: 7, state: "disputed", resolver: P.daoCore, pool: "9750000", ante_gross: "5000000",
      dispute: { challenger: W1, bond: "2437500", evidence_hash: EV, disputed_at: ns(NOW - 86400), resolution: null, resolved_at: null },
      settlement: { source: "consent", payload: { seq: "12", log_hash: LOG, appraisal_state_hash: BOARD, settlement_weights: ["7400", "2600"] }, accepted_at: ns(NOW - 2 * 86400) },
      ...over },
    deadlines: { resolver_timeout_at: ns(NOW + 20 * 86400), funding_deadline: ns(NOW - 9 * 86400), challenge_window_end: ns(NOW - 86400), liveness_available_at: null },
    latest_checkpoint: null,
  };
}
const SEATS = { seats: [{ chain_seat_index: 0, seat: { wallet: W0, net_deposit: "4875000" } }, { chain_seat_index: 1, seat: { wallet: W1, net_deposit: "4875000" } }] };
const proposalFor = (id, gameId, status, contract = P.escrow) => ({ id, proposal: { status, title: "t", description: "d", proposer: W0, total_power: "1000", votes: { yes: "0", no: "0", abstain: "0" },
  msgs: [{ wasm: { execute: { contract_addr: contract, msg: LudumGovMod.resolveB64(gameId, "annul"), funds: [] } } }] } });

/* ================= gov-case.js ================= */

test("validateRecord accepts exactly a §5 record for this game, contract and chain", () => {
  assert.equal(LudumCase.validateRecord(record(), EXPECT).ok, true);
  const unavailableParts = record({ dispute: none("no dispute is recorded on chain for this game"), seats: [{ chainSeatIndex: 0, wallet: W0, isChallenger: false }, { chainSeatIndex: 1, wallet: W1, isChallenger: false }],
    chainSettlement: none("no settlement"), serverTerminal: none("this server holds no record of this chain game"), evidenceMatches: none("no dispute") });
  assert.equal(LudumCase.validateRecord(unavailableParts, EXPECT).ok, true, "unavailable parts with reasons are a valid record");
});

test("validateRecord rejects mismatched identities and anything outside the §5 / §4 rules", () => {
  const bad = [
    [record({ chainGameId: "8" }), /not #7/],
    [record({ contract: "juno1" + "x".repeat(58) }), /different escrow contract/],
    [record({ chainId: "juno-1" }), /different chain/],
    [{ ...record(), extra: 1 }, /exactly the §5 fields/],
    [record({ escrow: { value: "disputed", provenance: "trust-me" } }), /unknown provenance/],
    [record({ escrow: { value: "disputed", provenance: "unavailable", reason: "x" } }), /carries a value/],
    [record({ escrow: { value: null, provenance: "unavailable" } }), /without a reason/],
    [record({ escrow: { value: "disputed", provenance: "chain-observed" } }), /without its read time/],
    [record({ escrow: chainFact("paused") }), /not an escrow state/],
    [record({ serverTerminal: { ...record().serverTerminal, provenance: "chain-confirmed", observedAt: READ } }), /cannot have/],
    [record({ seats: [{ chainSeatIndex: 0, wallet: W0, isChallenger: true }, { chainSeatIndex: 1, wallet: W1, isChallenger: true }] }), /inconsistently with the challenger/],
    [record({ seats: [{ chainSeatIndex: 1, wallet: W0, isChallenger: false }] }), /seat 0 is malformed/],
    [record({ dispute: chainFact({ challenger: W1, bond: { amount: "-1", denom: "ujunox" }, evidenceHash: EV, disputedAt: READ, resolverTimeoutAt: READ }) }), /dispute is malformed/],
    [record({ dispute: chainFact({ challenger: W1, bond: { amount: "1", denom: "ujuno" }, evidenceHash: EV, disputedAt: READ, resolverTimeoutAt: READ }) }), /dispute is malformed/],
    [record({ serverTerminal: { value: { ...record().serverTerminal.value, logLen: "412" }, provenance: "server-recorded" } }), /serverTerminal is malformed/],
    [record({ serverTerminal: { value: { ...record().serverTerminal.value, totalsBySeat: [{ chainSeatIndex: 0, dollars: 7400 }] }, provenance: "server-recorded" } }), /every seat/],
    [record({ evidenceMatches: { value: "probably", provenance: "server-recorded" } }), /known verdict/],
    [null, /not a case record/],
  ];
  for (const [rec, why] of bad) {
    const v = LudumCase.validateRecord(rec, EXPECT);
    assert.equal(v.ok, false, String(why));
    assert.match(v.problems.join("; "), why);
  }
});

test("crossCheck: identity facts must agree with this browser's chain read; a state difference is only a note", () => {
  const chain = { game: chainGame().game, seats: SEATS.seats };
  assert.deepEqual(JSON.parse(JSON.stringify(LudumCase.crossCheck(record(), chain))), { agree: true, problems: [], notes: [] });
  const moved = LudumCase.crossCheck(record({ escrow: chainFact("settleable") }), chain);
  assert.equal(moved.agree, true);
  assert.match(moved.notes[0], /different read times/);
  const wrongSeat = { game: chain.game, seats: [SEATS.seats[0], { chain_seat_index: 1, seat: { wallet: W9 } }] };
  assert.equal(LudumCase.crossCheck(record(), wrongSeat).agree, false);
  assert.match(LudumCase.crossCheck(record(), { game: chainGame({ dispute: { ...chainGame().game.dispute, challenger: W0 } }).game, seats: SEATS.seats }).problems.join(), /challenger differs/);
  assert.match(LudumCase.crossCheck(record(), { game: chainGame({ dispute: { ...chainGame().game.dispute, evidence_hash: LOG } }).game, seats: SEATS.seats }).problems.join(), /evidence hash differs/);
  assert.match(LudumCase.crossCheck(record(), { game: chainGame({ dispute: { ...chainGame().game.dispute, bond: "1" } }).game, seats: SEATS.seats }).problems.join(), /bond differs/);
  assert.match(LudumCase.crossCheck(record(), { game: chainGame({ dispute: null }).game, seats: SEATS.seats }).problems.join(), /does not/);
  assert.match(LudumCase.crossCheck(record(), { game: chainGame({ chain_game_id: 8 }).game, seats: SEATS.seats }).problems.join(), /different games/);
  assert.equal(LudumCase.crossCheck(record(), null).agree, null, "no chain read: not cross-checked, never 'agrees'");
});

test("fetchCase calls exactly the public `case` route, never redirects, and classifies every failure", async () => {
  const calls = [];
  const session = (answer) => ({ api: (route, body, options) => { calls.push([route, body, options]); return answer(); } });
  const ok = await LudumCase.fetchCase(session(() => Promise.resolve(record())), "7", EXPECT);
  assert.equal(ok.kind, "ok");
  assert.equal(calls[0][0], "case");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), { chainGameId: "7" }, "the closed body");
  assert.equal(calls[0][2], undefined, "no options: never a sign-in redirect");
  const err = (status, error, detail) => () => Promise.reject({ status, error, detail });
  for (const [status, kind] of [[0, "unreachable"], [400, "bad-request"], [404, "not-found"], [429, "rate-limited"], [503, "unavailable"], [401, "unexpected"], [500, "unexpected"]]) {
    assert.equal((await LudumCase.fetchCase(session(err(status, "x", "why")), "7", EXPECT)).kind, kind, `HTTP ${status}`);
  }
  assert.equal((await LudumCase.fetchCase(session(() => Promise.resolve(record({ chainGameId: "8" }))), "7", EXPECT)).kind, "invalid", "a record for another game is rejected");
  const before = calls.length;
  assert.equal((await LudumCase.fetchCase(session(() => Promise.resolve(record())), "7abc", EXPECT)).kind, "bad-request");
  assert.equal(calls.length, before, "a non-id is never sent");
  assert.equal((await LudumCase.fetchCase(undefined, "7", EXPECT)).kind, "no-client");
});

test("caseStatus comes from the chain read and decoded links only", () => {
  const g = chainGame().game;
  assert.equal(LudumCase.caseStatus(null, []).kind, "unknown");
  assert.equal(LudumCase.caseStatus({ ...g, dispute: null, state: "in_progress" }, []).kind, "no-dispute");
  assert.equal(LudumCase.caseStatus(g, []).kind, "disputed");
  assert.equal(LudumCase.caseStatus(g, [{ id: 3, status: "rejected", outcome: "annul" }]).kind, "disputed", "a rejected appeal is not pending");
  assert.equal(LudumCase.caseStatus(g, [{ id: 4, status: "open", outcome: "annul" }]).kind, "appeal-pending");
  assert.equal(LudumCase.caseStatus(g, [{ id: 4, status: "passed", outcome: "annul" }]).kind, "appeal-pending");
  assert.equal(LudumCase.caseStatus({ ...g, state: "annulled", dispute: { ...g.dispute, resolution: "annulled", resolved_at: ns(NOW) } }, []).kind, "resolved");
  assert.equal(LudumCase.caseStatus({ ...g, state: "settleable" }, []).kind, "dispute-ended");
});

/* ================= the real case page in a fake DOM ================= */

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.parentNode = null; this.attributes = {}; this.listeners = {}; this.className = ""; this.style = {}; this._text = null; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { if (c == null) return c; c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  click() { (this.listeners.click || []).forEach((f) => f({ currentTarget: this, preventDefault() {} })); }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return (this._text ?? "") + this.children.map((c) => c.textContent).join(""); }
  set innerHTML(_) { this.children = []; }
  get id() { return this.getAttribute("id"); }
  find(pred) { if (pred(this)) return this; for (const c of this.children) { const f = c.find?.(pred); if (f) return f; } return null; }
  findAll(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.findAll?.(pred, out); return out; }
}
class Text { constructor(t) { this.text = String(t); } get textContent() { return this.text; } }

function chainRest(handlers) {
  return async (url, init) => {
    const u = String(url);
    assert.ok(u.startsWith(P.rest), `only the pinned REST endpoint is read: ${u}`);
    assert.equal(init.method, "GET", `page load never POSTs to the chain: ${u}`);
    const m = u.match(/\/contract\/([^/]+)\/smart\/([^?]+)$/);
    assert.ok(m, `a smart query: ${u}`);
    const q = JSON.parse(Buffer.from(decodeURIComponent(m[2]), "base64").toString("utf8"));
    const key = Object.keys(q)[0];
    const answer = handlers(m[1], key, q[key]);
    const status = answer.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(status < 400 ? { data: answer.data } : { message: answer.message }) };
  };
}
function defaultChain(over = {}) {
  return (contract, key, args) => {
    if (over[key]) return over[key](contract, args);
    if (key === "proposal_modules") return { data: [{ address: P.proposalSingle, status: "enabled" }, { address: P.proposalMultiple, status: "enabled" }] };
    if (key === "voting_module") return { data: P.voting };
    if (key === "proposal_creation_policy") return { data: { module: { addr: P.preProposeSingle } } };
    if (key === "group_contract") return { data: P.cw4Group };
    if (key === "config" && contract === P.proposalSingle) return { data: { dao: P.daoCore, max_voting_period: { time: 604800 } } };
    if (key === "config" && contract === P.escrow) return { data: { contract_version: "2.1.0", config: { resolver: P.daoCore, denom: "ujunox" } } };
    if (key === "game") return { data: chainGame() };
    if (key === "seats") return { data: SEATS };
    if (key === "reverse_proposals") return { data: { proposals: [] } };
    throw new Error("unexpected query " + key);
  };
}

async function loadCasePage({ search = "?id=7", chain = defaultChain(), sessionApi, withSession = true } = {}) {
  const ids = ["gv-pins", "gv-wallet", "gv-case", "gv-case-title", "gv-propose", "gv-server"];
  const body = new Node("body");
  body.setAttribute("data-gov-page", "case");
  for (const id of ids) { const n = new Node("div"); n.setAttribute("id", id); body.appendChild(n); }
  const head = new Node("head");
  const document = {
    readyState: "complete", title: "", body, head,
    createElement: (t) => new Node(t), createTextNode: (t) => new Text(t),
    getElementById: (id) => body.find((n) => n.getAttribute && n.getAttribute("id") === id),
    addEventListener() {},
  };
  const keplr = { calls: 0, enable() { this.calls += 1; return Promise.resolve(); }, getKey() { this.calls += 1; return Promise.resolve(null); } };
  const apiCalls = [];
  const ctx = {
    document, URLSearchParams, TextEncoder, TextDecoder, atob, btoa, Promise, AbortController, setTimeout, clearTimeout,
    setInterval: () => 0, Date, JSON, Math, Number, String, Object, Array, Error, RegExp, Boolean, isFinite,
    location: { search, href: "https://ludum.netadao.org/disputes/case/" + search, reload() { throw new Error("reload during load"); }, ancestorOrigins: [] },
    fetch: chainRest(chain), keplr,
  };
  ctx.window = ctx; ctx.top = ctx; ctx.self = ctx;
  if (withSession) ctx.LudumSession = { api: (route, b, options) => { apiCalls.push([route, b, options]); return sessionApi ? sessionApi(route, b) : Promise.resolve(record()); } };
  vm.createContext(ctx);
  for (const f of ["platform/js/gov.js", "platform/js/gov-case.js", "platform/js/gov-page.js"]) vm.runInContext(src(f), ctx, { filename: f });
  for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r));
  const text = (id) => document.getElementById(id).textContent;
  return { ctx, document, head, keplr, apiCalls, text, el: (id) => document.getElementById(id) };
}

test("page: one real `case` call; the record is shown, cross-checked, with its provenance; no wallet or tx on load", async () => {
  const page = await loadCasePage();
  assert.equal(page.apiCalls.length, 1, "exactly one call");
  assert.equal(page.apiCalls[0][0], "case");
  assert.deepEqual(JSON.parse(JSON.stringify(page.apiCalls[0][1])), { chainGameId: "7" });
  assert.equal(page.apiCalls[0][2], undefined, "no sign-in redirect");
  const server = page.text("gv-server");
  assert.match(server, /agree with the chain facts above/);
  assert.match(server, /matches neither of the server’s hashes/);
  assert.match(server, /BankBroken/);
  assert.match(server, /\$7400/);
  assert.match(server, /in-game dollars · not JUNOX/);
  assert.match(server, /server record/);
  assert.match(page.text("gv-case"), /Disputed · no live appeal proposal/);
  assert.equal(page.keplr.calls, 0, "Keplr is never touched on load");
  assert.equal(page.head.children.length, 0, "the signing bundle is never loaded on load");
  assert.match(page.text("gv-propose"), /Not available: .*connect a Keplr wallet/);
});

test("page: 404, 503, 400, 429, network failure, unexpected status and an invalid record each say what happened and show nothing invented", async () => {
  const fail = (status, detail) => () => Promise.reject({ status, error: "x", detail });
  const cases = [
    [fail(404, "the escrow has no such game"), /No such game.*this browser read one from the chain.*disagree/],
    [fail(503, "the chain could not be read"), /Unavailable.*could not produce this record \(the chain could not be read\)/],
    [fail(400, "chainGameId must be a decimal string"), /Refused/],
    [fail(429), /Busy/],
    [fail(0, "Play could not be reached"), /could not be reached from this browser/],
    [fail(500), /answered unexpectedly \(HTTP 500\)/],
    [() => Promise.resolve(record({ chainGameId: "8" })), /Rejected.*not #7/],
    [() => Promise.resolve(record({ seats: [{ chainSeatIndex: 0, wallet: W0, isChallenger: false }, { chainSeatIndex: 1, wallet: W9, isChallenger: true }], dispute: chainFact({ ...record().dispute.value, challenger: W9 }) })), /Disagrees with the chain.*seat 1 differs/],
  ];
  for (const [answer, want] of cases) {
    const page = await loadCasePage({ sessionApi: answer });
    const server = page.text("gv-server");
    assert.match(server, want);
    assert.doesNotMatch(server, /\$7400|BankBroken|matches neither/, "no record fact is shown");
    assert.match(page.text("gv-case"), /Chain facts from escrow/, "the chain facts still stand on their own");
  }
});

test("page: a game the chain does not have, and a chain that cannot be read", async () => {
  const missing = await loadCasePage({ chain: defaultChain({ game: () => ({ status: 500, message: "codespace wasm: game not found" }) }), sessionApi: () => Promise.reject({ status: 404, error: "not-found" }) });
  assert.match(missing.text("gv-case"), /No such game/);
  assert.match(missing.text("gv-server"), /The server also reports that escrow .* has no game #7/);
  assert.match(missing.text("gv-propose"), /the escrow has no game #7/);
  const down = await loadCasePage({ chain: defaultChain({ game: () => ({ status: 502, message: "bad gateway" }) }) });
  assert.match(down.text("gv-case"), /Unavailable/);
  assert.match(down.text("gv-server"), /Not cross-checked: this browser could not read the chain/, "server record labelled as the server's alone");
  assert.match(down.text("gv-propose"), /chain facts are unavailable/, "no action without this browser's chain facts, whatever the server says");
});

test("page: the server record never enables an action -- the chain read decides, and the deadline guard holds", async () => {
  const settled = await loadCasePage({ chain: defaultChain({ game: () => ({ data: chainGame({ state: "settled", dispute: { ...chainGame().game.dispute, resolution: "upheld", resolved_at: ns(NOW) } }) }) }) });
  assert.match(settled.text("gv-case"), /Resolved · upheld/);
  assert.match(settled.text("gv-propose"), /is not disputed \(it is settled\)/, "the server saying 'disputed' changes nothing");
  assert.match(settled.text("gv-server"), /the server read the escrow as disputed; this browser read settled/);
  const late = await loadCasePage({ chain: defaultChain({ game: () => { const g = chainGame(); g.deadlines.resolver_timeout_at = ns(NOW + 3 * 86400); return { data: g }; } }) });
  assert.match(late.text("gv-propose"), /Deadline guard/);
  for (const page of [settled, late]) {
    const buttons = page.el("gv-propose").findAll((n) => n.tagName === "button" && /Uphold|Annul|Prepare proposal/.test(n.textContent));
    assert.ok(buttons.length >= 3);
    for (const b of buttons) assert.equal(b.getAttribute("aria-disabled"), "true", `${b.textContent} is disabled`);
  }
});

test("page: only proposals that decode to THIS game's Resolve on the pinned escrow are linked", async () => {
  const page = await loadCasePage({ chain: defaultChain({ reverse_proposals: () => ({ data: { proposals: [
    proposalFor(5, "8", "open"),
    proposalFor(6, "7", "open", "juno1" + "x".repeat(58)),
    proposalFor(4, "7", "open"),
  ] } }) }) });
  const caseText = page.text("gv-case");
  assert.match(caseText, /appeal pending: #4 open/);
  assert.doesNotMatch(caseText, /#5|#6/);
});

test("page: without LudumSession the page stays chain-only and says so", async () => {
  const page = await loadCasePage({ withSession: false });
  assert.match(page.text("gv-server"), /no connection to play\.netadao\.org/);
  assert.match(page.text("gv-case"), /Chain facts from escrow/);
});

test("disputes/case/index.html loads session.js, gov.js and gov-case.js before gov-page.js, once each", () => {
  const html = src("disputes/case/index.html");
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["https://netadao.org/radio/radio.js", "/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", "/platform/js/account-menu.js", "/platform/js/gov.js", "/platform/js/gov-case.js", "/platform/js/gov-page.js"]);
  assert.match(html, /id="gv-server"/);
});

/* v1.1 (1830Juno §5.1): a seat's table name and the server's relayed transactions are optional, and exact when present. */
test("v1.1: seat display names and relayed transactions are accepted when well formed, refused otherwise", () => {
  const H = "AB".repeat(32);
  const named = (names) => record({ seats: record().seats.map((s, i) => ({ ...s, displayName: names[i] })) });
  const tx = (relayed) => record({ transactions: { value: { relayed, walletSigned: "not-server-recorded" }, provenance: "server-recorded", observedAt: READ } });
  const ok = (rec) => LudumCase.validateRecord(rec, EXPECT).ok;
  assert.equal(ok(named(["Marlowe", null])), true);
  assert.equal(ok(tx([{ op: "start", txHash: H, status: { value: "included", provenance: "chain-observed", observedAt: READ, height: "100" }, at: READ }, { op: "settle", txHash: H, status: { value: "broadcast", provenance: "pending" }, at: READ }])), true);
  assert.equal(ok(record({ transactions: none("this server relays no transactions") })), true);
  assert.equal(ok(named(["", "Quill"])), false, "an empty name");
  assert.equal(ok(named(["x".repeat(65), "Quill"])), false, "an overlong name");
  assert.equal(ok(named([7, "Quill"])), false, "a non-string name");
  assert.equal(ok(tx([{ op: "transfer", txHash: H, status: { value: "included", provenance: "chain-observed" }, at: READ }])), false, "an unknown step");
  assert.equal(ok(tx([{ op: "start", txHash: "ab".repeat(32), status: { value: "included", provenance: "chain-observed" }, at: READ }])), false, "a lower-case hash");
  assert.equal(ok(tx([{ op: "start", txHash: H, status: { value: "included", provenance: "pending" }, at: READ }])), false, "an impossible status");
  assert.equal(ok(record({ transactions: { value: { relayed: [], walletSigned: "x" }, provenance: "server-recorded" } })), false);
  assert.equal(ok(record({ extra: 1 })), false, "any other new field is still refused");
});
