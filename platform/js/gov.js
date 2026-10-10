/* LudumGov · the Ludum DAO appeal workflow on uni-7, chain-direct from the browser (architecture §2.2, §6).
   Reads go to the pinned REST endpoint by smart query. Writes are signed in Keplr, simulated first, and broadcast to the
   same REST endpoint. The server is never in this path, and nothing here reads an account session.
   Governance powers come only from the connected Keplr wallet: cw4 member weight > 0 AND pre-propose can_propose.
   Pure parts (pins, builders, link-by-decoding, guards) take no globals so node --test can load this file. */
(function (root) {
  'use strict';

  /* ---- Pins (architecture §1.4, verified live 2026-10-09). A mismatch with the chain stops everything. ---- */
  var PINS = Object.freeze({
    chainId: 'uni-7',
    chainName: 'Juno testnet (uni-7)',
    rest: 'https://juno.api.t.stavr.tech',
    denom: 'ujunox',
    symbol: 'JUNOX',
    exponent: 6,
    gasPrice: '0.075',
    daoCore: 'juno1fccq3dcjjn35fgt8u8jfz5kvcajfk604lhl85w25k6pr32q9r7psk6wrpu',
    proposalSingle: 'juno1shhuc4w9ht7kfzjamhz5xvatywtyzfhz6npcm8lvp8p0jlnrkk0suqcpe8',
    preProposeSingle: 'juno1huu2ysuct2e9xnmxc28xdwfeflytw2samzp95a2devjqs0qfj6fqpsmvcf',
    proposalMultiple: 'juno10va8m9zqllgypj4eyyph0rszushr43l9pg2lgn4wau7adguzau4s50a6su',
    preProposeMultiple: 'juno1glupnpaf5pzh8ym6e64vuph937jqqwjlg0pzfv7lnwthg6pekahsz2783p',
    voting: 'juno12cjzsve63f6v2rt6uekyp0ytqynsw25023vjw5ry45vw87vgyr2q9h8ym3',
    cw4Group: 'juno13dvggejlcz6nxn8kzzhr2m0e94r7adepr9crclum82uv7eyegftq2yz5up',
    escrow: 'juno19vd5hphghprl2m8agchctyav8pmeh6p4x3vud6cfhd2y6ulwtf0s0jrk7x',
    escrowVersion: '2.1.0',
    maxVotingPeriodSecs: 604800,
    caseUrlBase: 'https://ludum.netadao.org/disputes/case/?id='
  });

  /* The radio's family (§2.4): the only origins allowed to frame an action page. */
  var FAMILY_ORIGINS = Object.freeze([
    'https://netadao.org', 'https://www.netadao.org', 'https://academy.netadao.org',
    'https://fork.netadao.org', 'https://ludum.netadao.org', 'https://play.netadao.org'
  ]);

  var DAY_SECS = 86400;
  var EXEC_TYPE_URL = '/cosmwasm.wasm.v1.MsgExecuteContract';
  var VENDOR_SRC = '/platform/vendor/cosmjs-0.32.4.min.js';
  var OUTCOMES = Object.freeze({ uphold: 'Uphold', replace: 'Replace', annul: 'Annul' });
  var OUTCOME_GLOSS = Object.freeze({
    uphold: 'the stored settlement stands and the challenger’s bond joins the pool',
    replace: 'a corrected settlement (reason ResolverCorrection) pays the pool by its weights and the bond goes back to the challenger',
    annul: 'every seat’s net ante is refunded and the bond goes back to the challenger'
  });

  /* ---- Replace: a corrected SettlementPayloadV1 (escrow 2.1.0 msg.rs; payload.rs check_shape; helpers.rs
     check_payload_for_game; execute/dispute.rs Resolve::Replace). It is authorised by the resolver's own transaction --
     the DAO executing the passed proposal -- never by a signature, so nothing here signs it. The contract requires:
       version 1; domain = the game's 32-byte settlement domain; kind 1 (Terminal); reason 5 (ResolverCorrection);
       seq = 2·log_len + 1; appraisal_log_len == log_len; seat_count == weights.length == the game's seats; Σ weights > 0;
       seq > the game's trusted checkpoint floor; and never for a third-strike (RemedyStrike3) settlement.
     signer_key_id and issued_at are carried but not checked for a Replace. state_schema_version is the server's
     SETTLEMENT_STATE_SCHEMA_VERSION (1). ---- */
  var REASON_RESOLVER_CORRECTION = 5;
  var KIND_TERMINAL = 1;
  var STATE_SCHEMA_VERSION = 1;
  var HEX32 = /^[0-9a-f]{64}$/;
  var UINT = /^(0|[1-9]\d*)$/;
  var U128_MAX = BigInt('340282366920938463463374607431768211455');
  var U64_MAX = BigInt('18446744073709551615');

  /** The corrected payload, checked against every rule the contract applies. `input`: { domain (hex), logLen,
   *  logHash, appraisalStateHash, weights: [decimal strings], seatCount, floorSeq (the trusted checkpoint seq, or null),
   *  settlementSource (the stored settlement's source, or null), signerKeyId, issuedAtSecs }. Throws with the rule broken. */
  function replacePayload(input) {
    var i = input || {};
    var domain = String(i.domain || '').toLowerCase();
    if (!HEX32.test(domain)) throw new Error('the game’s settlement domain must be 32 bytes of hex');
    if (i.settlementSource === 'remedy_strike3') throw new Error('a third-strike foreclosure cannot be replaced: uphold or annul it');
    if (!Number.isSafeInteger(i.logLen) || i.logLen < 1) throw new Error('log_len must be a whole number above zero');
    var logLen = BigInt(i.logLen);
    var seq = logLen * BigInt(2) + BigInt(KIND_TERMINAL);
    if (seq > U64_MAX) throw new Error('seq does not fit a u64');
    var logHash = String(i.logHash || '').toLowerCase(), boardHash = String(i.appraisalStateHash || '').toLowerCase();
    if (!HEX32.test(logHash)) throw new Error('log_hash must be 32 bytes of hex');
    if (!HEX32.test(boardHash)) throw new Error('appraisal_state_hash must be 32 bytes of hex');
    var weights = Array.isArray(i.weights) ? i.weights.map(String) : [];
    if (!Number.isSafeInteger(i.seatCount) || i.seatCount < 1 || i.seatCount > 255 || weights.length !== i.seatCount) throw new Error('there must be exactly one weight per seat');
    var sum = BigInt(0);
    weights.forEach(function (w, n) {
      if (!UINT.test(w) || BigInt(w) > U128_MAX) throw new Error('weight ' + n + ' must be a whole number (u128)');
      sum += BigInt(w);
    });
    if (sum === BigInt(0)) throw new Error('the weights must not all be zero');
    if (i.floorSeq != null) {
      if (!UINT.test(String(i.floorSeq))) throw new Error('the checkpoint floor is not a sequence number');
      if (seq <= BigInt(String(i.floorSeq))) throw new Error('seq ' + seq + ' is not beyond the trusted checkpoint ' + i.floorSeq + ': the log must reach past it');
    }
    var signer = i.signerKeyId == null ? 0 : i.signerKeyId;
    if (!Number.isSafeInteger(signer) || signer < 0 || signer > 65535) throw new Error('signer_key_id must be a u16');
    if (!Number.isSafeInteger(i.issuedAtSecs) || i.issuedAtSecs < 0) throw new Error('issued_at must be whole seconds');
    return {
      version: 1,
      domain: domain,
      seq: seq.toString(),
      kind: KIND_TERMINAL,
      reason: REASON_RESOLVER_CORRECTION,
      log_len: logLen.toString(),
      log_hash: logHash,
      appraisal_log_len: logLen.toString(),
      appraisal_state_hash: boardHash,
      state_schema_version: STATE_SCHEMA_VERSION,
      seat_count: i.seatCount,
      settlement_weights: weights,
      signer_key_id: signer,
      issued_at: String(i.issuedAtSecs)
    };
  }

  /** The exact keys and rules of a payload a Replace proposal carries (for decoding someone else's proposal). */
  function replacePayloadProblem(p) {
    var keys = ['appraisal_log_len', 'appraisal_state_hash', 'domain', 'issued_at', 'kind', 'log_hash', 'log_len', 'reason', 'seat_count', 'seq', 'settlement_weights', 'signer_key_id', 'state_schema_version', 'version'];
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).sort().join() !== keys.join()) return 'not a SettlementPayloadV1';
    if (p.version !== 1 || p.kind !== KIND_TERMINAL || p.reason !== REASON_RESOLVER_CORRECTION) return 'not a terminal ResolverCorrection payload';
    if (!UINT.test(String(p.log_len)) || String(p.seq) !== (BigInt(String(p.log_len)) * BigInt(2) + BigInt(1)).toString()) return 'seq is not 2·log_len + 1';
    if (String(p.appraisal_log_len) !== String(p.log_len)) return 'appraisal_log_len differs from log_len';
    if (!Array.isArray(p.settlement_weights) || p.settlement_weights.length !== p.seat_count) return 'seat_count differs from the weights';
    if (!p.settlement_weights.every(function (w) { return UINT.test(String(w)); }) || p.settlement_weights.every(function (w) { return BigInt(String(w)) === BigInt(0); })) return 'the weights are not usable';
    return null;
  }

  /* ---- Encoding: UTF-8 JSON ⇄ base64, with only what browsers and Node both have. ---- */
  function utf8ToB64(text) {
    var bytes = new TextEncoder().encode(text), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  function jsonB64(obj) { return utf8ToB64(JSON.stringify(obj)); }

  /* ---- Ids: u64 strings of digits on our side; JSON numbers on the wire only while exactly representable. ---- */
  function u64Number(id, what) {
    var s = String(id);
    if (!/^(0|[1-9]\d{0,15})$/.test(s) || Number(s) > Number.MAX_SAFE_INTEGER) throw new Error((what || 'id') + ' must be a whole number');
    return Number(s);
  }

  /* ---- Builders (§6, byte for byte). Each returns { contract, msg, funds: [] } for one MsgExecuteContract. ---- */
  function resolveMsg(chainGameId, outcome, payload) {
    if (!Object.prototype.hasOwnProperty.call(OUTCOMES, outcome)) throw new Error('outcome must be uphold, replace or annul');
    var body = {};
    if (outcome === 'replace') {
      var problem = replacePayloadProblem(payload);
      if (problem !== null) throw new Error('replace needs a corrected payload: ' + problem);
      body.replace = { payload: payload };
    } else {
      if (payload !== undefined) throw new Error(outcome + ' takes no payload');
      body[outcome] = {};
    }
    return { resolve: { chain_game_id: u64Number(chainGameId, 'chain_game_id'), outcome: body } };
  }
  function resolveB64(chainGameId, outcome, payload) { return jsonB64(resolveMsg(chainGameId, outcome, payload)); }

  function proposalTitle(chainGameId, outcome) {
    return 'Appeal: escrow game #' + u64Number(chainGameId) + ' — ' + OUTCOMES[outcome];
  }
  function caseUrl(chainGameId) { return PINS.caseUrlBase + u64Number(chainGameId); }

  /* The case summary that goes on chain: chain facts only, then the case URL. */
  function proposalDescription(facts) {
    var id = u64Number(facts.chainGameId);
    var lines = ['Escrow ' + PINS.escrowVersion + ' game #' + id + ' on ' + PINS.chainId + ' (' + PINS.escrow + ') is disputed.'];
    if (facts.challenger) lines.push('Challenger: ' + facts.challenger + '.');
    if (facts.bond) lines.push('Bond: ' + facts.bond + ' ' + PINS.denom + '.');
    if (facts.evidenceHash) lines.push('Evidence hash: ' + facts.evidenceHash + '.');
    if (facts.disputedAt) lines.push('Disputed at: ' + facts.disputedAt + '.');
    if (facts.resolverTimeoutAt) lines.push('Resolver timeout: ' + facts.resolverTimeoutAt + '.');
    lines.push('Proposed resolution: ' + OUTCOMES[facts.outcome] + ' — ' + OUTCOME_GLOSS[facts.outcome] + '.');
    if (facts.outcome === 'replace' && facts.payload) {
      lines.push('Corrected settlement: log_len ' + facts.payload.log_len + ', seq ' + facts.payload.seq + ', log hash ' + facts.payload.log_hash + ', board hash ' + facts.payload.appraisal_state_hash + '.');
      lines.push('Weights by seat: ' + facts.payload.settlement_weights.join(' · ') + '.');
      if (facts.basis) lines.push('Basis: ' + facts.basis + '.');
    }
    lines.push('Case: ' + caseUrl(id));
    return lines.join('\n');
  }

  function buildPropose(opts) {
    if (typeof opts.description !== 'string' || !opts.description) throw new Error('description is required');
    var outcome = opts.outcome;
    var b64 = resolveB64(opts.chainGameId, outcome, outcome === 'replace' ? opts.payload : undefined);
    var msg = { propose: { msg: { propose: {
      title: proposalTitle(opts.chainGameId, outcome),
      description: opts.description,
      msgs: [{ wasm: { execute: { contract_addr: PINS.escrow, msg: b64, funds: [] } } }],
      vote: opts.voteYes === true ? { vote: 'yes' } : null
    } } } };
    return { contract: PINS.preProposeSingle, msg: msg, funds: [] };
  }
  function buildVote(proposalId, vote, rationale) {
    if (vote !== 'yes' && vote !== 'no' && vote !== 'abstain') throw new Error('vote must be yes, no or abstain');
    var r = typeof rationale === 'string' && rationale.trim() ? rationale.trim() : null;
    return { contract: PINS.proposalSingle, msg: { vote: { proposal_id: u64Number(proposalId, 'proposal_id'), vote: vote, rationale: r } }, funds: [] };
  }
  function buildExecute(proposalId) {
    return { contract: PINS.proposalSingle, msg: { execute: { proposal_id: u64Number(proposalId, 'proposal_id') } }, funds: [] };
  }
  function buildClose(proposalId) {
    return { contract: PINS.proposalSingle, msg: { close: { proposal_id: u64Number(proposalId, 'proposal_id') } }, funds: [] };
  }

  /* ---- Link-by-decoding (§6). A proposal belongs to game G iff it holds exactly one msg, a wasm.execute to the
     pinned escrow, whose decoded body is { resolve } and nothing else, with chain_game_id == G. ---- */
  function decodeResolve(proposal) {
    var msgs = proposal && proposal.msgs;
    if (!Array.isArray(msgs) || msgs.length !== 1) return null;
    var m = msgs[0];
    if (!m || typeof m !== 'object' || Object.keys(m).length !== 1 || !m.wasm || typeof m.wasm !== 'object') return null;
    if (Object.keys(m.wasm).length !== 1 || !m.wasm.execute) return null;
    var ex = m.wasm.execute;
    if (ex.contract_addr !== PINS.escrow || typeof ex.msg !== 'string') return null;
    var body;
    try { body = JSON.parse(b64ToUtf8(ex.msg)); } catch (e) { return null; }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) return null;
    var r = body.resolve;
    if (!r || typeof r !== 'object' || !Number.isSafeInteger(r.chain_game_id) || r.chain_game_id < 0) return null;
    var o = r.outcome, kind = o && typeof o === 'object' ? Object.keys(o) : [];
    if (kind.length !== 1 || (kind[0] !== 'uphold' && kind[0] !== 'annul' && kind[0] !== 'replace')) return null;
    if (kind[0] === 'replace') {
      var rp = o.replace;
      if (!rp || typeof rp !== 'object' || Object.keys(rp).length !== 1 || replacePayloadProblem(rp.payload) !== null) return null;
      return { chainGameId: String(r.chain_game_id), outcome: 'replace', payload: rp.payload };
    }
    if (Object.keys(o[kind[0]] || {}).length !== 0) return null;
    return { chainGameId: String(r.chain_game_id), outcome: kind[0] };
  }
  function linksToGame(proposal, chainGameId) {
    var d = decodeResolve(proposal);
    return d !== null && d.chainGameId === String(chainGameId);
  }

  /* ---- Pin check: every address the UI would act on must equal §1.4, as the DAO itself reports it. ---- */
  function checkPins(live) {
    var problems = [];
    var mods = live && live.proposalModules;
    if (!Array.isArray(mods)) problems.push('proposal_modules unreadable');
    else {
      var addrs = mods.map(function (m) { return m && m.address; }).sort();
      var want = [PINS.proposalSingle, PINS.proposalMultiple].sort();
      if (addrs.length !== 2 || addrs[0] !== want[0] || addrs[1] !== want[1]) problems.push('proposal_modules differ from the pinned modules');
      var single = mods.filter(function (m) { return m && m.address === PINS.proposalSingle; })[0];
      if (!single || single.status !== 'enabled') problems.push('the pinned single-choice module is not enabled');
    }
    if (live.votingModule !== PINS.voting) problems.push('voting_module differs from the pin');
    if (live.preProposeSingle !== PINS.preProposeSingle) problems.push('the single-choice pre-propose differs from the pin');
    if (live.cw4Group !== PINS.cw4Group) problems.push('the cw4 group differs from the pin');
    var c = live.singleConfig;
    if (!c || c.dao !== PINS.daoCore || !c.max_voting_period || c.max_voting_period.time !== PINS.maxVotingPeriodSecs) {
      problems.push('the single-choice module configuration differs from the pin');
    }
    var e = live.escrowConfig;
    if (!e || e.contract_version !== PINS.escrowVersion || !e.config || e.config.resolver !== PINS.daoCore || e.config.denom !== PINS.denom) {
      problems.push('the escrow configuration differs from the pin');
    }
    return { ok: problems.length === 0, problems: problems };
  }

  /* ---- Deadline guard (§6): refuse to prefill when resolverTimeoutAt − now < max_voting_period + 24 h. ---- */
  function deadlineGuard(resolverTimeoutAtSecs, nowSecs, maxVotingPeriodSecs) {
    var mvp = maxVotingPeriodSecs == null ? PINS.maxVotingPeriodSecs : maxVotingPeriodSecs;
    var need = mvp + DAY_SECS;
    if (typeof resolverTimeoutAtSecs !== 'number' || !isFinite(resolverTimeoutAtSecs)) {
      return { ok: false, needSecs: need, leftSecs: null, reason: 'The resolver deadline is unavailable, so no proposal is prefilled.' };
    }
    var left = resolverTimeoutAtSecs - nowSecs;
    if (left < need) {
      return { ok: false, needSecs: need, leftSecs: left, reason: 'Too late to appeal safely: ' + fmtDuration(Math.max(0, left)) +
        ' remain before any seat may liveness-settle, and a vote may take ' + fmtDuration(mvp) + ' plus a day to execute. ' +
        'A proposal now could race liveness_settle and fail, so none is offered.' };
    }
    return { ok: true, needSecs: need, leftSecs: left, reason: null };
  }

  /* ---- Framing guard (§2.4): action buttons only top-level, or inside family-only ancestors (the radio shell). ---- */
  function framingAllowed(win) {
    try {
      if (win.top === win) return true;
      var ao = win.location && win.location.ancestorOrigins;
      if (!ao || typeof ao.length !== 'number' || ao.length === 0) return false;
      for (var i = 0; i < ao.length; i++) if (FAMILY_ORIGINS.indexOf(ao[i]) === -1) return false;
      return true;
    } catch (e) { return false; }
  }

  /* ---- Formatting ---- */
  function fmtDuration(secs) {
    secs = Math.floor(secs);
    var d = Math.floor(secs / DAY_SECS), h = Math.floor((secs % DAY_SECS) / 3600), m = Math.floor((secs % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm ' + (secs % 60) + 's';
  }
  /* Integer base units → "1.500000 JUNOX", by string arithmetic only (never a JS number). */
  function fmtJunox(amount) {
    var s = String(amount);
    if (!/^\d+$/.test(s)) return 'unavailable';
    s = s.replace(/^0+(?=\d)/, '');
    while (s.length <= PINS.exponent) s = '0' + s;
    return s.slice(0, -PINS.exponent) + '.' + s.slice(-PINS.exponent) + ' ' + PINS.symbol;
  }
  /* cosmwasm Timestamp (nanoseconds, a string) → whole seconds. */
  function nanosToSecs(ns) {
    if (typeof ns !== 'string' || !/^\d+$/.test(ns)) return null;
    return ns.length > 9 ? Number(ns.slice(0, -9)) : 0;
  }
  function isoFromSecs(secs) { return secs == null ? null : new Date(secs * 1000).toISOString().replace('.000Z', 'Z'); }

  /* ---- Chain reads (REST smart queries). Every value carries its read time; failures say "unavailable". ---- */
  function makeReader(fetchImpl, now) {
    var f = fetchImpl || (typeof fetch === 'function' ? fetch.bind(root) : null);
    var clock = now || function () { return Date.now(); };
    function get(path) {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;
      return f(PINS.rest + path, { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: ctl ? ctl.signal : undefined })
        .then(function (res) {
          return res.text().then(function (text) {
            var json; try { json = JSON.parse(text); } catch (e) { json = null; }
            if (!res.ok) { var err = new Error((json && json.message) || ('HTTP ' + res.status)); err.status = res.status; err.chain = true; throw err; }
            return json;
          });
        })
        .finally(function () { if (timer) clearTimeout(timer); });
    }
    function smart(contract, query) {
      return get('/cosmwasm/wasm/v1/contract/' + contract + '/smart/' + encodeURIComponent(jsonB64(query))).then(function (json) {
        return { data: json.data, observedAt: new Date(clock()).toISOString() };
      });
    }
    return { get: get, smart: smart };
  }

  function readLivePins(reader) {
    return Promise.all([
      reader.smart(PINS.daoCore, { proposal_modules: {} }),
      reader.smart(PINS.daoCore, { voting_module: {} }),
      reader.smart(PINS.proposalSingle, { proposal_creation_policy: {} }),
      reader.smart(PINS.voting, { group_contract: {} }),
      reader.smart(PINS.proposalSingle, { config: {} }),
      reader.smart(PINS.escrow, { config: {} })
    ]).then(function (r) {
      var policy = r[2].data && r[2].data.module;
      var live = {
        proposalModules: r[0].data, votingModule: r[1].data,
        preProposeSingle: policy && policy.addr, cw4Group: r[3].data,
        singleConfig: r[4].data, escrowConfig: r[5].data, observedAt: r[5].observedAt
      };
      live.check = checkPins(live);
      return live;
    });
  }

  function readGovernor(reader, address) {
    return Promise.all([
      reader.smart(PINS.cw4Group, { member: { addr: address } }),
      reader.smart(PINS.preProposeSingle, { can_propose: { address: address } })
    ]).then(function (r) {
      var weight = r[0].data && typeof r[0].data.weight === 'number' ? r[0].data.weight : 0;
      var canPropose = r[1].data === true;
      return { address: address, weight: weight, member: weight > 0, canPropose: canPropose, governor: weight > 0 && canPropose, observedAt: r[1].observedAt };
    });
  }

  /* Every escrow game, 30 at a time (the contract's cap). */
  function readAllGames(reader) {
    var out = [], observedAt = null;
    function page(after) {
      var q = { games: { limit: 30 } }; if (after != null) q.games.start_after = after;
      return reader.smart(PINS.escrow, q).then(function (r) {
        var games = (r.data && r.data.games) || [];
        observedAt = r.observedAt;
        out = out.concat(games);
        return games.length === 30 ? page(games[games.length - 1].chain_game_id) : { games: out, observedAt: observedAt };
      });
    }
    return page(null);
  }

  /* Every proposal on the single-choice module, newest first. */
  function readAllProposals(reader) {
    var out = [], observedAt = null;
    function page(before) {
      var q = { reverse_proposals: { limit: 30 } }; if (before != null) q.reverse_proposals.start_before = before;
      return reader.smart(PINS.proposalSingle, q).then(function (r) {
        var ps = (r.data && r.data.proposals) || [];
        observedAt = r.observedAt;
        out = out.concat(ps);
        return ps.length === 30 ? page(ps[ps.length - 1].id) : { proposals: out, observedAt: observedAt };
      });
    }
    return page(null);
  }

  function readVotes(reader, proposalId) {
    var out = [], observedAt = null;
    function page(after) {
      var q = { list_votes: { proposal_id: u64Number(proposalId), limit: 30 } }; if (after) q.list_votes.start_after = after;
      return reader.smart(PINS.proposalSingle, q).then(function (r) {
        var vs = (r.data && r.data.votes) || [];
        observedAt = r.observedAt;
        out = out.concat(vs);
        return vs.length === 30 ? page(vs[vs.length - 1].voter) : { votes: out, observedAt: observedAt };
      });
    }
    return page(null);
  }

  /* ---- Keplr ---- */
  function keplr() {
    var k = root && root.keplr;
    return k && typeof k.enable === 'function' && typeof k.getKey === 'function' ? k : null;
  }
  function chainInfo() {
    var price = Number(PINS.gasPrice);
    var cur = { coinDenom: PINS.symbol, coinMinimalDenom: PINS.denom, coinDecimals: PINS.exponent };
    return {
      chainId: PINS.chainId, chainName: PINS.chainName, rpc: PINS.rest, rest: PINS.rest, bip44: { coinType: 118 },
      bech32Config: { bech32PrefixAccAddr: 'juno', bech32PrefixAccPub: 'junopub', bech32PrefixValAddr: 'junovaloper',
        bech32PrefixValPub: 'junovaloperpub', bech32PrefixConsAddr: 'junovalcons', bech32PrefixConsPub: 'junovalconspub' },
      currencies: [cur], feeCurrencies: [Object.assign({}, cur, { gasPriceStep: { low: price, average: price, high: price * 2 } })],
      stakeCurrency: cur, features: ['cosmwasm']
    };
  }
  var declined = function (e) { return /reject|denied|cancel|declin/i.test(e && e.message ? e.message : String(e)); };
  function connect() {
    var k = keplr();
    if (!k) return Promise.reject(new Error('Keplr isn’t available in this browser.'));
    var suggest = typeof k.experimentalSuggestChain === 'function' ? k.experimentalSuggestChain(chainInfo()) : Promise.resolve();
    return Promise.resolve(suggest)
      .then(function () { return k.enable(PINS.chainId); })
      .then(function () { return k.getKey(PINS.chainId); })
      .then(function (key) {
        if (!key || !/^juno1[02-9ac-hj-np-z]{38}$/.test(key.bech32Address)) throw new Error('Keplr has no Juno account to use.');
        return { address: key.bech32Address, name: key.name || '', pubKey: key.pubKey };
      }, function (e) { throw new Error(declined(e) ? 'Keplr didn’t connect. Nothing was shared.' : 'Keplr couldn’t connect to ' + PINS.chainName + '.'); });
  }

  var vendorPromise = null;
  function loadVendor() {
    if (root.LudumCosmJS) return Promise.resolve(root.LudumCosmJS);
    if (vendorPromise) return vendorPromise;
    vendorPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = VENDOR_SRC; s.async = true;
      s.onload = function () { root.LudumCosmJS ? resolve(root.LudumCosmJS) : reject(new Error('cosmjs did not load')); };
      s.onerror = function () { vendorPromise = null; reject(new Error('cosmjs did not load')); };
      document.head.appendChild(s);
    });
    return vendorPromise;
  }

  /* Simulate → Keplr signs → broadcast (sync) → wait for inclusion. Keplr is never asked if the simulation fails. */
  function prepare(reader, spec, wallet) {
    return loadVendor().then(function (C) {
      var enc = C.MsgExecuteContract.fromPartial({ sender: wallet.address, contract: spec.contract, msg: C.toUtf8(JSON.stringify(spec.msg)), funds: [] });
      var any = { typeUrl: EXEC_TYPE_URL, value: C.MsgExecuteContract.encode(enc).finish() };
      return reader.get('/cosmos/auth/v1beta1/accounts/' + wallet.address).then(function (acc) {
        var a = acc && acc.account;
        if (!a || a.account_number == null) throw new Error('This wallet has no account on ' + PINS.chainId + ' yet (it needs JUNOX for fees).');
        var seq = Number(a.sequence || 0);
        var tx = C.Tx.fromPartial({
          body: C.TxBody.fromPartial({ messages: [any], memo: '' }),
          authInfo: C.AuthInfo.fromPartial({ fee: C.Fee.fromPartial({}), signerInfos: [{
            publicKey: C.encodePubkey(C.encodeSecp256k1Pubkey(wallet.pubKey)), modeInfo: { single: { mode: C.SignMode.SIGN_MODE_UNSPECIFIED } }, sequence: BigInt(seq) }] }),
          signatures: [new Uint8Array()]
        });
        return post(reader, '/cosmos/tx/v1beta1/simulate', { tx_bytes: C.toBase64(C.Tx.encode(tx).finish()) }).then(function (sim) {
          var used = Number(sim && sim.gas_info && sim.gas_info.gas_used);
          if (!(used > 0)) throw new Error('The simulation returned no gas estimate.');
          return { C: C, enc: enc, gasUsed: used, accountNumber: Number(a.account_number), sequence: seq };
        });
      });
    });
  }
  function post(reader, path, body) {
    return fetch(PINS.rest + path, { method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().catch(function () { return null; }).then(function (j) {
        if (!res.ok) { var e = new Error((j && j.message) || ('HTTP ' + res.status)); e.chain = true; throw e; }
        return j;
      }); });
  }
  function signAndBroadcast(reader, spec, wallet, prepared) {
    var k = keplr(), C = prepared.C;
    if (!k) return Promise.reject(new Error('Keplr isn’t available in this browser.'));
    var gasPrice = C.GasPrice.fromString(PINS.gasPrice + PINS.denom);
    var fee = C.calculateFee(Math.floor(prepared.gasUsed * 14 / 10) + 1, gasPrice);
    return Promise.resolve(typeof k.getOfflineSignerAuto === 'function' ? k.getOfflineSignerAuto(PINS.chainId) : k.getOfflineSigner(PINS.chainId))
      .then(function (signer) { return C.SigningCosmWasmClient.offline(signer); })
      .then(function (client) {
        return client.sign(wallet.address, [{ typeUrl: EXEC_TYPE_URL, value: prepared.enc }], fee, '',
          { accountNumber: prepared.accountNumber, sequence: prepared.sequence, chainId: PINS.chainId });
      })
      .then(function (raw) {
        return post(reader, '/cosmos/tx/v1beta1/txs', { tx_bytes: C.toBase64(C.TxRaw.encode(raw).finish()), mode: 'BROADCAST_MODE_SYNC' });
      }, function (e) { throw new Error(declined(e) ? 'You declined in Keplr. Nothing was sent.' : 'Keplr stopped without signing: ' + (e && e.message)); })
      .then(function (r) {
        var t = r && r.tx_response;
        if (!t || !t.txhash) throw new Error('The node did not accept the transaction.');
        if (t.code) throw new Error('The node refused the transaction: ' + (t.raw_log || ('code ' + t.code)));
        return waitForTx(reader, t.txhash, 0);
      });
  }
  function waitForTx(reader, hash, tries) {
    return new Promise(function (r) { setTimeout(r, 3000); }).then(function () {
      return reader.get('/cosmos/tx/v1beta1/txs/' + hash).then(function (j) {
        var t = j && j.tx_response;
        if (t && t.code) throw new Error('Included but failed: ' + (t.raw_log || ('code ' + t.code)));
        return { txhash: hash, height: t && t.height };
      }, function (e) {
        if (tries >= 20) return { txhash: hash, height: null, pending: true };
        return waitForTx(reader, hash, tries + 1);
      });
    });
  }

  var LudumGov = {
    PINS: PINS, FAMILY_ORIGINS: FAMILY_ORIGINS, OUTCOMES: OUTCOMES,
    resolveMsg: resolveMsg, resolveB64: resolveB64, proposalTitle: proposalTitle, proposalDescription: proposalDescription, caseUrl: caseUrl,
    replacePayload: replacePayload, replacePayloadProblem: replacePayloadProblem,
    buildPropose: buildPropose, buildVote: buildVote, buildExecute: buildExecute, buildClose: buildClose,
    decodeResolve: decodeResolve, linksToGame: linksToGame, checkPins: checkPins,
    deadlineGuard: deadlineGuard, framingAllowed: framingAllowed,
    fmtDuration: fmtDuration, fmtJunox: fmtJunox, nanosToSecs: nanosToSecs, isoFromSecs: isoFromSecs,
    utf8ToB64: utf8ToB64, b64ToUtf8: b64ToUtf8,
    makeReader: makeReader, readLivePins: readLivePins, readGovernor: readGovernor,
    readAllGames: readAllGames, readAllProposals: readAllProposals, readVotes: readVotes,
    keplr: keplr, connect: connect, prepare: prepare, signAndBroadcast: signAndBroadcast
  };
  root.LudumGov = LudumGov;
  if (typeof module === 'object' && module.exports) module.exports = LudumGov;
})(typeof window !== 'undefined' ? window : globalThis);
