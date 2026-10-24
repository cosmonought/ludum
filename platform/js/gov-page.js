/* Ludum governance pages, as the Ludum Profile design draws them (the record pages open on a record head printed on the
 * pass's stock and use the work tabs' blocks):
 *   /governance/proposal/?id=N a Ludum DAO proposal: the vote, what it does, execution and its record
 *   /governance/               every Ludum DAO proposal (and the old #proposal-N links, forwarded to the proposal page)
 *
 * LUDUM v1.7 (owner, 2026-10-24): the retired JUNOX escrow is no Ludum feature. Its pages -- the disputed tables, the
 * case file and the new-appeal ticket -- are gone, and so are the escrow's labels here (the Case column, "Appeal ·",
 * the game checks before an execution, the resolver deadline). /disputes/ is a neutral page of its own
 * (disputes-page.js). Everything that makes an ordinary proposal safe to act on stays exactly as it was.
 *
 * The governance trust path is unchanged (architecture §2.2, §6): every figure is THIS browser's read of the chain at
 * the pinned REST endpoint, with its read time; an action is offered only when the DAO's modules match the pins, the
 * page is not framed by a foreign site, and the connected Keplr wallet is a member (execution: when the module lets only
 * members execute); every transaction is said to be one, and simulated before Keplr is asked. The chain decides again.
 * Nothing is invented: a read that fails says "unavailable", and a figure no source holds is left out.
 *
 * No inline script (§2.4): each page loads ludum.js, session.js, records.js, pass.js, work.js, auth.js, account-menu.js,
 * gov.js and this file, which calls Ludum.enhance(). Chain text is set with textContent, never as HTML. */
(function () {
  'use strict';
  var G = window.LudumGov;
  var R = window.LudumRecords;
  var W = window.LudumWork;
  var LP = window.LudumPass;
  var P = G.PINS;
  var reader = G.makeReader();
  var state = { pins: null, wallet: null, governor: null, totalWeight: null, framed: !G.framingAllowed(window), who: null };
  var listeners = [];
  var el = R.el;

  /* ---------------- small helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function why(e) { return (e && e.message ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 160); }
  /** The chain's whole error text (never truncated) -- what "does this exist?" is decided on. */
  function missing(e) { return /not found|NoSuchProposal/i.test(e && e.message ? e.message : String(e)); }
  function when(iso) { return iso ? R.day(iso) + ' · ' + R.clock(iso) : '—'; }
  function shortWhen(iso) { return iso ? R.day(iso).replace(/ \d{4}$/, '') + ' · ' + R.clock(iso).replace(' UTC', '') : '—'; }
  function shortDay(iso) { return iso ? R.day(iso).replace(/ \d{4}$/, '') : '—'; }
  function jx(amount) { return /^\d+$/.test(String(amount)) ? R.junox(String(amount)) : '—'; }
  function proposalHref(id) { return '/governance/proposal/?id=' + id; }
  function onChange(f) { listeners.push(f); }
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) { /* one view never stops another */ } }); }
  function actionsAllowed() { return !!(state.pins && state.pins.check && state.pins.check.ok) && !state.framed; }
  function arrow() { return LP.svg(LP.ARROW_RIGHT); }
  function btn(label, onClick, opts) {
    opts = opts || {};
    var b = el('button', { type: 'button', class: 'ld-btn' + (opts.secondary ? ' ld-btn--secondary' : opts.yellow ? ' ld-btn--yellow' : '') + (opts.large ? ' ld-btn--l' : '') + (opts.small ? ' ld-btn--s' : '') }, [label, arrow()]);
    b.addEventListener('click', function (e) { if (b.getAttribute('aria-disabled') !== 'true') onClick(e); });
    if (opts.disabled) { b.setAttribute('aria-disabled', 'true'); if (opts.title) b.setAttribute('title', opts.title); }
    return b;
  }
  function code(obj, label) { return W.code(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2), label); }

  /* The work tabs' pieces, under the names this file has always used. */
  /** A notice: the design's empty or failed state, said in its block. "stop" is a problem. */
  function notice(label, text, kind, action) { return W.none(label, text, { bad: kind === 'stop', action: action || null, role: kind === 'stop' ? 'alert' : 'status' }); }
  function td(label, children, cls) { return W.cell(label, children, cls === 'is-key' ? 'c-wide' : cls); }
  /** A work ledger from the old options ({title, unit, columns: [label, numeric?, unit?], rows, note, foot}). */
  function ledger(opts) {
    var table = W.ledger({ caption: opts.title || opts.label || null, columns: opts.columns.map(function (c) { return { text: c[0], num: !!c[1], small: c[2] || null }; }), rows: opts.foot ? opts.rows.concat([opts.foot]) : opts.rows, empty: 'Nothing to show.' });
    return opts.title || opts.note ? el('div', null, [opts.title ? W.sub(opts.title + (opts.unit ? ' · ' + opts.unit : '')) : null, table, opts.note ? el('p', { class: 'ld-block__note', text: opts.note }) : null]) : table;
  }
  function idSpan(text, title) { return el('span', { title: title, text: text }); }
  function unavailable(host, what, e) {
    clear(host).appendChild(notice('Unavailable', what + ' could not be read from the chain just now' + (e ? ' (' + why(e) + ')' : '') + '. Nothing is shown rather than an old value.', 'stop'));
  }
  /** The one red-edged line, only when actions are off (and why). */
  function offLine() {
    if (state.framed) return W.worknote('Actions are off while this page is framed by another site. Open it in its own tab.');
    if (state.pins && state.pins.error) return W.worknote('The Ludum DAO could not be read (' + state.pins.error + '), so no action is offered.');
    if (state.pins && !state.pins.check.ok) return W.worknote('What the DAO reports on chain differs from the addresses this site pins, so this page offers no action: ' + state.pins.check.problems.join('; ') + '.');
    return null;
  }

  /* ---------------- the record head (a proposal) ---------------- */
  function back() { return { href: '/governance/', text: 'Ludum DAO' }; }
  /** The record pages' blocks go in the design's record body (its space under the head and its source line). */
  function recBody() {
    var body = $('gv-body');
    if (body && !/(^| )ld-recbody( |$)/.test(body.className || '')) body.className = (body.className ? body.className + ' ' : '') + 'ld-recbody';
    return body;
  }
  function frame(head) {
    recBody();
    var host = $('gv-frame'); if (!host) return;
    clear(host);
    host.appendChild(W.recordHead({ back: head.back || back(), kicker: head.kicker, title: head.title, titleSize: head.titleSize, dek: head.dek, facts: head.facts || [], form: head.form, id: 'gv-head' }));
    if (head.source) host.appendChild(W.recsource(head.source));
  }

  /* ---------------- the signing wallet: Keplr, for a vote or an execution (the DAO's authority) ---------------- */
  function walletBlock(what) {
    var box = el('div', { class: 'ld-key gv-wallet', 'data-theme': 'press' });
    function draw() {
      clear(box);
      var g = state.governor;
      var role = !state.wallet ? 'Not connected' : !g ? 'Checking…' : g.error ? 'Unavailable' : g.member ? (g.canPropose ? 'Member' : 'Member (cannot propose)') : 'Not a member';
      var power = '—';
      if (g && !g.error && g.member && state.totalWeight && Number(state.totalWeight) > 0) power = (Math.round(g.weight / Number(state.totalWeight) * 1000) / 10).toFixed(1) + '%';
      var connect = el('button', { type: 'button', class: 'ld-btn ld-btn--yellow ld-btn--s', text: state.wallet ? 'Switch wallet' : 'Connect Keplr' });
      if (!actionsAllowed()) { connect.setAttribute('aria-disabled', 'true'); connect.setAttribute('title', state.framed ? 'Open this page in its own tab' : 'Available once the DAO pins are verified'); }
      connect.addEventListener('click', function () { if (connect.getAttribute('aria-disabled') !== 'true') onConnect(); });
      /* The design's key field: whatever happens in Keplr sits in it. */
      box.appendChild(el('div', { class: 'ld-tx', 'data-theme': 'press' }, [
        el('p', { class: 'ld-tx__label', text: 'Signing wallet' }),
        el('p', { class: 'ld-key__lede', style: 'margin:0', text: what + ' is a transaction signed in Keplr by a Ludum DAO member’s wallet. Connecting reads nothing private and signs nothing.' }),
        el('dl', { class: 'ld-key__wallet', style: 'margin:0' }, [el('dt', { text: 'Wallet' }), el('dd', null, [state.wallet ? idSpan(R.shortAddress(state.wallet.address), state.wallet.address) : 'Not connected']),
          el('dt', { text: 'Ludum DAO' }), el('dd', { text: role }), el('dt', { text: 'Voting power' }), el('dd', { text: power })]),
        el('div', { class: 'ld-key__acts', style: 'margin:0' }, [connect]),
        state.connectError ? el('p', { class: 'ld-step__error', role: 'alert', text: state.connectError }) : null
      ]));
    }
    draw();
    onChange(draw);
    return box;
  }
  function onConnect() {
    state.connectError = null;
    G.connect().then(function (w) {
      state.wallet = w; state.governor = null; changed();
      return Promise.all([G.readGovernor(reader, w.address), G.readTotalWeight(reader).catch(function () { return null; })]).then(function (r) {
        state.governor = r[0];
        state.totalWeight = r[1] && r[1].data != null ? (typeof r[1].data === 'object' ? r[1].data.weight : r[1].data) : null;
        if (R.rememberMember) R.rememberMember(window.localStorage, r[0].member ? w.address : null, Date.now(), R.accountOf ? R.accountOf(state.who) : null);
      }, function (e) { state.governor = { error: why(e) }; });
    }, function (e) { state.connectError = why(e); }).then(changed);
  }

  /* ---------------- a transaction: said first, the exact message, simulated, then Keplr ---------------- */
  function txPanel(host, spec, label, done) {
    clear(host);
    var status = el('p', { class: 'ld-tx__status', role: 'status', text: 'Simulating on ' + P.chainId + '… (nothing is signed yet)' });
    var box = el('div', { class: 'ld-tx gv-tx', 'data-theme': 'press' }, [
      el('p', { class: 'ld-tx__warn' }, [el('span', null, [el('b', { text: 'This is a transaction.' }), ' It changes the chain and costs a small network fee, paid by the wallet that signs. Keplr shows the same message and the fee before you approve.'])]),
      el('p', { class: 'ld-tx__label', text: label + ' · the message Keplr will be asked to sign' }),
      code('contract: ' + spec.contract + '\nfunds: []\nmsg: ' + JSON.stringify(spec.msg, null, 2)), status]);
    host.appendChild(box);
    G.prepare(reader, spec, state.wallet).then(function (prep) {
      status.textContent = 'Simulation passed (gas used ' + prep.gasUsed + '). Keplr will show the same message and the network fee.';
      box.appendChild(el('div', null, [btn('Sign in Keplr', function (ev) {
        ev.currentTarget.setAttribute('aria-disabled', 'true');
        status.textContent = 'Waiting for Keplr…';
        G.signAndBroadcast(reader, spec, state.wallet, prep).then(function (r) {
          status.textContent = r.pending ? 'Broadcast as ' + r.txhash + '; not yet seen in a block. Reload in a minute.' : 'Included at height ' + r.height + ' (' + r.txhash + ').';
          if (done) done(r);
        }, function (e) { status.textContent = why(e); });
      }, { large: true, yellow: true })]));
    }, function (e) { status.textContent = 'The simulation was refused, so Keplr was not asked: ' + why(e); });
  }
  function reloadSoon() { setTimeout(function () { location.reload(); }, 4000); }

  /** The phase of a proposal as the work tabs say it: ring under way, square for someone to act, disc settled. */
  function phaseState(ph) { return W.state(ph.label, ph.phase === 'passed' ? 'due' : ph.phase === 'executed' || ph.phase === 'failed' ? 'done' : ''); }

  /* ---------------- the proposals ledger ---------------- */
  var FILTERS = [['all', 'All'], ['open', 'Voting'], ['passed', 'Passed'], ['executed', 'Executed'], ['failed', 'Failed']];
  /** `voter`: the wallet whose cues to show ("Your vote is open", "Ready to execute"): the connected Keplr wallet when it
   *  is a member; null shows none. */
  function proposalsLedger(items, observedAt, opts) {
    opts = opts || {};
    if (!items.length) return W.none('No proposals yet', 'The Ludum DAO has no proposals on ' + P.chainId + '.' + (observedAt ? ' Read ' + R.clock(observedAt) + '.' : ''));
    var noun = ['proposal', 'proposals'];
    var table = W.ledger({ cls: 'proposals', wide: true, caption: 'Ludum DAO proposals, newest first',
      columns: [{ text: 'No.' }, { text: 'Status' }, { text: 'Proposal' }, { text: 'Voting' }, { text: 'Yes · No · Abstain %', num: true }, { text: 'For you', sr: true }], rows: [] });
    /* The ledger's own body: the filters and the cues redraw it. */
    var tbody = table.children[table.children.length - 1];
    var counts = { all: items.length, open: 0, passed: 0, executed: 0, failed: 0 };
    items.forEach(function (p) { counts[G.proposalPhase(p.proposal.status).phase] += 1; });
    var votedBy = {};
    function voter() { return opts.voter ? opts.voter() : null; }
    function cue(p) {
      var ph = G.proposalPhase(p.proposal.status).phase;
      if (!voter()) return null;
      if (ph === 'open') return votedBy[p.id] === false ? W.yours('Your vote is open') : null;
      if (ph === 'passed') return W.yours('Ready to execute');
      return null;
    }
    var current = 'all';
    function draw(filter) {
      current = filter;
      clear(tbody);
      var shown = items.filter(function (p) { return filter === 'all' || G.proposalPhase(p.proposal.status).phase === filter; });
      shown.forEach(function (p) {
        var ph = G.proposalPhase(p.proposal.status), t = G.tallyOf(p.proposal), exp = G.expirationSecs(p.proposal);
        var voting = ph.phase === 'open' ? (exp ? 'Closes ' + shortWhen(G.isoFromSecs(exp)) : 'Open') : ph.phase === 'executed' ? 'Executed' : exp ? 'Closed ' + shortDay(G.isoFromSecs(Math.min(exp, Math.floor(Date.now() / 1000)))) : 'Closed';
        tbody.appendChild(el('tr', { 'data-ld-status': ph.phase, id: 'proposal-' + p.id }, [
          W.cell('No.', [String(p.id)], 'c-no'),
          W.cell('Status', [phaseState(ph)], 'c-status'),
          W.cell('Proposal', [el('a', { class: 'ld-wl__text', href: proposalHref(p.id), text: p.proposal.title })], 'c-title c-wide'),
          W.cell('Voting', [voting], 'c-when'),
          W.cell('Yes · No · Abstain %', [t ? [Math.round(t.yes), Math.round(t.no), Math.round(t.abstain)].join(' · ') : '—'], 'c-tally is-num'),
          W.cell('', [cue(p)], 'c-you c-act')
        ]));
      });
      if (!shown.length) tbody.appendChild(el('tr', { class: 'ld-wl__empty' }, [el('td', { colspan: '6', text: 'No ' + noun[1] + ' with this status.' })]));
      chips.setCount(shown.length);
    }
    var chips = W.chips('Filter proposals', FILTERS.map(function (f) { return { key: f[0], text: f[1], count: counts[f[0]] }; }), draw, noun);
    draw('all');
    /* A member's own cue: which open proposals the voting wallet has voted on (chain reads; no Keplr). */
    function readCues() {
      var v = voter();
      if (!v) { draw(current); return; }
      var open = items.filter(function (p) { return p.proposal.status === 'open' && votedBy[p.id] === undefined; });
      Promise.all(open.map(function (p) { return G.readVotes(reader, p.id).then(function (r) { votedBy[p.id] = r.votes.some(function (x) { return x.voter === v; }); }, function () {}); })).then(function () { draw(current); });
    }
    onChange(readCues);
    readCues();
    return el('div', null, [chips.node, table]);
  }

  function dueItem(iso, what, line, by) { return { kind: 'due', when: [shortDay(iso), ' · ' + R.clock(iso)], what: what, line: line, by: by }; }

  /** The vote: Yes / No / Abstain as shares of the proposal's total power, turnout against the quorum's red mark. */
  function tally(proposal, live) {
    var t = G.tallyOf(proposal);
    if (!t) return W.none('Unavailable', 'The proposal’s count could not be read.');
    var row = function (name, pct, cls, mark, unit) {
      return el('div', { class: 'ld-rtally__row' + (cls === 'turnout' ? ' is-turnout' : '') }, [el('span', { class: 'ld-rtally__name', text: name }),
        el('div', { class: 'ld-rtally__bar', role: 'img', 'aria-label': name + ' ' + pct.toFixed(1) + '% ' + unit + (mark ? ', ' + mark.label : '') }, [el('span', { class: 'ld-rtally__fill' + (cls === 'no' ? ' ld-rtally__fill--no' : cls === 'abstain' ? ' ld-rtally__fill--abstain' : ''), style: 'width:' + Math.min(100, pct) + '%' }),
          mark ? el('span', { class: 'ld-rtally__mark', style: 'left:' + mark.at + '%', title: mark.label }) : null]),
        el('span', { class: 'ld-rtally__fig', text: pct.toFixed(1) + '%' })]);
    };
    var quorumMark = t.quorum ? { at: t.quorum.percent, label: 'Quorum ' + t.quorum.percent + '%' } : null;
    return el('div', { class: 'ld-pstack' }, [el('div', { class: 'ld-rtally' }, [row('Yes', t.yes, 'yes', null, 'of voting power'), row('No', t.no, 'no', null, 'of voting power'), row('Abstain', t.abstain, 'abstain', null, 'of voting power'), row('Turnout', t.turnout, 'turnout', quorumMark, 'of all voting power')]),
      el('p', { class: 'ld-rtally__src' }, [(live ? 'So far, read' : 'Final count, read') + ' from the proposal module. To pass: ' + (t.threshold ? t.threshold.text : 'the module’s threshold') + (t.quorum ? ', with ' : '.'), t.quorum ? el('b', { text: 'Quorum ' + t.quorum.percent + '%' }) : null, t.quorum ? ' (' + t.quorum.text + '). Ludum never sets these.' : ' Ludum never sets these.'])]);
  }

  /* ================= /governance/proposal/?id=N: one proposal ================= */
  function proposalPage() {
    var pid = new URLSearchParams(location.search).get('id');
    var body = $('gv-body');
    if (!pid || !/^[1-9]\d{0,15}$/.test(pid)) {
      frame({ kicker: 'Ludum DAO', title: 'Proposal' });
      body.appendChild(notice('No proposal chosen', 'Open a proposal from the Ludum DAO’s proposals.', 'wait', el('a', { class: 'ld-link', href: '/governance/', text: 'Proposals' })));
      return;
    }
    frame({ kicker: 'Proposal ' + pid, title: 'Proposal ' + pid, dek: 'Reading the proposal module…' });
    Promise.all([G.readProposal(reader, pid), G.readVotes(reader, pid)]).then(function (r) {
      var p = r[0].data.proposal, votes = r[1].votes, at = r[0].observedAt;
      var extra = { txs: null };
      return G.readTxs(reader, G.proposalTxQuery(pid)).then(function (t) { extra.txs = t; }, function () { extra.txs = null; }).then(function () { drawProposal(body, pid, p, votes, at, extra); });
    }).catch(function (e) {
      frame({ kicker: 'Proposal ' + pid, title: 'Proposal ' + pid });
      var gone = missing(e);
      body.appendChild(gone ? notice('No such proposal', 'The proposal module has no proposal ' + pid + '.', 'stop') : notice('Unavailable', 'The proposal could not be read from the chain (' + why(e) + ').', 'stop'));
    });
  }

  function drawProposal(body, pid, p, votes, at, extra) {
    var ph = G.proposalPhase(p.status), exp = G.expirationSecs(p);
    document.title = 'Proposal ' + pid + ' — Ludum';
    var mineVote = function () { return state.wallet ? votes.filter(function (v) { return v.voter === state.wallet.address; })[0] || null : null; };
    function head() {
      var mine = mineVote();
      var yourVote = ph.phase !== 'open' ? null : !state.wallet ? 'Connect Keplr below' : mine ? 'Voted ' + mine.vote : W.yours('Your vote is open');
      frame({ kicker: 'Ludum DAO · Proposal ' + pid, title: p.title, titleSize: 'm',
        facts: [['Status', phaseState(ph)], ['Voting', exp ? (ph.phase === 'open' ? 'Closes ' : 'Closed ') + when(G.isoFromSecs(exp)) : '—']].concat(yourVote ? [['Your vote', yourVote]] : []),
        source: ['Read from the proposal module on ' + P.chainId + ' · ' + when(at)] });
    }
    head(); onChange(head);
    clear(body);
    var off = el('div');
    body.appendChild(off);
    function drawOff() { clear(off); var line = offLine(); if (line) off.appendChild(line); }
    drawOff(); onChange(drawOff);

    /* The vote */
    var voteHost = el('div', { class: 'ld-pstack' });
    var ballotHost = el('div');
    var wallet = ph.phase === 'open' ? walletBlock('A vote') : null;
    function drawVote() {
      clear(voteHost);
      voteHost.appendChild(tally(p, ph.phase === 'open'));
      clear(ballotHost);
      if (ph.phase !== 'open') return;
      var g = state.governor, mine = mineVote();
      var allowed = actionsAllowed() && state.wallet && g && !g.error && g.member;
      var noticeText = !actionsAllowed() ? (state.framed ? 'Actions are off while framed.' : 'Actions are off until the DAO pins are verified.') : !state.wallet ? 'Connect a Keplr wallet that is a Ludum DAO member to vote.' : !g ? 'Reading the wallet’s membership…' : g.error ? 'The wallet’s membership could not be read.' : !g.member ? 'The connected wallet is not a Ludum DAO member.' : mine ? 'This wallet voted ' + mine.vote + '. ' + (p.allow_revoting ? 'The module allows changing it while voting is open.' : 'The module does not allow revoting.') : 'Voting closes ' + (exp ? R.day(G.isoFromSecs(exp)) + ' at ' + R.clock(G.isoFromSecs(exp)) : '—') + '. Your voting power is the voting module’s figure for this proposal.';
      ballotHost.appendChild(W.none(allowed && !mine ? 'Your vote is open' : 'Voting', noticeText));
      if (!allowed || (mine && !p.allow_revoting)) return;
      var choice = { v: null }, txHost = el('div');
      var lines = { yes: 'For the proposal.', no: 'Against the proposal.', abstain: 'Neither for nor against; the module decides how it counts.' };
      var fs = W.choices({ legend: 'Your vote · ' + (mine ? 'this wallet voted ' + mine.vote : 'this wallet has not voted'), name: 'q-v', row: true,
        options: ['yes', 'no', 'abstain'].map(function (k) { return { value: k, name: k.charAt(0).toUpperCase() + k.slice(1), line: lines[k] }; }), onChange: function (v) { choice.v = v; } });
      var rationale = el('input', { class: 'ld-pinput', id: 'q-why', maxlength: '280', placeholder: 'Optional rationale, published with your vote' });
      ballotHost.appendChild(el('form', { class: 'ld-pstack' }, [fs, el('div', null, [el('label', { class: 'ld-step__label', for: 'q-why', text: 'Rationale (optional)' }), rationale]),
        el('div', null, [btn('Vote with Keplr', function () { if (!choice.v) { txHost.textContent = 'Choose Yes, No or Abstain first.'; return; } txPanel(txHost, G.buildVote(pid, choice.v, rationale.value), 'Vote ' + choice.v + ' on proposal ' + pid, reloadSoon); }, { large: true, yellow: true })]), txHost]));
    }
    drawVote(); onChange(drawVote);
    var votesLedger = votes.length ? ledger({ title: 'Votes', columns: [['Voter'], ['Vote'], ['Power', true], ['Rationale']], rows: votes.map(function (v) {
      return el('tr', null, [td('Voter', [idSpan(R.shortAddress(v.voter), v.voter)]), td('Vote', [v.vote]), td('Power', [String(v.power)], 'is-num'), td('Rationale', [v.rationale || ''])]);
    }) }) : el('p', { class: 'ld-block__note', text: 'No votes yet. Read ' + R.clock(at) + '.' });
    body.appendChild(W.block({ id: 'q1', title: 'The vote', read: 'Read ' + R.clock(at) }, [voteHost, W.details(votes.length + ' vote' + (votes.length === 1 ? '' : 's'), [votesLedger]), wallet ? W.twocol(ballotHost, wallet) : ballotHost]));

    /* What it does */
    var msgs = (p.msgs || []).map(function (m) { var ex = m && m.wasm && m.wasm.execute, b = null; if (ex && typeof ex.msg === 'string') { try { b = JSON.parse(G.b64ToUtf8(ex.msg)); } catch (e) { b = '(undecodable)'; } } return ex ? { wasm: { execute: { contract_addr: ex.contract_addr, msg: b, funds: ex.funds } } } : m; });
    body.appendChild(W.block({ id: 'q2', title: 'What it does', read: (p.msgs || []).length === 1 ? 'One message, executed by the Ludum DAO core' : (p.msgs || []).length + ' messages, executed by the Ludum DAO core' },
      [W.twocol(code(msgs.length === 1 ? msgs[0] : msgs), W.facts([['Proposer', idSpan(R.shortAddress(p.proposer), p.proposer)], ['Description', el('span', { class: 'gv-prewrap', style: 'white-space:pre-wrap;font-family:var(--font-sans)', text: p.description })]]))]));

    /* Execution */
    var execHost = el('div');
    var txs = extra.txs || [];
    var byAction = function (a) { return txs.filter(function (x) { return G.proposalActionOf(x, pid) === a; }); };
    var execTx = byAction('execute').pop() || null, proposeTx = byAction('propose')[0] || null, closeTx = byAction('close').pop() || null;
    var execWallet = p.status === 'passed' || p.status === 'rejected' ? walletBlock(p.status === 'passed' ? 'Execution' : 'Closing it') : null;
    function drawExec() {
      clear(execHost);
      var g = state.governor, member = state.wallet && g && !g.error && g.member && actionsAllowed();
      if (ph.phase === 'open') { execHost.appendChild(W.none('Not yet', 'Voting ' + (exp ? 'closes ' + when(G.isoFromSecs(exp)) : 'is open') + '. If the proposal passes, a wallet the proposal module allows can execute it; the DAO core then sends its message.')); return; }
      if (p.status === 'passed') {
        var onlyMembers = state.pins && state.pins.singleConfig ? state.pins.singleConfig.only_members_execute !== false : true;
        var why2 = !actionsAllowed() ? 'actions are off (pins or framing)' : !state.wallet ? 'connect a Keplr wallet' : onlyMembers && !member ? 'the proposal module lets only members execute' : null;
        var txHost = el('div');
        execHost.appendChild(W.twocol(el('div', { class: 'ld-pstack' }, [
          W.none(why2 ? 'Passed' : 'Ready to execute', 'Proposal ' + pid + ' passed. ' + (why2 ? 'To execute it here: ' + why2 + '.' : 'This wallet may execute it.')),
          el('div', null, [btn('Execute with Keplr', function () { txPanel(txHost, G.buildExecute(pid), 'Execute proposal ' + pid, reloadSoon); }, { large: true, yellow: true, disabled: !!why2, title: why2 })]), txHost,
          el('p', { class: 'ld-block__note', text: 'The execution is simulated first: if the chain would refuse it, Keplr is not asked. After you sign, Ludum waits for a block to include the transaction, then shows it. It never reports success before the chain does.' })]), execWallet));
        return;
      }
      if (p.status === 'rejected') {
        var txHost2 = el('div');
        execHost.appendChild(W.twocol(el('div', { class: 'ld-pstack' }, [W.none('Rejected', 'The proposal did not pass. Anyone may close it, which returns any deposit as the module’s rules say. Closing it is a transaction.'),
          el('div', null, [btn('Close with Keplr', function () { txPanel(txHost2, G.buildClose(pid), 'Close proposal ' + pid, reloadSoon); }, { secondary: true, disabled: !actionsAllowed() || !state.wallet, title: !state.wallet ? 'connect a Keplr wallet' : null })]), txHost2]), execWallet));
        return;
      }
      var failed = p.status === 'execution_failed';
      var label = p.status === 'executed' ? 'Executed' : failed ? 'Execution failed' : G.proposalPhase(p.status).label;
      var text = p.status === 'executed' ? 'The DAO core sent the proposal’s message.' : failed ? 'The DAO core’s message was refused. The proposal module records this proposal as Execution failed; Ludum does not retry it.' : 'The proposal is ' + label.toLowerCase() + '.';
      var receiptTx = execTx || closeTx;
      execHost.appendChild(W.twocol(W.none(label, text, { bad: failed }), receiptTx ? receipt(receiptTx, failed, execTx ? 'Execution' : 'Close') : W.none('Receipt', extra.txs === null ? 'The chain’s transaction index could not be read.' : 'The chain’s transaction index holds no execution for this proposal.')));
    }
    drawExec(); onChange(drawExec);
    body.appendChild(W.block({ id: 'q3', title: 'Execution' }, [execHost]));

    /* Record */
    var items = [];
    function failedNow() { return p.status === 'execution_failed'; }
    if (proposeTx) items.push({ at: proposeTx.timestamp, what: 'Submitted', line: 'By ' + R.shortAddress(p.proposer) + '.', by: 'tx ' + R.shortHash(proposeTx.txhash) });
    if (execTx) items.push({ at: execTx.timestamp, what: failedNow() ? 'Execution failed' : 'Executed', line: failedNow() ? 'The message was refused.' : 'The DAO core sent the message.', by: 'tx ' + R.shortHash(execTx.txhash), aside: W.state(failedNow() ? 'Execution failed' : 'Executed', failedNow() ? 'bad' : 'done') });
    if (closeTx) items.push({ at: closeTx.timestamp, what: 'Closed', line: '', by: 'tx ' + R.shortHash(closeTx.txhash) });
    var recItems = items.filter(function (x) { return x.at; }).map(function (x) { return { when: [shortDay(x.at), ' · ' + R.clock(x.at)], what: x.what, line: x.line, by: x.by, aside: x.aside }; });
    if (!proposeTx) recItems.unshift({ when: ['On chain', ''], what: 'Submitted', line: 'By ' + R.shortAddress(p.proposer) + (p.start_height ? ' at height ' + p.start_height : '') + '.' });
    if (ph.phase === 'open') {
      recItems.push({ kind: 'now', when: ['Now', ''], what: 'Voting', line: votes.length + ' vote' + (votes.length === 1 ? '' : 's') + ' so far.' });
      if (exp) recItems.push(dueItem(G.isoFromSecs(exp), 'Voting closes', null, 'Proposal module'));
    } else if (p.status === 'passed') {
      recItems.push({ kind: 'now', when: ['Now', ''], what: 'Waiting to be executed', aside: W.state('Ready to execute', 'due') });
    }
    body.appendChild(W.block({ id: 'q4', title: 'Record', read: 'All times UTC', note: extra.txs === null ? 'The chain’s transaction index could not be read; only the proposal module’s own facts are shown.' : null }, [W.docket(recItems)]));
  }
  function receipt(tx, failed, title) {
    var fee = tx.tx && tx.tx.auth_info && tx.tx.auth_info.fee && tx.tx.auth_info.fee.amount ? tx.tx.auth_info.fee.amount.filter(function (c) { return c.denom === P.denom; })[0] : null;
    var sender = null;
    try { sender = tx.tx.body.messages[0].sender; } catch (e) { sender = null; }
    var ok = Number(tx.code) === 0 && !failed;
    return el('figure', { class: 'ld-rreceipt' }, [
      el('div', { class: 'ld-rreceipt__head' }, [el('b', { text: title }), W.state(Number(tx.code) === 0 ? (failed ? 'Included · message refused' : 'Success') : 'Failed · code ' + tx.code, ok ? 'done' : 'bad')]),
      W.facts([['Transaction', idSpan(R.shortHash(tx.txhash), tx.txhash)], ['Block', Number(tx.height).toLocaleString('en-US') + (tx.timestamp ? ' · ' + when(tx.timestamp) : '')],
        sender ? ['Sender', idSpan(R.shortAddress(sender), sender)] : null, ['Gas', Number(tx.gas_used).toLocaleString('en-US') + ' used of ' + Number(tx.gas_wanted).toLocaleString('en-US')],
        fee ? ['Fee', jx(fee.amount) + ' JUNOX'] : null]),
      tx.raw_log ? W.code(String(tx.raw_log).slice(0, 600), 'Chain log') : null,
      el('div', { class: 'ld-rreceipt__foot' }, [el('a', { class: 'ld-link', href: R.txHref(tx.txhash), rel: 'noopener' }, ['View transaction', arrow()])])]);
  }

  /* ================= /governance/: every Ludum DAO proposal (and the old anchors) ================= */
  function proposalsPage() {
    var m = /^#proposal-([1-9]\d{0,15})$/.exec(location.hash || '');
    if (m) { location.replace(proposalHref(m[1])); return; }
    frame({ back: { href: '/', text: 'Ludum' }, kicker: 'Ludum DAO · ' + P.chainId, title: 'Proposals',
      dek: 'Every Ludum DAO proposal on ' + P.chainId + ', read live: its status, its count and what it does.', facts: [['Chain', P.chainId]] });
    var host = el('div', null, [W.reading('Reading the proposal module…')]);
    var wallet = walletBlock('A vote or an execution');
    $('gv-body').appendChild(W.block({ id: 'g1', title: 'Proposals', note: 'Newest first. Vote, execute and close are transactions for members, signed in Keplr on each proposal’s page.' }, [host]));
    $('gv-body').appendChild(W.block({ id: 'g2', title: 'Your wallet' }, [wallet]));
    G.readAllProposals(reader).then(function (r) { clear(host).appendChild(proposalsLedger(r.proposals, r.observedAt, { voter: function () { return state.wallet && state.governor && !state.governor.error && state.governor.member ? state.wallet.address : null; } })); }, function (e) { unavailable(host, 'The proposals', e); });
  }

  /* ---------------- start ---------------- */
  function start() {
    if (window.Ludum && typeof Ludum.enhance === 'function') Ludum.enhance();
    var page = document.body.getAttribute('data-gov-page');
    var who = window.LudumSession && typeof LudumSession.whoami === 'function' ? LudumSession.whoami().then(function (w) { state.who = w; }, function () {}) : Promise.resolve();
    G.readLivePins(reader).then(function (live) { state.pins = live; }, function (e) { state.pins = { error: why(e) }; }).then(changed);
    var go = page === 'proposal' ? proposalPage : page === 'governance' ? proposalsPage : null;
    if (!go) return;
    /* The page's head needs the session; never wait long for it (the chain pages stand on their own). */
    var ran = false;
    var run = function () { if (!ran) { ran = true; go(); } };
    who.then(run);
    setTimeout(run, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
