/* LudumCase · the dispute case page's server record (architecture §5 `CaseRecord`, Lane B2), checked before it is shown.
 *
 * The record comes from Play's public route `POST /gs/api/ludum/v1/case { chainGameId }` through LudumSession.api (the
 * one configured client; no origin is named here). It is ENRICHMENT ONLY (§2.2: the server is never in the governance
 * trust path): every governance action on the case page is still gated on this browser's own chain read (gov.js). So:
 *
 *   - a record is shown only if it is exactly the §5 shape, for exactly this game, escrow contract and chain id;
 *   - its seats, challenger, bond and evidence hash must agree with this browser's chain read, or nothing of it is
 *     shown (a disagreement is reported, never resolved in either side's favour);
 *   - an escrow-state difference alone is a read-time difference (both are reads of a moving chain): shown as such;
 *   - every fact keeps the provenance the server gave it; "unavailable" keeps its reason; nothing is filled in.
 *
 * v1.1 (1830Juno §5.1, additive): a seat may carry `displayName` (the table name, or null) and the record may carry
 * `transactions` (what the server relayed for the game). Both are optional, and checked exactly when present.
 *
 * Pure: no DOM and no globals (the caller passes the pins it expects), so node --test can load it. */
(function (root) {
  'use strict';

  var PROVENANCES = ['chain-confirmed', 'chain-observed', 'server-recorded', 'pending', 'unavailable'];
  var ESCROW_STATES = ['funding', 'funded', 'in_progress', 'settleable', 'disputed', 'settled', 'cancelled', 'annulled'];
  var RECORD_KEYS = ['chainGameId', 'chainId', 'chainSettlement', 'contract', 'dispute', 'escrow', 'evidenceMatches', 'seats', 'serverTerminal'];
  var TX_OPS = ['start', 'checkpoint', 'settle', 'finalize', 'consent', 'annul', 'remedy'];
  var TX_HASH = /^[0-9A-F]{64}$/;
  var EVIDENCE = ['server-log', 'server-board', 'neither'];
  var HEX64 = /^[0-9a-f]{64}$/i;
  var DIGITS = /^(0|[1-9]\d*)$/;
  var ADDR = /^juno1[02-9ac-hj-np-z]{38,58}$/;
  var ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  var ID = /^(0|[1-9]\d{0,19})$/;

  function isObj(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }
  function keysExactly(o, keys) { var k = Object.keys(o).sort(), w = keys.slice().sort(); return k.length === w.length && k.every(function (x, i) { return x === w[i]; }); }
  /** Exactly `keys`, plus any of `optional` that are present. */
  function keysWithin(o, keys, optional) { return keysExactly(o, keys.concat(optional.filter(function (k) { return Object.prototype.hasOwnProperty.call(o, k); }))); }

  /* ---- One §4 Fact: value null iff unavailable; unavailable carries a reason; chain facts carry their read time. ---- */
  function checkFact(f, where, problems, valueCheck, allowed) {
    if (!isObj(f)) { problems.push(where + ' is not a fact'); return; }
    if (PROVENANCES.indexOf(f.provenance) === -1) { problems.push(where + ' has an unknown provenance'); return; }
    if (allowed && allowed.indexOf(f.provenance) === -1) { problems.push(where + ' has provenance ' + f.provenance + ', which it cannot have'); return; }
    if (f.provenance === 'unavailable') {
      if (f.value !== null) problems.push(where + ' is unavailable but carries a value');
      if (typeof f.reason !== 'string' || !f.reason) problems.push(where + ' is unavailable without a reason');
      return;
    }
    if (f.value === null || f.value === undefined) { problems.push(where + ' has no value'); return; }
    if ((f.provenance === 'chain-confirmed' || f.provenance === 'chain-observed') && !(typeof f.observedAt === 'string' && ISO.test(f.observedAt))) problems.push(where + ' is a chain fact without its read time');
    if (f.height !== undefined && !(typeof f.height === 'string' && DIGITS.test(f.height))) problems.push(where + '.height is not a block height');
    valueCheck(f.value, problems);
  }
  function junoxOk(j) { return isObj(j) && keysExactly(j, ['amount', 'denom']) && typeof j.amount === 'string' && DIGITS.test(j.amount) && j.denom === 'ujunox'; }

  /* The §5 CaseRecord, for exactly `expect = { chainGameId, contract, chainId }`. Returns { ok, problems }. */
  function validateRecord(rec, expect) {
    var p = [];
    if (!isObj(rec)) return { ok: false, problems: ['the answer is not a case record'] };
    if (!keysWithin(rec, RECORD_KEYS, ['transactions'])) p.push('the record does not have exactly the §5 fields');
    if (rec.chainGameId !== expect.chainGameId) p.push('the record is for game ' + String(rec.chainGameId) + ', not #' + expect.chainGameId);
    if (rec.contract !== expect.contract) p.push('the record names a different escrow contract');
    if (rec.chainId !== expect.chainId) p.push('the record names a different chain');
    checkFact(rec.escrow, 'escrow', p, function (v, q) { if (ESCROW_STATES.indexOf(v) === -1) q.push('escrow is not an escrow state'); }, ['chain-confirmed', 'chain-observed', 'unavailable']);
    var challenger = isObj(rec.dispute) && isObj(rec.dispute.value) ? rec.dispute.value.challenger : null;
    if (!Array.isArray(rec.seats) || rec.seats.length > 7) p.push('seats is not a seat list');
    else rec.seats.forEach(function (s, i) {
      if (!isObj(s) || !keysWithin(s, ['chainSeatIndex', 'isChallenger', 'wallet'], ['displayName']) || s.chainSeatIndex !== i || !ADDR.test(String(s.wallet)) || typeof s.isChallenger !== 'boolean') p.push('seat ' + i + ' is malformed');
      else if (s.displayName !== undefined && s.displayName !== null && !(typeof s.displayName === 'string' && s.displayName.length > 0 && s.displayName.length <= 64)) p.push('seat ' + i + ' has a malformed display name');
      else if (s.isChallenger !== (challenger !== null && s.wallet === challenger)) p.push('seat ' + i + ' is marked inconsistently with the challenger');
    });
    checkFact(rec.dispute, 'dispute', p, function (v, q) {
      if (!keysExactly(v, ['bond', 'challenger', 'disputedAt', 'evidenceHash', 'resolverTimeoutAt']) || !ADDR.test(String(v.challenger)) || !junoxOk(v.bond) || !HEX64.test(String(v.evidenceHash)) || !ISO.test(String(v.disputedAt)) || !ISO.test(String(v.resolverTimeoutAt))) q.push('dispute is malformed');
    }, ['chain-confirmed', 'chain-observed', 'unavailable']);
    checkFact(rec.chainSettlement, 'chainSettlement', p, function (v, q) {
      if (!keysExactly(v, ['appraisalStateHash', 'logHash', 'seq', 'weights']) || !DIGITS.test(String(v.seq)) || !HEX64.test(String(v.logHash)) || !HEX64.test(String(v.appraisalStateHash)) || !Array.isArray(v.weights) || !v.weights.every(function (w) { return typeof w === 'string' && DIGITS.test(w); })) q.push('chainSettlement is malformed');
    }, ['chain-confirmed', 'chain-observed', 'unavailable']);
    checkFact(rec.serverTerminal, 'serverTerminal', p, function (v, q) {
      var ok = keysExactly(v, ['appraisalStateHash', 'logHash', 'logLen', 'reason', 'totalsBySeat']) && Number.isSafeInteger(v.logLen) && v.logLen > 0 && HEX64.test(String(v.logHash)) && HEX64.test(String(v.appraisalStateHash)) &&
        typeof v.reason === 'string' && Array.isArray(v.totalsBySeat) && v.totalsBySeat.every(function (t, i) { return isObj(t) && t.chainSeatIndex === i && Number.isSafeInteger(t.dollars); });
      if (!ok) q.push('serverTerminal is malformed');
      else if (Array.isArray(rec.seats) && v.totalsBySeat.length !== rec.seats.length) q.push('serverTerminal does not cover every seat');
    }, ['server-recorded', 'unavailable']);
    checkFact(rec.evidenceMatches, 'evidenceMatches', p, function (v, q) { if (EVIDENCE.indexOf(v) === -1) q.push('evidenceMatches is not a known verdict'); });
    if (rec.transactions !== undefined) checkTransactions(rec.transactions, p);
    return { ok: p.length === 0, problems: p };
  }

  /* v1.1: the transactions the server relayed. Each is included (a chain observation, with its height) or broadcast
     (pending); nothing else is a transaction worth naming. */
  function checkTransactions(t, p) {
    checkFact(t, 'transactions', p, function (v, q) {
      if (!isObj(v) || !keysExactly(v, ['relayed', 'walletSigned']) || v.walletSigned !== 'not-server-recorded' || !Array.isArray(v.relayed) || v.relayed.length > 256) { q.push('transactions is malformed'); return; }
      v.relayed.forEach(function (x, i) {
        var ok = isObj(x) && keysExactly(x, ['at', 'op', 'status', 'txHash']) && TX_OPS.indexOf(x.op) !== -1 && TX_HASH.test(String(x.txHash)) && ISO.test(String(x.at)) && isObj(x.status);
        if (!ok) { q.push('transaction ' + i + ' is malformed'); return; }
        var st = x.status;
        if (!((st.value === 'included' && st.provenance === 'chain-observed') || (st.value === 'broadcast' && st.provenance === 'pending'))) q.push('transaction ' + i + ' has an impossible status');
        if (st.height !== undefined && !(typeof st.height === 'string' && DIGITS.test(st.height))) q.push('transaction ' + i + ' has a malformed height');
      });
    }, ['server-recorded', 'unavailable']);
  }

  /* The record against this browser's own chain read (`game` from the escrow `game` query, `seats` from `seats`).
     Identity disagreements reject the record; an escrow-state difference is a read-time difference only. */
  function crossCheck(rec, chain) {
    var problems = [], notes = [];
    if (!chain || !chain.game) return { agree: null, problems: problems, notes: ['not cross-checked: this browser could not read the chain'] };
    var game = chain.game, seats = chain.seats || [];
    if (String(game.chain_game_id) !== rec.chainGameId) problems.push('the chain read and the record are for different games');
    if (seats.length !== rec.seats.length) problems.push('the record lists ' + rec.seats.length + ' seats; the chain lists ' + seats.length);
    else seats.forEach(function (s, i) {
      if (Number(s.chain_seat_index) !== i || !s.seat || s.seat.wallet !== rec.seats[i].wallet) problems.push('seat ' + i + ' differs from the chain');
    });
    var d = game.dispute, rd = rec.dispute.value;
    if (rd !== null) {
      if (!d) problems.push('the record shows a dispute the chain read does not');
      else {
        if (d.challenger !== rd.challenger) problems.push('the challenger differs from the chain');
        if (String(d.evidence_hash).toLowerCase() !== rd.evidenceHash.toLowerCase()) problems.push('the evidence hash differs from the chain');
        if (String(d.bond) !== rd.bond.amount) problems.push('the bond differs from the chain');
      }
    }
    if (rec.escrow.value !== null && rec.escrow.value !== game.state) notes.push('the server read the escrow as ' + rec.escrow.value.replace(/_/g, ' ') + '; this browser read ' + String(game.state).replace(/_/g, ' ') + ' (different read times)');
    return { agree: problems.length === 0, problems: problems, notes: notes };
  }

  /* Fetch and classify. Never redirects to sign in: `case` is public (§5). */
  function fetchCase(session, chainGameId, expect) {
    if (!session || typeof session.api !== 'function') return Promise.resolve({ kind: 'no-client' });
    if (!ID.test(String(chainGameId))) return Promise.resolve({ kind: 'bad-request', detail: 'not a game id' });
    return Promise.resolve().then(function () { return session.api('case', { chainGameId: String(chainGameId) }); }).then(function (json) {
      var v = validateRecord(json, expect);
      return v.ok ? { kind: 'ok', record: json } : { kind: 'invalid', problems: v.problems };
    }, function (e) {
      var status = e && typeof e.status === 'number' ? e.status : 0;
      var detail = e && typeof e.detail === 'string' ? e.detail : null;
      if (status === 0) return { kind: 'unreachable', detail: detail };
      if (status === 400) return { kind: 'bad-request', detail: detail };
      if (status === 404) return { kind: 'not-found', detail: detail };
      if (status === 429) return { kind: 'rate-limited', detail: detail };
      if (status === 503) return { kind: 'unavailable', detail: detail };
      return { kind: 'unexpected', status: status, detail: detail };
    });
  }

  /* The case's status from THIS BROWSER'S chain read and the proposals linked to it by decoding (§6). */
  function caseStatus(game, linked) {
    if (!game) return { kind: 'unknown' };
    var d = game.dispute, links = linked || [];
    if (!d) return { kind: 'no-dispute', state: game.state };
    if (d.resolution != null) return { kind: 'resolved', resolution: d.resolution, resolvedAt: d.resolved_at || null, proposals: links };
    if (game.state === 'disputed') {
      var live = links.filter(function (x) { return x.status === 'open' || x.status === 'passed'; });
      return live.length ? { kind: 'appeal-pending', proposals: live, all: links } : { kind: 'disputed', proposals: links };
    }
    return { kind: 'dispute-ended', state: game.state, proposals: links };
  }

  var LudumCase = { validateRecord: validateRecord, crossCheck: crossCheck, fetchCase: fetchCase, caseStatus: caseStatus, PROVENANCES: PROVENANCES };
  root.LudumCase = LudumCase;
  if (typeof module === 'object' && module.exports) module.exports = LudumCase;
})(typeof window !== 'undefined' ? window : globalThis);
