/* Ludum · /me/ -- your profile, Games (Ludum Profile "the pass", owner 2026-10-22). The same pass everyone else sees,
 * then the private tabs ("Only you see these": Games, Account; Moderation and Disputes where held) and your games, each
 * result opening in place. /me/?game=<gameId> opens one (the old /me/game/?id= page leads here).
 *
 * PROGRESSIVE (owner: the profile took 2-5 s): the session and your figures (`profile`, with its v1.6 `standing`) are
 * asked for at once; the pass is drawn as soon as the session answers (the name), its figures as soon as `profile`
 * answers, the games as soon as their first page does; older pages follow, one after another, without holding anything
 * up. Every figure is the server's own (§16-§19), never recomputed here.
 *
 * COLD START (owner performance review 2026-10-23): a cold first visit showed "Reading your profile…" for 2-5 s because
 * the games' first page made the server replay completed games on its one event loop, and the session's answer waited
 * behind them. So: the pass's SHELL is drawn at once -- no name, no figure, no tab: nothing about anyone, the same for
 * every visitor -- and the games are asked for only once the session has said this browser is signed in (a signed-out
 * visitor no longer asks at all). The session and the figures are never queued behind the history.
 *
 * The games ledger (the design's): Date, Game, Table (its edition), Players, Finish, Credits, Rating. Finish is the row's
 * disclosure (`aria-expanded`); a pointer may press anywhere on the row. The result: the players by place with their
 * final net worth in IN-GAME DOLLARS (your line bold, the `you` edge, "(you)"; other names link to their profiles), then
 * the table, the playing time, and for a credit table its wager, pool, payout, any advance and how it ended. Credits are
 * always written as credits; in-game dollars never become credits. Filters appear only past ten games.
 *
 * Owner rules kept: a cancelled table is not a game (Phase 4); another player's payout is never shown. Needs
 * session.js, records.js and pass.js. */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var P = window.LudumPass;
  var MAX_PAGES = 10;
  var FILTERS_FROM = 10;
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

  /** Phase 4: a table cancelled or expired before the deal is never a game. */
  function isCancelled(g) {
    if (g.history && g.history.value) return g.history.value === 'cancelled';
    var t = g.table && g.table.value;
    return t === 'cancelled' || t === 'expired' || (t === 'archived' && !g.startedAt);
  }

  /** The Finish cell: your place in the recorded result (ties share it), or "—". */
  function finishOf(g) {
    var r = g.inGame && g.inGame.rank;
    if (!r || typeof r.value !== 'number') return { text: '—', sub: null };
    var tied = g.inGame.tied && g.inGame.tied.value === true;
    return { text: R.ordinal(r.value), sub: 'of ' + g.playerCount + (tied ? ' · tied' : '') };
  }

  /** The credit cells of one game (pure): wager, net credits and rating change -- a dash where the game has none. */
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

  /** The game's playing time: from the deal to its last moment -- never estimated. */
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

  /** How a game ended, in one line, when the status alone does not say why. Null for a game that simply ended on its
   *  board, or is still being played. */
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
   *  credit table only what its row does not show: the pool, your payout, Ludum's advance and how it ended. */
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

  /** v1.6: the game a row names (the design's Game column) and its table (the edition: "18XX+"). */
  function gameColumns(g) {
    var game = g.game && typeof g.game.name === 'string' && g.game.name ? g.game.name : 'Project 18XX';
    var edition = R.gameName(g.game);
    return { game: game, table: /^18xx/.test(edition) ? edition.replace(/^18xx/, '18XX') : edition };
  }

  /** v1.6: the Credits and Rating cells (pure): a credit table's net credits (a void says its wager came back), or "No
   *  wager"; the Skill Rating change, or "Unrated". */
  function ledgerCells(g) {
    var c = creditCells(g);
    var credit = !g.credits ? { text: 'No wager', cls: 'ld-games__muted' } : g.credits.outcome === 'void' ? { text: 'Returned', cls: 'ld-games__muted' } : g.credits.outcome === 'open' ? { text: 'In play', cls: 'ld-games__muted' } : { text: c.net.text, cls: c.net.cls };
    var rating = g.credits && typeof g.credits.ratingDelta === 'number' ? { text: c.rating.text, cls: c.rating.cls } : { text: 'Unrated', cls: 'ld-games__muted' };
    return { credits: credit, rating: rating };
  }

  /* ---------- a game's result, in place ---------- */

  var el = R.el;

  function playerName(s) {
    var name = s.profileName || s.displayName;
    if (s.you) return el('span', null, [name, el('span', { class: 'ld-places__you', text: ' (you)' })]);
    return s.profileName ? el('a', { class: 'ld-name-link', href: '/players/?name=' + encodeURIComponent(s.profileName), text: name }) : el('span', { text: name });
  }

  function placesList(g, seats) {
    var ordered = standingsOf(seats);
    var anyPlace = seats.some(function (s) { return s.rank && typeof s.rank.value === 'number'; });
    var anyWorth = seats.some(function (s) { return s.finalNetWorth && s.finalNetWorth.value; });
    var head = el('div', { class: 'ld-places__head', 'aria-hidden': 'true' }, [el('span', { text: anyPlace ? 'Place' : '' }), el('span', { text: 'Player' }), el('span', { class: 'is-num', text: anyWorth ? 'Net worth' : '' })]);
    var list = el('ol', { class: 'ld-places', 'aria-label': anyWorth ? 'Final standings, net worth in in-game dollars' : 'Players' }, ordered.map(function (s) {
      return el('li', { class: s.you ? 'is-you' : null }, [
        el('span', { class: 'ld-places__place', text: s.rank && typeof s.rank.value === 'number' ? R.ordinal(s.rank.value) : '—' }),
        el('span', null, [playerName(s)]),
        el('span', { class: 'is-num' }, [el('span', { class: 'ld-sr', text: 'net worth ' }), s.finalNetWorth && s.finalNetWorth.value ? R.dollars(s.finalNetWorth.value.dollars) : '—'])
      ]);
    }));
    var note = isOver(g) && !anyPlace && !(g.credits && g.credits.outcome === 'void') ? el('p', { class: 'ld-games__muted', text: 'No result was recorded for this game.' }) : null;
    return el('div', null, [head, list, note]);
  }

  function factsList(g) {
    var cols = gameColumns(g);
    var facts = [['Table', cols.table + ' · ' + g.playerCount + ' player' + (g.playerCount === 1 ? '' : 's') + (g.mode === 'live' ? ' · Live' : g.mode === 'async' ? ' · Async' : '')]];
    if (typeof g.tableCode === 'string' && g.tableCode) facts.push(['Code', g.tableCode]);
    if (Array.isArray(g.rules) && g.rules.length) facts.push(['Rules', g.rules.join(' · ')]);
    var played = playedOf(g);
    if (played) facts.push(['Played', R.day(played.start) + ', ' + R.clock(played.start).replace(' UTC', '') + '–' + (R.day(played.end) === R.day(played.start) ? '' : R.day(played.end) + ', ') + R.clock(played.end) + ' · ' + played.text]);
    else if (g.startedAt && !isOver(g)) facts.push(['Began', R.day(g.startedAt)]);
    var c = g.credits;
    facts.push(['Wager', c ? R.credits(c.wager) + ' credits' + (c.outcome === 'void' ? ' (returned)' : '') : 'None']);
    if (c) {
      if (typeof c.pool === 'number') facts.push(['Pool', R.credits(c.pool) + ' credits']);
      if (c.outcome !== 'void' && typeof c.payout === 'number') facts.push(['Your payout', R.credits(c.payout) + ' credits']);
      if (c.fronted > 0) facts.push(['Ludum advanced', R.credits(c.fronted) + ' credits']);
    }
    facts.push(['Rating', c && typeof c.ratingDelta === 'number' ? R.ratingChange(c.ratingDelta) + ' Skill Rating' : c && c.outcome === 'open' ? 'Rated when it settles' : 'Unrated table']);
    var ending = endingOf(g);
    if (ending) facts.push(['Ended', ending]);
    return el('dl', { class: 'ld-games__facts' }, facts.map(function (f) { return el('div', null, [el('dt', { text: f[0] }), el('dd', { text: f[1] })]); }));
  }

  /* ---------- the games ---------- */

  var COLUMNS = [['Date', 'c-date'], ['Game', 'c-game'], ['Table', 'c-table'], ['Players', 'c-players'], ['Finish', 'c-finish'], ['Credits', 'c-credits'], ['Rating', 'c-rating is-num']];

  /** The Games panel: filters past ten games, the ledger, each result opening in place. Returns {host, set(games, more),
   *  open(gameId)}: `set` redraws with more games as older pages arrive, keeping what is open. */
  function gamesBlock(session) {
    var host = el('div');
    var games = [];
    var more = false;
    var filter = { game: '', outcome: '', oldest: false };
    var opened = {};
    var details = {};
    var shown = {};
    var bar = null;
    var slot = el('div');
    var countLine = el('p', { class: 'ld-filters__count', role: 'status' });

    function detailOf(g) {
      if (!details[g.gameId]) details[g.gameId] = session.api('game', { gameId: g.gameId }).catch(function (e) { delete details[g.gameId]; throw e; });
      return details[g.gameId];
    }

    function gameRows(g) {
      var cols = gameColumns(g);
      var cells = ledgerCells(g);
      var panel = el('div', { class: 'ld-games__result' });
      var moreRow = el('tr', { class: 'ld-games__more', id: 'game-' + g.gameId, hidden: true }, [el('td', { colspan: String(COLUMNS.length) }, [panel])]);
      var finish = finishOf(g);
      function finishButton(f) {
        return el('button', { class: 'ld-games__finish', type: 'button', 'aria-expanded': 'false', 'aria-controls': moreRow.id, 'aria-label': (f.text === '—' ? 'No place recorded' : f.text + ' ' + f.sub) + ', ' + R.day(dateOf(g)) + ', result' }, [
          el('b', { text: f.text }), f.sub ? el('span', { text: f.sub }) : null, R.icon('arrow-down')
        ]);
      }
      var button = finishButton(finish);
      var finishCell = el('td', { class: 'c-finish' }, [button]);
      var row = el('tr', { class: 'ld-games__row', 'data-game': g.gameId }, [
        el('td', { class: 'c-date' }, [el('span', { class: 'ld-games__date', text: R.day(dateOf(g)) })]),
        el('td', { class: 'c-game' }, [el('span', { class: 'ld-games__game', text: cols.game })]),
        el('td', { class: 'c-table' }, [el('span', { text: cols.table })]),
        el('td', { class: 'c-players', text: String(g.playerCount) }),
        finishCell,
        el('td', { class: 'c-credits' }, [el('span', { class: cells.credits.cls, text: cells.credits.text })]),
        el('td', { class: 'c-rating is-num' }, [el('span', { class: cells.rating.cls, text: cells.rating.text })])
      ]);
      function fill() {
        panel.textContent = '';
        panel.appendChild(el('p', { class: 'ld-games__muted', text: 'Reading the players…' }));
        detailOf(g).then(function (d) {
          panel.textContent = '';
          panel.appendChild(placesList(g, d.seats || []));
          panel.appendChild(factsList(g));
          /* A place read only now (a game past the page's replays): the row says it too. */
          if (finishOf(g).text === '—') {
            var you = (d.seats || []).filter(function (s) { return s.you; })[0];
            if (you && you.rank && typeof you.rank.value === 'number') {
              g.inGame = { rank: you.rank, finalNetWorth: you.finalNetWorth };
              var fresh = finishButton(finishOf(g));
              fresh.setAttribute('aria-expanded', 'true');
              fresh.addEventListener('click', toggle);
              finishCell.replaceChild(fresh, button);
              button = fresh;
            }
          }
        }, function () {
          panel.textContent = '';
          var again = el('button', { class: 'ld-link', type: 'button', text: 'Try again' });
          again.addEventListener('click', fill);
          panel.appendChild(el('p', { class: 'ld-games__muted', role: 'alert' }, ['The players could not be read just now. ', again]));
        });
      }
      function set(open) {
        opened[g.gameId] = open;
        moreRow.hidden = !open;
        row.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open && !panel.firstChild) fill();
        try { window.history.replaceState(null, '', open ? '/me/?game=' + encodeURIComponent(g.gameId) : '/me/'); } catch (e) { /* the address stays */ }
      }
      function toggle() { set(moreRow.hidden); }
      button.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
      /* A pointer or a tap anywhere on the row opens it too (its links and buttons keep their own). */
      row.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('a, button, select, summary, input')) return; toggle(); });
      if (opened[g.gameId]) set(true);
      return { rows: [row, moreRow], open: function () { set(true); return button; } };
    }

    function options(values) { return [''].concat(values).map(function (v) { return el('option', { value: v, text: v || 'All' }); }); }
    function unique(key) { var seen = []; games.forEach(function (g) { var v = facetsOf(g)[key]; if (seen.indexOf(v) === -1) seen.push(v); }); return seen.sort(); }
    function select(id, label, values, onChange) {
      var s = el('select', { class: 'ld-select', id: id }, values);
      s.addEventListener('change', function () { onChange(s.value); draw(); });
      return el('label', { class: 'ld-filter', for: id }, [el('span', { class: 'ld-label-s', text: label }), s]);
    }
    function filters() {
      return el('div', { class: 'ld-filterhead' }, [el('div', { class: 'ld-filterbar', role: 'group', 'aria-label': 'Filter your games' }, [
        select('rec-game', 'Game', options(unique('game')), function (v) { filter.game = v; }),
        select('rec-outcome', 'Status', options(unique('outcome')), function (v) { filter.outcome = v; }),
        select('rec-order', 'Order', [el('option', { value: 'new', text: 'Newest first' }), el('option', { value: 'old', text: 'Oldest first' })], function (v) { filter.oldest = v === 'old'; })
      ]), countLine]);
    }

    function draw() {
      slot.textContent = '';
      shown = {};
      if (!games.length) { slot.appendChild(el('div', { class: 'ld-none' }, [el('b', { text: 'No games yet' }), el('p', { text: 'Tables you sit at on play.netadao.org appear here.' })])); return; }
      var rows = filtered(games, filter);
      countLine.textContent = rows.length + ' of ' + games.length + ' game' + (games.length === 1 ? '' : 's');
      if (!rows.length) { slot.appendChild(el('div', { class: 'ld-none' }, [el('b', { text: 'No games match' }), el('p', { text: 'Choose “All” to see every game.' })])); return; }
      var trs = [];
      rows.forEach(function (g) { var made = gameRows(g); shown[g.gameId] = made; trs.push(made.rows[0], made.rows[1]); });
      slot.appendChild(el('table', { class: 'ld-games' }, [
        el('caption', { class: 'ld-sr', text: 'Your games, ' + (filter.oldest ? 'oldest' : 'newest') + ' first' }),
        el('thead', null, [el('tr', null, COLUMNS.map(function (c) { return el('th', { scope: 'col', class: c[1], text: c[0] }); }))]),
        el('tbody', null, trs)
      ]));
      if (more) slot.appendChild(el('p', { class: 'ld-games__muted', text: 'Older games are not listed here.' }));
    }

    host.appendChild(slot);
    return {
      host: host,
      set: function (list, older) {
        games = list;
        more = older;
        if (games.length > FILTERS_FROM && bar === null) { bar = filters(); host.insertBefore(bar, slot); }
        draw();
      },
      loading: function () { slot.textContent = ''; slot.appendChild(el('p', { class: 'ld-games__muted', role: 'status', text: 'Reading your games…' })); },
      failed: function (e) {
        slot.textContent = '';
        slot.appendChild(el('div', { class: 'ld-none', role: 'alert' }, [el('b', { text: 'Your games can’t be read right now' }), el('p', { text: e && e.error === 'rate-limited' ? 'Too many requests. Try again in a minute.' : 'Try again in a moment.' })]));
      },
      /** Open one game's result and bring it into view; false when the game is not (yet) listed. */
      open: function (gameId) {
        if (!shown[gameId]) {
          if (!games.some(function (g) { return g.gameId === gameId; })) return false;
          filter = { game: '', outcome: '', oldest: filter.oldest };
          if (bar) bar.querySelectorAll('select').forEach(function (s) { if (s.id !== 'rec-order') s.value = ''; });
          draw();
        }
        var b = shown[gameId].open();
        var row = slot.querySelector('tr[data-game="' + gameId + '"]');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
        if (b && b.focus) b.focus({ preventScroll: true });
        return true;
      }
    };
  }

  /* ---------- the page ---------- */

  function signedOut(slot) {
    slot.textContent = '';
    slot.appendChild(el('div', { class: 'ld-none' }, [el('b', { text: 'Signed out' }), el('p', { text: 'Sign in to see your profile, your games and your account.' }),
      el('p', null, [el('a', { class: 'ld-btn', href: window.LudumSession.signInUrl('/me/') }, ['Sign in ', P.svg(P.ARROW_RIGHT)])])]));
  }

  /** The session and the figures start together, the games once the session says signed in; each draws as it lands.
   *  Until the session answers, the pass's shell: nothing personal. */
  function mount(root, session) {
    var slot = root.querySelector('[data-pass-slot]');
    var wanted = openedIn(window.location.search);
    slot.replaceChildren(P.pass(null, {}), P.passFoot());
    var who = session.whoami();
    var figures = session.api('profile', {});
    /* Nothing is left unhandled while the session is being read. */
    figures.catch(function () { return null; });
    return who.then(function (w) {
      if (!w || w.signedIn !== true) { signedOut(slot); return; }
      var firstPage = session.api('games', { limit: 50 });
      firstPage.catch(function () { return null; });
      slot.textContent = '';
      var passSlot = el('div');
      passSlot.appendChild(P.pass(null, { name: w.account.name }));
      slot.appendChild(passSlot);
      slot.appendChild(P.passFoot());
      var tabsSlot = el('div', null, [P.tabsRow(w, 'games', { daoMember: R.rememberedMember(window.localStorage, Date.now(), R.accountOf(w)) })]);
      slot.appendChild(tabsSlot);
      var block = gamesBlock(session);
      block.loading();
      slot.appendChild(el('section', { class: 'ld-panel', 'aria-labelledby': 'panel-games' }, [el('h2', { class: 'ld-sr', id: 'panel-games', text: 'Games' }), block.host]));
      var dao = R.rememberedMember(window.localStorage, Date.now(), R.accountOf(w));
      R.checkMembership(w).then(function (member) { if (member !== null && member !== dao) { dao = member; tabsSlot.replaceChildren(P.tabsRow(w, 'games', { daoMember: member, games: tabCount })); } });
      var tabCount;

      figures.then(function (profile) {
        passSlot.replaceChildren(P.pass(P.figuresOfProfile(profile, w)));
      }, function () {
        /* The figures once more after a short wait (a busy moment, a slow network); the pass's shell stays meanwhile. */
        setTimeout(function () { session.api('profile', {}).then(function (profile) { passSlot.replaceChildren(P.pass(P.figuresOfProfile(profile, w))); }, function () { /* the shell stays */ }); }, 1500);
      });

      var all = [];
      function next(cursor, n) {
        return session.api('games', { cursor: cursor, limit: 50 }).then(function (r) { return arrived(r, n); });
      }
      function arrived(r, n) {
        all = all.concat(r.games);
        /* v1.7 (owner, 2026-10-24): a cancelled table is never listed -- a legacy money table's included (the retired
           escrow's refund is no player-facing record; the server keeps the game's record). */
        var listed = all.filter(function (g) { return !isCancelled(g); });
        var older = r.nextCursor !== null && n + 1 >= MAX_PAGES;
        block.set(listed, older);
        if (r.nextCursor !== null && n + 1 < MAX_PAGES) return next(r.nextCursor, n + 1);
        tabCount = listed.length;
        tabsSlot.replaceChildren(P.tabsRow(w, 'games', { daoMember: dao, games: tabCount }));
        return listed;
      }
      return firstPage.then(function (r) {
        var first = arrived(r, 0);
        if (wanted && !block.open(wanted)) {
          /* Maybe on an older page: try again once every page is in. */
          Promise.resolve(first).then(function () {
            if (!block.open(wanted)) block.host.insertBefore(el('div', { class: 'ld-none' }, [el('b', { text: 'Not in your games' }), el('p', { text: 'That game is not one you sat at, or it is older than the games listed here.' })]), block.host.firstChild);
          });
        }
        return first;
      }).catch(function (e) {
        if (e && e.error === 'signed-out') { signedOut(slot); return; }
        block.failed(e);
      });
    }, function () {
      slot.textContent = '';
      slot.appendChild(el('div', { class: 'ld-none', role: 'alert' }, [el('b', { text: 'Your profile can’t be read right now' }), el('p', { text: 'Try again in a moment.' })]));
    });
  }

  window.LudumMeRecord = {
    isCancelled: isCancelled, finishOf: finishOf, creditCells: creditCells, filtered: filtered, facetsOf: facetsOf,
    isOver: isOver, playedOf: playedOf, dateOf: dateOf, standingsOf: standingsOf, endingOf: endingOf, factsOf: factsOf, openedIn: openedIn,
    gameColumns: gameColumns, ledgerCells: ledgerCells, mount: mount
  };
  function start() {
    var root = document.querySelector('[data-ludum-record]');
    if (root && window.LudumSession && R && P) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
