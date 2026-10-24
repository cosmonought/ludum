// Test fixtures for the governance pages: a uni-7 world shaped exactly as DAO DAO proposal-single and cw4 answer it.
// DEVELOPMENT ONLY -- never published (platform/tools/build-site.mjs publishes no platform/tests/ file).
// LUDUM v1.7 (owner, 2026-10-24): the retired JUNOX escrow is no Ludum feature, so this world answers no escrow query --
// any page that still asked one would fail with "unexpected query". The proposals are the chain's real history: earlier
// proposals carried a message to the retired escrow, and the pages show them as the ordinary proposals they are.
import { Buffer } from "node:buffer";

export const PIN = {
  rest: "https://juno.api.t.stavr.tech",
  daoCore: "juno1fccq3dcjjn35fgt8u8jfz5kvcajfk604lhl85w25k6pr32q9r7psk6wrpu",
  proposalSingle: "juno1shhuc4w9ht7kfzjamhz5xvatywtyzfhz6npcm8lvp8p0jlnrkk0suqcpe8",
  preProposeSingle: "juno1huu2ysuct2e9xnmxc28xdwfeflytw2samzp95a2devjqs0qfj6fqpsmvcf",
  proposalMultiple: "juno10va8m9zqllgypj4eyyph0rszushr43l9pg2lgn4wau7adguzau4s50a6su",
  voting: "juno12cjzsve63f6v2rt6uekyp0ytqynsw25023vjw5ry45vw87vgyr2q9h8ym3",
  cw4Group: "juno13dvggejlcz6nxn8kzzhr2m0e94r7adepr9crclum82uv7eyegftq2yz5up",
};
/** The retired escrow: only ever the target of a historical proposal's message, never read. */
export const RETIRED_ESCROW = "juno19vd5hphghprl2m8agchctyav8pmeh6p4x3vud6cfhd2y6ulwtf0s0jrk7x";
export const MEMBER = "juno1" + "x".repeat(38);
export const NOW = Math.floor(Date.now() / 1000);
export const ns = (secs) => String(secs) + "000000000";
const b64 = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64");

export function proposal(id, gameId, status, outcome = "uphold", over = {}) {
  const resolve = { resolve: { chain_game_id: gameId, outcome: { [outcome]: {} } } };
  return { id, proposal: { title: `Appeal ${gameId}: ${outcome}`, description: "The recorded settlement matches the log.", proposer: MEMBER, start_height: 100, min_voting_period: null,
    expiration: { at_time: ns(status === "open" ? NOW + 5 * 86400 : NOW - 86400) }, threshold: { threshold_quorum: { threshold: { majority: {} }, quorum: { percent: "0.2" } } },
    total_power: "100", msgs: [{ wasm: { execute: { contract_addr: RETIRED_ESCROW, msg: b64(resolve), funds: [] } } }], status, veto: null,
    votes: { yes: status === "open" ? "41" : "62", no: status === "open" ? "12" : "9", abstain: status === "open" ? "6" : "4" }, allow_revoting: false, ...over } };
}

export function tx(hash, action, proposalId, over = {}) {
  return { height: "18983183", txhash: hash, code: 0, raw_log: "", gas_wanted: "520000", gas_used: "201334", timestamp: new Date((NOW - 86400) * 1000).toISOString().replace(".000Z", "Z"),
    tx: { body: { messages: [{ "@type": "/cosmwasm.wasm.v1.MsgExecuteContract", sender: MEMBER }] }, auth_info: { fee: { amount: [{ denom: "ujunox", amount: "39000" }] } } },
    events: [{ type: "wasm", attributes: [{ key: "_contract_address", value: PIN.proposalSingle }, { key: "action", value: action }, { key: "proposal_id", value: String(proposalId) }] }], ...over };
}

/** The whole world's smart-query and tx-index answers. `over[key](contract, args)` replaces one. */
export function world(over = {}) {
  const proposals = [proposal(13, 7, "open"), proposal(12, 5, "execution_failed"), proposal(11, 6, "passed", "annul"), proposal(10, 4, "executed", "annul")];
  return {
    proposals,
    smart(contract, key, args) {
      if (over[key]) { const a = over[key](contract, args); if (a !== undefined) return a; }
      if (contract === RETIRED_ESCROW) throw new Error("unexpected query to the retired escrow: " + key);
      if (key === "proposal_modules") return { data: [{ address: PIN.proposalSingle, status: "enabled" }, { address: PIN.proposalMultiple, status: "enabled" }] };
      if (key === "voting_module") return { data: PIN.voting };
      if (key === "proposal_creation_policy") return { data: { module: { addr: PIN.preProposeSingle } } };
      if (key === "group_contract") return { data: PIN.cw4Group };
      if (key === "config" && contract === PIN.proposalSingle) return { data: { dao: PIN.daoCore, max_voting_period: { time: 604800 }, only_members_execute: true, allow_revoting: false, threshold: proposals[0].proposal.threshold } };
      if (key === "config" && contract === PIN.preProposeSingle) return { data: { deposit_info: null, open_proposal_submission: false } };
      if (key === "reverse_proposals") return { data: { proposals } };
      if (key === "proposal") { const p = proposals.find((x) => x.id === args.proposal_id); return p ? { data: p } : { status: 500, message: "NoSuchProposal" }; }
      if (key === "list_votes") return { data: { votes: args.proposal_id === 13 ? [{ voter: "juno1" + "v".repeat(38), vote: "yes", power: "41", rationale: null }] : [] } };
      if (key === "total_weight") return { data: { weight: 100 } };
      if (key === "member") return { data: { weight: args.addr === MEMBER ? 4 : null } };
      if (key === "can_propose") return { data: args.address === MEMBER };
      throw new Error("unexpected query " + key);
    },
    txs(query) {
      const m = /proposal_id='(\d+)'/.exec(query);
      const id = m ? Number(m[1]) : null;
      if (over.txs) return over.txs(id);
      if (id === 12) return [tx("0D41" + "0".repeat(56) + "AB12", "propose", 12), tx("B90E" + "0".repeat(56) + "14F7", "execute", 12, { raw_log: "dispatch: submessages: wrong state: game is Annulled, this message needs Disputed" })];
      if (id === 10) return [tx("61BC" + "0".repeat(56) + "40E9", "propose", 10), tx("E28B" + "0".repeat(56) + "91F0", "execute", 10)];
      if (id) return [tx("2A77" + "0".repeat(56) + "D013", "propose", id)];
      return [];
    },
  };
}

/** A fetch for `world`: every read is a GET to the pinned REST endpoint (asserted by the caller if it likes). */
export function restFetch(w, onRequest) {
  return async (url, init) => {
    const u = String(url);
    if (onRequest) onRequest(u, init);
    let status = 200, body;
    const smart = u.match(/\/contract\/([^/]+)\/smart\/([^?]+)$/);
    if (smart) {
      const q = JSON.parse(Buffer.from(decodeURIComponent(smart[2]), "base64").toString("utf8"));
      const key = Object.keys(q)[0];
      const a = w.smart(smart[1], key, q[key]);
      status = a.status ?? 200;
      body = status < 400 ? { data: a.data } : { message: a.message };
    } else if (u.includes("/cosmos/tx/v1beta1/txs?query=")) {
      body = { tx_responses: w.txs(decodeURIComponent(u.split("query=")[1].split("&")[0])) };
    } else { status = 404; body = { message: "not found" }; }
    return { ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body };
  };
}
