/* Ludum governance pages, as Claude Design's records layer draws them (handoff §8.4):
 *   /disputes/                 Appeals & Disputes (AccountAppeals): the pending-review register and the DAO's proposals
 *   /disputes/case/?id=N       Case file (CaseFile): docket, parties, the disputed result, evidence, what each
 *                              resolution would do, and the appeal
 *   /governance/new/?case=N    New appeal (ProposalNew): the stepped proposal workflow, signed in Keplr
 *   /governance/proposal/?id=N Proposal: the vote, what it does, execution and its record
 *   /governance/               the proposals list (and the old #proposal-N links, forwarded to the proposal page)
 *
 * The governance trust path is unchanged (architecture §2.2, §6): every figure is THIS browser's read of the chain at
 * the pinned REST endpoint, with its read time; an action is offered only when the DAO's modules match the pins, the
 * page is not framed by a foreign site, the connected Keplr wallet is a member (and, to propose, allowed by the
 * pre-propose module), and the chain read -- never Play's server record -- says the game is disputed; the deadline guard
 * holds; every transaction is simulated before Keplr is asked. Play's public `case` record (gov-case.js) only adds
 * table names and the server's terminal record, shown only when it agrees with the chain. Nothing is invented: a read
 * that fails says "unavailable", and a figure no source holds is left out.
 *
 * No inline script (§2.4): each page loads ludum.js, session.js, records.js, account-menu.js, gov.js, gov-case.js and
 * this file, which calls Ludum.enhance(). Chain text is set with textContent, never parsed as HTML. */
(function () {
  'use strict';
  var G = window.LudumGov;
  var R = window.LudumRecords;
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
  function missingGame(e) { return missing(e); }
  function missing(e) { return /not found|NoSuchProposal/i.test(e && e.message ? e.message : String(e)); }
  function isoOf(ns) { var s = G.nanosToSecs(ns == null ? null : String(ns)); return s == null ? null : G.isoFromSecs(s); }
  function secsOf(ns) { return G.nanosToSecs(ns == null ? null : String(ns)); }
  function when(iso) { return iso ? R.day(iso) + ' · ' + R.clock(iso) : '—'; }
  function shortWhen(iso) { return iso ? R.day(iso).replace(/ \d{4}$/, '') + ' · ' + R.clock(iso).replace(' UTC', '') : '—'; }
  function jx(amount) { return /^\d+$/.test(String(amount)) ? R.junox(String(amount)) : '—'; }
  function stateWord(s) { return typeof s === 'string' ? s.replace(/_/g, ' ') : 'unavailable'; }
  function caseHref(id) { return '/disputes/case/?id=' + id; }
  function proposalHref(id) { return '/governance/proposal/?id=' + id; }
  function newHref(id) { return '/governance/new/' + (id != null ? '?case=' + id : ''); }
  function readStamp(iso) { return el('span', { class: 'ld-label-s ld-muted', text: iso ? 'Read ' + R.clock(iso) : 'unavailable' }); }
  function onChange(f) { listeners.push(f); }
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) { /* one view never stops another */ } }); }
  function actionsAllowed() { return !!(state.pins && state.pins.check && state.pins.check.ok) && !state.framed; }
  function sechead(no, id, title, dek, more) {
    return el('header', { class: 'ld-sechead ld-sechead--s' }, [el('span', { class: 'ld-sechead__no', text: no }), el('h2', { class: 'ld-sechead__title', id: id, text: title }),
      dek ? el('p', { class: 'ld-sechead__dek', text: dek }) : null, more ? el('span', { class: 'ld-sechead__more' }, [more]) : null]);
  }
  function section(no, id, title, dek, body, more) {
    return el('section', { class: 'ld-section ld-section--rec', 'aria-labelledby': id }, [el('div', { class: 'ld-wrap' }, [sechead(no, id, title, dek, more)].concat(body))]);
  }
  function btn(label, onClick, opts) {
    opts = opts || {};
    var b = el('button', { type: 'button', class: 'ld-btn' + (opts.secondary ? ' ld-btn--secondary' : '') + (opts.large ? ' ld-btn--l' : '') }, [label, R.icon('arrow-right')]);
    b.addEventListener('click', function (e) { if (b.getAttribute('aria-disabled') !== 'true') onClick(e); });
    if (opts.disabled) { b.setAttribute('aria-disabled', 'true'); if (opts.title) b.setAttribute('title', opts.title); }
    return b;
  }
  function linkBtn(label, href, ink) { return el('a', { class: 'ld-btn' + (ink ? ' ld-btn--ink' : ' ld-btn--secondary'), href: href }, [label, R.icon('arrow-right')]); }
  function unavailable(host, what, e) {
    clear(host).appendChild(R.notice('Unavailable', what + ' could not be read from the chain just now' + (e ? ' (' + why(e) + ')' : '') + '. Nothing is shown rather than an old value.', 'stop'));
  }
  function code(obj, label) { return el('pre', { class: 'ld-code', tabindex: '0', role: 'region', 'aria-label': label || 'Message', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }); }
  function scroller(table, label) { return el('div', { class: 'ld-ledger__scroll', tabindex: '0', role: 'region', 'aria-label': label }, [table]); }

  /* ---------------- the connected wallet: membership and voting power (the DAO's authority, never Play's) ---------------- */
  function walletBlock(extraMeta) {
    var box = el('div', { class: 'ld-wallet' });
    function draw() {
      clear(box);
      if (extraMeta) box.appendChild(el('dl', { class: 'ld-meta' }, extraMeta.map(function (m) { return el('div', null, [el('dt', { text: m[0] }), el('dd', null, [m[1]])]); })));
      var g = state.governor;
      var role = !state.wallet ? 'Not connected' : !g ? 'Checking…' : g.error ? 'Unavailable' : g.member ? (g.canPropose ? 'Member' : 'Member (cannot propose)') : 'Not a member';
      var power = '—';
      if (g && !g.error && g.member && state.totalWeight && Number(state.totalWeight) > 0) power = (Math.round(g.weight / Number(state.totalWeight) * 1000) / 10).toFixed(1) + '%';
      box.appendChild(el('dl', { class: 'ld-meta' }, [
        el('div', null, [el('dt', { text: 'Wallet' }), el('dd', null, [state.wallet ? el('span', { class: 'ld-id', title: state.wallet.address, text: R.shortAddress(state.wallet.address) }) : 'Not connected'])]),
        el('div', null, [el('dt', { text: 'Ludum DAO' }), el('dd', { text: role })]),
        el('div', null, [el('dt', { text: 'Voting power' }), el('dd', { text: power })])
      ]));
      var acts = el('div', { class: 'gv-wallet-acts' });
      var connect = el('button', { type: 'button', class: 'ld-link', text: state.wallet ? 'Switch wallet' : 'Connect Keplr' });
      if (!actionsAllowed()) { connect.setAttribute('aria-disabled', 'true'); connect.setAttribute('title', state.framed ? 'Open this page in its own tab' : 'Available once the DAO pins are verified'); }
      connect.addEventListener('click', function () { if (connect.getAttribute('aria-disabled') !== 'true') onConnect(); });
      acts.appendChild(connect);
      acts.appendChild(el('a', { class: 'ld-link ld-link--out', href: P.rest + '/cosmwasm/wasm/v1/contract/' + P.daoCore, rel: 'noopener' }, ['Ludum DAO on chain', R.icon('arrow-out')]));
      box.appendChild(acts);
      if (state.framed) box.appendChild(R.notice('Framed', 'Actions are off while this page is framed by another site. Open it in its own tab.', 'stop'));
      else if (state.pins && state.pins.error) box.appendChild(R.notice('Unavailable', 'The Ludum DAO could not be read (' + state.pins.error + '), so no action is offered.', 'stop'));
      else if (state.pins && !state.pins.check.ok) box.appendChild(R.notice('Configuration mismatch', 'What the DAO reports on chain differs from the addresses this site pins, so this page offers no action: ' + state.pins.check.problems.join('; ') + '.', 'stop'));
      if (state.connectError) box.appendChild(R.notice('Keplr', state.connectError, 'stop'));
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

  /* ---------------- a transaction: the exact message, simulated first, then Keplr ---------------- */
  function txPanel(host, spec, label, done) {
    clear(host);
    var status = el('p', { class: 'ld-body-s', role: 'status', text: 'Simulating on ' + P.chainId + '… (nothing is signed yet)' });
    host.appendChild(el('div', { class: 'ld-stack gv-tx' }, [el('p', { class: 'ld-label', text: label + ' · the message Keplr will be asked to sign' }),
      code('contract: ' + spec.contract + '\nfunds: []\nmsg: ' + JSON.stringify(spec.msg, null, 2)), status]));
    G.prepare(reader, spec, state.wallet).then(function (prep) {
      status.textContent = 'Simulation passed (gas used ' + prep.gasUsed + '). Keplr will show the same message and the network fee.';
      host.firstChild.appendChild(btn('Sign in Keplr', function (ev) {
        ev.currentTarget.setAttribute('aria-disabled', 'true');
        status.textContent = 'Waiting for Keplr…';
        G.signAndBroadcast(reader, spec, state.wallet, prep).then(function (r) {
          status.textContent = r.pending ? 'Broadcast as ' + r.txhash + '; not yet seen in a block. Reload in a minute.' : 'Included at height ' + r.height + ' (' + r.txhash + ').';
          if (done) done(r);
        }, function (e) { status.textContent = why(e); });
      }, { large: true }));
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

  /* ---------------- the page frame: a profile head for a signed-in player, else the DAO's ---------------- */
  function frame(head, opts) {
    var host = $('gv-frame'); if (!host) return;
    clear(host);
    host.appendChild(R.rechead(head));
    if (opts && opts.tabs && state.who && state.who.signedIn === true) host.appendChild(R.tabsNav(R.profileTabs(state.who, true, 'appeals')));
    if (opts && opts.wallet) host.appendChild(el('div', { class: 'ld-wrap ld-wallet-bar' }, [walletBlock(opts.walletMeta)]));
  }

  /* ---------------- the proposal list (shared by /disputes/ and /governance/) ---------------- */
  var FILTERS = [['all', 'All'], ['open', 'Voting'], ['passed', 'Passed'], ['executed', 'Executed'], ['failed', 'Failed']];
  function proposalsLedger(items, observedAt) {
    var tbody = el('tbody'), count = el('span', { class: 'ld-filters__count', 'aria-live': 'polite' });
    var counts = { all: items.length, open: 0, passed: 0, executed: 0, failed: 0 };
    items.forEach(function (p) { counts[G.proposalPhase(p.proposal.status).phase] += 1; });
    var votedBy = {};
    function cue(p) {
      var g = state.governor, ph = G.proposalPhase(p.proposal.status).phase;
      if (!g || g.error || !g.member) return null;
      if (ph === 'open') return votedBy[p.id] === true ? null : votedBy[p.id] === false ? el('span', { class: 'ld-due', text: 'Your vote is open' }) : null;
      if (ph === 'passed') return el('span', { class: 'ld-due', text: 'Ready to execute' });
      return null;
    }
    function draw(filter) {
      clear(tbody);
      var shown = items.filter(function (p) { return filter === 'all' || G.proposalPhase(p.proposal.status).phase === filter; });
      shown.forEach(function (p) {
        var ph = G.proposalPhase(p.proposal.status), d = G.decodeResolve(p.proposal), t = G.tallyOf(p.proposal), exp = G.expirationSecs(p.proposal);
        var voting = ph.phase === 'open' ? (exp ? 'Closes ' + when(G.isoFromSecs(exp)) : 'Open') : ph.phase === 'executed' ? 'Executed' : exp ? 'Closed ' + R.day(G.isoFromSecs(Math.min(exp, Math.floor(Date.now() / 1000)))) : 'Closed';
        tbody.appendChild(el('tr', { 'data-ld-status': ph.phase, id: 'proposal-' + p.id }, [
          R.td('No.', [String(p.id)], 'is-key'),
          R.td('Proposal', [R.val(el('a', { href: proposalHref(p.id), text: p.proposal.title }))]),
          R.td('Case', [R.val(d ? el('a', { href: caseHref(d.chainGameId), text: d.chainGameId }) : el('span', { class: 'ld-muted', text: 'Not an appeal' }))]),
          R.td('Status', [R.val(R.stamp(ph.label, ph.stamp))]),
          R.td('Voting', [R.val(voting)]),
          R.td('Yes · No · Abstain %', [R.val(t ? [Math.round(t.yes), Math.round(t.no), Math.round(t.abstain)].join(' · ') : '—')]),
          R.td('', [R.val(cue(p))]),
          R.go(proposalHref(p.id))
        ]));
      });
      count.textContent = shown.length + (shown.length === 1 ? ' proposal' : ' proposals');
    }
    var current = 'all';
    var tabs = el('div', { class: 'ld-tabs', role: 'group', 'aria-label': 'Filter proposals' }, FILTERS.map(function (f) {
      var b = el('button', { type: 'button', 'aria-pressed': f[0] === 'all' ? 'true' : 'false' }, [f[1] + ' ', el('span', { class: 'ld-tabs__count', text: String(counts[f[0]]) })]);
      b.addEventListener('click', function () { current = f[0]; Array.prototype.forEach.call(tabs.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); draw(current); });
      return b;
    }));
    draw('all');
    /* A member's own cue: which open proposals this wallet has voted on (read only once a member wallet is connected). */
    onChange(function () {
      var g = state.governor;
      if (!g || g.error || !g.member) { draw(current); return; }
      var open = items.filter(function (p) { return p.proposal.status === 'open' && votedBy[p.id] === undefined; });
      Promise.all(open.map(function (p) { return G.readVotes(reader, p.id).then(function (v) { votedBy[p.id] = v.votes.some(function (x) { return x.voter === state.wallet.address; }); }, function () {}); })).then(function () { draw(current); });
    });
    if (!items.length) return R.notice('No proposals yet', 'The Ludum DAO has no proposals on ' + P.chainId + '. ' + (observedAt ? 'Read ' + R.clock(observedAt) + '.' : ''), 'wait');
    return el('div', null, [el('div', { class: 'ld-filters gv-filters' }, [tabs, count]),
      R.el('figure', { class: 'ld-ledger ld-ledger--stack' }, [scroller(el('table', null, [
        el('thead', null, [el('tr', null, ['No.', 'Proposal', 'Case', 'Status', 'Voting', 'Yes · No · Abstain %', '', ''].map(function (t) { return el('th', { scope: 'col', text: t }); }))]), tbody]), 'Proposals'),
        el('p', { class: 'ld-ledger__note', text: 'From the single-choice proposal module ' + R.shortAddress(P.proposalSingle) + ', newest first. Percentages are of each proposal’s total voting power. ' + (observedAt ? 'Read ' + when(observedAt) + '.' : '') })])]);
  }

  /* ================= /disputes/: Appeals & Disputes ================= */
  function registerPage() {
    var who = state.who;
    frame({ kicker: who && who.signedIn ? 'Profile' : 'Ludum DAO · ' + P.chainId, muted: 'Appeals & Disputes', title: who && who.signedIn ? who.account.name : 'Appeals & Disputes',
      dek: 'Disputed tables whose money is held, and the Ludum DAO’s appeals, read live from Juno.' }, { tabs: true, wallet: true });
    var body = $('gv-body');
    var pending = el('div', null, [el('p', { class: 'ld-body-s', role: 'status', text: 'Reading ' + P.chainId + '…' })]);
    var props = el('div', null, [el('p', { class: 'ld-body-s', role: 'status', text: 'Reading the proposal module…' })]);
    var how = el('div');
    body.appendChild(section('01', 'a1', 'Pending review', 'Disputed tables whose money is held. Only Ludum DAO members can propose.', [pending]));
    body.appendChild(section('02', 'a2', 'Proposals', 'Appeals put to the Ludum DAO, as its proposal module reports them, newest first. Vote while one is open; execute one that has passed.', [props], linkBtn('New appeal', newHref(null), true)));
    body.appendChild(el('section', { class: 'ld-section ld-section--rec', 'aria-label': 'How a dispute is decided' }, [el('div', { class: 'ld-wrap' }, [how])]));
    Promise.all([G.readAllGames(reader), G.readAllProposals(reader)]).then(function (r) {
      var links = linkIndex(r[1].proposals);
      clear(props).appendChild(proposalsLedger(r[1].proposals, r[1].observedAt));
      var disputed = r[0].games.filter(function (g) { return g.state === 'disputed'; });
      if (!disputed.length) {
        clear(pending).appendChild(R.notice('Nothing pending', r[0].games.length + ' escrow game' + (r[0].games.length === 1 ? '' : 's') + ' on ' + P.chainId + ', none disputed. Read ' + R.clock(r[0].observedAt) + '.', 'wait'));
        return;
      }
      return Promise.all(disputed.map(function (g) { return G.readGame(reader, g.chain_game_id); })).then(function (full) {
        var tbody = el('tbody');
        full.forEach(function (f, i) {
          var game = f.data.game, d = game.dispute, dl = f.data.deadlines || {}, id = String(game.chain_game_id);
          var deadline = isoOf(dl.resolver_timeout_at), left = deadline ? R.daysUntil(deadline, Date.now()) : null;
          var guard = G.deadlineGuard(secsOf(dl.resolver_timeout_at), Math.floor(Date.now() / 1000), state.pins && state.pins.singleConfig && state.pins.singleConfig.max_voting_period ? state.pins.singleConfig.max_voting_period.time : P.maxVotingPeriodSecs);
          var appeal = liveAppeal(links[id]);
          var challengerSeat = d ? game.seats.map(function (s) { return s.wallet; }).indexOf(d.challenger) : -1;
          var chal = el('span', null, [d ? R.shortAddress(d.challenger) : '—']);
          namesFor(id, game.seats).then(function (n) { if (n.names && challengerSeat >= 0 && n.names[challengerSeat]) chal.textContent = n.names[challengerSeat]; });
          tbody.appendChild(el('tr', null, [
            R.td('Case', [el('a', { href: caseHref(id), text: id })], 'is-key'),
            R.td('Game · table', [R.val('Escrow game ' + id, stateWord(game.mode) + ' · ' + game.seats.length + ' seats')]),
            R.td('Disputed (UTC)', [R.val(d ? shortWhen(isoOf(d.disputed_at)) : '—')]),
            R.td('Challenger', [R.val(chal, challengerSeat >= 0 ? 'seat ' + challengerSeat : null)]),
            R.td('Bond · JUNOX', [R.val(d ? jx(d.bond) : '—')], 'is-num'),
            R.td('Resolver deadline', [R.val(shortWhen(deadline), left === null ? null : guard.ok ? left + ' days' : el('span', { class: 'ld-due', text: left > 0 ? left + ' days' : 'passed' }))]),
            R.td('Appeal', [R.val(appeal ? el('a', { href: proposalHref(appeal.id), text: 'Proposal ' + appeal.id }) : el('span', { class: 'ld-muted', text: 'None yet' }), appeal ? G.proposalPhase(appeal.status).label : null)]),
            R.td('Status', [R.val(R.stamp(appeal ? 'Under appeal' : 'Disputed', 'held'))]),
            appeal ? R.go(caseHref(id)) : R.td('', [R.val(linkBtn('Create appeal', newHref(id), true))])
          ]));
        });
        clear(pending).appendChild(el('figure', { class: 'ld-ledger ld-ledger--stack' }, [scroller(el('table', null, [
          el('thead', null, [el('tr', null, ['Case', 'Game · table', 'Disputed (UTC)', 'Challenger', 'Bond', 'Resolver deadline', 'Appeal', 'Status', ''].map(function (t) {
            return el('th', { scope: 'col', class: t === 'Bond' ? 'is-num' : null }, [t, t === 'Bond' ? el('span', { class: 'ld-ledger__unit', text: 'JUNOX' }) : null]);
          }))]), tbody]), 'Pending review'),
          el('p', { class: 'ld-ledger__note', text: 'The resolver deadline is the escrow’s own (its resolver window after the challenge). Names are Play’s, shown only when its record names exactly the chain’s seat wallets. Read ' + when(full[0].observedAt) + '.' })]));
      });
    }).catch(function (e) { unavailable(pending, 'The escrow games', e); unavailable(props, 'The proposals', e); });
    drawHow(how);
  }
  function drawHow(host) {
    var steps = [['Challenge', 'Inside a table’s challenge window, a player submits a challenge to the result.'], ['Review', 'Neta DAO’s Ludum DAO reviews challenges and may contact players for further information through Neta DAO’s Discord server.'], ['Resolution', 'The Ludum DAO votes and executes a resolution.']];
    var meta = el('div', { class: 'gv-how-meta' });
    host.appendChild(el('details', { class: 'ld-disclose' }, [el('summary', null, [el('span', { text: 'How a dispute is decided' })]), el('div', { class: 'ld-disclose__body' }, [
      el('ol', { class: 'ld-vflow' }, steps.map(function (s) { return el('li', null, [el('span', { class: 'ld-vflow__name', text: s[0] }), el('span', { class: 'ld-vflow__text', text: s[1] })]); })), meta])]));
    onChange(function () {
      var c = state.pins && state.pins.escrowConfig && state.pins.escrowConfig.config;
      clear(meta);
      if (!c) return;
      var daoName = function (a) { return a === P.daoCore ? 'Ludum DAO core' : R.shortAddress(a); };
      var rows = [['Resolver', c.resolver ? daoName(c.resolver) : null], ['Treasury', c.treasury ? daoName(c.treasury) : null],
        ['Resolver window', c.params && c.params.resolver_timeout_secs ? Math.round(c.params.resolver_timeout_secs / 86400) + ' days' : null],
        ['Subsidy', c.params && c.params.subsidy_bps != null ? (c.params.subsidy_bps / 100) + '% of every deposit' : null]].filter(function (x) { return x[1] !== null; });
      meta.appendChild(el('dl', { class: 'ld-meta' }, rows.map(function (x) { return el('div', null, [el('dt', { text: x[0] }), el('dd', { text: x[1] })]); })));
    });
  }

  /* ================= /disputes/case/?id=N: the Case file ================= */
  function casePage() {
    var id = new URLSearchParams(location.search).get('id');
    var body = $('gv-body');
    if (!id || !/^(0|[1-9]\d{0,15})$/.test(id)) {
      frame({ back: { href: '/disputes/', text: 'Appeals & Disputes' }, no: 'Case', title: '—' });
      body.appendChild(el('div', { class: 'ld-wrap' }, [R.notice('No case chosen', 'Open a case from the Appeals & Disputes register.', 'wait', el('a', { class: 'ld-link', href: '/disputes/', text: 'Appeals & Disputes' }))]));
      return;
    }
    document.title = 'Case ' + id + ' — Appeals & Disputes — Ludum';
    frame({ back: { href: '/disputes/', text: 'Appeals & Disputes' }, muted: 'Escrow game ' + id, no: 'Case', title: id, dek: 'Reading the escrow on ' + P.chainId + '…' }, { wallet: false });
    var cid = Number(id);
    var expect = { chainGameId: id, contract: P.escrow, chainId: P.chainId };
    var server = window.LudumCase && window.LudumSession ? LudumCase.fetchCase(window.LudumSession, id, expect) : Promise.resolve({ kind: 'no-client' });
    var chain = Promise.all([G.readGame(reader, cid), G.readSeats(reader, cid), G.readAllProposals(reader)]);
    Promise.all([chain.then(function (r) { return { ok: r }; }, function (e) { return { error: e }; }), server]).then(function (both) {
      var c = both[0], outcome = both[1];
      if (c.error) {
        var missing = missingGame(c.error);
        frame({ back: { href: '/disputes/', text: 'Appeals & Disputes' }, no: 'Case', title: id, dek: missing ? 'Escrow ' + R.shortAddress(P.escrow) + ' has no game ' + id + '.' : 'The escrow could not be read.' });
        body.appendChild(el('div', { class: 'ld-wrap', 'data-chain-state': missing ? 'missing' : 'unavailable' }, [missing ? R.notice('No such game', 'Escrow ' + R.shortAddress(P.escrow) + ' has no game #' + id + '.', 'stop') : R.notice('Unavailable', 'The chain could not be read from this browser just now (' + why(c.error) + '). Nothing is shown rather than an old value.', 'stop')]));
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

  function serverNotice(outcome, cross, id, chainRead) {
    var k = outcome && outcome.kind, detail = outcome && outcome.detail ? ' (' + outcome.detail + ')' : '';
    var box = el('div', { class: 'ld-wrap gv-server', 'data-server-state': k || 'none' });
    var say = function (label, text, kind) { box.appendChild(R.notice(label, text, kind)); return box; };
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
    return say('Play’s record', text, '');
  }

  function caseStatusStamp(game, links) {
    var st = window.LudumCase ? LudumCase.caseStatus(game, links) : null;
    if (!st) return R.stamp(stateWord(game.state), '');
    if (st.kind === 'appeal-pending') return R.stamp('Under appeal', 'held');
    if (st.kind === 'disputed') return R.stamp('Disputed', 'held');
    if (st.kind === 'resolved') return R.stamp('Resolved · ' + stateWord(st.resolution), 'closed');
    if (st.kind === 'no-dispute') return R.stamp('No dispute · ' + stateWord(st.state), '');
    return R.stamp('Dispute ended · ' + stateWord(st.state), 'closed');
  }

  function drawCase(body, id, gr, seats, at, links, outcome, cross, rec, names, extra) {
    var game = gr.game, d = game.dispute, dl = gr.deadlines || {}, st = game.settlement;
    var deadline = isoOf(dl.resolver_timeout_at) || (d && game.terms ? G.isoFromSecs(secsOf(d.disputed_at) + Number(game.terms.resolver_timeout_secs)) : null);
    var appeal = liveAppeal(links), lastAppeal = links[0] || null;
    var challengerSeat = d ? game.seats.map(function (s) { return s.wallet; }).indexOf(d.challenger) : -1;
    var heldBase = d && !d.resolution ? (BigInt(String(game.pool)) + BigInt(String(d.bond))).toString() : null;
    var party = (state.who && state.who.signedIn && names) ? names.indexOf(state.who.account.name) : -1;
    var dek = !d ? 'Escrow game ' + id + ' has no dispute (it is ' + stateWord(game.state) + ').' : d.resolution ? 'The dispute was resolved: ' + stateWord(d.resolution) + ' on ' + R.day(isoOf(d.resolved_at)) + '.'
      : seatName(names, challengerSeat) + ' challenged the recorded payout. The pool and the bond are held until the Ludum DAO resolves the case or its resolver window ends.';
    frame({ back: { href: '/disputes/', text: 'Appeals & Disputes' }, muted: 'Escrow game ' + id + ' · ' + stateWord(game.mode) + ' · ' + game.seats.length + ' seats', no: 'Case', title: id, dek: dek,
      meta: [['Status', caseStatusStamp(game, links)], ['Held', heldBase ? jx(heldBase) + ' JUNOX' : '—'], ['Resolver deadline', d && !d.resolution ? when(deadline) : '—']] }, { wallet: false });
    clear(body);
    body.appendChild(el('div', { class: 'ld-wrap gv-chain', 'data-chain-state': 'read' }, [el('p', { class: 'ld-label-s ld-muted' }, ['Chain facts from escrow ', el('span', { class: 'ld-id', title: P.escrow, text: R.shortAddress(P.escrow) }), ' on ' + P.chainId + ', read ' + when(at) + '.'])]));
    if (party >= 0) body.appendChild(el('div', { class: 'ld-wrap' }, [R.notice('You are a party', 'You sat at this table' + (party === challengerSeat ? ' and made the challenge' : '') + '. You can read everything here; the Ludum DAO decides the case.', '')]));

    /* 01 Docket */
    var items = [];
    if (game.created_at) items.push({ at: isoOf(game.created_at), what: 'Table created', line: 'A ' + game.max_players + '-seat ' + stateWord(game.mode) + ' table with a ' + jx(game.ante_gross) + ' JUNOX ante.', by: ['CreateGame'] });
    if (game.started_at) items.push({ at: isoOf(game.started_at), what: 'Started', line: 'Seats and resolver were fixed.', by: ['Start'] });
    var relayed = rec && rec.transactions && rec.transactions.value ? rec.transactions.value.relayed : [];
    var settleTx = relayed.filter(function (t) { return t.op === 'settle'; }).pop();
    if (st) items.push({ at: isoOf(st.accepted_at), what: 'Result recorded', line: 'The settlement was stored and the challenge window opened.', by: [settleTx ? 'Settle · tx ' + R.shortHash(settleTx.txHash) : stateWord(st.source)], aside: R.stamp('Settleable', '') });
    if (d) items.push({ at: isoOf(d.disputed_at), what: 'Challenged', line: seatName(names, challengerSeat) + (challengerSeat >= 0 ? ' (seat ' + challengerSeat + ')' : '') + ' challenged the recorded payout with a ' + jx(d.bond) + ' JUNOX bond.', by: ['Challenge'], aside: R.stamp('Disputed', 'held') });
    links.slice().reverse().forEach(function (l) { items.push({ at: null, what: 'Appeal proposed', line: 'Proposal ' + l.id + ' asks the Ludum DAO to ' + l.outcome + '. ' + G.proposalPhase(l.status).label + '.', by: ['Proposer ' + R.shortAddress(l.proposal.proposer)], link: proposalHref(l.id) }); });
    if (d && d.resolution) items.push({ at: isoOf(d.resolved_at), what: 'Resolved', line: stateWord(d.resolution) + '.', by: ['Resolve'], aside: R.stamp(stateWord(d.resolution), 'closed') });
    var dated = items.filter(function (x) { return x.at; }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    var docket = el('ol', { class: 'ld-docket' }, dated.map(R.docketItem));
    items.filter(function (x) { return !x.at; }).forEach(function (x) {
      docket.appendChild(el('li', { class: 'ld-docket__item' }, [el('p', { class: 'ld-docket__when', style: 'margin:0' }, [el('b', { text: 'On chain' })]), el('span', { class: 'ld-docket__mark', 'aria-hidden': 'true' }),
        el('div', { class: 'ld-docket__main' }, [el('p', { class: 'ld-docket__what' }, [el('a', { href: x.link, text: x.what })]), el('p', { class: 'ld-docket__line', text: x.line }), el('span', { class: 'ld-docket__by', text: x.by[0] })]), el('div', { class: 'ld-docket__aside' })]));
    });
    if (d && !d.resolution) {
      var t = appeal ? G.tallyOf(appeal.proposal) : null, closes = appeal ? G.expirationSecs(appeal.proposal) : null;
      docket.appendChild(el('li', { class: 'ld-docket__item is-now' }, [el('p', { class: 'ld-docket__when', style: 'margin:0' }, [el('b', { text: 'Now' })]), el('span', { class: 'ld-docket__mark', 'aria-hidden': 'true' }),
        el('div', { class: 'ld-docket__main' }, [el('p', { class: 'ld-docket__what', text: appeal ? (appeal.status === 'open' ? 'Voting' : 'Waiting to be executed') : 'Awaiting an appeal' }),
          el('p', { class: 'ld-docket__line', text: t && appeal.status === 'open' ? 'So far ' + Math.round(t.yes) + '% of voting power for, ' + Math.round(t.no) + '% against, ' + Math.round(t.abstain) + '% abstaining.' : appeal ? 'Proposal ' + appeal.id + ' passed.' : 'No live appeal proposal. Only Ludum DAO members can propose.' })]),
        el('div', { class: 'ld-docket__aside' }, [el('span', { class: 'ld-due', text: appeal ? (appeal.status === 'open' ? 'Members can vote' : 'Members can execute') : 'Members can propose' })])]));
      if (closes) docket.appendChild(dueItem(G.isoFromSecs(closes), 'Voting closes', 'If it passes, a wallet the proposal module allows can execute it.', 'Proposal module'));
      if (deadline) docket.appendChild(dueItem(deadline, 'Resolver deadline', 'Unresolved by now, any seat can take the timeout exit: ' + (extra.trusted === true ? 'the recorded payout is paid (its signer key is trusted) and the bond returned.' : extra.trusted === false ? 'the recorded settlement’s signer key is compromised, so the escrow refunds or settles on a trusted checkpoint, and the bond is returned.' : 'the recorded payout is paid if its signer key is trusted, and the bond returned.'), 'The escrow’s resolver window'));
    }
    body.appendChild(section('01', 'k1', 'Docket', 'What has happened, and what is due. All times UTC.', [docket]));

    /* 02 Parties */
    var payouts = extra.preview && extra.preview.payouts ? extra.preview.payouts : null;
    var partyRows = game.seats.map(function (s, i) {
      return el('tr', { class: i === party ? 'is-you' : null }, [
        R.td('Seat', [R.val(String(i))], 'is-num'), R.td('Player', [R.val(seatName(names, i))]),
        R.td('Payout wallet', [R.val(el('span', { class: 'ld-id', title: s.wallet, text: R.shortAddress(s.wallet) }))]),
        R.td('Net deposit · JUNOX', [R.val(jx(s.net_deposit))], 'is-num'),
        R.td('Recorded payout · JUNOX', [R.val(payouts ? jx(payouts[i]) : '—')], 'is-num'),
        R.td('Role', [R.val(i === challengerSeat ? 'Challenger · bond ' + jx(d.bond) : '')])
      ]);
    });
    body.appendChild(section('02', 'k2', 'Parties', null, [R.ledger({ columns: [['Seat', true], ['Player'], ['Payout wallet'], ['Net deposit', true, 'JUNOX'], ['Recorded payout', true, 'JUNOX'], ['Role']], rows: partyRows,
      note: 'Seat numbers are the chain’s (deposit order). Names are Play’s players’ display names, shown only when Play’s record names exactly these wallets. Recorded payouts are the escrow’s own settlement preview.' })]));

    /* 03 The disputed result */
    var left = el('div', { class: 'ld-pj ld-pj--p18 ld-field-panel', 'data-theme': 'press' }, [el('div', { class: 'ld-field-panel__head' }, [el('h3', { class: 'ld-field-panel__name', text: 'The game’s result' }), el('span', { class: 'ld-field-panel__no', text: '$ in game' })])]);
    var term = rec && rec.serverTerminal && rec.serverTerminal.value;
    if (term) {
      var order = term.totalsBySeat.slice().sort(function (a, b) { return b.dollars - a.dollars; });
      left.appendChild(R.ledger({ columns: [['Finish'], ['Player'], ['Net worth', true, '$']], rows: order.map(function (x, n) {
        return el('tr', { class: x.chainSeatIndex === party ? 'is-you' : null }, [R.td('Finish', [R.val(R.ordinal(n + 1))]), R.td('Player', [R.val(seatName(names, x.chainSeatIndex))]), R.td('Net worth · $', [R.val(R.dollars(x.dollars))], 'is-num')]);
      }), note: 'As the server recorded it when the game ended (ended by ' + term.reason + '). The dispute is about the money it set, not the finish.' }));
    } else left.appendChild(R.notice('Play’s record', 'The standings are Play’s record, which is not available here: ' + (rec ? (rec.serverTerminal.reason || 'none') : 'see Evidence') + '.', 'wait'));
    var right = el('div', { class: 'ld-stack' });
    if (st && extra.preview) {
      var w = st.payload.settlement_weights;
      right.appendChild(R.ledger({ title: 'Recorded settlement', unit: 'JUNOX', columns: [['Seat', true], ['Weight', true], ['Payout', true, 'JUNOX']],
        rows: w.map(function (x, i) { return el('tr', { class: i === party ? 'is-you' : null }, [R.td('Seat', [R.val(String(i))], 'is-num'), R.td('Weight', [R.val(String(x))], 'is-num'), R.td('Payout · JUNOX', [R.val(jx(extra.preview.payouts[i]))], 'is-num')]); })
          .concat([el('tr', null, [R.td('Seat', [R.val('Dust')], 'is-num'), R.td('Weight', [R.val('')], 'is-num'), R.td('Payout · JUNOX', [R.val(jx(extra.preview.dust))], 'is-num')])]),
        foot: el('tr', null, [el('td', null, [el('span', { class: 'ld-ledger__total', text: 'Pool' })]), el('td'), el('td', { class: 'is-num', text: jx(extra.preview.pool) })]) }));
    } else right.appendChild(R.notice(st ? 'Unavailable' : 'No settlement', st ? 'The escrow’s settlement preview could not be read just now.' : 'No settlement is stored for this game.', 'wait'));
    if (st) right.appendChild(el('dl', { class: 'ld-facts' }, [el('dt', { text: 'Signed by' }), el('dd', { text: 'Settlement key ' + st.payload.signer_key_id + ' · ' + (extra.trusted === true ? 'trusted' : extra.trusted === false ? 'compromised' : 'trust unavailable') }),
      el('dt', { text: 'Recorded' }), el('dd', { text: when(isoOf(st.accepted_at)) + ' · challenge window to ' + when(isoOf(st.window_end)) })]));
    body.appendChild(section('03', 'k3', 'The disputed result', 'The finish stands either way. What is disputed is the payout the settlement set.', [el('div', { class: 'ld-twocol' }, [left, right])]));

    /* 04 Evidence (+ Play's record, cross-checked) */
    var cp = extra.checkpoints;
    var cpCount = cp && cp.checkpoints ? cp.checkpoints.length : null;
    var verdict = { 'server-log': 'equals the server’s log hash', 'server-board': 'equals the server’s terminal board hash', neither: 'matches neither of the server’s hashes' };
    var ev = [el('dt', { text: 'Evidence hash, on Juno' }), el('dd', null, [d ? R.hashSpan(d.evidence_hash) : '—']),
      el('dt', { text: 'Game log at the result' }), el('dd', null, term ? [term.logLen.toLocaleString('en-US') + ' entries · hash ', R.hashSpan(term.logHash)] : [st ? 'Stored settlement: log length ' + st.payload.log_len + ' · hash ' : '—', st ? R.hashSpan(st.payload.log_hash) : '']),
      el('dt', { text: 'Checkpoints' }), el('dd', { text: cpCount === null ? 'unavailable' : cpCount + (cp.liveness_candidate_seq ? ' · highest trusted sequence ' + Number(cp.liveness_candidate_seq).toLocaleString('en-US') : ' · none trusted') })];
    if (rec && rec.evidenceMatches && rec.evidenceMatches.value) ev.push(el('dt', { text: 'The challenger’s evidence' }), el('dd', { text: verdict[rec.evidenceMatches.value] || rec.evidenceMatches.value }));
    body.appendChild(section('04', 'k4', 'Evidence', 'What the money rests on. Hashes are shortened; each shows in full on hover.', [el('div', { class: 'ld-twocol' }, [el('dl', { class: 'ld-facts' }, ev),
      el('div', { class: 'ld-stack' }, [el('dl', { class: 'ld-facts' }, [el('dt', { text: 'Rules and variants' }), el('dd', null, ['Engine ' + game.rules_engine_version + ' · variants digest ', R.hashSpan(game.variants_digest)]),
        el('dt', { text: 'Roster hash' }), el('dd', null, [game.roster_hash ? R.hashSpan(game.roster_hash) : '—']), el('dt', { text: 'Resolver for this table' }), el('dd', { text: game.resolver === P.daoCore ? 'The Ludum DAO core · fixed at Start' : game.resolver ? R.shortAddress(game.resolver) : '—' })]),
        R.notice('Play holds the rest', 'The log, the checkpoints’ contents and what the evidence hash commits to are Play’s records. They appear here once Play offers a read-only case route.', 'wait')])]), serverNotice(outcome, cross, id, true)]));

    /* 05 What each resolution would do */
    var replaceAppeal = links.filter(function (l) { return l.outcome === 'replace' && (l.status === 'open' || l.status === 'passed'); })[0];
    var decodedReplace = replaceAppeal ? G.decodeResolve(replaceAppeal.proposal) : null;
    var o = G.outcomePreviews(game, { trusted: extra.trusted, replacePayload: decodedReplace ? decodedReplace.payload : null });
    var bondLine = function (back) { return challengerSeat >= 0 ? [seatName(names, challengerSeat) + '’s bond', back ? jx(o.bond) + ' back' : 'to the pool'] : null; };
    var rows = function (split) { var out = (split.amounts || []).map(function (a, i) { return [seatName(names, i), jx(a), i === party]; }); if (split.dust !== undefined) out.push(['Dust to the treasury', jx(split.dust)]); return out; };
    var card = function (title, text, list, alt) {
      return el('div', { class: 'ld-outcome' + (alt ? ' ld-outcome--alt' : '') }, [el('h3', { text: title }), el('p', { text: text }), el('dl', null, list.filter(Boolean).reduce(function (acc, r) { acc.push(el('dt', { class: r[2] ? 'is-you' : null, text: r[0] }), el('dd', { text: r[1] })); return acc; }, []))]);
    };
    var cards = [];
    if (d) {
      cards.push(card('Uphold', 'The recorded settlement stands. The bond joins the pool, which is paid by the same weights.', o.uphold ? rows(o.uphold).concat([bondLine(false)]) : [['Payouts', 'unavailable: no stored settlement']]));
      cards.push(card('Replace', o.replaceable ? 'A corrected settlement replaces the recorded one; the bond goes back to the challenger.' : 'Not possible for this table: a third-strike settlement is upheld or annulled, never replaced.',
        o.replaceable ? (o.replace ? rows(o.replace) : [['Payouts', 'by the corrected weights']]).concat([bondLine(true)]) : []));
      cards.push(card('Annul', 'Every seat’s net deposit is refunded and the bond goes back. Nobody is paid by result.', rows(o.annul).concat([bondLine(true)])));
      cards.push(card('Timeout', deadline ? 'Unresolved on ' + R.day(deadline) + ' at ' + R.clock(deadline) + ': a seat can take the exit. ' + (o.trusted === true ? 'The recorded payout is paid, its signer key being trusted, and the bond returned.' : o.trusted === false ? 'Its signer key is compromised: the escrow refunds or settles on a trusted checkpoint, and returns the bond.' : 'If its signer key is trusted the recorded payout is paid; the bond is returned.') : 'The resolver deadline is unavailable.',
        o.timeout ? rows(o.timeout).concat([bondLine(true)]) : [bondLine(true)], true));
    }
    body.appendChild(section('05', 'k5', 'What each resolution would do', 'In JUNOX, for this table. Computed from the escrow’s rules and the recorded weights.', [d ? el('div', { class: 'ld-outcomes' }, cards) : R.notice('No dispute', 'This game has no dispute record, so no resolution applies.', 'wait')]));

    /* 06 The appeal */
    var shown = appeal || lastAppeal;
    var appealBody = [];
    if (shown) {
      var closesAt = G.expirationSecs(shown.proposal);
      appealBody.push(tally(shown.proposal, shown.status === 'open'));
    } else if (d && !d.resolution) {
      var guard = G.deadlineGuard(secsOf(dl.resolver_timeout_at), Math.floor(Date.now() / 1000), state.pins && state.pins.singleConfig && state.pins.singleConfig.max_voting_period ? state.pins.singleConfig.max_voting_period.time : P.maxVotingPeriodSecs);
      appealBody.push(R.notice('No appeal yet', guard.ok ? 'Nothing creates a DAO proposal automatically. A Ludum DAO member submits one with their own wallet.' : 'Deadline guard: ' + guard.reason, guard.ok ? 'due' : 'stop', guard.ok ? linkBtn('Create appeal', newHref(id), true) : null));
    } else appealBody.push(R.notice('No appeal', 'No proposal resolves this game.', 'wait'));
    body.appendChild(section('06', 'k6', 'The appeal', shown ? 'Proposal ' + shown.id + ' · ' + G.OUTCOMES[shown.outcome] + ' · ' + G.proposalPhase(shown.status).label + (closesAt ? (shown.status === 'open' ? ' until ' : ' · voting ended ') + when(G.isoFromSecs(closesAt)) : '') + '.' : null, appealBody,
      shown ? el('a', { class: 'ld-link', href: proposalHref(shown.id) }, ['Open Proposal ' + shown.id, R.icon('arrow-right')]) : null));
  }
  function dueItem(iso, what, line, by) {
    return el('li', { class: 'ld-docket__item is-due' }, [el('p', { class: 'ld-docket__when', style: 'margin:0' }, [el('b', { text: R.day(iso) }), R.clock(iso)]), el('span', { class: 'ld-docket__mark', 'aria-hidden': 'true' }),
      el('div', { class: 'ld-docket__main' }, [el('p', { class: 'ld-docket__what', text: what }), line ? el('p', { class: 'ld-docket__line', text: line }) : null, el('span', { class: 'ld-docket__by', text: by })]), el('div', { class: 'ld-docket__aside' })]);
  }

  /** The VoteTally: Yes / No / Abstain as shares of the proposal's total power, turnout against the quorum. */
  function tally(proposal, live) {
    var t = G.tallyOf(proposal);
    if (!t) return R.notice('Unavailable', 'The proposal’s count could not be read.', 'wait');
    var row = function (name, pct, cls, mark, unit) {
      return el('div', { class: 'ld-tally__row' + (cls === 'turnout' ? ' ld-tally__turnout' : '') }, [el('span', { class: 'ld-tally__name', text: name }),
        el('div', { class: 'ld-tally__bar', role: 'img', 'aria-label': name + ' ' + pct.toFixed(1) + '%' }, [el('span', { class: 'ld-tally__fill' + (cls === 'no' ? ' ld-tally__fill--no' : cls === 'abstain' ? ' ld-tally__fill--abstain' : ''), style: 'width:' + Math.min(100, pct) + '%' }),
          mark ? el('span', { class: 'ld-tally__mark', style: 'left:' + mark.at + '%' }, [el('span', { text: mark.label })]) : null]),
        el('span', { class: 'ld-tally__fig' }, [pct.toFixed(1) + '%', el('small', { text: unit })])]);
    };
    var quorumMark = t.quorum ? { at: t.quorum.percent, label: 'Quorum ' + t.quorum.percent + '%' } : null;
    return el('div', { class: 'ld-stack' }, [el('div', { class: 'ld-tally' }, [row('Yes', t.yes, 'yes', null, 'of voting power'), row('No', t.no, 'no', null, 'of voting power'), row('Abstain', t.abstain, 'abstain', null, 'of voting power'), row('Turnout', t.turnout, 'turnout', quorumMark, 'of all voting power')]),
      el('p', { class: 'ld-tally__src', text: (live ? 'So far, read' : 'Final count, read') + ' from the proposal module. To pass: ' + (t.threshold ? t.threshold.text : 'the module’s threshold') + (t.quorum ? ', with a quorum of ' + t.quorum.text : '') + '. Ludum never sets these.' })]);
  }

  /* ================= /governance/new/?case=N: New appeal ================= */
  function newPage() {
    var pre = new URLSearchParams(location.search).get('case');
    var form = { id: pre && /^(0|[1-9]\d{0,15})$/.test(pre) ? pre : null, outcome: null, title: null, titleEdited: false, rationale: '', read: false, voteYes: false, weights: null };
    frame({ back: { href: '/disputes/', text: 'Appeals & Disputes' }, muted: 'New appeal proposal', title: 'New appeal', dek: 'Write the Ludum DAO’s appeal for one disputed table. You submit it with your own wallet; it carries one message, the escrow’s Resolve.' }, { wallet: true });
    var body = $('gv-body');
    var host = el('div', null, [el('p', { class: 'ld-body-s', role: 'status', text: 'Reading the disputed games on ' + P.chainId + '…' })]);
    body.appendChild(el('section', { class: 'ld-section ld-section--rec', 'aria-label': 'New appeal proposal' }, [el('div', { class: 'ld-wrap' }, [host])]));
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
      var gr = data.game && !data.game.error ? data.game : null, game = gr ? gr.game : null, d = game ? game.dispute : null, dl = gr ? gr.deadlines || {} : {};
      var names = data.server && data.server.names;
      var challengerSeat = d ? game.seats.map(function (s) { return s.wallet; }).indexOf(d.challenger) : -1;
      var links = form.id !== null ? data.links[form.id] || [] : [];
      var steps = el('ol', { class: 'ld-steps' });
      var step = function (no, title, content) { steps.appendChild(el('li', null, [el('span', { class: 'ld-steps__no', text: no }), el('div', null, [el('h2', { class: 'ld-steps__title', text: title })].concat(content))])); };

      /* 01 The case */
      var select = el('select', { class: 'ld-select', id: 'nw-case' });
      if (!data.games.length) select.appendChild(el('option', { value: '', text: 'No disputed table on ' + P.chainId }));
      data.games.forEach(function (g) {
        var id = String(g.chain_game_id), live = liveAppeal(data.links[id]);
        var opt = el('option', { value: id, text: id + ' · escrow game · ' + stateWord(g.mode) + ' · ' + g.seats_filled + ' seats' + (live ? ' (has Proposal ' + live.id + ')' : '') });
        if (id === form.id) opt.setAttribute('selected', '');
        select.appendChild(opt);
      });
      select.addEventListener('change', function () { form.id = select.value || null; form.outcome = null; form.weights = null; if (!form.titleEdited) form.title = null; loadGame(); });
      var caseSide = el('div', { class: 'ld-stack' });
      if (data.game && data.game.error) caseSide.appendChild(R.notice('Unavailable', 'Game ' + form.id + ' could not be read (' + why(data.game.error) + ').', 'stop'));
      else if (game) {
        caseSide.appendChild(el('dl', { class: 'ld-meta' }, [['Bond', d ? jx(d.bond) + ' JUNOX' : '—'], ['Pool held', jx(game.pool) + ' JUNOX'], ['Resolver deadline', when(isoOf(dl.resolver_timeout_at))]].map(function (m) { return el('div', null, [el('dt', { text: m[0] }), el('dd', { text: m[1] })]); })));
        caseSide.appendChild(R.notice(game.state === 'disputed' ? 'Still disputed' : 'Not disputed', 'Read from the escrow at ' + R.clock(data.at) + ': game ' + form.id + ' is ' + stateWord(game.state) + (d ? '; challenged by ' + seatName(names, challengerSeat) + (challengerSeat >= 0 ? ' (seat ' + challengerSeat + ')' : '') : '') + '.', game.state === 'disputed' ? '' : 'stop', el('a', { class: 'ld-link', href: caseHref(form.id) }, ['Open the case file', R.icon('arrow-right')])));
      }
      step('01', 'The case', [el('div', { class: 'ld-twocol' }, [el('div', { class: 'ld-field' }, [el('label', { class: 'ld-field__label', for: 'nw-case', text: 'Case' }), el('p', { class: 'ld-field__hint', text: 'Only disputed tables are listed. A table with an open or passed proposal says so.' }), select]), caseSide])]);

      /* 02 The outcome */
      var o = game ? G.outcomePreviews(game, {}) : null;
      var serverOk = data.server && data.server.kind === 'ok' && data.server.record && data.server.record.serverTerminal.value;
      var replaceWhy = !game ? 'choose a case' : !o.replaceable ? 'a third-strike settlement is upheld or annulled, never replaced' : !serverOk ? 'it needs Play’s terminal record for this table, agreeing with the chain' : null;
      var lines = {
        uphold: game && d ? 'The recorded settlement stands; ' + seatName(names, challengerSeat) + '’s ' + jx(d.bond) + ' bond joins the pool, paid by the recorded weights.' : 'The recorded settlement stands.',
        replace: replaceWhy ? 'Not available here: ' + replaceWhy + '.' : 'A corrected settlement (reason ResolverCorrection), prefilled from Play’s terminal record; the bond goes back. Check the weights below.',
        annul: game ? 'Each of the ' + game.seats.length + ' seats gets its net deposit back (' + game.seats.map(function (s) { return jx(s.net_deposit); }).join(', ') + '); the bond goes back.' : 'Every net deposit is refunded.'
      };
      var choices = el('fieldset', { class: 'ld-choices' }, [el('legend', { class: 'ld-sr', text: 'Outcome' })].concat(['uphold', 'replace', 'annul'].map(function (k) {
        var off = !game || (k === 'replace' && replaceWhy !== null);
        var input = el('input', { type: 'radio', name: 'nw-o', value: k });
        if (off) input.setAttribute('disabled', '');
        if (form.outcome === k) input.setAttribute('checked', '');
        input.addEventListener('change', function () { form.outcome = k; if (!form.titleEdited) form.title = null; draw(); });
        return el('label', { class: 'ld-choice' + (off ? ' is-disabled' : '') + (form.outcome === k ? ' is-checked' : '') }, [input, el('span', { class: 'ld-choice__box', 'aria-hidden': 'true' }), el('span', { class: 'ld-choice__name', text: G.OUTCOMES[k] }), el('span', { class: 'ld-choice__line', text: lines[k] })]);
      })));
      var outcomeExtra = el('div', { class: 'ld-stack' });
      var payload = null, payloadProblem = null;
      if (form.outcome === 'replace' && !replaceWhy) {
        var tv = data.server.record.serverTerminal.value;
        var weights = form.weights || tv.totalsBySeat.map(function (x) { return String(Math.max(0, x.dollars)); });
        try {
          payload = G.replacePayload({ domain: game.domain, logLen: tv.logLen, logHash: tv.logHash, appraisalStateHash: tv.appraisalStateHash, weights: weights, seatCount: game.seats.length, floorSeq: data.floor,
            settlementSource: game.settlement ? game.settlement.source : null, signerKeyId: game.settlement && game.settlement.payload ? game.settlement.payload.signer_key_id : 0, issuedAtSecs: Math.floor(Date.now() / 1000) });
        } catch (e) { payloadProblem = why(e); }
        var grid = el('div', { class: 'gv-weights', role: 'group', 'aria-label': 'Corrected weights by seat' });
        weights.forEach(function (w, n) {
          var inp = el('input', { class: 'ld-input', type: 'text', inputmode: 'numeric', id: 'nw-w' + n, value: w });
          inp.addEventListener('change', function () { var next = weights.slice(); next[n] = inp.value.trim(); form.weights = next; draw(); });
          grid.appendChild(el('div', { class: 'ld-field' }, [el('label', { class: 'ld-field__label', for: 'nw-w' + n, text: 'Seat ' + n + ' · ' + seatName(names, n) }), inp]));
        });
        outcomeExtra.appendChild(el('p', { class: 'ld-field__hint', text: 'A seat’s share is its weight ÷ the total. They start as Play’s final net worth by seat; change them only to correct the result.' }));
        outcomeExtra.appendChild(grid);
        if (payloadProblem) outcomeExtra.appendChild(R.notice('Refused', 'This payload would be refused: ' + payloadProblem + '.', 'stop'));
      }
      step('02', 'The outcome', [choices, outcomeExtra]);

      /* 03 Title and rationale */
      var defTitle = form.id !== null && form.outcome ? 'Appeal ' + form.id + ': ' + form.outcome : '';
      var titleVal = form.titleEdited ? form.title : defTitle;
      var titleIn = el('input', { class: 'ld-input', id: 'nw-t', value: titleVal || '', maxlength: String(G.TITLE_MAX) });
      var titleCount = el('span', { text: (titleVal || '').length + ' characters' });
      titleIn.addEventListener('input', function () { form.title = titleIn.value; form.titleEdited = true; titleCount.textContent = titleIn.value.length + ' characters'; });
      titleIn.addEventListener('change', function () { draw(); });
      var rat = el('textarea', { class: 'ld-textarea', id: 'nw-r', maxlength: String(G.RATIONALE_MAX) });
      rat.textContent = form.rationale;
      var ratCount = el('span', { text: form.rationale.length + ' characters' });
      rat.addEventListener('input', function () { form.rationale = rat.value; ratCount.textContent = rat.value.length + ' characters'; });
      rat.addEventListener('change', function () { draw(); });
      step('03', 'Title and rationale', [el('div', { class: 'ld-form' }, [el('div', { class: 'ld-field' }, [el('label', { class: 'ld-field__label', for: 'nw-t', text: 'Title' }), titleIn, el('div', { class: 'ld-field__foot' }, [el('span', { text: 'Shown in the proposal list' }), titleCount])]),
        el('div', { class: 'ld-field' }, [el('label', { class: 'ld-field__label', for: 'nw-r', text: 'Rationale' }), el('p', { class: 'ld-field__hint', text: 'Published on chain with the proposal, followed by the case facts this page reads from the chain. Name the evidence you relied on.' }), rat, el('div', { class: 'ld-field__foot' }, [el('span', { text: 'Plain text' }), ratCount])])])]);

      /* 04 The message -- exactly what the DAO core will send */
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
      step('04', 'The message', [el('div', { class: 'ld-twocol ld-twocol--wide' }, [code(resolveMsg ? { wasm: { execute: { contract_addr: P.escrow, msg: resolveMsg, funds: [] } } } : 'Choose a case and an outcome.'),
        el('dl', { class: 'ld-facts' }, [el('dt', { text: 'Sent by' }), el('dd', { text: 'The Ludum DAO core, when the proposal passes and is executed' }), el('dt', { text: 'Allowed because' }),
          el('dd', { text: game ? (game.resolver === P.daoCore ? 'The core is this game’s resolver, fixed at Start' : 'Not allowed: this game’s resolver is not the Ludum DAO core') : '—' }), el('dt', { text: 'Moves' }), el('dd', { text: 'No funds of yours; the escrow pays or refunds the seats' })])]),
        specProblem ? R.notice('Refused', specProblem + '.', 'stop') : null]);

      /* 05 Timing */
      var mvp = state.pins && state.pins.singleConfig && state.pins.singleConfig.max_voting_period ? state.pins.singleConfig.max_voting_period.time : null;
      var now = Math.floor(Date.now() / 1000), deadlineSecs = secsOf(dl.resolver_timeout_at);
      var guard = G.deadlineGuard(deadlineSecs, now, mvp == null ? P.maxVotingPeriodSecs : mvp);
      var voteEnd = mvp != null ? now + mvp : null, execLeft = voteEnd != null && deadlineSecs != null ? deadlineSecs - voteEnd : null;
      var deposit = data.preCfg === undefined ? 'unavailable' : data.preCfg && data.preCfg.deposit_info ? JSON.stringify(data.preCfg.deposit_info) : 'None';
      step('05', 'Timing', [R.ledger({ columns: [['Step'], ['From the chain'], ['Ends'], ['']], rows: [
        el('tr', null, [R.td('Step', [R.val('Voting period')]), R.td('From the chain', [R.val(mvp != null ? 'The proposal module’s setting · ' + G.fmtDuration(mvp) : 'unavailable')]), R.td('Ends', [R.val(voteEnd != null ? R.day(G.isoFromSecs(now)) + ' → ' + R.day(G.isoFromSecs(voteEnd)) : '—')]), R.td('', [R.val('')])]),
        el('tr', null, [R.td('Step', [R.val('Resolver deadline')]), R.td('From the chain', [R.val('The escrow’s resolver window after the challenge')]), R.td('Ends', [R.val(when(G.isoFromSecs(deadlineSecs)))]), R.td('', [R.val('')])]),
        el('tr', null, [R.td('Step', [R.val('Left to execute')]), R.td('From the chain', [R.val('After voting closes')]), R.td('Ends', [R.val(execLeft != null ? G.fmtDuration(Math.max(0, execLeft)) : '—')]), R.td('', [R.val(game ? R.stamp(guard.ok ? 'Enough' : 'Not enough', guard.ok ? 'closed' : 'failed') : '')])]),
        el('tr', null, [R.td('Step', [R.val('Deposit')]), R.td('From the chain', [R.val('The pre-propose module’s setting')]), R.td('Ends', [R.val(deposit)]), R.td('', [R.val('')])])
      ], note: guard.ok ? 'If voting would end too close to the resolver deadline, Ludum says so here and offers no proposal.' : 'Deadline guard: ' + guard.reason })]);

      /* 06 Submit */
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
      var submit = btn('Sign and submit with Keplr', function () { txPanel(txHost, spec, 'Create appeal proposal', function () { setTimeout(function () { location.assign('/disputes/'); }, 4000); }); }, { large: true, disabled: reasons.length > 0, title: reasons.length ? 'Not yet: ' + reasons.join('; ') : null });
      step('06', 'Submit', [el('div', { class: 'ld-stack gv-submit' }, [
        el('label', { class: 'ld-check', for: 'nw-read' }, [readBox, el('span', { text: 'I have read the case file and the evidence it links to.' })]),
        el('label', { class: 'ld-check', for: 'nw-yes' }, [yesBox, el('span', { text: 'Also vote yes in the same transaction (with today’s single member, the proposal then passes at once).' })]),
        el('div', null, [submit]),
        reasons.length ? el('p', { class: 'ld-field__hint', role: 'status', text: 'Not yet: ' + reasons.join('; ') + '.' }) : null,
        txHost,
        R.notice('Your wallet, your proposal', 'You sign with your own wallet' + (state.wallet ? ' (' + R.shortAddress(state.wallet.address) + ')' : '') + '. Ludum’s relayer is never a DAO member and never submits a proposal.', '')])]);
      host.appendChild(el('div', { class: 'ld-form' }, [steps]));
      if (links.length) host.insertBefore(R.notice('This case has proposals', links.map(function (l) { return 'Proposal ' + l.id + ' (' + l.outcome + ', ' + G.proposalPhase(l.status).label + ')'; }).join('; ') + '.', 'wait'), host.firstChild);
    }
  }

  /* ================= /governance/proposal/?id=N ================= */
  function proposalPage() {
    var pid = new URLSearchParams(location.search).get('id');
    var body = $('gv-body');
    if (!pid || !/^[1-9]\d{0,15}$/.test(pid)) {
      frame({ back: { href: '/disputes/', text: 'Appeals & Disputes' }, title: 'Proposal' });
      body.appendChild(el('div', { class: 'ld-wrap' }, [R.notice('No proposal chosen', 'Open a proposal from the Appeals & Disputes register.', 'wait', el('a', { class: 'ld-link', href: '/disputes/', text: 'Appeals & Disputes' }))]));
      return;
    }
    frame({ back: { href: '/disputes/', text: 'Appeals & Disputes' }, muted: 'Proposal ' + pid, title: 'Proposal ' + pid, dek: 'Reading the proposal module…' });
    Promise.all([G.readProposal(reader, pid), G.readVotes(reader, pid)]).then(function (r) {
      var p = r[0].data.proposal, votes = r[1].votes, at = r[0].observedAt, d = G.decodeResolve(p);
      var extra = { game: null, txs: null };
      var waits = [G.readTxs(reader, G.proposalTxQuery(pid)).then(function (t) { extra.txs = t; }, function () { extra.txs = null; })];
      if (d) waits.push(G.readGame(reader, d.chainGameId).then(function (g) { extra.game = g.data; }, function () {}));
      return Promise.all(waits).then(function () { drawProposal(body, pid, p, votes, at, d, extra); });
    }).catch(function (e) {
      frame({ back: { href: '/disputes/', text: 'Appeals & Disputes' }, title: 'Proposal ' + pid });
      var gone = missing(e);
      body.appendChild(el('div', { class: 'ld-wrap' }, [gone ? R.notice('No such proposal', 'The proposal module has no proposal ' + pid + '.', 'stop') : R.notice('Unavailable', 'The proposal could not be read from the chain (' + why(e) + ').', 'stop')]));
    });
  }

  function drawProposal(body, pid, p, votes, at, d, extra) {
    var ph = G.proposalPhase(p.status), exp = G.expirationSecs(p), t = G.tallyOf(p);
    var game = extra.game ? extra.game.game : null, dl = extra.game ? extra.game.deadlines || {} : {};
    document.title = 'Proposal ' + pid + ' — Ludum';
    var mineVote = function () { return state.wallet ? votes.filter(function (v) { return v.voter === state.wallet.address; })[0] || null : null; };
    function head() {
      frame({ back: { href: '/disputes/', text: 'Appeals & Disputes' }, muted: 'Proposal ' + pid + (d ? ' · Appeal' : ''), no: 'Proposal ' + pid, title: p.title, titleClass: 'ld-rechead__title--m',
        dek: d ? 'Asks the Ludum DAO to ' + d.outcome + ' game ' + d.chainGameId + (game && game.dispute ? ', challenged on ' + R.day(isoOf(game.dispute.disputed_at)) : '') + '.' : 'A Ludum DAO proposal that is not an appeal.' },
        { wallet: true, walletMeta: [['Status', R.stamp(ph.label, ph.stamp)], ['Case', d ? el('a', { class: 'ld-inline', href: caseHref(d.chainGameId), text: d.chainGameId }) : '—'], ['Voting', exp ? (ph.phase === 'open' ? 'Closes ' : 'Closed ') + when(G.isoFromSecs(exp)) : '—']] });
    }
    head();
    clear(body);

    /* 01 The vote */
    var voteHost = el('div', { class: 'ld-stack' });
    function drawVote() {
      clear(voteHost);
      voteHost.appendChild(tally(p, ph.phase === 'open'));
      if (ph.phase !== 'open') return;
      var g = state.governor, mine = mineVote();
      var allowed = actionsAllowed() && state.wallet && g && !g.error && g.member;
      var noticeText = !actionsAllowed() ? (state.framed ? 'Actions are off while framed.' : 'Actions are off until the DAO pins are verified.') : !state.wallet ? 'Connect a Keplr wallet that is a Ludum DAO member to vote.' : !g ? 'Reading the wallet’s membership…' : g.error ? 'The wallet’s membership could not be read.' : !g.member ? 'The connected wallet is not a Ludum DAO member.' : mine ? 'This wallet voted ' + mine.vote + '. ' + (p.allow_revoting ? 'The module allows changing it while voting is open.' : 'The module does not allow revoting.') : 'Voting closes ' + (exp ? R.day(G.isoFromSecs(exp)) + ' at ' + R.clock(G.isoFromSecs(exp)) : '—') + '. Your voting power is the voting module’s figure for this proposal.';
      voteHost.appendChild(R.notice(allowed && !mine ? 'Your vote is open' : 'Voting', noticeText, allowed && !mine ? 'due' : 'wait'));
      if (!allowed || (mine && !p.allow_revoting)) return;
      var choice = { v: null }, txHost = el('div');
      var lines = { yes: d ? G.OUTCOMES[d.outcome] + ' for game ' + d.chainGameId + '.' : 'For the proposal.', no: d ? 'Reject the proposal; the case stays Disputed.' : 'Against the proposal.', abstain: 'Neither for nor against; the module decides how it counts.' };
      var fs = el('fieldset', { class: 'ld-choices ld-choices--row', style: '--n:3' }, [el('legend', { text: 'Your vote · ' + (mine ? 'this wallet voted ' + mine.vote : 'this wallet has not voted') })].concat(['yes', 'no', 'abstain'].map(function (k) {
        var input = el('input', { type: 'radio', name: 'q-v', value: k });
        input.addEventListener('change', function () { choice.v = k; });
        return el('label', { class: 'ld-choice' }, [input, el('span', { class: 'ld-choice__box', 'aria-hidden': 'true' }), el('span', { class: 'ld-choice__name', text: k.charAt(0).toUpperCase() + k.slice(1) }), el('span', { class: 'ld-choice__line', text: lines[k] })]);
      })));
      var rationale = el('input', { class: 'ld-input', id: 'q-why', maxlength: '280', placeholder: 'Optional rationale, published with your vote' });
      voteHost.appendChild(el('form', { class: 'ld-stack' }, [fs, el('div', { class: 'ld-field' }, [el('label', { class: 'ld-field__label', for: 'q-why', text: 'Rationale (optional)' }), rationale]),
        el('div', null, [btn('Vote with Keplr', function () { if (!choice.v) { txHost.textContent = 'Choose Yes, No or Abstain first.'; return; } txPanel(txHost, G.buildVote(pid, choice.v, rationale.value), 'Vote ' + choice.v + ' on proposal ' + pid, reloadSoon); }, { large: true })]), txHost]));
    }
    drawVote(); onChange(drawVote);
    var votesLedger = votes.length ? R.ledger({ title: 'Votes', unit: 'Read ' + R.clock(at), columns: [['Voter'], ['Vote'], ['Power', true], ['Rationale']], rows: votes.map(function (v) {
      return el('tr', null, [R.td('Voter', [R.val(el('span', { class: 'ld-id', title: v.voter, text: R.shortAddress(v.voter) }))]), R.td('Vote', [R.val(v.vote)]), R.td('Power', [R.val(String(v.power))], 'is-num'), R.td('Rationale', [R.val(v.rationale || '')])]);
    }) }) : el('p', { class: 'ld-body-s', text: 'No votes yet. Read ' + R.clock(at) + '.' });
    body.appendChild(section('01', 'q1', 'The vote', 'Read from the proposal module.', [voteHost, el('details', { class: 'ld-disclose' }, [el('summary', null, [el('span', { text: votes.length + ' vote' + (votes.length === 1 ? '' : 's') })]), el('div', { class: 'ld-disclose__body' }, [votesLedger])])]));

    /* 02 What it does */
    var msgs = (p.msgs || []).map(function (m) { var ex = m && m.wasm && m.wasm.execute, b = null; if (ex && typeof ex.msg === 'string') { try { b = JSON.parse(G.b64ToUtf8(ex.msg)); } catch (e) { b = '(undecodable)'; } } return ex ? { wasm: { execute: { contract_addr: ex.contract_addr, msg: b, funds: ex.funds } } } : m; });
    body.appendChild(section('02', 'q2', 'What it does', (p.msgs || []).length === 1 ? 'One message, executed by the Ludum DAO core.' : (p.msgs || []).length + ' messages, executed by the Ludum DAO core.', [el('div', { class: 'ld-twocol ld-twocol--wide' }, [code(msgs.length === 1 ? msgs[0] : msgs),
      el('dl', { class: 'ld-facts' }, [el('dt', { text: 'Outcome' }), el('dd', { text: d ? G.OUTCOMES[d.outcome] : 'Not an appeal' }), el('dt', { text: 'Proposer' }), el('dd', null, [el('span', { class: 'ld-id', title: p.proposer, text: R.shortAddress(p.proposer) })]),
        el('dt', { text: 'Rationale' }), el('dd', { class: 'gv-prewrap', text: p.description })])])], d ? el('a', { class: 'ld-link', href: caseHref(d.chainGameId) }, ['Case file ' + d.chainGameId, R.icon('arrow-right')]) : null));

    /* 03 Execution */
    var execHost = el('div');
    var txs = extra.txs || [];
    var byAction = function (a) { return txs.filter(function (x) { return G.proposalActionOf(x, pid) === a; }); };
    var execTx = byAction('execute').pop() || null, proposeTx = byAction('propose')[0] || null, closeTx = byAction('close').pop() || null;
    function drawExec() {
      clear(execHost);
      var g = state.governor, member = state.wallet && g && !g.error && g.member && actionsAllowed();
      if (ph.phase === 'open') { execHost.appendChild(R.notice('Not yet', 'Voting ' + (exp ? 'closes ' + when(G.isoFromSecs(exp)) : 'is open') + '. If the proposal passes, a wallet the proposal module allows can execute it; the DAO core then sends its message.', 'wait')); return; }
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
        execHost.appendChild(el('div', { class: 'ld-twocol ld-twocol--wide' }, [el('div', { class: 'ld-stack' }, [
          R.notice(why2 ? 'Passed' : 'Ready to execute', 'Proposal ' + pid + ' passed. ' + (why2 ? 'To execute it here: ' + why2 + '.' : 'This wallet may execute it.'), why2 ? 'wait' : 'due'),
          checks.length ? R.ledger({ columns: [['Check'], ['Read now'], ['']], rows: checks.map(function (c) { return el('tr', null, [R.td('Check', [R.val(c[0])]), R.td('Read now', [R.val(c[1])]), R.td('', [R.val(R.stamp(c[2] ? 'Yes' : 'No', c[2] ? 'closed' : 'failed'))])]); }), note: 'Checked against the chain when this page was read. If any fails, execution would fail too.' }) : null,
          el('div', null, [btn('Execute with Keplr', function () { txPanel(txHost, G.buildExecute(pid), 'Execute proposal ' + pid, reloadSoon); }, { large: true, disabled: !!why2, title: why2 })]), txHost]),
          R.notice('After you sign', 'Ludum waits for a block to include the transaction, then shows it. It never reports success before the chain does.', 'wait')]));
        return;
      }
      if (p.status === 'rejected') {
        var txHost2 = el('div');
        execHost.appendChild(el('div', { class: 'ld-stack' }, [R.notice('Rejected', 'The proposal did not pass. Anyone may close it, which returns any deposit as the module’s rules say.', 'wait'),
          el('div', null, [btn('Close with Keplr', function () { txPanel(txHost2, G.buildClose(pid), 'Close proposal ' + pid, reloadSoon); }, { secondary: true, disabled: !actionsAllowed() || !state.wallet, title: !state.wallet ? 'connect a Keplr wallet' : null })]), txHost2]));
        return;
      }
      var failed = p.status === 'execution_failed';
      var label = p.status === 'executed' ? 'Executed' : failed ? 'Execution failed' : G.proposalPhase(p.status).label;
      var text = p.status === 'executed' ? 'The DAO core sent the proposal’s message' + (game && game.dispute && game.dispute.resolution ? '; game ' + d.chainGameId + ' is now resolved (' + stateWord(game.dispute.resolution) + ').' : '.') : failed ? 'The DAO core’s message was refused' + (game ? '; game ' + d.chainGameId + ' is ' + stateWord(game.state) + ' now.' : '.') + ' The proposal module records this proposal as Execution failed; Ludum does not retry it.' : 'The proposal is ' + label.toLowerCase() + '.';
      var receiptTx = execTx || closeTx;
      execHost.appendChild(el('div', { class: 'ld-twocol ld-twocol--wide' }, [el('div', { class: 'ld-stack' }, [R.notice(label, text, failed ? 'stop' : '')]), receiptTx ? receipt(receiptTx, failed, execTx ? 'Execution' : 'Close') : R.notice('Receipt', extra.txs === null ? 'The chain’s transaction index could not be read.' : 'The chain’s transaction index holds no execution for this proposal.', 'wait')]));
    }
    drawExec(); onChange(drawExec);
    body.appendChild(section('03', 'q3', 'Execution', null, [execHost]));

    /* 04 Record */
    var items = [];
    if (proposeTx) items.push({ at: proposeTx.timestamp, what: 'Submitted', line: 'By ' + R.shortAddress(p.proposer) + '.', by: ['tx ' + R.shortHash(proposeTx.txhash)] });
    byAction('vote').forEach(function () {});
    if (execTx) items.push({ at: execTx.timestamp, what: failed() ? 'Execution failed' : 'Executed', line: failed() ? 'The escrow refused the message.' : 'The DAO core sent the message.', by: ['tx ' + R.shortHash(execTx.txhash)], aside: R.stamp(failed() ? 'Execution failed' : 'Executed', failed() ? 'failed' : 'closed') });
    if (closeTx) items.push({ at: closeTx.timestamp, what: 'Closed', line: '', by: ['tx ' + R.shortHash(closeTx.txhash)] });
    function failed() { return p.status === 'execution_failed'; }
    var docket = el('ol', { class: 'ld-docket' }, items.filter(function (x) { return x.at; }).map(R.docketItem));
    if (!proposeTx) docket.appendChild(el('li', { class: 'ld-docket__item' }, [el('p', { class: 'ld-docket__when', style: 'margin:0' }, [el('b', { text: 'On chain' })]), el('span', { class: 'ld-docket__mark', 'aria-hidden': 'true' }), el('div', { class: 'ld-docket__main' }, [el('p', { class: 'ld-docket__what', text: 'Submitted' }), el('p', { class: 'ld-docket__line', text: 'By ' + R.shortAddress(p.proposer) + (p.start_height ? ' at height ' + p.start_height : '') + '.' })]), el('div', { class: 'ld-docket__aside' })]));
    if (ph.phase === 'open') {
      docket.appendChild(el('li', { class: 'ld-docket__item is-now' }, [el('p', { class: 'ld-docket__when', style: 'margin:0' }, [el('b', { text: 'Now' })]), el('span', { class: 'ld-docket__mark', 'aria-hidden': 'true' }), el('div', { class: 'ld-docket__main' }, [el('p', { class: 'ld-docket__what', text: 'Voting' }), el('p', { class: 'ld-docket__line', text: votes.length + ' vote' + (votes.length === 1 ? '' : 's') + ' so far.' })]), el('div', { class: 'ld-docket__aside' })]));
      if (exp) docket.appendChild(dueItem(G.isoFromSecs(exp), 'Voting closes', null, 'Proposal module'));
    } else if (p.status === 'passed') {
      docket.appendChild(el('li', { class: 'ld-docket__item is-now' }, [el('p', { class: 'ld-docket__when', style: 'margin:0' }, [el('b', { text: 'Now' })]), el('span', { class: 'ld-docket__mark', 'aria-hidden': 'true' }), el('div', { class: 'ld-docket__main' }, [el('p', { class: 'ld-docket__what', text: 'Waiting to be executed' })]), el('div', { class: 'ld-docket__aside' }, [el('span', { class: 'ld-due', text: 'Ready to execute' })])]));
    }
    if (d && game && game.state === 'disputed' && dl.resolver_timeout_at) docket.appendChild(dueItem(isoOf(dl.resolver_timeout_at), 'Resolver deadline for game ' + d.chainGameId, ph.phase === 'open' ? 'The last moment execution can still resolve the case.' : 'After this, a seat can take the timeout exit instead.', 'The escrow’s resolver window'));
    body.appendChild(section('04', 'q4', 'Record', extra.txs === null ? 'The chain’s transaction index could not be read; only the proposal module’s own facts are shown.' : null, [docket]));
  }
  function receipt(tx, failed, title) {
    var fee = tx.tx && tx.tx.auth_info && tx.tx.auth_info.fee && tx.tx.auth_info.fee.amount ? tx.tx.auth_info.fee.amount.filter(function (c) { return c.denom === P.denom; })[0] : null;
    var sender = null;
    try { sender = tx.tx.body.messages[0].sender; } catch (e) { sender = null; }
    var ok = Number(tx.code) === 0 && !failed;
    return el('figure', { class: 'ld-receipt' + (ok ? '' : ' ld-receipt--failed') }, [
      el('div', { class: 'ld-receipt__head' }, [el('p', { class: 'ld-receipt__title', text: title }), R.stamp(Number(tx.code) === 0 ? (failed ? 'Included · message refused' : 'Success') : 'Failed · code ' + tx.code, ok ? 'closed' : 'failed')]),
      el('dl', null, [el('dt', { text: 'Transaction' }), el('dd', null, [R.hashSpan(tx.txhash)]), el('dt', { text: 'Block' }), el('dd', { text: Number(tx.height).toLocaleString('en-US') + (tx.timestamp ? ' · ' + when(tx.timestamp) : '') }),
        sender ? el('dt', { text: 'Sender' }) : null, sender ? el('dd', null, [el('span', { class: 'ld-id', title: sender, text: R.shortAddress(sender) })]) : null,
        el('dt', { text: 'Gas' }), el('dd', { text: Number(tx.gas_used).toLocaleString('en-US') + ' used of ' + Number(tx.gas_wanted).toLocaleString('en-US') }),
        fee ? el('dt', { text: 'Fee' }) : null, fee ? el('dd', { text: jx(fee.amount) + ' JUNOX' }) : null]),
      tx.raw_log ? el('pre', { class: 'ld-receipt__log', tabindex: '0', role: 'region', 'aria-label': 'Chain log', text: String(tx.raw_log).slice(0, 600) }) : null,
      el('div', { class: 'ld-receipt__foot' }, [el('a', { class: 'ld-link ld-link--out', href: R.txHref(tx.txhash), rel: 'noopener' }, ['View transaction', R.icon('arrow-out')])])]);
  }

  /* ================= /governance/: the proposals list (and the old anchors) ================= */
  function proposalsPage() {
    var m = /^#proposal-([1-9]\d{0,15})$/.exec(location.hash || '');
    if (m) { location.replace(proposalHref(m[1])); return; }
    frame({ kicker: 'Ludum DAO · ' + P.chainId, muted: 'Governance', title: 'Proposals', dek: 'The Ludum DAO’s proposals on ' + P.chainId + ', read live: status, count, and the escrow game each appeal would resolve.' }, { wallet: true });
    var host = el('div', null, [el('p', { class: 'ld-body-s', role: 'status', text: 'Reading the proposal module…' })]);
    $('gv-body').appendChild(section('01', 'g1', 'Proposals', 'Newest first. Vote, execute and close are for members, signed in Keplr.', [host], linkBtn('New appeal', newHref(null), true)));
    G.readAllProposals(reader).then(function (r) { clear(host).appendChild(proposalsLedger(r.proposals, r.observedAt)); }, function (e) { unavailable(host, 'The proposals', e); });
  }

  /* ---------------- start ---------------- */
  function start() {
    if (window.Ludum && typeof Ludum.enhance === 'function') Ludum.enhance();
    var page = document.body.getAttribute('data-gov-page');
    var who = window.LudumSession && typeof LudumSession.whoami === 'function' ? LudumSession.whoami().then(function (w) { state.who = w; }, function () {}) : Promise.resolve();
    G.readLivePins(reader).then(function (live) { state.pins = live; }, function (e) { state.pins = { error: why(e) }; }).then(changed);
    var go = page === 'register' ? registerPage : page === 'case' ? casePage : page === 'new' ? newPage : page === 'proposal' ? proposalPage : page === 'governance' ? proposalsPage : null;
    if (!go) return;
    /* The profile head needs the session; never wait long for it (the chain pages stand on their own). */
    var ran = false;
    var run = function () { if (!ran) { ran = true; go(); } };
    who.then(run);
    setTimeout(run, 1500);
  }
  window.LudumGovPage = { linkIndex: linkIndex, liveAppeal: liveAppeal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
