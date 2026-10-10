// LudumGov: §6 builders byte for byte, pin check, deadline guard, link-by-decoding, framing guard.
// Run from the repository root: node --test platform/tests/gov.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const G = require("../js/gov.js");

const ESCROW = "juno19vd5hphghprl2m8agchctyav8pmeh6p4x3vud6cfhd2y6ulwtf0s0jrk7x";
const PREPROPOSE = "juno1huu2ysuct2e9xnmxc28xdwfeflytw2samzp95a2devjqs0qfj6fqpsmvcf";
const SINGLE = "juno1shhuc4w9ht7kfzjamhz5xvatywtyzfhz6npcm8lvp8p0jlnrkk0suqcpe8";
const MULTIPLE = "juno10va8m9zqllgypj4eyyph0rszushr43l9pg2lgn4wau7adguzau4s50a6su";
const CORE = "juno1fccq3dcjjn35fgt8u8jfz5kvcajfk604lhl85w25k6pr32q9r7psk6wrpu";
const VOTING = "juno12cjzsve63f6v2rt6uekyp0ytqynsw25023vjw5ry45vw87vgyr2q9h8ym3";
const CW4 = "juno13dvggejlcz6nxn8kzzhr2m0e94r7adepr9crclum82uv7eyegftq2yz5up";

// base64 of the exact §6 Resolve JSON, computed independently (Buffer, not gov.js).
const UPHOLD_7 = "eyJyZXNvbHZlIjp7ImNoYWluX2dhbWVfaWQiOjcsIm91dGNvbWUiOnsidXBob2xkIjp7fX19fQ==";
const ANNUL_7 = "eyJyZXNvbHZlIjp7ImNoYWluX2dhbWVfaWQiOjcsIm91dGNvbWUiOnsiYW5udWwiOnt9fX19";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

test("pins: §1.4 addresses, uni-7, the pinned REST endpoint, ujunox", () => {
  const P = G.PINS;
  assert.equal(P.chainId, "uni-7");
  assert.equal(P.rest, "https://juno.api.t.stavr.tech");
  assert.equal(P.denom, "ujunox");
  assert.equal(P.daoCore, CORE);
  assert.equal(P.proposalSingle, SINGLE);
  assert.equal(P.preProposeSingle, PREPROPOSE);
  assert.equal(P.proposalMultiple, MULTIPLE);
  assert.equal(P.preProposeMultiple, "juno1glupnpaf5pzh8ym6e64vuph937jqqwjlg0pzfv7lnwthg6pekahsz2783p");
  assert.equal(P.voting, VOTING);
  assert.equal(P.cw4Group, CW4);
  assert.equal(P.escrow, ESCROW);
  assert.equal(P.maxVotingPeriodSecs, 604800);
  assert.ok(Object.isFrozen(P));
});

test("Resolve: exact JSON and base64 for Uphold and Annul; chain_game_id is a JSON number", () => {
  assert.equal(JSON.stringify(G.resolveMsg("7", "uphold")), '{"resolve":{"chain_game_id":7,"outcome":{"uphold":{}}}}');
  assert.equal(JSON.stringify(G.resolveMsg("7", "annul")), '{"resolve":{"chain_game_id":7,"outcome":{"annul":{}}}}');
  assert.equal(G.resolveB64("7", "uphold"), UPHOLD_7);
  assert.equal(G.resolveB64("7", "annul"), ANNUL_7);
  assert.equal(G.resolveB64(7, "uphold"), UPHOLD_7);
  assert.throws(() => G.resolveMsg("7", "replace"), /corrected payload/);
  assert.throws(() => G.resolveMsg("7", "uphold", {}), /takes no payload/);
  assert.throws(() => G.resolveMsg("7", "toString"), /uphold, replace or annul/);
  for (const bad of ["-1", "07", "1.5", "", "abc", "9007199254740993", "1e3"]) assert.throws(() => G.resolveMsg(bad, "uphold"), /whole number/, bad);
});

test("propose: §6 byte for byte, sent to the pre-propose with funds []; vote null unless opted in", () => {
  const description = "Escrow 2.1.0 game #7 summary.\nCase: https://ludum.netadao.org/disputes/case/?id=7";
  const spec = G.buildPropose({ chainGameId: "7", outcome: "uphold", description });
  assert.equal(spec.contract, PREPROPOSE);
  assert.deepEqual(spec.funds, []);
  assert.equal(
    JSON.stringify(spec.msg),
    '{"propose":{"msg":{"propose":{"title":"Appeal: escrow game #7 — Uphold","description":' + JSON.stringify(description) +
      ',"msgs":[{"wasm":{"execute":{"contract_addr":"' + ESCROW + '","msg":"' + UPHOLD_7 + '","funds":[]}}}],"vote":null}}}}',
  );
  const annulYes = G.buildPropose({ chainGameId: "7", outcome: "annul", description: "d", voteYes: true });
  assert.equal(
    JSON.stringify(annulYes.msg),
    '{"propose":{"msg":{"propose":{"title":"Appeal: escrow game #7 — Annul","description":"d","msgs":[{"wasm":{"execute":{"contract_addr":"' +
      ESCROW + '","msg":"' + ANNUL_7 + '","funds":[]}}}],"vote":{"vote":"yes"}}}}}',
  );
  // Only `true` opts in: the checkbox is unchecked by default.
  assert.equal(G.buildPropose({ chainGameId: "7", outcome: "annul", description: "d", voteYes: "yes" }).msg.propose.msg.propose.vote, null);
  assert.throws(() => G.buildPropose({ chainGameId: "7", outcome: "uphold", description: "" }), /description/);
  assert.throws(() => G.buildPropose({ chainGameId: "7", outcome: "replace", description: "d" }), /corrected payload/);
});

test("propose description: chain facts and the case URL", () => {
  const d = G.proposalDescription({ chainGameId: "7", outcome: "annul", challenger: "juno1abc", bond: "1000000", evidenceHash: "ab".repeat(32),
    disputedAt: "2026-10-01T00:00:00Z", resolverTimeoutAt: "2026-10-31T00:00:00Z" });
  assert.match(d, /game #7 on uni-7/);
  assert.match(d, /Bond: 1000000 ujunox\./);
  assert.match(d, /Proposed resolution: Annul/);
  assert.ok(d.endsWith("Case: https://ludum.netadao.org/disputes/case/?id=7"));
});

test("vote, execute, close: §6 byte for byte, sent to the single-choice proposal module with funds []", () => {
  const v = G.buildVote("3", "yes");
  assert.equal(v.contract, SINGLE);
  assert.deepEqual(v.funds, []);
  assert.equal(JSON.stringify(v.msg), '{"vote":{"proposal_id":3,"vote":"yes","rationale":null}}');
  assert.equal(JSON.stringify(G.buildVote(3, "no", "  reasons  ").msg), '{"vote":{"proposal_id":3,"vote":"no","rationale":"reasons"}}');
  assert.equal(JSON.stringify(G.buildVote(3, "abstain", "").msg), '{"vote":{"proposal_id":3,"vote":"abstain","rationale":null}}');
  assert.throws(() => G.buildVote(3, "veto"), /yes, no or abstain/);
  const e = G.buildExecute("3"), c = G.buildClose("3");
  assert.equal(e.contract, SINGLE);
  assert.equal(c.contract, SINGLE);
  assert.deepEqual(e.funds, []);
  assert.deepEqual(c.funds, []);
  assert.equal(JSON.stringify(e.msg), '{"execute":{"proposal_id":3}}');
  assert.equal(JSON.stringify(c.msg), '{"close":{"proposal_id":3}}');
});

// ---- Pin check ----
const goodLive = () => ({
  proposalModules: [{ address: MULTIPLE, prefix: "B", status: "enabled" }, { address: SINGLE, prefix: "A", status: "enabled" }],
  votingModule: VOTING,
  preProposeSingle: PREPROPOSE,
  cw4Group: CW4,
  singleConfig: { dao: CORE, max_voting_period: { time: 604800 }, only_members_execute: true, allow_revoting: false },
  escrowConfig: { contract_version: "2.1.0", config: { resolver: CORE, denom: "ujunox" } },
});

test("pin check: the live 2026-10-09 configuration passes", () => {
  assert.deepEqual(G.checkPins(goodLive()), { ok: true, problems: [] });
});

test("pin check: any mismatch refuses", () => {
  const cases = {
    "a swapped single module": (l) => { l.proposalModules[1].address = "juno1shhuc4w9ht7kfzjamhz5xvatywtyzfhz6npcm8lvp8p0jlnrkk0suqcpe9"; },
    "an extra module": (l) => { l.proposalModules.push({ address: "juno1extra", prefix: "C", status: "enabled" }); },
    "a missing module": (l) => { l.proposalModules.pop(); },
    "the single module disabled": (l) => { l.proposalModules[1].status = "disabled"; },
    "unreadable modules": (l) => { l.proposalModules = null; },
    "another voting module": (l) => { l.votingModule = "juno1other"; },
    "another pre-propose": (l) => { l.preProposeSingle = "juno1other"; },
    "another cw4 group": (l) => { l.cw4Group = "juno1other"; },
    "a different voting period": (l) => { l.singleConfig.max_voting_period = { time: 86400 }; },
    "a height-based voting period": (l) => { l.singleConfig.max_voting_period = { height: 100 }; },
    "a module of another DAO": (l) => { l.singleConfig.dao = "juno1other"; },
    "another escrow version": (l) => { l.escrowConfig.contract_version = "2.2.0"; },
    "another resolver": (l) => { l.escrowConfig.config.resolver = "juno1other"; },
    "another denom": (l) => { l.escrowConfig.config.denom = "ujuno"; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const live = goodLive();
    mutate(live);
    const r = G.checkPins(live);
    assert.equal(r.ok, false, name);
    assert.ok(r.problems.length > 0, name);
  }
});

test("readLivePins: reads the DAO itself and refuses a mismatch it reports", async () => {
  const answers = (live) => (contract, query) => {
    const key = Object.keys(query)[0];
    const data = {
      [`${CORE}:proposal_modules`]: live.proposalModules,
      [`${CORE}:voting_module`]: live.votingModule,
      [`${SINGLE}:proposal_creation_policy`]: { module: { addr: live.preProposeSingle } },
      [`${VOTING}:group_contract`]: live.cw4Group,
      [`${SINGLE}:config`]: live.singleConfig,
      [`${ESCROW}:config`]: live.escrowConfig,
    }[`${contract}:${key}`];
    if (data === undefined) throw new Error("unexpected query " + contract + " " + key);
    return Promise.resolve({ data, observedAt: "2026-10-09T00:00:00.000Z" });
  };
  const ok = await G.readLivePins({ smart: answers(goodLive()) });
  assert.equal(ok.check.ok, true);
  const bad = goodLive();
  bad.votingModule = "juno1impostor";
  const refused = await G.readLivePins({ smart: answers(bad) });
  assert.equal(refused.check.ok, false);
  assert.match(refused.check.problems.join(";"), /voting_module/);
});

// ---- Deadline guard ----
test("deadline guard: refuses below max_voting_period + 24 h, allows at the boundary", () => {
  const now = 1_800_000_000, need = 604800 + 86400; // 8 days today
  assert.equal(G.deadlineGuard(now + need, now).ok, true, "exactly the boundary is allowed");
  const justUnder = G.deadlineGuard(now + need - 1, now);
  assert.equal(justUnder.ok, false, "one second under the boundary refuses");
  assert.match(justUnder.reason, /liveness_settle/);
  assert.equal(G.deadlineGuard(now + need + 1, now).ok, true);
  assert.equal(G.deadlineGuard(now - 10, now).ok, false, "a passed deadline refuses");
  assert.equal(G.deadlineGuard(null, now).ok, false, "an unknown deadline refuses");
  assert.equal(G.deadlineGuard(now + 2 * 86400, now, 86400).ok, true, "uses the live voting period when given");
  assert.equal(G.deadlineGuard(now + 2 * 86400 - 1, now, 86400).ok, false);
});

// ---- Link-by-decoding ----
const wasmExec = (contract, msg, funds = []) => ({ wasm: { execute: { contract_addr: contract, msg, funds } } });
test("link-by-decoding: links exactly one resolve to the pinned escrow, for that game", () => {
  const p = { msgs: [wasmExec(ESCROW, UPHOLD_7)] };
  assert.deepEqual(G.decodeResolve(p), { chainGameId: "7", outcome: "uphold" });
  assert.equal(G.linksToGame(p, "7"), true);
  assert.equal(G.linksToGame(p, 7), true);
  assert.equal(G.linksToGame({ msgs: [wasmExec(ESCROW, ANNUL_7)] }, "7"), true);
  // The proposal our own builder makes links back to its game.
  const built = G.buildPropose({ chainGameId: "42", outcome: "annul", description: "d" }).msg.propose.msg.propose;
  assert.equal(G.linksToGame(built, "42"), true);
});

test("link-by-decoding: ignores look-alike proposals", () => {
  const lookalikes = {
    "wrong contract": { msgs: [wasmExec(SINGLE, UPHOLD_7)] },
    "escrow address with a different checksum char": { msgs: [wasmExec(ESCROW.slice(0, -1) + "y", UPHOLD_7)] },
    "two msgs": { msgs: [wasmExec(ESCROW, UPHOLD_7), wasmExec(ESCROW, UPHOLD_7)] },
    "resolve plus another msg": { msgs: [wasmExec(ESCROW, UPHOLD_7), { bank: { send: { to_address: "juno1x", amount: [] } } }] },
    "no msgs": { msgs: [] },
    "msgs missing": {},
    "a non-resolve body": { msgs: [wasmExec(ESCROW, b64('{"transfer":{"chain_game_id":7}}'))] },
    "resolve plus an extra top-level key": { msgs: [wasmExec(ESCROW, b64('{"resolve":{"chain_game_id":7,"outcome":{"uphold":{}}},"x":1}'))] },
    "id as a string": { msgs: [wasmExec(ESCROW, b64('{"resolve":{"chain_game_id":"7","outcome":{"uphold":{}}}}'))] },
    "an unknown outcome": { msgs: [wasmExec(ESCROW, b64('{"resolve":{"chain_game_id":7,"outcome":{"pay_me":{}}}}'))] },
    "two outcomes": { msgs: [wasmExec(ESCROW, b64('{"resolve":{"chain_game_id":7,"outcome":{"uphold":{},"annul":{}}}}'))] },
    "undecodable base64": { msgs: [wasmExec(ESCROW, "%%%not-base64")] },
    "base64 of non-JSON": { msgs: [wasmExec(ESCROW, b64("resolve 7"))] },
    "an array body": { msgs: [wasmExec(ESCROW, b64('[{"resolve":{"chain_game_id":7,"outcome":{"uphold":{}}}}]'))] },
    "wasm instantiate, not execute": { msgs: [{ wasm: { instantiate: { code_id: 1, msg: UPHOLD_7, funds: [], label: "x" } } }] },
    "execute plus a sibling key": { msgs: [{ wasm: { execute: { contract_addr: ESCROW, msg: UPHOLD_7, funds: [] }, migrate: {} } }] },
    "a custom msg": { msgs: [{ custom: { resolve: { chain_game_id: 7 } } }] },
  };
  for (const [name, p] of Object.entries(lookalikes)) {
    assert.equal(G.decodeResolve(p), null, name);
    assert.equal(G.linksToGame(p, "7"), false, name);
  }
  // A different id: a genuine resolve for game 8 links to game 8 only, never to game 7 (or 78, or "08").
  const game8 = { msgs: [wasmExec(ESCROW, b64('{"resolve":{"chain_game_id":8,"outcome":{"uphold":{}}}}'))] };
  assert.equal(G.linksToGame(game8, "8"), true);
  for (const other of ["7", "78", "08", "", "80"]) assert.equal(G.linksToGame(game8, other), false, other);
});

// ---- Framing guard ----
test("framing guard: top-level allowed; framed only when every ancestor is a family origin", () => {
  const top = {}; top.top = top;
  assert.equal(G.framingAllowed(top), true);
  const framed = (ancestors) => ({ top: {}, location: ancestors === undefined ? {} : { ancestorOrigins: ancestors } });
  assert.equal(G.framingAllowed(framed(["https://netadao.org"])), true, "the radio shell on netadao.org");
  assert.equal(G.framingAllowed(framed(["https://ludum.netadao.org", "https://www.netadao.org"])), true);
  for (const o of ["https://netadao.org", "https://www.netadao.org", "https://academy.netadao.org", "https://fork.netadao.org", "https://ludum.netadao.org", "https://play.netadao.org"]) {
    assert.equal(G.framingAllowed(framed([o])), true, o);
  }
  for (const bad of [["https://evil.example"], ["https://netadao.org", "https://evil.example"], ["http://netadao.org"], ["https://netadao.org.evil.example"],
    ["https://evilnetadao.org"], ["https://NETADAO.org"], ["null"], ["https://netadao.org:8443"]]) {
    assert.equal(G.framingAllowed(framed(bad)), false, bad.join(","));
  }
  assert.equal(G.framingAllowed(framed(undefined)), false, "no ancestorOrigins (Firefox): Open in its own tab");
  assert.equal(G.framingAllowed(framed([])), false, "framed with an empty list");
  const throwing = { get top() { throw new Error("blocked"); } };
  assert.equal(G.framingAllowed(throwing), false);
});

// ---- Formatting: JUNOX by string arithmetic only ----
test("JUNOX formatting and timestamps", () => {
  assert.equal(G.fmtJunox("1000000"), "1.000000 JUNOX");
  assert.equal(G.fmtJunox("1"), "0.000001 JUNOX");
  assert.equal(G.fmtJunox("0"), "0.000000 JUNOX");
  assert.equal(G.fmtJunox("123456789012345678901234567890"), "123456789012345678901234.567890 JUNOX");
  assert.equal(G.fmtJunox(-1), "unavailable");
  assert.equal(G.fmtJunox("1.5"), "unavailable");
  assert.equal(G.nanosToSecs("1700000000123456789"), 1700000000);
  assert.equal(G.nanosToSecs(null), null);
  assert.equal(G.isoFromSecs(1700000000), "2023-11-14T22:13:20Z");
  assert.equal(G.b64ToUtf8(G.utf8ToB64("Appeal — é")), "Appeal — é");
});

/* ---- Replace (escrow 2.1.0 Resolve { Replace { payload } }): a corrected SettlementPayloadV1, authorised by the
   resolver's transaction. Golden JSON computed here by hand from msg.rs / payload.rs, not by gov.js. ---- */
const DOMAIN = "d0".repeat(32);
const LOG = "aa".repeat(32);
const BOARD = "bb".repeat(32);
const REPLACE_INPUT = { domain: DOMAIN.toUpperCase(), logLen: 120, logHash: LOG, appraisalStateHash: BOARD, weights: ["6000", "4000"], seatCount: 2, floorSeq: "200", settlementSource: "server", signerKeyId: 2, issuedAtSecs: 1790000000 };
const REPLACE_JSON = '{"version":1,"domain":"' + DOMAIN + '","seq":"241","kind":1,"reason":5,"log_len":"120","log_hash":"' + LOG + '","appraisal_log_len":"120","appraisal_state_hash":"' + BOARD +
  '","state_schema_version":1,"seat_count":2,"settlement_weights":["6000","4000"],"signer_key_id":2,"issued_at":"1790000000"}';

test("Replace payload: version 1, the game's domain, Terminal + ResolverCorrection, seq = 2·log_len + 1, appraisal = log_len, u128 weights as strings", () => {
  const payload = G.replacePayload(REPLACE_INPUT);
  assert.equal(JSON.stringify(payload), REPLACE_JSON);
  assert.equal(G.replacePayloadProblem(payload), null);
  const msg = G.resolveMsg("7", "replace", payload);
  const exact = '{"resolve":{"chain_game_id":7,"outcome":{"replace":{"payload":' + REPLACE_JSON + '}}}}';
  assert.equal(JSON.stringify(msg), exact);
  assert.equal(G.resolveB64("7", "replace", payload), b64(exact));
  /* Decoding finds it, and its payload, for exactly this game. */
  const spec = G.buildPropose({ chainGameId: "7", outcome: "replace", payload, description: "d" });
  assert.equal(spec.msg.propose.msg.propose.title, "Appeal: escrow game #7 — Replace");
  const decoded = G.decodeResolve({ msgs: spec.msg.propose.msg.propose.msgs });
  assert.deepEqual(decoded, { chainGameId: "7", outcome: "replace", payload });
});

test("Replace payload: every contract rule refuses before Keplr is asked", () => {
  const bad = (over, re) => assert.throws(() => G.replacePayload({ ...REPLACE_INPUT, ...over }), re, JSON.stringify(over));
  bad({ domain: "d0".repeat(31) }, /domain/);
  bad({ settlementSource: "remedy_strike3" }, /third-strike/);
  bad({ logLen: 0 }, /log_len/);
  bad({ logLen: 1.5 }, /log_len/);
  bad({ logHash: "zz".repeat(32) }, /log_hash/);
  bad({ appraisalStateHash: "" }, /appraisal_state_hash/);
  bad({ weights: ["1"] }, /one weight per seat/);
  bad({ weights: ["0", "0"] }, /all be zero/);
  bad({ weights: ["-1", "5"] }, /u128/);
  bad({ weights: ["1.5", "5"] }, /u128/);
  bad({ weights: ["340282366920938463463374607431768211456", "1"] }, /u128/);
  bad({ floorSeq: "241" }, /not beyond the trusted checkpoint/);
  bad({ signerKeyId: 70000 }, /u16/);
  bad({ issuedAtSecs: -1 }, /issued_at/);
  /* The floor may be absent (no trusted checkpoint): the contract's floor is then 0. */
  assert.equal(G.replacePayload({ ...REPLACE_INPUT, floorSeq: null }).seq, "241");
});

test("Replace decoding: a proposal whose payload breaks a rule is not linked as a Replace", () => {
  const payload = G.replacePayload(REPLACE_INPUT);
  const wrap = (p) => ({ msgs: [{ wasm: { execute: { contract_addr: ESCROW, msg: b64(JSON.stringify({ resolve: { chain_game_id: 7, outcome: { replace: { payload: p } } } })), funds: [] } } }] });
  assert.equal(G.decodeResolve(wrap({ ...payload, reason: 1 })), null);
  assert.equal(G.decodeResolve(wrap({ ...payload, seq: "240" })), null);
  assert.equal(G.decodeResolve(wrap({ ...payload, appraisal_log_len: "119" })), null);
  assert.equal(G.decodeResolve(wrap({ ...payload, extra: 1 })), null);
  assert.equal(G.decodeResolve(wrap({ ...payload, settlement_weights: ["0", "0"] })), null);
  /* An Uphold with a body is not an Uphold. */
  assert.equal(G.decodeResolve({ msgs: [{ wasm: { execute: { contract_addr: ESCROW, msg: b64('{"resolve":{"chain_game_id":7,"outcome":{"uphold":{"x":1}}}}'), funds: [] } } }] }), null);
});
