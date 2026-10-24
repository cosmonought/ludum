/* LudumGov · the Ludum DAO's governance on uni-7, chain-direct from the browser (architecture §2.2, §6).
   Reads go to the pinned REST endpoint by smart query. Writes are signed in Keplr, simulated first, and broadcast to the
   same REST endpoint. The server is never in this path, and nothing here reads an account session.
   Governance powers come only from the connected Keplr wallet: cw4 member weight > 0 AND pre-propose can_propose.
   Pure parts (pins, builders, guards) take no globals so node --test can load this file.

   LUDUM v1.7 (owner, 2026-10-24): the retired JUNOX escrow is no Ludum feature. Its appeal workflow -- escrow pins and
   reads, Resolve proposals, link-by-decoding, the deadline guard, the resolution previews -- is gone from this file. What
   stays is the DAO's own governance, with every check it had: the DAO's modules must equal the pins (an escrow that
   changes no longer turns it off), the page must not be framed by a foreign site, and the chain decides who may propose,
   vote and execute. */
(function (root) {
  'use strict';

  /* ---- Pins (architecture §1.4, verified live 2026-10-09). A mismatch with the chain stops every action. ---- */
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
    maxVotingPeriodSecs: 604800
  });

  /* The radio's family (§2.4): the only origins allowed to frame an action page. */
  var FAMILY_ORIGINS = Object.freeze([
    'https://netadao.org', 'https://www.netadao.org', 'https://academy.netadao.org',
    'https://fork.netadao.org', 'https://ludum.netadao.org', 'https://play.netadao.org'
  ]);

  var DAY_SECS = 86400;
  var EXEC_TYPE_URL = '/cosmwasm.wasm.v1.MsgExecuteContract';
  var VENDOR_SRC = '/platform/vendor/cosmjs-0.32.4.min.js';

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
  /* LUDUM RESULT REVIEW: a TEXT proposal -- no message, so it can execute nothing on chain. An appeal's resolution is
     decided by the Ludum DAO's vote on one that names the resolution's digest; Play's server reads the vote and applies
     the resolution itself. The pre-propose module takes no deposit (funds: []); the chain decides who may propose. */
  function buildTextProposal(title, description) {
    if (typeof title !== 'string' || title !== title.trim() || !title || title.length > 200) throw new Error('a proposal title is 1 to 200 characters');
    if (typeof description !== 'string' || !description.trim() || description.length > 30000) throw new Error('a proposal description is required (at most 30,000 characters)');
    return { contract: PINS.preProposeSingle, msg: { propose: { msg: { propose: { title: title, description: description, msgs: [], vote: null } } } }, funds: [] };
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

  /* ---- Pin check: every DAO address the UI would act on must equal §1.4, as the DAO itself reports it. ---- */
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
    return { ok: problems.length === 0, problems: problems };
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
      reader.smart(PINS.proposalSingle, { config: {} })
    ]).then(function (r) {
      var policy = r[2].data && r[2].data.module;
      var live = {
        proposalModules: r[0].data, votingModule: r[1].data,
        preProposeSingle: policy && policy.addr, cw4Group: r[3].data,
        singleConfig: r[4].data, observedAt: r[4].observedAt
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

  /* An account action's text (ADR-036 `signArbitrary`: an empty chain id and `sign/MsgSignData`, never a transaction),
     signed by `address` -- which must still be the account Keplr is on. LudumAuth checks the text BEFORE this is asked. */
  function signArbitrary(address, text) {
    var k = keplr();
    if (!k) return Promise.reject(new Error('Keplr isn’t available in this browser.'));
    if (typeof k.signArbitrary !== 'function') return Promise.reject(new Error('This Keplr can’t sign a message (only transactions). Use another Keplr account.'));
    return Promise.resolve(k.getKey(PINS.chainId)).then(function (key) {
      if (!key || key.bech32Address !== address) throw new Error('Keplr is now on another account than the one shown. Nothing was signed — check which account Keplr is on and try again.');
      return k.signArbitrary(PINS.chainId, address, text).then(function (signed) {
        var pub = signed && signed.pub_key && signed.pub_key.value;
        if (typeof pub !== 'string' || typeof signed.signature !== 'string') throw new Error('Keplr’s answer wasn’t a signature. Nothing was changed.');
        return { pubKey: pub, signature: signed.signature };
      }, function (e) { throw new Error(declined(e) ? 'You declined the signature in Keplr. Nothing was changed.' : 'Keplr couldn’t sign the message. Nothing was changed — try again.'); });
    });
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

  /* ================= pure models for the governance pages ================= */

  function big(x) { var t = String(x == null ? '' : x); if (!/^\d+$/.test(t)) throw new Error('not a whole amount'); return BigInt(t); }

  var PROPOSAL_PHASES = Object.freeze({
    open: { phase: 'open', label: 'Open', stamp: '' },
    passed: { phase: 'passed', label: 'Passed', stamp: 'held' },
    executed: { phase: 'executed', label: 'Executed', stamp: 'closed' },
    rejected: { phase: 'failed', label: 'Rejected', stamp: 'failed' },
    closed: { phase: 'failed', label: 'Closed', stamp: 'failed' },
    execution_failed: { phase: 'failed', label: 'Execution failed', stamp: 'failed' },
    vetoed: { phase: 'failed', label: 'Vetoed', stamp: 'failed' }
  });
  /** A proposal's phase for the filters (open · passed · executed · failed), its label and its stamp. */
  function proposalPhase(status) {
    return PROPOSAL_PHASES[status] || { phase: 'failed', label: String(status || 'unknown').replace(/_/g, ' '), stamp: 'failed' };
  }

  /** The proposal's own count, as fractions of its total power (DAO DAO proposal-single: votes.yes/no/abstain,
   *  total_power). Quorum and threshold are the proposal's own, described, never assumed. */
  function tallyOf(proposal) {
    var v = (proposal && proposal.votes) || {};
    var total, yes, no, abstain;
    try { total = big(proposal.total_power); yes = big(v.yes || 0); no = big(v.no || 0); abstain = big(v.abstain || 0); } catch (e) { return null; }
    var pct = function (x) { return total === BigInt(0) ? 0 : Number(x * BigInt(100000) / total) / 1000; };
    var th = proposal.threshold || {};
    var quorum = null, threshold = null;
    var tq = th.threshold_quorum, ab = th.absolute_percentage, ac = th.absolute_count;
    var describe = function (t) {
      if (!t) return null;
      if (t.majority) return { kind: 'majority', text: 'a majority of the votes cast' };
      if (t.percent != null) return { kind: 'percent', percent: Number(t.percent) * 100, text: (Number(t.percent) * 100) + '% of the votes cast' };
      return null;
    };
    if (tq) {
      threshold = describe(tq.threshold);
      if (tq.quorum && tq.quorum.percent != null) quorum = { percent: Number(tq.quorum.percent) * 100, text: (Number(tq.quorum.percent) * 100) + '% of all voting power' };
      else if (tq.quorum && tq.quorum.majority) quorum = { percent: 50, text: 'a majority of all voting power' };
    } else if (ab) {
      threshold = { kind: 'absolute', percent: ab.percentage && ab.percentage.percent != null ? Number(ab.percentage.percent) * 100 : null, text: 'a share of all voting power' };
    } else if (ac) {
      threshold = { kind: 'count', text: 'an absolute count of ' + ac.threshold };
    }
    return { yes: pct(yes), no: pct(no), abstain: pct(abstain), turnout: pct(yes + no + abstain), total: total.toString(), quorum: quorum, threshold: threshold };
  }
  /** A proposal's expiration as whole seconds (at_time only; a height or "never" is not a time). */
  function expirationSecs(proposal) {
    var e = proposal && proposal.expiration;
    return e && e.at_time ? nanosToSecs(String(e.at_time)) : null;
  }

  /* ---- reads (read-only smart queries and the tx index; nothing here signs) ---- */
  function readProposal(reader, id) { return reader.smart(PINS.proposalSingle, { proposal: { proposal_id: u64Number(id, 'proposal_id') } }); }
  function readTotalWeight(reader) { return reader.smart(PINS.cw4Group, { total_weight: {} }); }
  function readPreProposeConfig(reader) { return reader.smart(PINS.preProposeSingle, { config: {} }); }
  /** Transactions the chain's index holds for a CometBFT event query, oldest first (e.g. one proposal's txs). */
  function readTxs(reader, query) {
    return reader.get('/cosmos/tx/v1beta1/txs?query=' + encodeURIComponent(query) + '&order_by=ORDER_BY_ASC&pagination.limit=50')
      .then(function (j) { return (j && j.tx_responses) || []; });
  }
  function proposalTxQuery(id) { return "wasm._contract_address='" + PINS.proposalSingle + "' AND wasm.proposal_id='" + u64Number(id, 'proposal_id') + "'"; }
  /** The proposal-module action ("propose", "vote", "execute", "close") a tx took on proposal `id`, from its events. */
  function proposalActionOf(tx, id) {
    var events = (tx && tx.events) || [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type !== 'wasm') continue;
      var attrs = {}; (e.attributes || []).forEach(function (a) { attrs[a.key] = a.value; });
      if (attrs._contract_address === PINS.proposalSingle && String(attrs.proposal_id) === String(id) && attrs.action) return attrs.action;
    }
    return null;
  }

  var LudumGov = {
    PINS: PINS, FAMILY_ORIGINS: FAMILY_ORIGINS,
    proposalPhase: proposalPhase, tallyOf: tallyOf, expirationSecs: expirationSecs,
    readProposal: readProposal, readTotalWeight: readTotalWeight, readPreProposeConfig: readPreProposeConfig, readTxs: readTxs,
    proposalTxQuery: proposalTxQuery, proposalActionOf: proposalActionOf,
    buildVote: buildVote, buildExecute: buildExecute, buildClose: buildClose, buildTextProposal: buildTextProposal, checkPins: checkPins, framingAllowed: framingAllowed,
    fmtDuration: fmtDuration, nanosToSecs: nanosToSecs, isoFromSecs: isoFromSecs,
    utf8ToB64: utf8ToB64, b64ToUtf8: b64ToUtf8,
    makeReader: makeReader, readLivePins: readLivePins, readGovernor: readGovernor,
    readAllProposals: readAllProposals, readVotes: readVotes,
    keplr: keplr, connect: connect, signArbitrary: signArbitrary, prepare: prepare, signAndBroadcast: signAndBroadcast
  };
  root.LudumGov = LudumGov;
  if (typeof module === 'object' && module.exports) module.exports = LudumGov;
})(typeof window !== 'undefined' ? window : globalThis);
