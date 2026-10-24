// LudumGov: §6 builders byte for byte, the pin check, the framing guard.
// LUDUM v1.7 (owner, 2026-10-24): the retired JUNOX escrow is no Ludum feature -- its pins, reads, Resolve builders,
// link-by-decoding and deadline guard are gone. Every check that keeps an ordinary proposal safe to act on is pinned here.
// Run from the repository root: node --test platform/tests/gov.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const G = require("../js/gov.js");

const RETIRED_ESCROW = "juno19vd5hphghprl2m8agchctyav8pmeh6p4x3vud6cfhd2y6ulwtf0s0jrk7x";
const PREPROPOSE = "juno1huu2ysuct2e9xnmxc28xdwfeflytw2samzp95a2devjqs0qfj6fqpsmvcf";
const SINGLE = "juno1shhuc4w9ht7kfzjamhz5xvatywtyzfhz6npcm8lvp8p0jlnrkk0suqcpe8";
const MULTIPLE = "juno10va8m9zqllgypj4eyyph0rszushr43l9pg2lgn4wau7adguzau4s50a6su";
const CORE = "juno1fccq3dcjjn35fgt8u8jfz5kvcajfk604lhl85w25k6pr32q9r7psk6wrpu";
const VOTING = "juno12cjzsve63f6v2rt6uekyp0ytqynsw25023vjw5ry45vw87vgyr2q9h8ym3";
const CW4 = "juno13dvggejlcz6nxn8kzzhr2m0e94r7adepr9crclum82uv7eyegftq2yz5up";

test("pins: §1.4 addresses, uni-7, the pinned REST endpoint, ujunox -- and no escrow", () => {
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
  assert.equal(P.maxVotingPeriodSecs, 604800);
  assert.ok(Object.isFrozen(P));
  assert.equal(P.escrow, undefined, "the retired escrow is no pin");
  assert.ok(!Object.values(P).includes(RETIRED_ESCROW));
});

test("v1.7: the escrow's appeal workflow is gone from the library", () => {
  for (const gone of ["OUTCOMES", "buildPropose", "resolveMsg", "proposalDescription", "decodeResolve", "linksToGame", "deadlineGuard", "readAllGames", "readGame", "readSeats",
    "readCheckpoints", "readSettlementPreview", "readSignerKey", "replacePayload", "splitPool", "outcomePreviews", "fmtJunox", "caseUrl"]) {
    assert.equal(G[gone], undefined, gone);
  }
  for (const kept of ["buildVote", "buildExecute", "buildClose", "checkPins", "framingAllowed", "readLivePins", "readGovernor", "readAllProposals", "readVotes", "readProposal",
    "readTotalWeight", "readPreProposeConfig", "readTxs", "proposalTxQuery", "proposalActionOf", "proposalPhase", "tallyOf", "expirationSecs", "connect", "signArbitrary", "prepare", "signAndBroadcast"]) {
    assert.equal(typeof G[kept], "function", kept);
  }
});

test("vote, execute, close: §6 byte for byte, sent to the single-choice proposal module with funds []", () => {
  const v = G.buildVote("3", "yes");
  assert.equal(v.contract, SINGLE);
  assert.deepEqual(v.funds, []);
  assert.equal(JSON.stringify(v.msg), '{"vote":{"proposal_id":3,"vote":"yes","rationale":null}}');
  assert.equal(JSON.stringify(G.buildVote(3, "no", "  reasons  ").msg), '{"vote":{"proposal_id":3,"vote":"no","rationale":"reasons"}}');
  assert.equal(JSON.stringify(G.buildVote(3, "abstain", "").msg), '{"vote":{"proposal_id":3,"vote":"abstain","rationale":null}}');
  assert.throws(() => G.buildVote(3, "veto"), /yes, no or abstain/);
  assert.throws(() => G.buildExecute("3x"), /whole number/);
  assert.throws(() => G.buildClose("-1"), /whole number/);
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
});

test("pin check: the live 2026-10-09 configuration passes (and needs no escrow)", () => {
  assert.deepEqual(G.checkPins(goodLive()), { ok: true, problems: [] });
});

test("pin check: every DAO mismatch still refuses -- removing the escrow removed none of these", () => {
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
    "no single-choice configuration": (l) => { l.singleConfig = null; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const live = goodLive();
    mutate(live);
    const r = G.checkPins(live);
    assert.equal(r.ok, false, name);
    assert.ok(r.problems.length > 0, name);
  }
});

test("readLivePins: reads the DAO itself -- five queries, none to the retired escrow -- and refuses a mismatch it reports", async () => {
  const asked = [];
  const answers = (live) => (contract, query) => {
    const key = Object.keys(query)[0];
    asked.push(`${contract}:${key}`);
    const data = {
      [`${CORE}:proposal_modules`]: live.proposalModules,
      [`${CORE}:voting_module`]: live.votingModule,
      [`${SINGLE}:proposal_creation_policy`]: { module: { addr: live.preProposeSingle } },
      [`${VOTING}:group_contract`]: live.cw4Group,
      [`${SINGLE}:config`]: live.singleConfig,
    }[`${contract}:${key}`];
    if (data === undefined) throw new Error("unexpected query " + contract + " " + key);
    return Promise.resolve({ data, observedAt: `2026-10-09T00:00:0${asked.length}.000Z` });
  };
  const ok = await G.readLivePins({ smart: answers(goodLive()) });
  assert.equal(ok.check.ok, true);
  assert.equal(asked.length, 5);
  assert.ok(asked.every((q) => !q.startsWith(RETIRED_ESCROW)), "the escrow is never read");
  assert.equal(ok.observedAt, "2026-10-09T00:00:05.000Z", "the read time is the last query's");
  const bad = goodLive();
  bad.votingModule = "juno1impostor";
  const refused = await G.readLivePins({ smart: answers(bad) });
  assert.equal(refused.check.ok, false);
  assert.match(refused.check.problems.join(";"), /voting_module/);
});

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

test("timestamps and text encoding", () => {
  assert.equal(G.nanosToSecs("1700000000123456789"), 1700000000);
  assert.equal(G.nanosToSecs(null), null);
  assert.equal(G.isoFromSecs(1700000000), "2023-11-14T22:13:20Z");
  assert.equal(G.b64ToUtf8(G.utf8ToB64("Proposal — é")), "Proposal — é");
  assert.equal(G.fmtDuration(604800), "7d 0h");
});

test("a proposal's phase and its own count, as fractions of its total power", () => {
  assert.equal(G.proposalPhase("passed").phase, "passed");
  assert.equal(G.proposalPhase("execution_failed").label, "Execution failed");
  assert.equal(G.proposalPhase("weird_state").phase, "failed");
  const t = G.tallyOf({ total_power: "100", votes: { yes: "41", no: "12", abstain: "6" }, threshold: { threshold_quorum: { threshold: { majority: {} }, quorum: { percent: "0.2" } } } });
  assert.deepEqual([t.yes, t.no, t.abstain, t.turnout], [41, 12, 6, 59]);
  assert.equal(t.quorum.percent, 20);
  assert.equal(t.threshold.kind, "majority");
  assert.equal(G.tallyOf({ total_power: "x", votes: {} }), null, "an unreadable count is not invented");
});
