/* Ludum governance pages, as the Ludum Profile design draws them (owner, 2026-10-23: Disputes is a tab of your
 * profile; the record pages open on a record head printed on the pass's stock and use the work tabs' blocks):
 *   /disputes/                 the Disputes tab: your standing in the Ludum DAO (read on chain, no Keplr), the disputed
 *                              tables and the appeals that would resolve them
 *   /disputes/case/?id=N       the case file: docket, the appeal, the disputed result, what each resolution would do,
 *                              parties and evidence
 *   /governance/new/?case=N    a new appeal: a ticket, signed in Keplr
 *   /governance/proposal/?id=N an appeal (or any proposal): the vote, what it does, execution and its record
 *   /governance/               every Ludum DAO proposal (and the old #proposal-N links, forwarded to the proposal page)
 *
 * The governance trust path is unchanged (architecture §2.2, §6): every figure is THIS browser's read of the chain at
 * the pinned REST endpoint, with its read time; an action is offered only when the DAO's modules match the pins, the
 * page is not framed by a foreign site, the connected Keplr wallet is a member (and, to propose, allowed by the
 * pre-propose module), and the chain read -- never Play's server record -- says the game is disputed; the deadline guard
 * holds; every transaction is said to be one, and simulated before Keplr is asked. Play's public `case` record
 * (gov-case.js) only adds table names and the server's terminal record, shown only when it agrees with the chain.
 * Nothing is invented: a read that fails says "unavailable", and a figure no source holds is left out. Disputes counts
 * disputed tables, never escrow games; it lists only appeals (proposals that decode to a Resolve on the pinned escrow).
 * The appeals are decided by the Ludum DAO on chain: this site keeps no team of its own for them.
 *
 * No inline script (§2.4): each page loads ludum.js, session.js, records.js, pass.js, work.js, auth.js, account-menu.js,
 * gov.js, gov-case.js and this file, which calls Ludum.enhance(). Chain text is set with textContent, never as HTML. */
(function () {
  'use strict';
  var G = window.LudumGov;
  var R = window.LudumRecords;
  var W = window.LudumWork;
  var LP = window.LudumPass;
  var P = G.PINS;
  var reader = G.makeReader();
  var state = { pins: null, wallet: null, governor: null, totalWeight: null, framed: !G.framingAllowed(window), who: null, standing: null };
  var listeners = [];
  var el = R.el;

  /* ---------------- small helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function why(e) { return (e && e.message ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 160); }
  /** The chain's whole error text (never truncated) -- what "does this exist?" is decided on. */
  function missing(e) { return /not found|NoSuchProposal/i.test(e && e.message ? e.message : String(e)); }
  function isoOf(ns) { var s = G.nanosToSecs(ns == null ? null : String(ns)); return s == null ? null : G.isoFromSecs(s); }
  function secsOf(ns) { return G.nanosToSecs(ns == null ? null : String(ns)); }
  function when(iso) { return iso ? R.day(iso) + ' · ' + R.clock(iso) : '—'; }
  function shortWhen(iso) { return iso ? R.day(iso).replace(/ \d{4}$/, '') + ' · ' + R.clock(iso).replace(' UTC', '') : '—'; }
  function shortDay(iso) { return iso ? R.day(iso).replace(/ \d{4}$/, '') : '—'; }
  function jx(amount) { return /^\d+$/.test(String(amount)) ? R.junox(String(amount)) : '—'; }
  function stateWord(s) { return typeof s === 'string' ? s.replace(/_/g, ' ') : 'unavailable'; }
  function caseHref(id) { return '/disputes/case/?id=' + id; }
  function proposalHref(id) { return '/governance/proposal/?id=' + id; }
  function newHref(id) { return '/governance/new/' + (id != null ? '?case=' + id : ''); }
  function onChange(f) { listeners.push(f); }
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) { /* one view never stops another */ } }); }
  function actionsAllowed() { return !!(state.pins && state.pins.check && state.pins.check.ok) && !state.framed; }
  function signedIn() { return !!(state.who && state.who.signedIn === true); }
  function arrow() { return LP.svg(LP.ARROW_RIGHT); }
  function btn(label, onClick, opts) {
    opts = opts || {};
    var b = el('button', { type: 'button', class: 'ld-btn' + (opts.secondary ? ' ld-btn--secondary' : opts.yellow ? ' ld-btn--yellow' : '') + (opts.large ? ' ld-btn--l' : '') + (opts.small ? ' ld-btn--s' : '') }, [label, arrow()]);
    b.addEventListener('click', function (e) { if (b.getAttribute('aria-disabled') !== 'true') onClick(e); });
    if (opts.disabled) { b.setAttribute('aria-disabled', 'true'); if (opts.title) b.setAttribute('title', opts.title); }
    return b;
  }
  function linkBtn(label, href, ink) { return el('a', { class: 'ld-btn ld-btn--s' + (ink ? ' ld-btn--ink' : ' ld-btn--secondary'), href: href }, [label, arrow()]); }
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

  /* ---------------- the record head (the case file, an appeal, a new appeal) ---------------- */
  function back() { return signedIn() ? { href: '/disputes/', text: 'Disputes' } : { href: '/governance/', text: 'Ludum DAO' }; }
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

  /* ---------------- the signing wallet: Keplr, for a vote, an appeal or an execution (the DAO's authority) ---------------- */
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

  /* ---------------- shared chain reads ---------------- */
  /** Proposals that decode to a Resolve on the pinned escrow, by chain game id (link-by-decoding, §6). */
  function linkIndex(proposals) {
    var byGame = {};
    proposals.forEach(function (p) {
      var d = G.decodeResolve(p.proposal);
      if (d) (byGame[d.chainGameId] = byGame[d.chainGameId] || []).push({ id: p.id, status: p.proposal.status, outcome: d.outcome, proposal: p.proposal });
    });
    return byGame;
  }
  function liveAppeal(list) { return (list || []).filter(function (x) { return x.status === 'open' || x.status === 'passed'; })[0] || null; }
  /** Play's table names for the chain seats -- only from a valid public record whose seat wallets are the chain's. */
  function namesFor(chainGameId, chainSeats) {
    var expect = { chainGameId: String(chainGameId), contract: P.escrow, chainId: P.chainId };
    if (!window.LudumCase || !window.LudumSession) return Promise.resolve({ kind: 'no-client', names: null, record: null });
    return LudumCase.fetchCase(window.LudumSession, expect.chainGameId, expect).then(function (o) {
      if (o.kind !== 'ok') return { kind: o.kind, names: null, record: null, outcome: o };
      var wallets = (chainSeats || []).map(function (s) { return s.wallet; });
      var same = o.record.seats.length === wallets.length && o.record.seats.every(function (x, i) { return x.wallet === wallets[i]; });
      return { kind: same ? 'ok' : 'disagrees', names: same ? o.record.seats.map(function (x) { return x.displayName || null; }) : null, record: o.record, outcome: o };
    }, function () { return { kind: 'unreachable', names: null, record: null }; });
  }
  function seatName(names, i) { return names && names[i] ? names[i] : 'Seat ' + i; }
  function maxVotingSecs() { return state.pins && state.pins.singleConfig && state.pins.singleConfig.max_voting_period ? state.pins.singleConfig.max_voting_period.time : P.maxVotingPeriodSecs; }

  /** The phase of a proposal as the work tabs say it: ring under way, square for someone to act, disc settled. */
  function phaseState(ph) { return W.state(ph.label, ph.phase === 'passed' ? 'due' : ph.phase === 'executed' || ph.phase === 'failed' ? 'done' : ''); }

  /* ---------------- the appeals / proposals ledger (Disputes: appeals only; /governance/: every proposal) ---------------- */
  var FILTERS = [['all', 'All'], ['open', 'Voting'], ['passed', 'Passed'], ['executed', 'Executed'], ['failed', 'Failed']];
  /** `voter`: the wallet whose cues to show ("Your vote is open", "Ready to execute"): the account's voting wallet on
   *  Disputes, the connected Keplr wallet elsewhere; null shows none. */
  function proposalsLedger(items, observedAt, opts) {
    opts = opts || {};
    if (!items.length) return W.none(opts.appeals ? 'No appeals yet' : 'No proposals yet', opts.appeals ? 'No proposal resolves a disputed table yet. An appeal starts from its disputed table.' : 'The Ludum DAO has no proposals on ' + P.chainId + '.' + (observedAt ? ' Read ' + R.clock(observedAt) + '.' : ''));
    var noun = opts.appeals ? ['appeal', 'appeals'] : ['proposal', 'proposals'];
    var table = W.ledger({ cls: 'appeals', wide: true, caption: opts.appeals ? 'Appeals to the Ludum DAO, newest first' : 'Ludum DAO proposals, newest first',
      columns: [{ text: 'No.' }, { text: 'Status' }, { text: opts.appeals ? 'Appeal' : 'Proposal' }, { text: 'Case' }, { text: 'Voting' }, { text: 'Yes · No · Abstain %', num: true }, { text: 'For you', sr: true }], rows: [] });
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
        var ph = G.proposalPhase(p.proposal.status), d = G.decodeResolve(p.proposal), t = G.tallyOf(p.proposal), exp = G.expirationSecs(p.proposal);
        var voting = ph.phase === 'open' ? (exp ? 'Closes ' + shortWhen(G.isoFromSecs(exp)) : 'Open') : ph.phase === 'executed' ? 'Executed' : exp ? 'Closed ' + shortDay(G.isoFromSecs(Math.min(exp, Math.floor(Date.now() / 1000)))) : 'Closed';
        tbody.appendChild(el('tr', { 'data-ld-status': ph.phase, id: 'proposal-' + p.id }, [
          W.cell('No.', [String(p.id)], 'c-no'),
          W.cell('Status', [phaseState(ph)], 'c-status'),
          W.cell(opts.appeals ? 'Appeal' : 'Proposal', [el('a', { class: 'ld-wl__text', href: proposalHref(p.id), text: p.proposal.title })], 'c-title c-wide'),
          W.cell('Case', [d ? el('a', { class: 'ld-wl__text', href: caseHref(d.chainGameId), 'aria-label': 'Case ' + d.chainGameId, text: d.chainGameId }) : el('span', { class: 'ld-wl__sub', text: 'Not an appeal' })], 'c-case'),
          W.cell('Voting', [voting], 'c-when'),
          W.cell('Yes · No · Abstain %', [t ? [Math.round(t.yes), Math.round(t.no), Math.round(t.abstain)].join(' · ') : '—'], 'c-tally is-num'),
          W.cell('', [cue(p)], 'c-you c-act')
        ]));
      });
      if (!shown.length) tbody.appendChild(el('tr', { class: 'ld-wl__empty' }, [el('td', { colspan: '7', text: 'No ' + noun[1] + ' with this status.' })]));
      chips.setCount(shown.length);
    }
    var chips = W.chips(opts.appeals ? 'Filter appeals' : 'Filter proposals', FILTERS.map(function (f) { return { key: f[0], text: f[1], count: counts[f[0]] }; }), draw, noun);
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

  /* ---------------- your standing in the Ludum DAO: public chain reads, no Keplr ---------------- */
  /** The account's voting wallet -- its Authorization Wallet, or the Keplr wallet it connected that holds the membership
   *  (remembered under this account) -- with its membership and weight. Resolves {wallet, member, weight, total} or
   *  {error}; null when signed out. */
  function readStanding(who) {
    if (!who || who.signedIn !== true) return Promise.resolve(null);
    var wallets = [];
    var auth = who.account && who.account.authorizationWallet;
    if (auth && typeof auth.address === 'string') wallets.push(auth.address);
    var known = R.membershipEntry ? R.membershipEntry(window.localStorage, Date.now(), R.accountOf(who), true) : null;
    if (known && known.keplr && wallets.indexOf(known.keplr) === -1) wallets.push(known.keplr);
    if (!wallets.length) return Promise.resolve({ wallet: null, member: false, weight: 0, total: null });
    return Promise.all([Promise.all(wallets.map(function (w) { return G.readGovernor(reader, w).then(function (g) { return { wallet: w, g: g }; }); })), G.readTotalWeight(reader).catch(function () { return null; })]).then(function (r) {
      var found = r[0].filter(function (x) { return x.g && x.g.member; })[0] || null;
      var total = r[1] && r[1].data != null ? (typeof r[1].data === 'object' ? r[1].data.weight : r[1].data) : null;
      if (R.rememberMember) R.rememberMember(window.localStorage, found ? found.wallet : null, Date.now(), R.accountOf(who));
      return found ? { wallet: found.wallet, member: true, weight: found.g.weight, total: total } : { wallet: wallets[0], member: false, weight: 0, total: total };
    }, function (e) { return { error: why(e) }; });
  }

  /* ================= /disputes/: the Disputes tab ================= */
  function registerPage() {
    var who = state.who;
    var top = null;
    var frameHost = $('gv-frame');
    if (signedIn()) top = W.profileTop(frameHost, window.LudumSession, who, 'disputes');
    else {
      clear(frameHost).appendChild(W.recordHead({ back: { href: '/governance/', text: 'Ludum DAO' }, kicker: 'Ludum DAO · ' + P.chainId, title: 'Disputes',
        dek: 'Tables whose result a player challenged, and the appeals put to the Ludum DAO, read live from Juno.', facts: [['Chain', P.chainId]], id: 'gv-head' }));
    }
    var body = $('gv-body');
    var panel = el('section', { class: 'ld-panel', 'aria-label': 'Disputes' }, [el('h2', { class: 'ld-sr', text: 'Disputes' })]);
    body.appendChild(panel);
    var standingHost = el('div');
    panel.appendChild(standingHost);
    var off = el('div');
    panel.appendChild(off);
    function drawOff() { clear(off); var line = offLine(); if (line) off.appendChild(line); }
    drawOff(); onChange(drawOff);

    function drawStanding() {
      clear(standingHost);
      var s = state.standing;
      var lede = 'Tables whose result a player challenged: their money is held on Juno until the Ludum DAO decides. Below them, the appeals put to the DAO.';
      if (!signedIn()) { standingHost.appendChild(W.workhead(lede, null)); return; }
      var member = s === null ? 'Reading…' : s.error ? 'Unavailable' : s.member ? 'Member' : 'Not a member';
      var power = s && !s.error && s.member && s.total && Number(s.total) > 0 ? (Math.round(s.weight / Number(s.total) * 1000) / 10).toFixed(1) + '%' : '—';
      standingHost.appendChild(W.workhead(lede, [['Ludum DAO', member], ['Voting power', power], ['Voting wallet', s && s.wallet ? idSpan(R.shortAddress(s.wallet), s.wallet) : '—']]));
    }
    drawStanding();
    readStanding(who).then(function (s) { state.standing = s; drawStanding(); changed(); });
    var voter = function () { return state.standing && state.standing.member ? state.standing.wallet : null; };

    var tablesHost = el('div', null, [W.block({ title: 'Disputed tables' }, [W.reading('Reading the escrow on Juno…')])]);
    var appealsHost = el('div', null, [W.block({ title: 'Appeals' }, [W.reading('Reading the proposal module…')])]);
    panel.appendChild(tablesHost);
    panel.appendChild(appealsHost);
    panel.appendChild(howFoot());

    function retryNone(what, e, again) {
      var b = el('button', { class: 'ld-btn ld-btn--s ld-btn--secondary', type: 'button', text: 'Try again' });
      b.addEventListener('click', again);
      return W.none('Unavailable', what + ' could not be read from the chain just now (' + why(e) + '). Nothing is shown rather than an old value.', { bad: true, action: b });
    }
    function read() {
      clear(tablesHost).appendChild(W.block({ title: 'Disputed tables' }, [W.reading('Reading the escrow on Juno…')]));
      clear(appealsHost).appendChild(W.block({ title: 'Appeals' }, [W.reading('Reading the proposal module…')]));
      Promise.all([G.readAllGames(reader), G.readAllProposals(reader)]).then(function (r) {
        var links = linkIndex(r[1].proposals);
        var appeals = r[1].proposals.filter(function (p) { return G.decodeResolve(p.proposal) !== null; });
        clear(appealsHost).appendChild(W.block({ title: 'Appeals', count: String(appeals.length), read: 'Read from Juno · ' + R.clock(r[1].observedAt),
          note: 'Proposals that resolve a disputed table, newest first. Percentages are of each proposal’s total voting power. Every other Ludum DAO proposal is under All Ludum DAO proposals.' },
          [proposalsLedger(appeals, r[1].observedAt, { appeals: true, voter: voter })]));
        var disputed = r[0].games.filter(function (g) { return g.state === 'disputed'; });
        if (top) top.setCounts({ disputes: disputed.length });
        if (!disputed.length) {
          clear(tablesHost).appendChild(W.block({ title: 'Disputed tables', read: 'Read from Juno · ' + R.clock(r[0].observedAt) },
            [W.none('Nothing is disputed', 'No table’s result is under challenge. A table appears here when a player challenges its result inside the challenge window.')]));
          return;
        }
        return Promise.all(disputed.map(function (g) { return G.readGame(reader, g.chain_game_id); })).then(function (full) { drawTables(full, links); });
      }).catch(function (e) {
        clear(tablesHost).appendChild(W.block({ title: 'Disputed tables' }, [retryNone('The escrow games', e, read)]));
        clear(appealsHost).appendChild(W.block({ title: 'Appeals' }, [retryNone('The proposals', e, read)]));
      });
    }
    function drawTables(full, links) {
      var rows = full.map(function (f) {
        var game = f.data.game, d = game.dispute, dl = f.data.deadlines || {}, id = String(game.chain_game_id);
        var deadline = isoOf(dl.resolver_timeout_at), left = deadline ? R.daysUntil(deadline, Date.now()) : null;
        var guard = G.deadlineGuard(secsOf(dl.resolver_timeout_at), Math.floor(Date.now() / 1000), maxVotingSecs());
        return { f: f, game: game, d: d, id: id, deadline: deadline, left: left, guard: guard, appeal: liveAppeal(links[id]) };
      }).sort(function (a, b) { return (a.deadline || '9') < (b.deadline || '9') ? -1 : (a.deadline || '9') > (b.deadline || '9') ? 1 : 0; });
      var tbody = rows.map(function (x) {
        var d = x.d, game = x.game, id = x.id;
        var challengerSeat = d ? game.seats.map(function (s) { return s.wallet; }).indexOf(d.challenger) : -1;
        var chal = el('span', null, [d ? R.shortAddress(d.challenger) : '—']);
        namesFor(id, game.seats).then(function (n) { if (n.names && challengerSeat >= 0 && n.names[challengerSeat]) chal.textContent = n.names[challengerSeat]; });
        var appealCell = x.appeal
          ? [W.state(x.appeal.status === 'open' ? 'Voting' : 'Passed', x.appeal.status === 'open' ? '' : 'due'), el('span', { class: 'ld-wl__sub' }, [el('a', { href: proposalHref(x.appeal.id), text: 'Proposal ' + x.appeal.id })])]
          : [W.state('Needs an appeal', 'due'), el('span', { class: 'ld-wl__sub', text: 'None yet' })];
        var dueSub = x.left === null ? null : x.guard.ok ? el('span', { class: 'ld-wl__sub', text: x.left + ' days left' }) : el('span', { class: 'ld-wl__sub is-bad', id: 'gv-guard-' + id, text: (x.left > 0 ? x.left + ' days left' : 'passed') + ' · too short for a vote' });
        var act = null;
        if (!x.appeal) {
          act = x.guard.ok ? linkBtn('Create appeal', newHref(id), true) : el('a', { class: 'ld-btn ld-btn--s ld-btn--ink', 'aria-disabled': 'true', 'aria-describedby': 'gv-guard-' + id, title: 'Deadline guard: ' + x.guard.reason }, ['Create appeal', arrow()]);
        } else if (x.appeal.status === 'passed') act = linkBtn('Execute', proposalHref(x.appeal.id), false);
        else if (x.appeal.status === 'open') act = linkBtn('Vote', proposalHref(x.appeal.id), false);
        return el('tr', null, [
          W.cell('Case', [el('a', { class: 'ld-wl__key', href: caseHref(id), 'aria-label': 'Case ' + id, text: id }), el('span', { class: 'ld-wl__sub', text: 'Escrow game ' + id + ' · ' + stateWord(game.mode) + ' · ' + game.seats.length + ' seats' })], 'c-case c-wide'),
          W.cell('Appeal', appealCell, 'c-appeal'),
          W.cell('Challenged by', [chal, el('span', { class: 'ld-wl__sub', text: (d ? shortDay(isoOf(d.disputed_at)) : '—') + (challengerSeat >= 0 ? ' · seat ' + challengerSeat : '') })], 'c-by'),
          W.cell('Bond · JUNOX', [d ? jx(d.bond) : '—'], 'c-bond is-num'),
          W.cell('Resolver deadline', [shortWhen(x.deadline), dueSub], 'c-due'),
          W.cell('', [act], 'c-act')
        ]);
      });
      clear(tablesHost).appendChild(W.block({ title: 'Disputed tables', count: String(rows.length), read: 'Read from Juno · ' + R.clock(full[0].observedAt),
        note: 'Soonest deadline first. The resolver deadline is the escrow’s own. Names are Play’s, shown only when its record names exactly the chain’s seat wallets.' },
        [W.ledger({ cls: 'disputes', wide: true, caption: 'Disputed tables, soonest resolver deadline first', columns: [{ text: 'Case' }, { text: 'Appeal' }, { text: 'Challenged by' }, { text: 'Bond', num: true, small: 'JUNOX' }, { text: 'Resolver deadline' }, { text: 'Action', sr: true }], rows: tbody })]));
    }
    read();
  }

  function howFoot() {
    var rows = [['1 · Challenge', 'Inside a table’s challenge window, a player challenges the recorded result with a bond. The pool and the bond are held.'],
      ['2 · Appeal', 'A Ludum DAO member proposes how to resolve it: uphold, replace or annul. Neta DAO may ask the players for more on its Discord.'],
      ['3 · Resolution', 'Members vote; a passed appeal is executed on chain. Unresolved by the resolver deadline, any seat can take the timeout exit.']];
    var resolverRow = el('span', { text: 'The Ludum DAO core, fixed for each table when it starts.' });
    rows.push(['The resolver', resolverRow]);
    onChange(function () {
      var c = state.pins && state.pins.escrowConfig && state.pins.escrowConfig.config;
      if (!c) return;
      var daoName = function (a) { return a === P.daoCore ? 'The Ludum DAO core' : R.shortAddress(a); };
      resolverRow.textContent = (c.resolver ? daoName(c.resolver) : 'The Ludum DAO core') + ', fixed for each table when it starts.' + (c.params && c.params.resolver_timeout_secs ? ' Resolver window: ' + Math.round(c.params.resolver_timeout_secs / 86400) + ' days from the challenge.' : '') +
        (c.params && c.params.subsidy_bps != null ? ' Subsidy: ' + (c.params.subsidy_bps / 100) + '% of every deposit.' : '');
    });
    return W.workfoot('How a dispute is decided', rows, [
      el('a', { class: 'ld-link', href: '/governance/' }, ['All Ludum DAO proposals', arrow()]),
      el('a', { class: 'ld-link', href: P.rest + '/cosmwasm/wasm/v1/contract/' + P.daoCore, rel: 'noopener' }, ['Ludum DAO on chain', arrow()])
    ]);
  }

  /* ================= /disputes/case/?id=N: the case file ================= */
  function casePage() {
    var id = new URLSearchParams(location.search).get('id');
    var body = $('gv-body');
    if (!id || !/^(0|[1-9]\d{0,15})$/.test(id)) {
      frame({ kicker: 'Disputed table', title: 'Case' });
      body.appendChild(notice('No case chosen', 'Open a case from the Disputes tab.', 'wait', el('a', { class: 'ld-link', href: '/disputes/', text: 'Disputes' })));
      return;
    }
    document.title = 'Case ' + id + ' — Disputes — Ludum';
    frame({ kicker: 'Disputed table · Escrow game ' + id, title: 'Case ' + id, dek: 'Reading the escrow on ' + P.chainId + '…' });
    var cid = Number(id);
    var expect = { chainGameId: id, contract: P.escrow, chainId: P.chainId };
    var server = window.LudumCase && window.LudumSession ? LudumCase.fetchCase(window.LudumSession, id, expect) : Promise.resolve({ kind: 'no-client' });
    var chain = Promise.all([G.readGame(reader, cid), G.readSeats(reader, cid), G.readAllProposals(reader)]);
    Promise.all([chain.then(function (r) { return { ok: r }; }, function (e) { return { error: e }; }), server]).then(function (both) {
      var c = both[0], outcome = both[1];
      if (c.error) {
        var gone = missing(c.error);
        frame({ kicker: 'Disputed table · Escrow game ' + id, title: 'Case ' + id, dek: gone ? 'Escrow ' + R.shortAddress(P.escrow) + ' has no game ' + id + '.' : 'The escrow could not be read.' });
        body.appendChild(el('div', { 'data-chain-state': gone ? 'missing' : 'unavailable' }, [gone ? notice('No such game', 'Escrow ' + R.shortAddress(P.escrow) + ' has no game #' + id + '.', 'stop') : notice('Unavailable', 'The chain could not be read from this browser just now (' + why(c.error) + '). Nothing is shown rather than an old value.', 'stop')]));
        body.appendChild(serverNotice(outcome, null, id, false));
        return;
      }
      var gr = c.ok[0].data, game = gr.game, seats = (c.ok[1].data && c.ok[1].data.seats) || [], at = c.ok[0].observedAt;
      var links = linkIndex(c.ok[2].proposals)[id] || [];
      var chainRead = { game: game, seats: seats, observedAt: at };
      var cross = outcome.kind === 'ok' ? LudumCase.crossCheck(outcome.record, chainRead) : null;
      var rec = cross && cross.agree !== false ? outcome.record : null;
      var names = rec ? rec.seats.map(function (s) { return s.displayName || null; }) : null;
      var extra = { checkpoints: null, preview: null, trusted: null };
      var extras = [G.readCheckpoints(reader, cid).then(function (r) { extra.checkpoints = r.data; }, function () {})];
      if (game.settlement) {
        extras.push(G.readSettlementPreview(reader, cid).then(function (r) { extra.preview = r.data; }, function () {}));
        extras.push(G.readSignerKey(reader, game.settlement.payload.signer_key_id).then(function (r) { extra.trusted = r.data && r.data.key ? !r.data.key.compromised : null; }, function () {}));
      }
      Promise.all(extras).then(function () { drawCase(body, id, gr, seats, at, links, outcome, cross, rec, names, extra); });
    });
  }

  /** What Play's record says, in one line (or why none of it is shown). */
  function serverNotice(outcome, cross, id, chainRead) {
    var k = outcome && outcome.kind, detail = outcome && outcome.detail ? ' (' + outcome.detail + ')' : '';
    var box = el('div', { class: 'gv-server', 'data-server-state': k || 'none' });
    var say = function (label, text, kind) { box.appendChild(notice(label, text, kind)); return box; };
    if (k === 'no-client') return say('Chain only', 'This page has no connection to play.netadao.org, so only the chain facts are shown.', 'wait');
    if (k === 'unreachable') return say('Unavailable', 'play.netadao.org could not be reached from this browser. Nothing from the server is shown.', 'wait');
    if (k === 'rate-limited') return say('Busy', 'play.netadao.org asked this browser to slow down. Nothing from the server is shown.', 'wait');
    if (k === 'unavailable') return say('Unavailable', 'The server could not produce this record' + detail + '. Nothing from the server is shown.', 'wait');
    if (k === 'bad-request') return say('Refused', 'The server refused the request for game #' + id + detail + '.', 'wait');
    if (k === 'unexpected') return say('Unavailable', 'The server answered unexpectedly (HTTP ' + outcome.status + '). Nothing from it is shown.', 'wait');
    if (k === 'not-found') return say('No such game', !chainRead ? 'The server also reports that escrow ' + R.shortAddress(P.escrow) + ' has no game #' + id + '.' : 'The server reports no escrow game #' + id + ', but this browser read one from the chain. The two disagree, so nothing from the server is shown.', 'stop');
    if (k === 'invalid') return say('Rejected', 'The server’s answer is not a valid case record for game #' + id + ', so none of it is shown: ' + outcome.problems.join('; ') + '.', 'stop');
    if (k !== 'ok') return say('Unavailable', 'The server record could not be read.', 'wait');
    if (cross && cross.agree === false) return say('Disagrees with the chain', 'The server’s record for game #' + id + ' does not match this browser’s chain read, so none of it is shown: ' + cross.problems.join('; ') + '.', 'stop');
    var text = cross && cross.agree === null ? 'Not cross-checked: this browser could not read the chain, so the server’s record is shown as the server’s alone.' : 'Seats, challenger, bond and evidence hash agree with the chain facts.';
    (cross ? cross.notes : []).forEach(function (n) { text += ' Note: ' + n + '.'; });
    box.appendChild(el('p', { class: 'ld-provenance' }, [W.state('Play’s record', 'done'), el('span', { text: text })]));
    return box;
  }

  function caseStatus(game, links) {
    var st = window.LudumCase ? LudumCase.caseStatus(game, links) : null;
    if (!st) return W.state(stateWord(game.state), '');
    if (st.kind === 'appeal-pending') return W.state('Under appeal', '');
    if (st.kind === 'disputed') return W.state('Needs an appeal', 'due');
    if (st.kind === 'resolved') return W.state('Resolved · ' + stateWord(st.resolution), 'done');
    if (st.kind === 'no-dispute') return W.state('No dispute · ' + stateWord(st.state), '');
    return W.state('Dispute ended · ' + stateWord(st.state), 'done');
  }

  function drawCase(body, id, gr, seats, at, links, outcome, cross, rec, names, extra) {
    var game = gr.game, d = game.dispute, dl = gr.deadlines || {}, st = game.settlement;
    var deadline = isoOf(dl.resolver_timeout_at) || (d && game.terms ? G.isoFromSecs(secsOf(d.disputed_at) + Number(game.terms.resolver_timeout_secs)) : null);
    var appeal = liveAppeal(links), lastAppeal = links[0] || null;
    var challengerSeat = d ? game.seats.map(function (s) { return s.wallet; }).indexOf(d.challenger) : -1;
    var heldBase = d && !d.resolution ? (BigInt(String(game.pool)) + BigInt(String(d.bond))).toString() : null;
    var party = (state.who && state.who.signedIn && names) ? names.indexOf(state.who.account.name) : -1;
    var left = deadline ? R.daysUntil(deadline, Date.now()) : null;
    var dek = !d ? 'Escrow game ' + id + ' has no dispute (it is ' + stateWord(game.state) + ').' : d.resolution ? 'The dispute was resolved: ' + stateWord(d.resolution) + ' on ' + R.day(isoOf(d.resolved_at)) + '.'
      : seatName(names, challengerSeat) + ' challenged the recorded payout. The pool and the bond are held until the Ludum DAO resolves the case or its resolver window ends.';
    frame({ kicker: 'Disputed table · Escrow game ' + id + ' · ' + stateWord(game.mode) + ' · ' + game.seats.length + ' seats', title: 'Case ' + id, dek: dek,
      facts: [['Status', caseStatus(game, links)], ['Held', heldBase ? jx(heldBase) + ' JUNOX' : '—', heldBase ? 'pool ' + jx(game.pool) + ' · bond ' + jx(d.bond) : null],
        ['Resolver deadline', d && !d.resolution ? when(deadline) : '—', d && !d.resolution && left !== null ? (left > 0 ? left + ' days left' : 'passed') : null],
        ['Appeal', appeal ? el('a', { href: proposalHref(appeal.id), text: 'Proposal ' + appeal.id }) : 'None yet']],
      source: ['Chain facts from escrow ', idSpan(R.shortAddress(P.escrow), P.escrow), ' on ' + P.chainId + ' · read ' + when(at)] });
    clear(body);
    var chainMark = el('div', { class: 'gv-chain', 'data-chain-state': 'read' });
    body.appendChild(chainMark);
    if (party >= 0) body.appendChild(W.partynote([el('b', { text: 'You sat at this table' + (party === challengerSeat ? ' and made the challenge' : '') + '.' }), ' You can read everything here; the Ludum DAO decides the case.']));

    /* Docket: what happened (a disc), what is happening now (a square), what is due (a ring) */
    var items = [];
    var dayOf = function (iso) { return [shortDay(iso), iso ? ' · ' + R.clock(iso) : '']; };
    if (game.created_at) items.push({ at: isoOf(game.created_at), what: 'Table created', line: 'A ' + game.max_players + '-seat ' + stateWord(game.mode) + ' table with a ' + jx(game.ante_gross) + ' JUNOX ante.', by: 'CreateGame' });
    if (game.started_at) items.push({ at: isoOf(game.started_at), what: 'Started', line: 'Seats and resolver were fixed.', by: 'Start' });
    var relayed = rec && rec.transactions && rec.transactions.value ? rec.transactions.value.relayed : [];
    var settleTx = relayed.filter(function (t) { return t.op === 'settle'; }).pop();
    if (st) items.push({ at: isoOf(st.accepted_at), what: 'Result recorded', line: 'The settlement was stored and the challenge window opened.', by: settleTx ? 'Settle · tx ' + R.shortHash(settleTx.txHash) : stateWord(st.source) });
    if (d) items.push({ at: isoOf(d.disputed_at), what: 'Challenged', line: seatName(names, challengerSeat) + (challengerSeat >= 0 ? ' (seat ' + challengerSeat + ')' : '') + ' challenged the recorded payout with a ' + jx(d.bond) + ' JUNOX bond.', by: 'Challenge', aside: W.state('Disputed', 'due') });
    if (d && d.resolution) items.push({ at: isoOf(d.resolved_at), what: 'Resolved', line: stateWord(d.resolution) + '.', by: 'Resolve', aside: W.state(stateWord(d.resolution), 'done') });
    var docketItems = items.filter(function (x) { return x.at; }).sort(function (a, b) { return a.at < b.at ? -1 : 1; }).map(function (x) { return { when: dayOf(x.at), what: x.what, line: x.line, by: x.by, aside: x.aside }; });
    links.slice().reverse().forEach(function (l) { docketItems.push({ when: ['On chain', ''], what: el('a', { href: proposalHref(l.id), text: 'Appeal proposed' }), line: 'Proposal ' + l.id + ' asks the Ludum DAO to ' + l.outcome + '. ' + G.proposalPhase(l.status).label + '.', by: 'Proposer ' + R.shortAddress(l.proposal.proposer) }); });
    if (d && !d.resolution) {
      var t = appeal ? G.tallyOf(appeal.proposal) : null, closes = appeal ? G.expirationSecs(appeal.proposal) : null;
      docketItems.push({ kind: 'now', when: ['Now', ''], what: appeal ? (appeal.status === 'open' ? 'Voting' : 'Waiting to be executed') : 'Awaiting an appeal',
        line: t && appeal.status === 'open' ? 'So far ' + Math.round(t.yes) + '% of voting power for, ' + Math.round(t.no) + '% against, ' + Math.round(t.abstain) + '% abstaining.' : appeal ? 'Proposal ' + appeal.id + ' passed.' : 'No live appeal proposal. Only Ludum DAO members can propose.',
        aside: W.state(appeal ? (appeal.status === 'open' ? 'Members can vote' : 'Members can execute') : 'Members can propose', 'due') });
      if (closes) docketItems.push(dueItem(G.isoFromSecs(closes), 'Voting closes', 'If it passes, a wallet the proposal module allows can execute it.', 'Proposal module'));
      if (deadline) docketItems.push(dueItem(deadline, 'Resolver deadline', 'Unresolved by then, any seat can take the timeout exit: ' + (extra.trusted === true ? 'the recorded payout is paid (its signer key is trusted) and the bond returned.' : extra.trusted === false ? 'the recorded settlement’s signer key is compromised, so the escrow refunds or settles on a trusted checkpoint, and the bond is returned.' : 'the recorded payout is paid if its signer key is trusted, and the bond returned.'), 'The escrow’s resolver window'));
    }
    body.appendChild(W.block({ id: 'k1', title: 'Docket', read: 'All times UTC' }, [W.docket(docketItems)]));

    /* The appeal */
    var shown = appeal || lastAppeal;
    var appealBody = [];
    var closesAt = shown ? G.expirationSecs(shown.proposal) : null;
    if (shown) appealBody.push(tally(shown.proposal, shown.status === 'open'));
    else if (d && !d.resolution) {
      var guard = G.deadlineGuard(secsOf(dl.resolver_timeout_at), Math.floor(Date.now() / 1000), maxVotingSecs());
      appealBody.push(W.none('No appeal yet', guard.ok ? 'Nothing creates a DAO proposal automatically. A Ludum DAO member proposes one with their own wallet, and it is a transaction they sign in Keplr.' : 'Deadline guard: ' + guard.reason, { bad: !guard.ok, action: guard.ok ? el('a', { class: 'ld-btn ld-btn--ink', href: newHref(id) }, ['Create appeal', arrow()]) : null }));
    } else appealBody.push(W.none('No appeal', 'No proposal resolves this game.'));
    body.appendChild(W.block({ id: 'k6', title: 'The appeal', read: shown ? 'Proposal ' + shown.id + ' · ' + G.OUTCOMES[shown.outcome] + ' · ' + G.proposalPhase(shown.status).label : null,
      note: shown && closesAt ? (shown.status === 'open' ? 'Voting closes ' : 'Voting ended ') + when(G.isoFromSecs(closesAt)) + '.' : null,
      head: shown ? el('a', { class: 'ld-link', href: proposalHref(shown.id) }, ['Open Proposal ' + shown.id, arrow()]) : null }, appealBody));

    /* The disputed result */
    var term = rec && rec.serverTerminal && rec.serverTerminal.value;
    var left2;
    if (term) {
      var order = term.totalsBySeat.slice().sort(function (a, b) { return b.dollars - a.dollars; });
      left2 = el('div', { class: 'ld-fieldpanel', 'data-theme': 'press' }, [
        el('div', { class: 'ld-fieldpanel__head' }, [el('h4', { text: 'The game’s result' }), el('span', { text: '$ in game' })]),
        el('div', { class: 'ld-rstandings__head', 'aria-hidden': 'true' }, [el('span', { text: 'Finish' }), el('span', { text: 'Player' }), el('span', { class: 'is-num', text: 'Net worth' })]),
        el('ol', { class: 'ld-rstandings', 'aria-label': 'Final standings, net worth in in-game dollars' }, order.map(function (x, n) {
          return el('li', { class: x.chainSeatIndex === party ? 'is-you' : null }, [el('span', { class: 'ld-rstandings__place', text: R.ordinal(n + 1) }), el('span', { text: seatName(names, x.chainSeatIndex) }), el('span', { class: 'is-num', text: R.dollars(x.dollars) })]);
        })),
        el('p', { class: 'ld-fieldpanel__note', text: 'As the server recorded it when the game ended (ended by ' + term.reason + '). The dispute is about the money it set, not the finish.' })]);
    } else left2 = W.none('Play’s record', 'The standings are Play’s record, which is not available here: ' + (rec ? (rec.serverTerminal.reason || 'none') : 'see Evidence') + '.');
    var right = el('div', { class: 'ld-pstack' });
    if (st && extra.preview) {
      var w = st.payload.settlement_weights;
      right.appendChild(ledger({ title: 'Recorded settlement', columns: [['Seat', true], ['Weight', true], ['Payout', true, 'JUNOX']],
        rows: w.map(function (x, i) { return el('tr', { class: i === party ? 'is-you' : null }, [td('Seat', [String(i)], 'is-num'), td('Weight', [String(x)], 'is-num'), td('Payout · JUNOX', [jx(extra.preview.payouts[i])], 'is-num')]); })
          .concat([el('tr', null, [td('Seat', ['Dust'], 'is-num'), td('Weight', [''], 'is-num'), td('Payout · JUNOX', [jx(extra.preview.dust)], 'is-num')]), el('tr', null, [td('', ['Pool']), td('', ['']), td('Pool · JUNOX', [jx(extra.preview.pool)], 'is-num')])]) }));
    } else right.appendChild(W.none(st ? 'Unavailable' : 'No settlement', st ? 'The escrow’s settlement preview could not be read just now.' : 'No settlement is stored for this game.'));
    if (st) right.appendChild(W.facts([['Signed by', 'Settlement key ' + st.payload.signer_key_id + ' · ' + (extra.trusted === true ? 'trusted' : extra.trusted === false ? 'compromised' : 'trust unavailable')],
      ['Recorded', when(isoOf(st.accepted_at))], ['Challenge window', 'to ' + when(isoOf(st.window_end))], ['Pool', jx(game.pool) + ' JUNOX']]));
    body.appendChild(W.block({ id: 'k3', title: 'The disputed result', note: 'The finish stands either way. What is disputed is the payout the settlement set.' }, [W.twocol(left2, right)]));

    /* What each resolution would do */
    var replaceAppeal = links.filter(function (l) { return l.outcome === 'replace' && (l.status === 'open' || l.status === 'passed'); })[0];
    var decodedReplace = replaceAppeal ? G.decodeResolve(replaceAppeal.proposal) : null;
    var o = G.outcomePreviews(game, { trusted: extra.trusted, replacePayload: decodedReplace ? decodedReplace.payload : null });
    var bondLine = function (back2) { return challengerSeat >= 0 ? [seatName(names, challengerSeat) + '’s bond', back2 ? jx(o.bond) + ' back' : 'to the pool'] : null; };
    var rows = function (split) { var out = (split.amounts || []).map(function (a, i) { return [seatName(names, i), jx(a), i === party]; }); if (split.dust !== undefined) out.push(['Dust to the treasury', jx(split.dust)]); return out; };
    var card = function (title, text, list, alt, off) {
      return el('div', { class: 'ld-routcome' + (alt ? ' ld-routcome--alt' : '') + (off ? ' is-off' : '') }, [el('h4', { text: title }), el('p', { text: text }), el('dl', null, list.filter(Boolean).reduce(function (acc, r) { acc.push(el('dt', { class: r[2] ? 'is-you' : null, text: r[0] }), el('dd', { text: r[1] })); return acc; }, []))]);
    };
    var cards = [];
    if (d) {
      cards.push(card('Uphold', 'The recorded settlement stands. The bond joins the pool, which is paid by the same weights.', o.uphold ? rows(o.uphold).concat([bondLine(false)]) : [['Payouts', 'unavailable: no stored settlement']]));
      cards.push(card('Replace', !o.replaceable ? 'Not possible for this table: a third-strike settlement is upheld or annulled, never replaced.' : o.replace ? 'A corrected settlement replaces the recorded one; the bond goes back to the challenger.' : 'A corrected settlement replaces the recorded one and pays by its corrected weights; the bond goes back to the challenger.',
        o.replaceable ? (o.replace ? rows(o.replace) : []).concat([bondLine(true)]) : [], false, !o.replaceable));
      cards.push(card('Annul', 'Every seat’s net deposit is refunded and the bond goes back. Nobody is paid by result.', rows(o.annul).concat([bondLine(true)])));
      cards.push(card('Timeout', deadline ? 'Unresolved on ' + R.day(deadline) + ' at ' + R.clock(deadline) + ': a seat can take the exit, with no vote. ' + (o.trusted === true ? 'The recorded payout is paid, its signer key being trusted, and the bond returned.' : o.trusted === false ? 'Its signer key is compromised: the escrow refunds or settles on a trusted checkpoint, and returns the bond.' : 'If its signer key is trusted the recorded payout is paid; the bond is returned.') : 'The resolver deadline is unavailable.',
        o.timeout ? rows(o.timeout).concat([bondLine(true)]) : [bondLine(true)], true));
    }
    body.appendChild(W.block({ id: 'k5', title: 'What each resolution would do', read: 'JUNOX, for this table', note: 'Computed from the escrow’s rules and the recorded weights. Timeout happens without a vote.' },
      [d ? el('div', { class: 'ld-routcomes' }, cards) : W.none('No dispute', 'This game has no dispute record, so no resolution applies.')]));

    /* Parties */
    var payouts = extra.preview && extra.preview.payouts ? extra.preview.payouts : null;
    var partyRows = game.seats.map(function (s, i) {
      return el('tr', { class: i === party ? 'is-you' : null }, [
        td('Seat', [String(i)], 'is-num'), td('Player', [seatName(names, i)]),
        td('Payout wallet', [idSpan(R.shortAddress(s.wallet), s.wallet)]),
        td('Net deposit · JUNOX', [jx(s.net_deposit)], 'is-num'),
        td('Recorded payout · JUNOX', [payouts ? jx(payouts[i]) : '—'], 'is-num'),
        td('Role', [i === challengerSeat ? 'Challenger · bond ' + jx(d.bond) : ''])
      ]);
    });
    body.appendChild(W.block({ id: 'k2', title: 'Parties', note: 'Seat numbers are the chain’s (deposit order). Names are Play’s players’ display names, shown only when Play’s record names exactly these wallets. Recorded payouts are the escrow’s own settlement preview.' },
      [ledger({ columns: [['Seat', true], ['Player'], ['Payout wallet'], ['Net deposit', true, 'JUNOX'], ['Recorded payout', true, 'JUNOX'], ['Role']], rows: partyRows })]));

    /* Evidence (+ Play's record, cross-checked, in one line) */
    var cp = extra.checkpoints;
    var cpCount = cp && cp.checkpoints ? cp.checkpoints.length : null;
    var verdict = { 'server-log': 'equals the server’s log hash', 'server-board': 'equals the server’s terminal board hash', neither: 'matches neither of the server’s hashes' };
    var hash = function (h) { return idSpan(R.shortHash(h), String(h)); };
    var evRows = [['Evidence hash, on Juno', d ? hash(d.evidence_hash) : '—'],
      ['Game log at the result', term ? el('span', null, [term.logLen.toLocaleString('en-US') + ' entries · hash ', hash(term.logHash)]) : el('span', null, [st ? 'Stored settlement: log length ' + st.payload.log_len + ' · hash ' : '—', st ? hash(st.payload.log_hash) : ''])],
      ['Checkpoints', cpCount === null ? 'unavailable' : cpCount + (cp.liveness_candidate_seq ? ' · highest trusted sequence ' + Number(cp.liveness_candidate_seq).toLocaleString('en-US') : ' · none trusted')]];
    if (rec && rec.evidenceMatches && rec.evidenceMatches.value) evRows.push(['The challenger’s evidence', verdict[rec.evidenceMatches.value] || rec.evidenceMatches.value]);
    body.appendChild(W.block({ id: 'k4', title: 'Evidence', read: 'Hashes are shortened; each shows in full on hover', note: 'The log, the checkpoints’ contents and what the evidence hash commits to are Play’s records.' },
      [W.twocol(W.facts(evRows), W.facts([['Rules and variants', el('span', null, ['Engine ' + game.rules_engine_version + ' · variants digest ', hash(game.variants_digest)])],
        ['Roster hash', game.roster_hash ? hash(game.roster_hash) : '—'], ['Resolver for this table', game.resolver === P.daoCore ? 'The Ludum DAO core · fixed at Start' : game.resolver ? R.shortAddress(game.resolver) : '—']])), serverNotice(outcome, cross, id, true)]));
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

  /* ================= /governance/new/?case=N: a new appeal (a ticket) ================= */
  function newPage() {
    var pre = new URLSearchParams(location.search).get('case');
    var form = { id: pre && /^(0|[1-9]\d{0,15})$/.test(pre) ? pre : null, outcome: null, title: null, titleEdited: false, rationale: '', read: false, voteYes: false, weights: null };
    var frameHost = $('gv-frame');
    var stubHost = el('div', { class: 'ld-ticket__stub' });
    var mainHost = el('div', { class: 'ld-ticket__main' });
    clear(frameHost).appendChild(el('section', { class: 'ld-pass ld-ticket ld-rec ld-rec--form', 'aria-labelledby': 'gv-head' }, [mainHost, el('div', { class: 'ld-pass__perf', 'aria-hidden': 'true' }, [el('i')]), stubHost]));
    recBody();
    var head = el('div', { class: 'ld-rec__head' }, [el('div', { class: 'ld-rec__top' }, [W.backLink(back().href, back().text)]), el('p', { class: 'ld-rec__kicker', text: 'Ludum DAO · ' + P.chainId }),
      el('h1', { class: 'ld-rec__title', id: 'gv-head', tabindex: '-1', text: 'New appeal' }), el('p', { class: 'ld-rec__dek', text: 'Write the Ludum DAO’s appeal for one disputed table. You submit it with your own wallet; it carries one message, the escrow’s Resolve.' })]);
    /* Actions off (pins, framing): said once, in the head, above the steps. */
    var offSlot = el('div', { style: 'margin-top:16px' });
    head.appendChild(offSlot);
    var host = el('div', null, [W.reading('Reading the disputed games on ' + P.chainId + '…')]);
    mainHost.appendChild(head);
    mainHost.appendChild(host);
    var walletSlot = walletBlock('Submitting an appeal');
    var data = { games: null, links: null, game: null, seats: null, at: null, server: null, floor: null, preCfg: undefined };
    Promise.all([G.readAllGames(reader), G.readAllProposals(reader), G.readPreProposeConfig(reader).then(function (r) { return r.data; }, function () { return undefined; })]).then(function (r) {
      data.games = r[0].games.filter(function (g) { return g.state === 'disputed'; });
      data.links = linkIndex(r[1].proposals);
      data.preCfg = r[2];
      if (form.id === null && data.games.length) form.id = String(data.games[0].chain_game_id);
      return loadGame();
    }).catch(function (e) { unavailable(host, 'The escrow games', e); });
    function loadGame() {
      data.game = null; data.server = null; data.floor = null;
      if (form.id === null) { draw(); return Promise.resolve(); }
      return Promise.all([G.readGame(reader, form.id), G.readCheckpoints(reader, form.id).then(function (r) { return r.data; }, function () { return null; })]).then(function (r) {
        data.game = r[0].data; data.at = r[0].observedAt; data.floor = r[1] && r[1].liveness_candidate_seq != null ? String(r[1].liveness_candidate_seq) : r[0].data.latest_checkpoint ? String(r[0].data.latest_checkpoint.payload.seq) : null;
        draw();
        return namesFor(form.id, data.game.game.seats).then(function (n) {
          data.server = n;
          if (n.record) { var cr = LudumCase.crossCheck(n.record, { game: data.game.game, seats: data.game.game.seats.map(function (s, i) { return { chain_seat_index: i, seat: s }; }) }); if (cr.agree !== true) data.server = { kind: 'disagrees', names: null, record: null }; }
          draw();
        });
      }, function (e) { data.game = { error: e }; draw(); });
    }
    onChange(draw);
    function draw() {
      if (!data.games) return;
      clear(host);
      clear(stubHost);
      var goArea = el('div', { class: 'ld-go', style: 'padding-bottom:6px' });
      var keyArea = el('div', { class: 'ld-key', 'data-theme': 'press', style: 'flex:1 1 auto' });
      stubHost.appendChild(goArea);
      stubHost.appendChild(keyArea);
      var gr = data.game && !data.game.error ? data.game : null, game = gr ? gr.game : null, d = game ? game.dispute : null, dl = gr ? gr.deadlines || {} : {};
      var names = data.server && data.server.names;
      var challengerSeat = d ? game.seats.map(function (s) { return s.wallet; }).indexOf(d.challenger) : -1;
      var links = form.id !== null ? data.links[form.id] || [] : [];
      /* One numbered step: 1-4 on the main part, 5-6 on the stub. */
      var step = function (no, title, content, target) {
        (target || host).appendChild(el('div', { class: 'ld-step' }, [el('span', { class: 'ld-step__mark', 'aria-hidden': 'true', text: String(Number(no)) }), el('div', { class: 'ld-step__body' }, [el('div', { class: 'ld-step__top' }, [el('h2', { class: 'ld-step__label', text: title })])].concat(content))]));
      };
      clear(offSlot);
      var off = offLine();
      if (off) offSlot.appendChild(off);

      /* 1 The case */
      var select = el('select', { class: 'ld-pselect', id: 'nw-case' });
      if (!data.games.length) select.appendChild(el('option', { value: '', text: 'No disputed table on ' + P.chainId }));
      data.games.forEach(function (g) {
        var id = String(g.chain_game_id), live = liveAppeal(data.links[id]);
        var opt = el('option', { value: id, text: id + ' · escrow game · ' + stateWord(g.mode) + ' · ' + g.seats_filled + ' seats' + (live ? ' (has Proposal ' + live.id + ')' : '') });
        if (id === form.id) opt.setAttribute('selected', '');
        select.appendChild(opt);
      });
      select.addEventListener('change', function () { form.id = select.value || null; form.outcome = null; form.weights = null; if (!form.titleEdited) form.title = null; loadGame(); });
      var caseSide = el('div', { class: 'ld-pstack' });
      if (links.length) caseSide.appendChild(W.none('This case has proposals', links.map(function (l) { return 'Proposal ' + l.id + ' (' + l.outcome + ', ' + G.proposalPhase(l.status).label + ')'; }).join('; ') + '.'));
      if (data.game && data.game.error) caseSide.appendChild(W.none('Unavailable', 'Game ' + form.id + ' could not be read (' + why(data.game.error) + ').', { bad: true }));
      else if (game) {
        caseSide.appendChild(W.facts([['Bond', d ? jx(d.bond) + ' JUNOX' : '—'], ['Pool held', jx(game.pool) + ' JUNOX'], ['Resolver deadline', when(isoOf(dl.resolver_timeout_at))]]));
        caseSide.appendChild(W.none(game.state === 'disputed' ? 'Still disputed' : 'Not disputed', 'Read from the escrow at ' + R.clock(data.at) + ': game ' + form.id + ' is ' + stateWord(game.state) + (d ? '; challenged by ' + seatName(names, challengerSeat) + (challengerSeat >= 0 ? ' (seat ' + challengerSeat + ')' : '') : '') + '.',
          { bad: game.state !== 'disputed', action: el('a', { class: 'ld-link', href: caseHref(form.id) }, ['Open the case file', arrow()]) }));
      }
      step('01', 'The case', [el('label', { class: 'ld-sr', for: 'nw-case', text: 'Case' }), el('p', { class: 'ld-step__note', text: 'Only disputed tables are listed. A table with an open or passed proposal says so.' }), select, caseSide]);

      /* 2 The outcome */
      var o = game ? G.outcomePreviews(game, {}) : null;
      var serverOk = data.server && data.server.kind === 'ok' && data.server.record && data.server.record.serverTerminal.value;
      var replaceWhy = !game ? 'choose a case' : !o.replaceable ? 'a third-strike settlement is upheld or annulled, never replaced' : !serverOk ? 'it needs Play’s terminal record for this table, agreeing with the chain' : null;
      var lines = {
        uphold: game && d ? 'The recorded settlement stands; ' + seatName(names, challengerSeat) + '’s ' + jx(d.bond) + ' bond joins the pool, paid by the recorded weights.' : 'The recorded settlement stands.',
        replace: replaceWhy ? 'Not available here: ' + replaceWhy + '.' : 'A corrected settlement (reason ResolverCorrection), prefilled from Play’s terminal record; the bond goes back. Check the weights below.',
        annul: game ? 'Each of the ' + game.seats.length + ' seats gets its net deposit back (' + game.seats.map(function (s) { return jx(s.net_deposit); }).join(', ') + '); the bond goes back.' : 'Every net deposit is refunded.'
      };
      var choices = el('fieldset', { class: 'ld-pchoices' }, [el('legend', { class: 'ld-sr', text: 'Outcome' })].concat(['uphold', 'replace', 'annul'].map(function (k) {
        var off2 = !game || (k === 'replace' && replaceWhy !== null);
        var input = el('input', { type: 'radio', name: 'nw-o', value: k });
        if (off2) input.setAttribute('disabled', '');
        if (form.outcome === k) input.setAttribute('checked', '');
        input.addEventListener('change', function () { form.outcome = k; if (!form.titleEdited) form.title = null; draw(); });
        return el('label', { class: 'ld-pchoice' + (off2 ? ' is-disabled' : '') }, [input, el('span', { class: 'ld-pchoice__box', 'aria-hidden': 'true' }), el('span', { class: 'ld-pchoice__name', text: G.OUTCOMES[k] }), el('span', { class: 'ld-pchoice__line', text: lines[k] })]);
      })));
      var outcomeExtra = el('div', { class: 'ld-pstack' });
      var payload = null, payloadProblem = null;
      if (form.outcome === 'replace' && !replaceWhy) {
        var tv = data.server.record.serverTerminal.value;
        var weights = form.weights || tv.totalsBySeat.map(function (x) { return String(Math.max(0, x.dollars)); });
        try {
          payload = G.replacePayload({ domain: game.domain, logLen: tv.logLen, logHash: tv.logHash, appraisalStateHash: tv.appraisalStateHash, weights: weights, seatCount: game.seats.length, floorSeq: data.floor,
            settlementSource: game.settlement ? game.settlement.source : null, signerKeyId: game.settlement && game.settlement.payload ? game.settlement.payload.signer_key_id : 0, issuedAtSecs: Math.floor(Date.now() / 1000) });
        } catch (e) { payloadProblem = why(e); }
        var grid = el('div', { class: 'ld-weights', role: 'group', 'aria-label': 'Corrected weights by seat' });
        weights.forEach(function (w, n) {
          var inp = el('input', { class: 'ld-pinput', type: 'text', inputmode: 'numeric', id: 'nw-w' + n, value: w });
          inp.addEventListener('change', function () { var next = weights.slice(); next[n] = inp.value.trim(); form.weights = next; draw(); });
          grid.appendChild(el('div', null, [el('label', { class: 'ld-step__label', for: 'nw-w' + n, text: 'Seat ' + n + ' · ' + seatName(names, n) }), inp]));
        });
        outcomeExtra.appendChild(el('p', { class: 'ld-step__note', text: 'A seat’s share is its weight ÷ the total. They start as Play’s final net worth by seat; change them only to correct the result.' }));
        outcomeExtra.appendChild(grid);
        if (payloadProblem) outcomeExtra.appendChild(W.none('Refused', 'This payload would be refused: ' + payloadProblem + '.', { bad: true }));
      }
      step('02', 'The outcome', [choices, outcomeExtra]);

      /* 3 Title and rationale */
      var defTitle = form.id !== null && form.outcome ? 'Appeal ' + form.id + ': ' + form.outcome : '';
      var titleVal = form.titleEdited ? form.title : defTitle;
      var titleIn = el('input', { class: 'ld-pinput', id: 'nw-t', value: titleVal || '', maxlength: String(G.TITLE_MAX) });
      var titleCount = el('span', { text: (titleVal || '').length + ' characters' });
      titleIn.addEventListener('input', function () { form.title = titleIn.value; form.titleEdited = true; titleCount.textContent = titleIn.value.length + ' characters'; });
      titleIn.addEventListener('change', function () { draw(); });
      var rat = el('textarea', { class: 'ld-ptextarea', id: 'nw-r', maxlength: String(G.RATIONALE_MAX) });
      rat.textContent = form.rationale;
      var ratCount = el('span', { text: form.rationale.length + ' characters' });
      rat.addEventListener('input', function () { form.rationale = rat.value; ratCount.textContent = rat.value.length + ' characters'; });
      rat.addEventListener('change', function () { draw(); });
      step('03', 'Title and rationale', [el('div', { class: 'ld-pstack' }, [
        el('div', null, [el('label', { class: 'ld-step__label', for: 'nw-t', text: 'Title' }), titleIn, el('div', { class: 'ld-pfield__foot' }, [el('span', { text: 'Shown in the proposal list' }), titleCount])]),
        el('div', null, [el('label', { class: 'ld-step__label', for: 'nw-r', text: 'Rationale' }), el('p', { class: 'ld-step__note', text: 'Published on chain with the proposal, followed by the case facts this page reads from the chain. Name the evidence you relied on.' }), rat, el('div', { class: 'ld-pfield__foot' }, [el('span', { text: 'Plain text' }), ratCount])])])]);

      /* 4 The message -- exactly what the DAO core will send */
      var spec = null, specProblem = null;
      if (game && form.outcome && (form.outcome !== 'replace' || payload)) {
        try {
          spec = G.buildPropose({ chainGameId: form.id, outcome: form.outcome, voteYes: form.voteYes, payload: form.outcome === 'replace' ? payload : undefined, title: titleVal,
            description: G.proposalDescription({ chainGameId: form.id, outcome: form.outcome, rationale: form.rationale, challenger: d && d.challenger, bond: d && d.bond, evidenceHash: d && d.evidence_hash,
              disputedAt: d && isoOf(d.disputed_at), resolverTimeoutAt: isoOf(dl.resolver_timeout_at), payload: form.outcome === 'replace' ? payload : null,
              basis: form.outcome === 'replace' ? (form.weights ? 'weights corrected by the proposer from the server’s terminal record' : 'the server’s terminal record (final net worth by seat)') : null }) });
        } catch (e) { specProblem = why(e); }
      }
      var resolveMsg = spec ? JSON.parse(G.b64ToUtf8(spec.msg.propose.msg.propose.msgs[0].wasm.execute.msg)) : null;
      step('04', 'The message', [W.details('The exact message', [code(resolveMsg ? { wasm: { execute: { contract_addr: P.escrow, msg: resolveMsg, funds: [] } } } : 'Choose a case and an outcome.')], true),
        W.facts([['Sent by', 'The Ludum DAO core, when the proposal passes and is executed'], ['Allowed because', game ? (game.resolver === P.daoCore ? 'The core is this game’s resolver, fixed at Start' : 'Not allowed: this game’s resolver is not the Ludum DAO core') : '—'], ['Moves', 'No funds of yours; the escrow pays or refunds the seats']]),
        specProblem ? W.none('Refused', specProblem + '.', { bad: true }) : null]);

      /* 5 Timing (the stub) */
      var mvp = state.pins && state.pins.singleConfig && state.pins.singleConfig.max_voting_period ? state.pins.singleConfig.max_voting_period.time : null;
      var now = Math.floor(Date.now() / 1000), deadlineSecs = secsOf(dl.resolver_timeout_at);
      var guard = G.deadlineGuard(deadlineSecs, now, mvp == null ? P.maxVotingPeriodSecs : mvp);
      var voteEnd = mvp != null ? now + mvp : null, execLeft = voteEnd != null && deadlineSecs != null ? deadlineSecs - voteEnd : null;
      var deposit = data.preCfg === undefined ? 'unavailable' : data.preCfg && data.preCfg.deposit_info ? JSON.stringify(data.preCfg.deposit_info) : 'None';
      step('05', 'Timing', [W.facts([
        ['Voting period', mvp != null ? G.fmtDuration(mvp) + ' (the proposal module’s setting)' + (voteEnd != null ? ' · ' + R.day(G.isoFromSecs(now)) + ' → ' + R.day(G.isoFromSecs(voteEnd)) : '') : 'unavailable'],
        ['Resolver deadline', when(G.isoFromSecs(deadlineSecs))],
        ['Left to execute', el('span', null, [execLeft != null ? G.fmtDuration(Math.max(0, execLeft)) + ' after voting closes · ' : '', game ? W.state(guard.ok ? 'Enough' : 'Not enough', guard.ok ? 'done' : 'bad') : '—'])],
        ['Deposit', deposit + ' (the pre-propose module’s setting)']
      ]), el('p', { class: 'ld-step__note', text: guard.ok ? 'If voting would end too close to the resolver deadline, Ludum says so here and offers no proposal.' : 'Deadline guard: ' + guard.reason })], goArea);

      /* 6 Submit (the stub, in the key field) */
      var g = state.governor, reasons = [];
      if (!state.pins || state.pins.error) reasons.push('the DAO pins are not verified');
      else if (!state.pins.check.ok) reasons.push('configuration mismatch');
      if (state.framed) reasons.push('this page is framed (open it in its own tab)');
      if (!game) reasons.push('choose a disputed case');
      else if (game.state !== 'disputed') reasons.push('game ' + form.id + ' is not disputed (it is ' + stateWord(game.state) + ')');
      else if (!guard.ok) reasons.push('the deadline guard refuses');
      if (!form.outcome) reasons.push('choose an outcome');
      if (!spec) { if (form.outcome) reasons.push('the proposal is not complete'); }
      if (!state.wallet) reasons.push('connect a Keplr wallet');
      else if (!g || g.error) reasons.push('the wallet’s membership is not yet read');
      else if (!g.governor) reasons.push('the connected wallet is not a Ludum DAO member the pre-propose module allows');
      if (!form.read) reasons.push('confirm you have read the case file');
      var readBox = el('input', { type: 'checkbox', id: 'nw-read' }); if (form.read) readBox.setAttribute('checked', '');
      readBox.addEventListener('change', function () { form.read = readBox.checked; draw(); });
      var yesBox = el('input', { type: 'checkbox', id: 'nw-yes' }); if (form.voteYes) yesBox.setAttribute('checked', '');
      yesBox.addEventListener('change', function () { form.voteYes = yesBox.checked; draw(); });
      var txHost = el('div');
      var submit = btn('Sign and submit with Keplr', function () { txPanel(txHost, spec, 'Create appeal proposal', function () { setTimeout(function () { location.assign('/disputes/'); }, 4000); }); }, { yellow: true, disabled: reasons.length > 0, title: reasons.length ? 'Not yet: ' + reasons.join('; ') : null });
      submit.className += ' ld-btn--block';
      step('06', 'Submit', [walletSlot, el('div', { class: 'ld-tx gv-submit', 'data-theme': 'press' }, [
        el('p', { class: 'ld-tx__warn' }, [el('span', null, [el('b', { text: 'This is a transaction.' }), ' It changes the chain and costs a small network fee, paid by the wallet that signs. Keplr shows the same message and the fee before you approve.'])]),
        el('label', { class: 'ld-pcheck', for: 'nw-read' }, [readBox, el('span', { text: 'I have read the case file and the evidence it links to.' })]),
        el('label', { class: 'ld-pcheck', for: 'nw-yes' }, [yesBox, el('span', { text: 'Also vote yes in the same transaction (with today’s single member, the proposal then passes at once).' })]),
        el('div', null, [submit]),
        reasons.length ? el('p', { class: 'ld-step__note', role: 'status', text: 'Not yet: ' + reasons.join('; ') + '.' }) : null,
        txHost]),
        el('p', { class: 'ld-key__lede' }, [el('b', { text: 'Your wallet, your proposal.' }), ' You sign with your own wallet' + (state.wallet ? ' (' + R.shortAddress(state.wallet.address) + ')' : '') + '. Ludum’s relayer is never a DAO member and never submits a proposal.'])], keyArea);
    }
  }

  /* ================= /governance/proposal/?id=N: an appeal, or any proposal ================= */
  function proposalPage() {
    var pid = new URLSearchParams(location.search).get('id');
    var body = $('gv-body');
    if (!pid || !/^[1-9]\d{0,15}$/.test(pid)) {
      frame({ kicker: 'Appeal', title: 'Proposal' });
      body.appendChild(notice('No proposal chosen', 'Open an appeal from the Disputes tab.', 'wait', el('a', { class: 'ld-link', href: '/disputes/', text: 'Disputes' })));
      return;
    }
    frame({ kicker: 'Proposal ' + pid, title: 'Proposal ' + pid, dek: 'Reading the proposal module…' });
    Promise.all([G.readProposal(reader, pid), G.readVotes(reader, pid)]).then(function (r) {
      var p = r[0].data.proposal, votes = r[1].votes, at = r[0].observedAt, d = G.decodeResolve(p);
      var extra = { game: null, txs: null };
      var waits = [G.readTxs(reader, G.proposalTxQuery(pid)).then(function (t) { extra.txs = t; }, function () { extra.txs = null; })];
      if (d) waits.push(G.readGame(reader, d.chainGameId).then(function (g) { extra.game = g.data; }, function () {}));
      return Promise.all(waits).then(function () { drawProposal(body, pid, p, votes, at, d, extra); });
    }).catch(function (e) {
      frame({ kicker: 'Proposal ' + pid, title: 'Proposal ' + pid });
      var gone = missing(e);
      body.appendChild(gone ? notice('No such proposal', 'The proposal module has no proposal ' + pid + '.', 'stop') : notice('Unavailable', 'The proposal could not be read from the chain (' + why(e) + ').', 'stop'));
    });
  }

  function drawProposal(body, pid, p, votes, at, d, extra) {
    var ph = G.proposalPhase(p.status), exp = G.expirationSecs(p);
    var game = extra.game ? extra.game.game : null, dl = extra.game ? extra.game.deadlines || {} : {};
    document.title = (d ? 'Appeal · ' : '') + 'Proposal ' + pid + ' — Ludum';
    var mineVote = function () { return state.wallet ? votes.filter(function (v) { return v.voter === state.wallet.address; })[0] || null : null; };
    function head() {
      var mine = mineVote();
      var yourVote = ph.phase !== 'open' ? null : !state.wallet ? 'Connect Keplr below' : mine ? 'Voted ' + mine.vote : W.yours('Your vote is open');
      frame({ kicker: (d ? 'Appeal · ' : '') + 'Proposal ' + pid, title: p.title, titleSize: 'm',
        dek: d ? 'Asks the Ludum DAO to ' + d.outcome + ' game ' + d.chainGameId + (game && game.dispute ? ', challenged on ' + R.day(isoOf(game.dispute.disputed_at)) : '') + '.' : 'A Ludum DAO proposal that is not an appeal.',
        facts: [['Status', phaseState(ph)], ['Case', d ? el('a', { href: caseHref(d.chainGameId), text: d.chainGameId }) : '—'], ['Voting', exp ? (ph.phase === 'open' ? 'Closes ' : 'Closed ') + when(G.isoFromSecs(exp)) : '—']].concat(yourVote ? [['Your vote', yourVote]] : []),
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
      var lines = { yes: d ? G.OUTCOMES[d.outcome] + ' for game ' + d.chainGameId + '.' : 'For the proposal.', no: d ? 'Reject the proposal; the case stays Disputed.' : 'Against the proposal.', abstain: 'Neither for nor against; the module decides how it counts.' };
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
    body.appendChild(W.block({ id: 'q2', title: 'What it does', read: (p.msgs || []).length === 1 ? 'One message, executed by the Ludum DAO core' : (p.msgs || []).length + ' messages, executed by the Ludum DAO core',
      head: d ? el('a', { class: 'ld-link', href: caseHref(d.chainGameId) }, ['Case file ' + d.chainGameId, arrow()]) : null },
      [W.twocol(code(msgs.length === 1 ? msgs[0] : msgs), W.facts([['Outcome', d ? G.OUTCOMES[d.outcome] : 'Not an appeal'], ['Proposer', idSpan(R.shortAddress(p.proposer), p.proposer)], ['Rationale', el('span', { class: 'gv-prewrap', style: 'white-space:pre-wrap;font-family:var(--font-sans)', text: p.description })]]))]));

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
        var dSecs = secsOf(dl.resolver_timeout_at), now = Math.floor(Date.now() / 1000);
        var checks = d ? [
          ['Game ' + d.chainGameId, game ? stateWord(game.state) : 'unavailable', game && game.state === 'disputed'],
          ['Resolver deadline', dSecs ? when(G.isoFromSecs(dSecs)) + ' · ' + (dSecs > now ? G.fmtDuration(dSecs - now) + ' left' : 'passed') : 'unavailable', dSecs != null && dSecs > now],
          ['Resolver for game ' + d.chainGameId, game ? (game.resolver === P.daoCore ? 'The Ludum DAO core' : R.shortAddress(game.resolver)) : 'unavailable', game && game.resolver === P.daoCore]
        ] : [];
        var ok = checks.every(function (c) { return c[2]; });
        var onlyMembers = state.pins && state.pins.singleConfig ? state.pins.singleConfig.only_members_execute !== false : true;
        var why2 = !actionsAllowed() ? 'actions are off (pins or framing)' : !state.wallet ? 'connect a Keplr wallet' : onlyMembers && !member ? 'the proposal module lets only members execute' : !ok ? 'a check below fails' : null;
        var txHost = el('div');
        execHost.appendChild(W.twocol(el('div', { class: 'ld-pstack' }, [
          W.none(why2 ? 'Passed' : 'Ready to execute', 'Proposal ' + pid + ' passed. ' + (why2 ? 'To execute it here: ' + why2 + '.' : 'This wallet may execute it.')),
          checks.length ? ledger({ title: 'Live checks', columns: [['Check'], ['Read now'], ['']], rows: checks.map(function (c) { return el('tr', null, [td('Check', [c[0]]), td('Read now', [c[1]]), td('', [W.state(c[2] ? 'Yes' : 'No', c[2] ? 'done' : 'bad')])]); }), note: 'Checked against the chain when this page was read. If any fails, execution would fail too.' }) : null,
          el('div', null, [btn('Execute with Keplr', function () { txPanel(txHost, G.buildExecute(pid), 'Execute proposal ' + pid, reloadSoon); }, { large: true, yellow: true, disabled: !!why2, title: why2 })]), txHost,
          el('p', { class: 'ld-block__note', text: 'After you sign, Ludum waits for a block to include the transaction, then shows it. It never reports success before the chain does.' })]), execWallet));
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
      var text = p.status === 'executed' ? 'The DAO core sent the proposal’s message' + (game && game.dispute && game.dispute.resolution ? '; game ' + d.chainGameId + ' is now resolved (' + stateWord(game.dispute.resolution) + ').' : '.') : failed ? 'The DAO core’s message was refused' + (game ? '; game ' + d.chainGameId + ' is ' + stateWord(game.state) + ' now.' : '.') + ' The proposal module records this proposal as Execution failed; Ludum does not retry it.' : 'The proposal is ' + label.toLowerCase() + '.';
      var receiptTx = execTx || closeTx;
      execHost.appendChild(W.twocol(W.none(label, text, { bad: failed }), receiptTx ? receipt(receiptTx, failed, execTx ? 'Execution' : 'Close') : W.none('Receipt', extra.txs === null ? 'The chain’s transaction index could not be read.' : 'The chain’s transaction index holds no execution for this proposal.')));
    }
    drawExec(); onChange(drawExec);
    body.appendChild(W.block({ id: 'q3', title: 'Execution' }, [execHost]));

    /* Record */
    var items = [];
    function failedNow() { return p.status === 'execution_failed'; }
    if (proposeTx) items.push({ at: proposeTx.timestamp, what: 'Submitted', line: 'By ' + R.shortAddress(p.proposer) + '.', by: 'tx ' + R.shortHash(proposeTx.txhash) });
    if (execTx) items.push({ at: execTx.timestamp, what: failedNow() ? 'Execution failed' : 'Executed', line: failedNow() ? 'The escrow refused the message.' : 'The DAO core sent the message.', by: 'tx ' + R.shortHash(execTx.txhash), aside: W.state(failedNow() ? 'Execution failed' : 'Executed', failedNow() ? 'bad' : 'done') });
    if (closeTx) items.push({ at: closeTx.timestamp, what: 'Closed', line: '', by: 'tx ' + R.shortHash(closeTx.txhash) });
    var recItems = items.filter(function (x) { return x.at; }).map(function (x) { return { when: [shortDay(x.at), ' · ' + R.clock(x.at)], what: x.what, line: x.line, by: x.by, aside: x.aside }; });
    if (!proposeTx) recItems.unshift({ when: ['On chain', ''], what: 'Submitted', line: 'By ' + R.shortAddress(p.proposer) + (p.start_height ? ' at height ' + p.start_height : '') + '.' });
    if (ph.phase === 'open') {
      recItems.push({ kind: 'now', when: ['Now', ''], what: 'Voting', line: votes.length + ' vote' + (votes.length === 1 ? '' : 's') + ' so far.' });
      if (exp) recItems.push(dueItem(G.isoFromSecs(exp), 'Voting closes', null, 'Proposal module'));
    } else if (p.status === 'passed') {
      recItems.push({ kind: 'now', when: ['Now', ''], what: 'Waiting to be executed', aside: W.state('Ready to execute', 'due') });
    }
    if (d && game && game.state === 'disputed' && dl.resolver_timeout_at) recItems.push(dueItem(isoOf(dl.resolver_timeout_at), 'Resolver deadline for game ' + d.chainGameId, ph.phase === 'open' ? 'The last moment execution can still resolve the case.' : 'After this, a seat can take the timeout exit instead.', 'The escrow’s resolver window'));
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
    frame({ back: signedIn() ? { href: '/disputes/', text: 'Disputes' } : { href: '/', text: 'Ludum' }, kicker: 'Ludum DAO · ' + P.chainId, title: 'Proposals',
      dek: 'Every Ludum DAO proposal on ' + P.chainId + ', read live: status, count, and the escrow game each appeal would resolve.', facts: [['Chain', P.chainId]] });
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
    var go = page === 'register' ? registerPage : page === 'case' ? casePage : page === 'new' ? newPage : page === 'proposal' ? proposalPage : page === 'governance' ? proposalsPage : null;
    if (!go) return;
    /* The page's head needs the session; never wait long for it (the chain pages stand on their own). */
    var ran = false;
    var run = function () { if (!ran) { ran = true; go(); } };
    who.then(run);
    setTimeout(run, 1500);
  }
  window.LudumGovPage = { linkIndex: linkIndex, liveAppeal: liveAppeal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
