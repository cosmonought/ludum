/* Ludum · /me/ — Profile · Your record: your figures first (Credits, Lifetime Earnings, each game's Skill Rating,
 * completed games and the activity rank), then your games and your cases. Reads `session`, `profile` (1830Juno §16: the server's own figures, never
 * recomputed here), `games` (every page, up to MAX_PAGES) and, when a game is opened here or it is a disputed table,
 * `game`.
 *
 * The Games table is the game history (owner review 2026-10-21, 1830Juno §17): each row names the GAME by its recorded
 * edition (18xx, 18xx+, 18xx+: LPF), lists only the optional rules the host chose, shows the table's code while the
 * server still holds it (a private table's is released when it starts; never invented), and, for a credit table, the
 * wager, the net credits and the Skill Rating change. Its Finish opens the game's result in place: every player by
 * place with their final in-game net worth, how long the game was played (from the deal to its last moment; the times
 * one press further), and for a credit table what the row does not already say -- the pool, your payout, any advance and
 * how it was settled. A table that was not played for credits shows a dash there: nothing is converted or guessed.
 * /me/?game=<gameId> opens that game's result (the old /me/game/?id= page leads here). Needs session.js and records.js.
 *
 * Owner rules kept: a cancelled table is not a game (Phase 4); what others see is the server's (owner policy
 * 2026-10-22: every figure from the start, a Skill Rating labelled provisional until 5 rated games -- the tooltips say
 * so); another player's payout is never shown. */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var MAX_PAGES = 10;
  var GAME_ID = /^g_[0-9a-z]{6,40}$/;

  /* The clock's and the competition's reasons, in a few words (Play's `profileText.ts` reasonText, C3). */
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

  /** Phase 4: a table cancelled or expired before the deal is never a game. The server says so (`history`); a server
   *  without that field is read from the table's own status. */
  function isCancelled(g) {
    if (g.history && g.history.value) return g.history.value === 'cancelled';
    var t = g.table && g.table.value;
    return t === 'cancelled' || t === 'expired' || (t === 'archived' && !g.startedAt);
  }
  /** Phase 4: whether a cancelled table still has a line here: only one whose escrow held money (its record keeps the
   *  refund). A table nobody funded is not listed. */
  function keepsCancelled(g) { return !!(g.money && g.money.chainGameId); }

  /** The Finish cell: your place in the recorded result (ties share it), or "—". */
  function finishOf(g) {
    var r = g.inGame && g.inGame.rank;
    if (!r || typeof r.value !== 'number') return { text: '—', sub: null };
    var tied = g.inGame.tied && g.inGame.tied.value === true;
    return { text: R.ordinal(r.value), sub: 'of ' + g.playerCount + (tied ? ' · tied' : '') };
  }

  /** The credit cells of one game (pure): wager, net credits and rating change -- a dash where the game has none. A void
   *  says once, under its wager, that the wager came back. */
  function creditCells(g) {
    var c = g.credits;
    var dash = { text: '—', cls: 'ld-amt ld-amt--zero' };
    if (!c) return { wager: dash, net: dash, rating: dash, note: null };
    var net = c.outcome === 'open' || typeof c.net !== 'number' ? dash : { text: R.credits(c.net, true), cls: R.signClass(c.net) };
    var rating = typeof c.ratingDelta === 'number' ? { text: R.ratingChange(c.ratingDelta), cls: R.signClass(c.ratingDelta) } : dash;
    return { wager: { text: R.credits(c.wager), cls: 'ld-amt' }, net: net, rating: rating, note: c.outcome === 'void' ? 'Returned' : null };
  }

  /** Whether the game is over: played to its end, ended by its clock, or settled by the competition. */
  function isOver(g) {
    var c = g.credits;
    if (c && c.outcome !== 'open') return true;
    if (g.clockEnd) return true;
    return (g.history && g.history.value === 'completed') || (g.table && g.table.value === 'completed');
  }

  /** The game's playing time: from the deal (`startedAt`, never the table's opening) to its last moment -- the board's
   *  end (`endedAt`) or the clock's (`clockEnd.at`). Null while it is played, for a table that never dealt, and for a
   *  record without both times: never estimated. */
  function playedOf(g) {
    var start = g.startedAt || null;
    var finished = (g.history && g.history.value === 'completed') || (g.table && g.table.value === 'completed');
    var end = g.clockEnd && g.clockEnd.at ? g.clockEnd.at : finished ? g.endedAt || null : null;
    if (!start || !end) return null;
    var text = R.duration(start, end);
    return text === null ? null : { start: start, end: end, text: text };
  }

  /** The row's date: when it ended, else began, else was opened. */
  function dateOf(g) { return (g.clockEnd && g.clockEnd.at) || g.endedAt || g.startedAt || g.createdAt || null; }

  /** The filters' keys of one game: its game name and its outcome. */
  function facetsOf(g) { return { game: R.gameName(g.game), outcome: R.outcomeOf(g).text }; }

  /** The games a filter keeps, newest or oldest first (pure). */
  function filtered(games, filter) {
    var out = games.filter(function (g) {
      var f = facetsOf(g);
      return (!filter.game || f.game === filter.game) && (!filter.outcome || f.outcome === filter.outcome);
    });
    out.sort(function (a, b) {
      var x = dateOf(a) || '', y = dateOf(b) || '';
      return filter.oldest ? (x < y ? -1 : x > y ? 1 : 0) : (x < y ? 1 : x > y ? -1 : 0);
    });
    return out;
  }

  /** The players, by place (unknown places last, in seat order). */
  function standingsOf(seats) {
    return seats.map(function (s, i) { return { s: s, i: i }; }).sort(function (a, b) {
      var x = a.s.rank && typeof a.s.rank.value === 'number' ? a.s.rank.value : 99, y = b.s.rank && typeof b.s.rank.value === 'number' ? b.s.rank.value : 99;
      return x - y || a.i - b.i;
    }).map(function (e) { return e.s; });
  }

  /** How a game ended, in one line, when the Status alone does not say why: a credit table's settlement, or the clock's
   *  ending of a free table. Null for a game that simply ended on its board, or is still being played. */
  function endingOf(g) {
    var c = g.credits;
    var why = function (reason) { return reason && REASONS[reason] ? ': ' + REASONS[reason] : ''; };
    if (c && c.outcome === 'void') return 'Voided' + why(c.reason) + '. Every wager was returned; nobody was rated.';
    if (c && c.outcome === 'foreclosed') return (c.defaulted ? 'You forfeited' : 'Won by forfeit') + why(c.reason) + '.';
    if (c && (c.outcome === 'scored' || c.outcome === 'settled')) return 'Settled.';
    var e = g.clockEnd;
    if (e && e.how === 'annulled') return 'Annulled on the clock: an overdue turn, and the players did not go on.';
    if (e && e.how === 'forfeit') return e.defaulted ? 'You forfeited on the clock (an overdue turn).' : 'Another player forfeited on the clock (an overdue turn).';
    return null;
  }

  /** The facts under a game's players (pure): [label, text] -- how long it was played (or when it began), and for a
   *  credit table only what its row does not show: the pool, your payout, Ludum's advance and how it ended. In-game
   *  dollars never appear here; credits are always written as credits. */
  function factsOf(g) {
    var facts = [];
    var played = playedOf(g);
    if (played) facts.push(['Played', played.text]);
    else if (g.startedAt && !isOver(g)) facts.push(['Began', R.day(g.startedAt)]);
    var c = g.credits;
    if (c) {
      if (typeof c.pool === 'number') facts.push(['Pool', R.credits(c.pool) + ' credits']);
      if (c.outcome === 'void') facts.push(['Your payout', 'Wager returned']);
      else if (typeof c.payout === 'number') facts.push(['Your payout', R.credits(c.payout) + ' credits']);
      if (c.fronted > 0) facts.push(['Ludum advanced', R.credits(c.fronted) + ' credits']);
    }
    var ending = endingOf(g);
    if (ending) facts.push(['Ended', ending]);
    return facts;
  }

  /** The `?game=` of a query string: a game id, or null. */
  function openedIn(search) {
    var id = new URLSearchParams(String(search || '')).get('game');
    return id && GAME_ID.test(id) ? id : null;
  }

  /* ---------- the figures ---------- */

  var TIPS = {
    credits: 'Your available credits plus any in play at unfinished tables, including credits Ludum has advanced. Other players see this total on your public profile.',
    earnings: 'Payouts minus wagers, over every settled game. Grants and advances never count. Other players see it on your public profile, never below 0.',
    rating: 'Each game has its own Skill Rating. 18xx, 18xx+ and 18xx+: LPF share one. It is provisional until 5 rated games; other players see it, with the same label.',
    played: 'Games played to the end. Your Activity Rank is your place among every player with a completed game; ties share a place. It counts activity, not skill.'
  };

  function stat(label, value, small, tipText, cls) {
    return R.el('div', cls ? { class: cls } : null, [
      R.el('dt', null, [label, ' ', R.tip(label, tipText)]),
      R.el('dd', null, [value, small ? R.el('small', { text: small }) : null])
    ]);
  }

  /** The summary strip: Credits, Lifetime Earnings, each game's Skill Rating, completed games. Owner policy 2026-10-22:
   *  every one of them is public from the start, so no figure says when others will see it. */
  function figures(p) {
    var c = p.credits;
    var parts = [
      stat('Credits', R.credits(c.holdings), null, TIPS.credits),
      stat('Lifetime Earnings', R.el('span', { class: R.signClass(p.lifetimeEarnings), text: R.credits(p.lifetimeEarnings, true) }), null, TIPS.earnings)
    ];
    p.ratings.forEach(function (r) {
      parts.push(stat('Skill Rating · ' + r.name, R.rating(r.rating), r.established ? null : 'Provisional · ' + r.games + ' of 5', TIPS.rating));
    });
    var gp = p.gamesPlayed || { count: 0, rank: null, of: 0 };
    parts.push(stat('Completed Games', String(gp.count), gp.rank === null ? null : 'Activity Rank #' + gp.rank + ' of ' + gp.of, TIPS.played));
    var dl = R.el('dl', { class: 'ld-sum ld-sum--figures ld-sum--' + Math.min(5, parts.length) }, parts);
    var detail = null;
    if (c.inPlay > 0 || c.advanceOutstanding > 0) {
      var bits = ['Available ' + R.credits(c.available), 'In play ' + R.credits(c.inPlay)];
      if (c.advanceOutstanding > 0) bits.push('Ludum advance ' + R.credits(c.advanceOutstanding) + ' (repaid from later winnings)');
      detail = R.el('p', { class: 'ld-sum__line', text: bits.join(' · ') });
    }
    return R.el('div', { class: 'ld-figures' }, [dl, detail]);
  }

  /* ---------- a game's result, in place ---------- */

  function playerCell(s) {
    var name = s.profileName || s.displayName;
    var link = s.profileName ? R.el('a', { href: '/players/?name=' + encodeURIComponent(s.profileName), text: name }) : name;
    return R.el('span', null, [link, s.you ? R.el('span', { class: 'ld-result__you', text: ' (you)' }) : '']);
  }

  /** The players: by place with their final net worth (in-game dollars) once the game is over; a column nobody has a
   *  value for is left out (a game still being played lists who sits at it). */
  function playersList(g, seats) {
    var ordered = standingsOf(seats);
    var anyPlace = seats.some(function (s) { return s.rank && typeof s.rank.value === 'number'; });
    var anyWorth = seats.some(function (s) { return s.finalNetWorth && s.finalNetWorth.value; });
    var shape = 'ld-standings' + (anyPlace ? '' : ' ld-standings--noplace') + (anyWorth ? '' : ' ld-standings--noworth');
    var head = R.el('div', { class: shape + ' ld-standings__head', 'aria-hidden': 'true' }, [
      anyPlace ? R.el('span', { text: 'Finish' }) : null, R.el('span', { text: 'Player' }), anyWorth ? R.el('span', { class: 'is-num', text: 'Net worth · in-game $' }) : null
    ]);
    var list = R.el('ol', { class: shape, 'aria-label': 'Players' + (anyPlace ? ', by place' : '') }, ordered.map(function (s) {
      return R.el('li', { class: s.you ? 'is-you' : null }, [
        anyPlace ? R.el('span', { class: 'ld-standings__place', text: s.rank && typeof s.rank.value === 'number' ? R.ordinal(s.rank.value) : '—' }) : null,
        R.el('span', { class: 'ld-standings__name' }, [playerCell(s)]),
        anyWorth ? R.el('span', { class: 'ld-standings__worth is-num' }, [R.el('span', { class: 'ld-sr', text: 'net worth ' }), s.finalNetWorth && s.finalNetWorth.value ? R.dollars(s.finalNetWorth.value.dollars) : '—']) : null
      ]);
    }));
    var note = isOver(g) && !anyPlace && !(g.credits && g.credits.outcome === 'void') ? R.el('p', { class: 'ld-result__note', text: 'No result was recorded for this game.' }) : null;
    return R.el('div', { class: 'ld-result__players' }, [head, list, note]);
  }

  function factsList(g) {
    var facts = factsOf(g);
    var played = playedOf(g);
    if (!facts.length) return null;
    return R.el('dl', { class: 'ld-result__facts' }, facts.map(function (f) {
      var value = f[0] === 'Played' && played
        /* The times, one press away: the deal and the game's last moment. */
        ? R.el('details', { class: 'ld-result__times' }, [
            R.el('summary', { text: f[1] }),
            R.el('span', { text: R.day(played.start) + ' · ' + R.clock(played.start) + ' to ' + R.day(played.end) + ' · ' + R.clock(played.end) })
          ])
        : f[1];
      return R.el('div', null, [R.el('dt', { text: f[0] }), R.el('dd', null, [value])]);
    }));
  }

  /* ---------- the games ---------- */

  var COLUMNS = [['Date'], ['Game'], ['Variant rules'], ['Table'], ['Status'], ['Finish', true], ['Wager', true], ['Net credits', true], ['Rating change', true]];

  /** The Games table with its two filters and its order (lightweight: selects, no framework), each game's result opening
   *  in place. Returns {host, open(gameId)}. */
  function gamesBlock(games, more, session) {
    var host = R.el('div', { class: 'ld-record' });
    if (!games.length) { host.appendChild(R.notice('No games yet', 'Tables you sit at on play.netadao.org appear here.', 'wait')); return { host: host, open: function () { return false; } }; }
    var filter = { game: '', outcome: '', oldest: false };
    var opened = {};      /* gameId -> true while its result is open */
    var details = {};     /* gameId -> Promise of its `game` answer (read once) */
    function options(values) { return [''].concat(values).map(function (v) { return R.el('option', { value: v, text: v || 'All' }); }); }
    function unique(key) { var seen = []; games.forEach(function (g) { var v = facetsOf(g)[key]; if (seen.indexOf(v) === -1) seen.push(v); }); return seen.sort(); }
    function select(id, label, values, onChange) {
      var s = R.el('select', { class: 'ld-select', id: id }, values);
      s.addEventListener('change', function () { onChange(s.value); draw(); });
      return R.el('label', { class: 'ld-filter', for: id }, [R.el('span', { class: 'ld-label-s', text: label }), s]);
    }
    var bar = R.el('div', { class: 'ld-filterbar', role: 'group', 'aria-label': 'Filter your games' }, [
      select('rec-game', 'Game', options(unique('game')), function (v) { filter.game = v; }),
      select('rec-outcome', 'Status', options(unique('outcome')), function (v) { filter.outcome = v; }),
      select('rec-order', 'Order', [R.el('option', { value: 'new', text: 'Newest first' }), R.el('option', { value: 'old', text: 'Oldest first' })], function (v) { filter.oldest = v === 'old'; })
    ]);
    var count = R.el('p', { class: 'ld-filters__count', role: 'status' });
    var slot = R.el('div');

    function detailOf(g) {
      if (!details[g.gameId]) details[g.gameId] = session.api('game', { gameId: g.gameId }).catch(function (e) { delete details[g.gameId]; throw e; });
      return details[g.gameId];
    }

    function finishButton(g, more) {
      var f = finishOf(g);
      var b = R.el('button', { class: 'ld-finish', type: 'button', 'aria-expanded': 'false', 'aria-controls': more.id, title: 'Players and results' }, [
        R.el('span', { class: 'ld-finish__text' }, [f.text, f.sub ? R.el('span', { class: 'ld-ledger__sub', text: f.sub }) : null]),
        R.el('span', { class: 'ld-sr', text: f.text === '—' ? 'Players and results' : ', players and results' }),
        R.icon('arrow-down', 'ld-finish__icon')
      ]);
      return b;
    }

    /** One game: its row and, under it, its result (hidden until opened). */
    function gameRows(g) {
      var o = R.outcomeOf(g);
      var c = creditCells(g);
      var code = typeof g.tableCode === 'string' && g.tableCode ? g.tableCode : null;
      var rules = Array.isArray(g.rules) && g.rules.length ? g.rules.join(' · ') : '—';
      var mode = g.mode === 'live' ? 'Live' : g.mode === 'async' ? 'Async' : null;
      var panel = R.el('div', { class: 'ld-result' });
      var more = R.el('tr', { class: 'ld-games__more', id: 'game-' + g.gameId, hidden: true }, [R.el('td', { colspan: String(COLUMNS.length), 'data-label': '' }, [panel])]);
      var button = finishButton(g, more);
      var row = R.el('tr', { class: 'ld-games__row', 'data-game': g.gameId }, [
        R.td('Date', [R.val(R.day(dateOf(g)))]),
        R.td('Game', [R.val(R.el('span', { class: 'ld-game-cell', text: R.gameName(g.game) }), mode)], 'is-key'),
        R.td('Variant rules', [R.val(rules)]),
        R.td('Table', [R.val(code ? R.el('span', { class: 'ld-code-cell', text: code }) : R.el('span', { class: 'ld-muted', title: 'This table’s code was released when it started', text: '—' }))]),
        R.td('Status', [R.val(R.stamp(o.text, o.kind))]),
        R.td('Finish', [button], 'is-num'),
        R.td('Wager', [R.val(R.el('span', { class: c.wager.cls, text: c.wager.text }), c.note)], 'is-num'),
        R.td('Net credits', [R.val(R.el('span', { class: c.net.cls, text: c.net.text }))], 'is-num'),
        R.td('Rating change', [R.val(R.el('span', { class: c.rating.cls, text: c.rating.text }))], 'is-num')
      ]);

      function fill() {
        panel.textContent = '';
        panel.appendChild(R.el('p', { class: 'ld-result__note', text: 'Reading the players…' }));
        detailOf(g).then(function (d) {
          panel.textContent = '';
          panel.appendChild(playersList(g, d.seats || []));
          var facts = factsList(g);
          if (facts) panel.appendChild(facts);
          /* A place read only now (a game past the page's replays): the row says it too. */
          if (finishOf(g).text === '—') {
            var you = (d.seats || []).filter(function (s) { return s.you; })[0];
            if (you && you.rank && typeof you.rank.value === 'number') {
              g.inGame = { rank: you.rank, finalNetWorth: you.finalNetWorth };
              var fresh = finishButton(g, more);
              fresh.setAttribute('aria-expanded', 'true');
              fresh.addEventListener('click', toggle);
              button.parentNode.replaceChild(fresh, button);
              button = fresh;
            }
          }
        }, function () {
          panel.textContent = '';
          var again = R.el('button', { class: 'ld-link', type: 'button', text: 'Try again' });
          again.addEventListener('click', fill);
          panel.appendChild(R.el('p', { class: 'ld-result__note', role: 'alert' }, ['The players could not be read just now. ', again]));
        });
      }
      function set(open) {
        opened[g.gameId] = open;
        more.hidden = !open;
        row.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open && !panel.firstChild) fill();
        try { window.history.replaceState(null, '', open ? '/me/?game=' + encodeURIComponent(g.gameId) : '/me/'); } catch (e) { /* the address stays */ }
      }
      function toggle() { set(more.hidden); }
      button.addEventListener('click', toggle);
      /* A pointer or a tap anywhere on the row opens it too (its links and buttons keep their own). */
      row.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('a, button, select, summary, input')) return;
        toggle();
      });
      if (opened[g.gameId]) set(true);
      return { rows: [row, more], open: function () { set(true); return button; } };
    }

    var shown = {};
    function draw() {
      var rows = filtered(games, filter);
      count.textContent = rows.length + ' of ' + games.length + ' game' + (games.length === 1 ? '' : 's');
      slot.textContent = '';
      shown = {};
      if (!rows.length) { slot.appendChild(R.notice('No games match', 'Choose “All” to see every game.', 'wait')); return; }
      var trs = [];
      rows.forEach(function (g) { var made = gameRows(g); shown[g.gameId] = made; trs.push(made.rows[0], made.rows[1]); });
      var table = R.ledger({ label: 'Your games', columns: COLUMNS, rows: trs, note: more ? 'Older games are not listed here.' : null });
      table.classList.add('ld-ledger--games');
      slot.appendChild(table);
    }
    host.appendChild(R.el('div', { class: 'ld-filterhead' }, [bar, count]));
    host.appendChild(slot);
    draw();

    /** Open one game's result and bring it into view; false when the game is not in this record. */
    function open(gameId) {
      if (!shown[gameId]) {
        if (!games.some(function (g) { return g.gameId === gameId; })) return false;
        filter = { game: '', outcome: '', oldest: filter.oldest };
        bar.querySelectorAll('select').forEach(function (s) { if (s.id !== 'rec-order') s.value = ''; });
        draw();
      }
      var button = shown[gameId].open();
      var row = slot.querySelector('tr[data-game="' + gameId + '"]');
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
      if (button && button.focus) button.focus({ preventScroll: true });
      return true;
    }
    return { host: host, open: open };
  }

  /* ---------- cases (the retired escrow's disputes: kept as they were) ---------- */

  function caseRow(g, detail, openGame) {
    var m = g.money, d = detail && detail.dispute && detail.dispute.value;
    var left = d ? R.daysUntil(d.resolverTimeoutAt, Date.now()) : null;
    var status = !d ? R.stamp('Disputed', 'held') : d.resolution ? R.stamp(d.resolution === 'uphold' ? 'Upheld' : d.resolution === 'annul' ? 'Annulled' : 'Replaced', 'closed', '/disputes/case/?id=' + m.chainGameId) : R.stamp('Disputed', 'held', '/disputes/case/?id=' + m.chainGameId);
    var deadline = !d ? '—' : d.resolution ? 'Resolved ' + R.day(d.resolvedAt) : null;
    var gameLink = R.el('a', { href: '/me/?game=' + encodeURIComponent(g.gameId), text: g.tableCode || 'Result' });
    gameLink.addEventListener('click', function (e) { if (openGame(g.gameId)) e.preventDefault(); });
    return R.el('tr', null, [
      R.td('Case', [R.el('a', { href: '/disputes/case/?id=' + m.chainGameId, text: m.chainGameId })], 'is-key'),
      R.td('Game', [R.val(R.gameName(g.game), gameLink)]),
      R.td('Disputed', [R.val(d ? R.day(d.disputedAt) : '—')]),
      R.td('Challenger', [R.val(d ? (d.challengerIsYou ? 'You' : 'Another seat') : '—')]),
      R.td('Status', [R.val(status)]),
      R.td('Resolver deadline', [deadline !== null ? R.val(deadline) : R.val(R.day(d.resolverTimeoutAt) + ' · ' + R.clock(d.resolverTimeoutAt), left !== null ? (left > 0 ? left + ' days left' : 'passed') : null)]),
      R.go('/disputes/case/?id=' + m.chainGameId)
    ]);
  }

  function signedOut(frame) {
    frame.textContent = '';
    frame.appendChild(R.rechead({ kicker: null, title: 'Your record' }));
    frame.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice('Signed out', 'Sign in to see your record.', 'wait', R.el('a', { class: 'ld-btn', href: window.LudumSession.signInUrl('/me/'), text: 'Sign in' }))]));
  }

  function errorNotice(e) {
    var text = e && e.error === 'rate-limited' ? 'Too many requests. Try again in a minute.' : 'Your record is unavailable right now. Try again in a moment.';
    return R.el('div', { class: 'ld-wrap' }, [R.notice('Unavailable', text, 'stop')]);
  }

  /** The figures, read once more after a short wait when the first read fails (a busy moment, a slow network). */
  function readFigures(session) {
    return session.api('profile', {}).catch(function () {
      return new Promise(function (done) { setTimeout(done, 1500); }).then(function () { return session.api('profile', {}); });
    }).catch(function () { return null; });
  }

  function mount(root, session) {
    var frame = root.querySelector('[data-rec-frame]');
    var body = root.querySelector('[data-rec-body]');
    var wanted = openedIn(window.location.search);
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) { signedOut(frame); return; }
      var all = [];
      function page(cursor, n) {
        return session.api('games', cursor === null ? { limit: 50 } : { cursor: cursor, limit: 50 }).then(function (r) {
          all = all.concat(r.games);
          return r.nextCursor !== null && n + 1 < MAX_PAGES ? page(r.nextCursor, n + 1) : { more: r.nextCursor !== null };
        });
      }
      return Promise.all([page(null, 0), readFigures(session)]).then(function (both) {
        var end = both[0], profile = both[1];
        R.profileFrame(frame, who, 'record', {
          kicker: 'Only you can see this page', title: who.account.name,
          meta: [['Public profile', R.el('a', { class: 'ld-link', href: '/players/?name=' + encodeURIComponent(who.account.name), text: 'How others see you' })]]
        });
        body.textContent = '';
        body.appendChild(R.el('section', { class: 'ld-section ld-section--rec ld-section--figures', 'aria-label': 'Your figures' }, [R.el('div', { class: 'ld-wrap' }, [
          profile ? figures(profile) : R.el('p', { class: 'ld-sum__line', role: 'status', text: 'Your figures could not be read just now. Reload the page to try again.' })
        ])]));
        var listed = all.filter(function (g) { return !isCancelled(g) || keepsCancelled(g); });
        var block = gamesBlock(listed, end.more, session);
        body.appendChild(R.section(null, 'r1', 'Games', null, [block.host]));
        if (wanted && !block.open(wanted)) block.host.insertBefore(R.notice('Not in your record', 'That game is not one you sat at, or it is older than the games listed here.', 'wait'), block.host.firstChild);
        var disputed = all.filter(function (g) { return g.money && g.money.chainGameId && ((g.disputed && g.disputed.value === true) || (g.money.escrow && g.money.escrow.value === 'disputed')); });
        if (!disputed.length) return;
        var casesHost = R.el('div', { class: 'ld-record' }, [R.el('p', { class: 'ld-body-s', text: 'Reading your cases…' })]);
        body.appendChild(R.section(null, 'r2', 'Cases', 'Disputed tables you sat at, and where each one stands.', [casesHost]));
        return Promise.all(disputed.map(function (g) { return session.api('game', { gameId: g.gameId }).catch(function () { return null; }); })).then(function (details) {
          casesHost.textContent = '';
          casesHost.appendChild(R.ledger({ label: 'Your cases', columns: [['Case'], ['Game'], ['Disputed'], ['Challenger'], ['Status'], ['Resolver deadline'], ['']], rows: disputed.map(function (g, i) { return caseRow(g, details[i], block.open); }) }));
        });
      });
    }).catch(function (e) {
      if (e && e.error === 'signed-out') { signedOut(frame); return; }
      body.textContent = '';
      body.appendChild(errorNotice(e));
    });
  }

  window.LudumMeRecord = {
    isCancelled: isCancelled, keepsCancelled: keepsCancelled, finishOf: finishOf, creditCells: creditCells, filtered: filtered, facetsOf: facetsOf,
    isOver: isOver, playedOf: playedOf, dateOf: dateOf, standingsOf: standingsOf, endingOf: endingOf, factsOf: factsOf, openedIn: openedIn, mount: mount
  };
  function start() {
    var root = document.querySelector('[data-ludum-record]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
