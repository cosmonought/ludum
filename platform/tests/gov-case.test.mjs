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

/* The case page itself (and the other governance pages) is tested in gov-pages-design.test.mjs. */

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
