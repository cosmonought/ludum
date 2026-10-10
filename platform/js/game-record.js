/* Ludum · /me/game/?id=<gameId> — Game record (GameRecord): the head, The game (standings in the game's own money), The
 * money (your escrow ledger, in JUNOX), Record (a docket of what happened, with the transactions the server relayed)
 * and Evidence. Reads `session` and `game` (404 unless this account holds a seat: such a game answers as if it did not
 * exist). Figures the record does not carry (cash and shares apart, gas, the companies you ran) are not invented: the
 * design's columns that need them are left out, and the full log stays on play.netadao.org. */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var GAME_ID = /^g_[0-9a-z]{6,40}$/;

  var ENTRY = {
    ante_gross: ['Ante', 'into the escrow from your payout wallet', 'out'],
    subsidy: ['of which network subsidy', 'already inside the ante', 'info'],
    bond_posted: ['Challenge bond', 'posted with your challenge', 'out'],
    bond_returned: ['Challenge bond returned', '', 'in'],
    bond_forfeited: ['Challenge bond to the pool', 'already inside the bond', 'info'],
    payout: ['Payout', 'by the table’s settlement', 'in'],
    refund: ['Refund', 'the escrow returned your net ante', 'in']
  };
  var OP = { start: 'Start', checkpoint: 'Checkpoint', settle: 'Settle', finalize: 'Finalize', consent: 'Consent', annul: 'Annul', remedy: 'Remedy' };
  var OP_WHAT = { start: 'Started', checkpoint: 'Checkpoint recorded', settle: 'Result recorded', finalize: 'Paid', consent: 'Consent relayed', annul: 'Annulled by consent', remedy: 'Remedy relayed' };

  /** The docket's items (pure), oldest first: the table's own times, the relayed transactions and the dispute. */
  function docketOf(d) {
    var items = [];
    items.push({ at: d.createdAt, what: 'Table created', line: (d.money ? 'A ' + d.playerCount + '-seat table with a ' + R.junox(d.money.anteGross.amount) + ' JUNOX ante.' : 'A ' + d.playerCount + '-seat table with no stake.'), by: ['CreateGame'] });
    var relayed = d.transactions && d.transactions.value ? d.transactions.value.relayed : [];
    var startTx = relayed.filter(function (t) { return t.op === 'start'; })[0];
    if (d.startedAt) items.push({ at: d.startedAt, what: 'Started', line: 'The seats were fixed and the game was dealt.', by: startTx ? ['Start · tx ' + R.shortHash(startTx.txHash)] : ['Start'] });
    relayed.forEach(function (t) {
      if (t.op === 'start' || t.op === 'checkpoint') return;
      items.push({ at: t.at, what: OP_WHAT[t.op] || t.op, line: t.status.value === 'included' ? 'Included' + (t.status.height ? ' at height ' + t.status.height : '') + '.' : 'Broadcast; not yet seen in a block.', by: [(OP[t.op] || t.op) + ' · tx ' + R.shortHash(t.txHash)], tx: t });
    });
    var checkpoints = relayed.filter(function (t) { return t.op === 'checkpoint'; }).length;
    if (checkpoints) items.push({ at: (relayed.filter(function (t) { return t.op === 'checkpoint'; }).pop() || {}).at, what: checkpoints + ' checkpoint' + (checkpoints === 1 ? '' : 's') + ' recorded', line: 'The server recorded the game’s progress on chain as it went.', by: ['Checkpoint'] });
    var dv = d.dispute && d.dispute.value;
    if (dv) {
      items.push({ at: dv.disputedAt, what: dv.challengerIsYou ? 'You challenged the result' : 'The result was challenged', line: 'Bond ' + R.junox(dv.bond.amount) + ' JUNOX. The resolver has until ' + R.day(dv.resolverTimeoutAt) + '.', by: ['Challenge'] });
      if (dv.resolvedAt) items.push({ at: dv.resolvedAt, what: 'Resolved: ' + (dv.resolution || 'resolved'), line: 'The Ludum DAO executed a resolution.', by: ['Resolve'] });
    }
    if (d.endedAt) items.push({ at: d.endedAt, what: 'Game ended', line: 'The result was final when the game ended.', by: [] });
    return items.filter(function (x) { return typeof x.at === 'string'; }).sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
  }

  function escrowStamp(m) {
    var s = m && m.escrow && m.escrow.value;
    if (!m) return R.stamp('No stake', 'closed');
    if (s === 'settled') return R.stamp('Settled', 'closed');
    if (s === 'disputed') return R.stamp('Disputed', 'held');
    if (s === 'annulled') return R.stamp('Annulled', 'closed');
    if (s === 'cancelled') return R.stamp('Cancelled', 'closed');
    if (s === 'settleable') return R.stamp('Settleable', '');
    return R.stamp(s ? s.replace(/_/g, ' ') : 'Unavailable', s ? '' : 'failed');
  }

  function render(frame, body, who, d) {
    var you = d.seats.filter(function (s) { return s.you; })[0];
    var rank = you && you.rank.value !== null ? you.rank.value : null;
    var net = d.money && d.money.net && d.money.net.value ? d.money.net.value.amount : null;
    var dek = d.endedAt ? 'The game ended on ' + R.day(d.endedAt) + ' at ' + R.clock(d.endedAt) + (rank !== null ? ' with you in ' + R.ordinal(rank) + ' place.' : '.') : d.startedAt ? 'The game began on ' + R.day(d.startedAt) + ' and is still being played.' : 'The table has not started.';
    frame.textContent = '';
    frame.appendChild(R.rechead({
      back: { href: '/me/', text: 'Your record' }, muted: [d.product.name, d.variant, d.playerCount + ' seats'].filter(Boolean).join(' · '),
      no: 'Game record', title: R.shortId(d.gameId), dek: dek,
      meta: [['Your finish', rank !== null ? R.ordinal(rank) + ' of ' + d.playerCount : '—'], ['Money', escrowStamp(d.money)],
        ['Result', net !== null ? R.el('span', null, [R.el('span', { class: R.amountClass(net), text: R.junox(net, true) }), ' JUNOX']) : '—']]
    }));
    body.textContent = '';

    /* 01 The game -- in the game's own money (never JUNOX). */
    var standings = d.seats.slice().sort(function (a, b) { return (a.rank.value || 99) - (b.rank.value || 99); }).map(function (s) {
      return R.el('tr', { class: s.you ? 'is-you' : null }, [
        R.td('Finish', [R.val(s.rank.value !== null ? R.ordinal(s.rank.value) : '—')]),
        R.td('Player', [R.val(s.displayName + (s.you ? ' (you)' : ''))]),
        R.td('Net worth · $', [s.finalNetWorth.value !== null ? R.dollars(s.finalNetWorth.value.dollars) : '—'], 'is-num is-key')
      ]);
    });
    var facts = R.el('div', { class: 'ld-stack' }, [R.el('dl', { class: 'ld-facts' }, [
      R.el('dt', { text: 'Table' }), R.el('dd', null, [R.idSpan(d.gameId), d.variant ? ' · ' + d.variant : '', d.joinCode ? ' · code ' + d.joinCode : '']),
      R.el('dt', { text: 'Played' }), R.el('dd', { text: d.startedAt ? R.day(d.startedAt) + ' · ' + R.clock(d.startedAt) + (d.endedAt ? ' to ' + R.clock(d.endedAt) : '') : 'Not started' }),
      R.el('dt', { text: 'Ended by' }), R.el('dd', { text: d.terminal && d.terminal.value ? (d.terminal.value.reason === 'BankBroken' ? 'The bank broke' : 'Bankruptcy') : '—' }),
      R.el('dt', { text: 'Rules' }), R.el('dd', { text: d.product.name + ' rules engine, as pinned at the deal' })
    ]), R.el('p', { class: 'ld-body-s', style: 'margin:0', text: 'Replays and the full log live on play.netadao.org.' }),
    R.el('a', { class: 'ld-link ld-link--out', href: window.LudumSession.PLAY_ORIGIN + '/' }, ['Open play.netadao.org', R.icon('arrow-out')])]);
    var gameSection = R.section('01', 'gr1', 'The game', 'The result, in the game’s own money. It was final when the game ended.', [R.el('div', { class: 'ld-twocol ld-twocol--wide' }, [
      R.el('div', null, [R.ledger({ title: 'Standings', unit: 'Net worth at the end · $ in game', columns: [['Finish'], ['Player'], ['Net worth', true, '$']], rows: standings, note: 'In-game dollars are the game’s money. They are not JUNOX and cannot be withdrawn.' })]),
      facts
    ])]);
    body.appendChild(R.el('div', { class: 'ld-pj ld-pj--p18', 'data-theme': 'press' }, [gameSection]));

    /* 02 The money -- your escrow ledger in JUNOX. */
    if (d.money) {
      var rows = d.ledger ? d.ledger.entries.map(function (e) {
        var k = ENTRY[e.kind] || [e.kind, '', 'info'];
        var known = e.fact && e.fact.provenance !== 'unavailable';
        var amount = !known ? '—' : k[2] === 'info' ? '(' + R.junox(e.amount.amount) + ')' : (k[2] === 'out' ? '−' : '+') + R.junox(e.amount.amount);
        return R.el('tr', null, [
          R.td('Entry', [R.val(k[0], [k[1], k[1] && known ? ' · ' : '', R.provenanceText(e.fact)].join(''))]),
          R.td('Amount · JUNOX', [R.val(R.el('span', { class: k[2] === 'out' ? 'ld-amt ld-amt--out' : k[2] === 'in' ? 'ld-amt ld-amt--in' : 'ld-amt ld-amt--zero', text: amount }))], 'is-num')
        ]);
      }) : [];
      var netCell = d.ledger && d.ledger.net.value ? R.el('span', { class: R.amountClass(d.ledger.net.value.amount), text: R.junox(d.ledger.net.value.amount, true) }) : '—';
      body.appendChild(R.section('02', 'gr2', 'The money', 'In JUNOX, as the escrow recorded it.', [R.el('div', { class: 'ld-twocol' }, [
        rows.length ? R.ledger({ title: 'Yours', unit: 'JUNOX · escrow game ' + (d.money.chainGameId || '—'), columns: [['Entry'], ['Amount', true, 'JUNOX']], rows: rows,
          foot: R.el('tr', null, [R.el('td', null, [R.el('span', { class: 'ld-ledger__total', text: 'Net' })]), R.el('td', { class: 'is-num' }, [netCell])]),
          note: 'Bracketed lines are already inside another entry. Network fees are not included.' }) : R.notice('Not yet', 'The escrow has not recorded this table’s money yet.', 'wait'),
        R.el('div', { class: 'ld-stack' }, [R.el('dl', { class: 'ld-facts' }, [
          R.el('dt', { text: 'Escrow game' }), R.el('dd', { text: d.money.chainGameId ? d.money.chainGameId + ' on ' + d.money.chainId : '—' }),
          R.el('dt', { text: 'Contract' }), R.el('dd', null, [R.el('span', { class: 'ld-id', title: d.money.contract, text: R.shortAddress(d.money.contract) })]),
          R.el('dt', { text: 'Escrow state' }), R.el('dd', { text: d.money.escrow.value ? d.money.escrow.value.replace(/_/g, ' ') + ' · ' + R.provenanceText(d.money.escrow) : R.provenanceText(d.money.escrow) })
        ]), d.caseUrl ? R.el('a', { class: 'ld-link', href: '/disputes/case/?id=' + d.money.chainGameId }, ['Open the case file', R.icon('arrow-right')]) : null])
      ])]));
    }

    /* 03 Record -- the docket, and one receipt per relayed transaction. */
    var items = docketOf(d);
    var relayed = d.transactions && d.transactions.value ? d.transactions.value.relayed : [];
    var receipts = R.el('div', { class: 'ld-stack' }, relayed.filter(function (t) { return t.op !== 'checkpoint'; }).slice(-3).map(function (t) {
      return R.el('figure', { class: 'ld-receipt' }, [
        R.el('div', { class: 'ld-receipt__head' }, [R.el('p', { class: 'ld-receipt__title', text: OP[t.op] || t.op }), t.status.value === 'included' ? R.stamp('Included', 'closed') : R.stamp('Broadcast', '')]),
        R.el('dl', null, [R.el('dt', { text: 'Transaction' }), R.el('dd', null, [R.hashSpan(t.txHash)]), R.el('dt', { text: 'Block' }), R.el('dd', { text: t.status.height || 'not yet' }), R.el('dt', { text: 'Relayed by' }), R.el('dd', { text: 'play.netadao.org' })]),
        R.el('div', { class: 'ld-receipt__foot' }, [R.el('a', { class: 'ld-link ld-link--out', href: R.txHref(t.txHash), rel: 'noopener' }, ['View transaction', R.icon('arrow-out')])])
      ]);
    }));
    var txNote = d.transactions && !d.transactions.value ? 'The server’s transaction records are unavailable: ' + (d.transactions.reason || 'no reason given') + '.' : 'Your join and any challenge are signed by your own wallet and are on chain, not listed here.';
    body.appendChild(R.section('03', 'gr3', 'Record', 'What happened, in order.', [R.el('div', { class: 'ld-twocol ld-twocol--wide' }, [R.el('ol', { class: 'ld-docket' }, items.map(R.docketItem)), receipts]), R.el('p', { class: 'ld-ledger__note', text: txNote })]));

    /* 04 Evidence */
    var t = d.terminal && d.terminal.value;
    body.appendChild(R.section('04', 'gr4', 'Evidence', 'What the money rests on. Hashes are shortened; each shows in full on hover.', [R.el('div', { class: 'ld-twocol' }, [
      R.el('dl', { class: 'ld-facts' }, [R.el('dt', { text: 'Chain game id' }), R.el('dd', { text: d.money && d.money.chainGameId ? d.money.chainGameId + ' · ' + d.money.chainId : 'No stake' }),
        R.el('dt', { text: 'Log at the result' }), R.el('dd', null, t ? [t.logLen.toLocaleString('en-US') + ' entries · hash ', R.hashSpan(t.logHash)] : ['—'])]),
      R.el('dl', { class: 'ld-facts' }, [R.el('dt', { text: 'Rules and variants' }), R.el('dd', { text: 'Engine as pinned at the deal' + (d.variant ? ' · ' + d.variant : '') }),
        R.el('dt', { text: 'Resolver for this table' }), R.el('dd', { text: d.money ? 'The Ludum DAO core · fixed at Start' : '—' })])
    ])]));
  }

  function mount(root, session) {
    var frame = root.querySelector('[data-rec-frame]');
    var body = root.querySelector('[data-rec-body]');
    var id = new URLSearchParams(window.location.search).get('id');
    function stop(label, text) { body.textContent = ''; body.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice(label, text, 'stop', R.el('a', { class: 'ld-link', href: '/me/', text: 'Your record' }))])); }
    if (!id || !GAME_ID.test(id)) { stop('No game chosen', 'Open a game from your record.'); return Promise.resolve(); }
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) { stop('Signed out', 'Sign in to see this game.'); return; }
      return session.api('game', { gameId: id }).then(function (d) { document.title = 'Game record ' + R.shortId(d.gameId) + ' — Ludum'; render(frame, body, who, d); }, function (e) {
        if (e && e.error === 'not-found') stop('Not in your record', 'That game is not one you sat at.');
        else stop('Unavailable', 'This game could not be read just now. Nothing is shown rather than an old value.');
      });
    }, function () { stop('Unavailable', 'Your session could not be checked.'); });
  }

  window.LudumGameRecord = { docketOf: docketOf, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-game]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
