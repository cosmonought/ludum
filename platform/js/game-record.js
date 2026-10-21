/* Ludum · /me/game/?id=<gameId> — one game's record, for a player who sat at it: the game and its table code, how it
 * ended, the players and their places, and -- for a credit table -- your wager, payout, net credits and Skill Rating
 * change. Reads `session` and `game` (404 unless this account holds a seat: such a game answers as if it did not exist).
 *
 * Places come from the server: a credit table's competition result, else its replay of the game's log; a game whose
 * result was never recorded shows "—", never a guess. A table from the retired real-money escrow keeps its escrow
 * ledger and evidence under "Technical record" (historical; nothing there is the current product). */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var GAME_ID = /^g_[0-9a-z]{6,40}$/;

  var ENTRY = {
    ante_gross: ['Ante', 'into the escrow', 'out'],
    subsidy: ['of which network subsidy', 'already inside the ante', 'info'],
    bond_posted: ['Challenge bond', 'posted with a challenge', 'out'],
    bond_returned: ['Challenge bond returned', '', 'in'],
    bond_forfeited: ['Challenge bond to the pool', 'already inside the bond', 'info'],
    payout: ['Payout', 'by the table’s settlement', 'in'],
    refund: ['Refund', 'the escrow returned the net ante', 'in']
  };
  var OP = { start: 'Start', checkpoint: 'Checkpoint', settle: 'Settle', finalize: 'Finalize', consent: 'Consent', annul: 'Annul', remedy: 'Remedy' };
  /* The competition's own reason codes (Play's `profileText.ts` reasonText, C3), in a few words. */
  var REASONS = {
    'clock-live-strike3-foreclosure': 'a third missed action clock',
    'clock-live-foreclosure': 'an uncured overdue turn, with every other player approving',
    'clock-async-foreclosure': 'an overdue Timed Async turn, with every other player approving',
    'clock-live-timeout-annul': 'an overdue turn the other players did not all vote to foreclose',
    'clock-async-annul': 'the players annulled an overdue Timed Async game',
    'clock-annulled': 'every player agreed to annul it',
    'not-dealt': 'the table never dealt',
    'start-superseded': 'the seats changed before the deal'
  };

  /* ---------- pure (pinned by platform/tests/records.test.mjs) ---------- */

  /** The page title: "18xx+: LPF — Table JUNO-ABCD-EFGH", or the game alone when the record no longer holds a code. */
  function titleOf(d) {
    var game = R.gameName(d.game);
    return d.tableCode ? game + ' — Table ' + d.tableCode : game;
  }

  /** The sentence under the title: how the game ended for you, in one line. */
  function dekOf(d) {
    var c = d.credits;
    var you = d.seats.filter(function (s) { return s.you; })[0];
    var place = you && you.rank && typeof you.rank.value === 'number' ? you.rank.value : null;
    var finished = place !== null ? ' You finished ' + R.ordinal(place) + ' of ' + d.playerCount + '.' : '';
    if (c && c.outcome === 'void') return 'Voided' + (c.reason && REASONS[c.reason] ? ': ' + REASONS[c.reason] : '') + '. Every wager was returned; nobody was rated.';
    if (c && c.outcome === 'foreclosed') return (c.defaulted ? 'You forfeited' : 'Won by forfeit') + (c.reason && REASONS[c.reason] ? ': ' + REASONS[c.reason] : '') + '.';
    if (d.endedAt && !(d.table && d.table.value === 'cancelled')) return 'Ended ' + R.day(d.endedAt) + '.' + finished;
    if (d.table && (d.table.value === 'cancelled' || d.table.value === 'expired')) return 'Cancelled before the game began.';
    if (d.startedAt) return 'Began ' + R.day(d.startedAt) + '. Still being played.';
    return 'Waiting for players.';
  }

  /** The figures beside the title (pure): your finish, and a credit table's wager, payout, net credits and rating
   *  change -- each [label, text, class or null]. */
  function metaOf(d) {
    var c = d.credits;
    var you = d.seats.filter(function (s) { return s.you; })[0];
    var place = you && you.rank && typeof you.rank.value === 'number' ? R.ordinal(you.rank.value) + ' of ' + d.playerCount : '—';
    var meta = [['Your finish', place, null]];
    if (!c) return meta;
    var settled = typeof c.net === 'number' && c.outcome !== 'open';
    meta.push(['Wager', R.credits(c.wager), null]);
    if (c.fronted > 0) meta.push(['Ludum advanced', R.credits(c.fronted), null]);
    meta.push(['Payout', c.outcome === 'void' ? 'Returned' : typeof c.payout === 'number' ? R.credits(c.payout) : '—', null]);
    meta.push(['Net credits', settled ? R.credits(c.net, true) : '—', settled ? R.signClass(c.net) : null]);
    meta.push(['Rating change', typeof c.ratingDelta === 'number' ? R.ratingChange(c.ratingDelta) : '—', typeof c.ratingDelta === 'number' ? R.signClass(c.ratingDelta) : null]);
    return meta;
  }

  /** The players, by place (unknown places last, in seat order). */
  function standingsOf(d) {
    return d.seats.map(function (s, i) { return { s: s, i: i }; }).sort(function (a, b) {
      var x = a.s.rank && typeof a.s.rank.value === 'number' ? a.s.rank.value : 99, y = b.s.rank && typeof b.s.rank.value === 'number' ? b.s.rank.value : 99;
      return x - y || a.i - b.i;
    }).map(function (e) { return e.s; });
  }

  /* ---------- render ---------- */

  function playerCell(s) {
    var name = s.profileName || s.displayName;
    var link = s.profileName ? R.el('a', { href: '/players/?name=' + encodeURIComponent(s.profileName), text: name }) : name;
    return R.val(R.el('span', null, [link, s.you ? ' (you)' : '']));
  }

  function render(frame, body, d) {
    var c = d.credits;
    frame.textContent = '';
    frame.appendChild(R.rechead({
      back: { href: '/me/', text: 'Your record' },
      muted: [d.mode === 'live' ? 'Live' : d.mode === 'async' ? 'Async' : null, d.playerCount + ' players', c ? 'Played for credits' : null].filter(Boolean).join(' · '),
      no: 'Game record', title: titleOf(d), titleClass: 'ld-rechead__title--m', dek: dekOf(d),
      meta: metaOf(d).map(function (m) { return [m[0], m[2] ? R.el('span', { class: m[2], text: m[1] }) : m[1]]; })
    }));
    body.textContent = '';

    /* 01 The game: the standings, and the table's facts. */
    var rows = standingsOf(d).map(function (s) {
      return R.el('tr', { class: s.you ? 'is-you' : null }, [
        R.td('Finish', [R.val(s.rank && typeof s.rank.value === 'number' ? R.ordinal(s.rank.value) : '—')]),
        R.td('Player', [playerCell(s)]),
        R.td('Net worth', [s.finalNetWorth && s.finalNetWorth.value ? R.dollars(s.finalNetWorth.value.dollars) : '—'], 'is-num')
      ]);
    });
    var anyPlace = d.seats.some(function (s) { return s.rank && typeof s.rank.value === 'number'; });
    var o = R.outcomeOf(d);
    var facts = R.el('dl', { class: 'ld-facts' }, [
      R.el('dt', { text: 'Game' }), R.el('dd', { text: R.gameName(d.game) }),
      R.el('dt', { text: 'Variant rules' }), R.el('dd', { text: Array.isArray(d.rules) && d.rules.length ? d.rules.join(' · ') : 'None' }),
      R.el('dt', { text: 'Table' }), R.el('dd', { text: d.tableCode || 'Code not kept (released when the table started)' }),
      R.el('dt', { text: 'Played' }), R.el('dd', { text: d.startedAt ? R.day(d.startedAt) + ' · ' + R.clock(d.startedAt) + (d.endedAt ? ' to ' + R.day(d.endedAt) + ' · ' + R.clock(d.endedAt) : '') : 'Not started' }),
      R.el('dt', { text: 'Status' }), R.el('dd', null, [R.stamp(o.text, o.kind)])
    ]);
    var standings = R.ledger({ title: 'Players', unit: 'Net worth at the end · in-game $', columns: [['Finish'], ['Player'], ['Net worth', true, '$']], rows: rows,
      note: anyPlace ? null : 'This game’s result was not recorded, so no places are shown.' });
    body.appendChild(R.section('01', 'gr1', 'The game', null, [R.el('div', { class: 'ld-twocol ld-twocol--wide' }, [R.el('div', null, [standings]), facts])]));

    /* Technical record: ids and, for a retired real-money table, its escrow ledger -- collapsed. */
    body.appendChild(R.el('section', { class: 'ld-section ld-section--rec', 'aria-label': 'Technical record' }, [R.el('div', { class: 'ld-wrap' }, [technical(d)])]));
  }

  function technical(d) {
    var parts = [R.el('dl', { class: 'ld-facts' }, [
      R.el('dt', { text: 'Game id' }), R.el('dd', null, [R.el('span', { class: 'ld-id', text: d.gameId })]),
      R.el('dt', { text: 'Opened' }), R.el('dd', { text: R.day(d.createdAt) + ' · ' + R.clock(d.createdAt) })
    ])];
    var m = d.money;
    if (m) {
      var rows = d.ledger ? d.ledger.entries.map(function (e) {
        var k = ENTRY[e.kind] || [e.kind, '', 'info'];
        var known = e.fact && e.fact.provenance !== 'unavailable';
        var amount = !known ? '—' : k[2] === 'info' ? '(' + R.junox(e.amount.amount) + ')' : (k[2] === 'out' ? '−' : '+') + R.junox(e.amount.amount);
        return R.el('tr', null, [R.td('Entry', [R.val(k[0], k[1] || null)]), R.td('Amount · JUNOX', [R.val(amount)], 'is-num')]);
      }) : [];
      parts.push(R.el('p', { class: 'ld-body-s', text: 'A table from the retired real-money escrow. Kept as a record.' }));
      if (rows.length) parts.push(R.ledger({ title: 'Escrow ledger', unit: 'JUNOX', columns: [['Entry'], ['Amount', true, 'JUNOX']], rows: rows }));
      parts.push(R.el('dl', { class: 'ld-facts' }, [
        R.el('dt', { text: 'Escrow game' }), R.el('dd', { text: m.chainGameId ? m.chainGameId + ' on ' + m.chainId : '—' }),
        R.el('dt', { text: 'Escrow state' }), R.el('dd', { text: m.escrow && m.escrow.value ? m.escrow.value.replace(/_/g, ' ') : 'Not readable on this server' })
      ]));
      if (d.caseUrl) parts.push(R.el('a', { class: 'ld-link', href: '/disputes/case/?id=' + m.chainGameId }, ['Open the case file', R.icon('arrow-right')]));
      var relayed = d.transactions && d.transactions.value ? d.transactions.value.relayed : [];
      relayed.filter(function (t) { return t.op !== 'checkpoint'; }).forEach(function (t) {
        parts.push(R.el('p', { class: 'ld-body-s' }, [(OP[t.op] || t.op) + ' · ', R.el('a', { class: 'ld-link ld-link--out', href: R.txHref(t.txHash), rel: 'noopener' }, [R.hashSpan(t.txHash)])]));
      });
    }
    var t = d.terminal && d.terminal.value;
    if (t) parts.push(R.el('p', { class: 'ld-body-s' }, ['Log at the result: ' + t.logLen.toLocaleString('en-US') + ' entries · hash ', R.hashSpan(t.logHash)]));
    return R.el('details', { class: 'ld-disclose' }, [
      R.el('summary', null, [R.el('span', { text: 'Technical record' })]),
      R.el('div', { class: 'ld-disclose__body ld-stack' }, parts)
    ]);
  }

  function mount(root, session) {
    var frame = root.querySelector('[data-rec-frame]');
    var body = root.querySelector('[data-rec-body]');
    var id = new URLSearchParams(window.location.search).get('id');
    function stop(label, text) { body.textContent = ''; body.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice(label, text, 'stop', R.el('a', { class: 'ld-link', href: '/me/', text: 'Your record' }))])); }
    if (!id || !GAME_ID.test(id)) { stop('No game chosen', 'Open a game from your record.'); return Promise.resolve(); }
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) { stop('Signed out', 'Sign in to see this game.'); return; }
      return session.api('game', { gameId: id }).then(function (d) { document.title = titleOf(d) + ' — Ludum'; render(frame, body, d); }, function (e) {
        if (e && e.error === 'not-found') stop('Not in your record', 'That game is not one you sat at.');
        else stop('Unavailable', 'This game could not be read just now. Try again in a moment.');
      });
    }, function () { stop('Unavailable', 'Your session could not be checked.'); });
  }

  window.LudumGameRecord = { titleOf: titleOf, dekOf: dekOf, metaOf: metaOf, standingsOf: standingsOf, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-game]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
