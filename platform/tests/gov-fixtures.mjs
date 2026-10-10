// Test fixtures for the governance pages: a uni-7 world shaped exactly as escrow 2.1.0 (contracts/escrow/src/msg.rs,
// state.rs, serde snake_case) and DAO DAO proposal-single answer it. DEVELOPMENT ONLY -- never published
// (platform/tools/build-site.mjs publishes no platform/tests/ file).
import { Buffer } from "node:buffer";

export const PIN = {
  rest: "https://juno.api.t.stavr.tech",
  daoCore: "juno1fccq3dcjjn35fgt8u8jfz5kvcajfk604lhl85w25k6pr32q9r7psk6wrpu",
  proposalSingle: "juno1shhuc4w9ht7kfzjamhz5xvatywtyzfhz6npcm8lvp8p0jlnrkk0suqcpe8",
  preProposeSingle: "juno1huu2ysuct2e9xnmxc28xdwfeflytw2samzp95a2devjqs0qfj6fqpsmvcf",
  proposalMultiple: "juno10va8m9zqllgypj4eyyph0rszushr43l9pg2lgn4wau7adguzau4s50a6su",
  voting: "juno12cjzsve63f6v2rt6uekyp0ytqynsw25023vjw5ry45vw87vgyr2q9h8ym3",
  cw4Group: "juno13dvggejlcz6nxn8kzzhr2m0e94r7adepr9crclum82uv7eyegftq2yz5up",
  escrow: "juno19vd5hphghprl2m8agchctyav8pmeh6p4x3vud6cfhd2y6ulwtf0s0jrk7x",
};
export const W = ["juno1" + "q".repeat(38), "juno1" + "p".repeat(38), "juno1" + "z".repeat(38)];
export const MEMBER = "juno1" + "x".repeat(38);
export const EV = "ab".repeat(32), LOG = "cd".repeat(32), BOARD = "ef".repeat(32), DOMAIN = "d0".repeat(32);
export const NOW = Math.floor(Date.now() / 1000);
export const ns = (secs) => String(secs) + "000000000";
const b64 = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64");

/** One escrow game. `kind`: "disputed" (default), "settleable", "annulled". */
export function chainGame(id = 7, over = {}) {
  const disputedAt = NOW - 2 * 86400;
  const seats = W.map((wallet, i) => ({ wallet, consent_pubkey: "02" + "11".repeat(32), consent_key_rotated_at: null, join_ticket: "aa".repeat(32), gross_deposit: "10000000", subsidy_paid: "250000", net_deposit: "9750000", joined_at: ns(NOW - 5 * 86400) }));
  const game = {
    chain_game_id: id, state: "disputed", creator: W[0], max_players: 3, mode: "async", rules_engine_version: 1, variants_digest: "52".repeat(32), denom: "ujunox",
    ante_gross: "10000000", subsidy_per_seat: "250000", ante_net: "9750000",
    terms: { subsidy_bps: 250, bond_bps: 500, bond_floor: "5000000", challenge_window_secs: 86400, liveness_window_secs: 604800, resolver_timeout_secs: 2592000, treasury: PIN.daoCore },
    created_at: ns(NOW - 6 * 86400), funding_deadline: ns(NOW - 5 * 86400), pool: "29250000", seats,
    roster_hash: "e0".repeat(32), domain: DOMAIN, bond: "5000000", resolver: PIN.daoCore, started_at: ns(NOW - 5 * 86400), last_activity: ns(NOW - 3 * 86400), last_seq: "2973",
    settlement: { source: "terminal_payload", payload: { seq: "2973", kind: 1, reason: 1, log_len: "1486", log_hash: LOG, appraisal_log_len: "1486", appraisal_state_hash: BOARD, state_schema_version: 1, settlement_weights: ["6940", "5210", "4850"], signer_key_id: 2, issued_at: String(NOW - 3 * 86400), payload_digest: "dd".repeat(32) }, accepted_at: ns(NOW - 3 * 86400), window_end: ns(NOW - 2 * 86400 + 3600) },
    consent_bitmap: 0,
    dispute: { challenger: W[2], bond: "5000000", evidence_hash: EV, disputed_at: ns(disputedAt), resolution: null, resolved_at: null },
    outcome: null,
    ...over,
  };
  return { game, paused: false, latest_checkpoint: { payload: { seq: "2972" }, accepted_at: ns(NOW - 3 * 86400) }, trusted_seq: "2973",
    deadlines: { funding_deadline: ns(NOW - 5 * 86400), liveness_available_at: null, challenge_window_end: null, resolver_timeout_at: game.state === "disputed" ? ns(disputedAt + 2592000) : null, review_annul_available_at: null } };
}

export function proposal(id, gameId, status, outcome = "uphold", over = {}) {
  const resolve = { resolve: { chain_game_id: gameId, outcome: { [outcome]: {} } } };
  return { id, proposal: { title: `Appeal ${gameId}: ${outcome}`, description: "The recorded settlement matches the log.", proposer: MEMBER, start_height: 100, min_voting_period: null,
    expiration: { at_time: ns(status === "open" ? NOW + 5 * 86400 : NOW - 86400) }, threshold: { threshold_quorum: { threshold: { majority: {} }, quorum: { percent: "0.2" } } },
    total_power: "100", msgs: [{ wasm: { execute: { contract_addr: PIN.escrow, msg: b64(resolve), funds: [] } } }], status, veto: null,
    votes: { yes: status === "open" ? "41" : "62", no: status === "open" ? "12" : "9", abstain: status === "open" ? "6" : "4" }, allow_revoting: false, ...over } };
}

export function tx(hash, action, proposalId, over = {}) {
  return { height: "18983183", txhash: hash, code: 0, raw_log: "", gas_wanted: "520000", gas_used: "201334", timestamp: new Date((NOW - 86400) * 1000).toISOString().replace(".000Z", "Z"),
    tx: { body: { messages: [{ "@type": "/cosmwasm.wasm.v1.MsgExecuteContract", sender: MEMBER }] }, auth_info: { fee: { amount: [{ denom: "ujunox", amount: "39000" }] } } },
    events: [{ type: "wasm", attributes: [{ key: "_contract_address", value: PIN.proposalSingle }, { key: "action", value: action }, { key: "proposal_id", value: String(proposalId) }] }], ...over };
}

/** The whole world's smart-query and tx-index answers. `over[key](contract, args)` replaces one. */
export function world(over = {}) {
  const games = { 7: chainGame(7), 6: chainGame(6, { mode: "live" }) };
  const proposals = [proposal(13, 7, "open"), proposal(12, 5, "execution_failed"), proposal(11, 6, "passed", "annul"), proposal(10, 4, "executed", "annul")];
  return {
    games, proposals,
    smart(contract, key, args) {
      if (over[key]) { const a = over[key](contract, args); if (a !== undefined) return a; }
      if (key === "proposal_modules") return { data: [{ address: PIN.proposalSingle, status: "enabled" }, { address: PIN.proposalMultiple, status: "enabled" }] };
      if (key === "voting_module") return { data: PIN.voting };
      if (key === "proposal_creation_policy") return { data: { module: { addr: PIN.preProposeSingle } } };
      if (key === "group_contract") return { data: PIN.cw4Group };
      if (key === "config" && contract === PIN.proposalSingle) return { data: { dao: PIN.daoCore, max_voting_period: { time: 604800 }, only_members_execute: true, allow_revoting: false, threshold: proposals[0].proposal.threshold } };
      if (key === "config" && contract === PIN.preProposeSingle) return { data: { deposit_info: null, open_proposal_submission: false } };
      if (key === "config" && contract === PIN.escrow) return { data: { contract_version: "2.1.0", next_chain_game_id: 8, config: { resolver: PIN.daoCore, treasury: PIN.daoCore, denom: "ujunox", params: { subsidy_bps: 250, resolver_timeout_secs: 2592000 } } } };
      if (key === "games") return { data: { games: Object.values(games).map((g) => ({ chain_game_id: g.game.chain_game_id, state: g.game.state, creator: W[0], mode: g.game.mode, max_players: 3, seats_filled: 3, ante_gross: "10000000", pool: g.game.pool })) } };
      if (key === "game") { const g = games[args.chain_game_id]; return g ? { data: g } : { status: 500, message: "codespace wasm: game not found" }; }
      if (key === "seats") { const g = games[args.chain_game_id]; return { data: { seats: (g ? g.game.seats : []).map((seat, i) => ({ chain_seat_index: i, seat, consented: false })) } }; }
      if (key === "checkpoints") return { data: { checkpoints: Array.from({ length: 31 }, (_, i) => ({ checkpoint: { payload: { seq: String(2 * i) } }, signer_key_retired: false, signer_key_compromised: false })), liveness_candidate_seq: "2972" } };
      if (key === "settlement_preview") return { data: { pool: "29250000", settlement_weights: ["6940", "5210", "4850"], payouts: ["11940882", "8964264", "8344852"], dust: "2" } };
      if (key === "signer_key") return { data: { key: { key_id: 2, pubkey: "02", added_at: ns(1), retired_at: null, compromised: false } } };
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

/** Play's public case record for a world game (names are the accounts' display names). */
export function caseRecord(id = 7, names = ["Teodora", "quill", "Marlowe"]) {
  const g = chainGame(id).game, read = new Date(NOW * 1000).toISOString();
  return {
    chainGameId: String(id), contract: PIN.escrow, chainId: "uni-7",
    escrow: { value: "disputed", provenance: "chain-observed", observedAt: read },
    seats: g.seats.map((s, i) => ({ chainSeatIndex: i, wallet: s.wallet, isChallenger: s.wallet === g.dispute.challenger, displayName: names[i] })),
    dispute: { value: { challenger: g.dispute.challenger, bond: { amount: "5000000", denom: "ujunox" }, evidenceHash: EV, disputedAt: new Date((NOW - 2 * 86400) * 1000).toISOString(), resolverTimeoutAt: new Date((NOW + 28 * 86400) * 1000).toISOString() }, provenance: "chain-observed", observedAt: read },
    chainSettlement: { value: { seq: "2973", logHash: LOG, appraisalStateHash: BOARD, weights: ["6940", "5210", "4850"] }, provenance: "chain-observed", observedAt: read },
    serverTerminal: { value: { logLen: 1486, logHash: LOG, appraisalStateHash: BOARD, reason: "BankBroken", totalsBySeat: [{ chainSeatIndex: 0, dollars: 6940 }, { chainSeatIndex: 1, dollars: 5210 }, { chainSeatIndex: 2, dollars: 4850 }] }, provenance: "server-recorded" },
    evidenceMatches: { value: "neither", provenance: "chain-observed", observedAt: read },
    transactions: { value: { relayed: [{ op: "settle", txHash: "4C1E" + "0".repeat(56) + "9A0B", status: { value: "included", provenance: "chain-observed", height: "100" }, at: read }], walletSigned: "not-server-recorded" }, provenance: "server-recorded" },
  };
}
