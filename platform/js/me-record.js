/* Ludum · /me/ — Profile · Your record: your figures first (Credits, Lifetime Earnings, each game's Skill Rating, games
 * played), then your games and your cases. Reads `session`, `profile` (1830Juno §16: the server's own figures, never
 * recomputed here), `games` (every page, up to MAX_PAGES) and, for each disputed table only, `game`.
 *
 * The Games table names the GAME by its recorded edition (18xx, 18xx+, 18xx+: LPF), lists only the optional rules the host
 * chose, shows the table's code while the server still holds it (a private table's is released when it starts; never
 * invented), and, for a credit table, the wager, the net credits and the Skill Rating change. A table that was not played
 * for credits shows a dash there: nothing is converted or guessed. Needs session.js and records.js.
 *
 * Owner rules kept: a cancelled table is not a game (Phase 4); the private / public thresholds are the server's (the
 * page says which figures others see, and why, only in the tooltips). */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var MAX_PAGES = 10;

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

  /** The credit cells of one game (pure): wager, net credits and rating change -- a dash where the game has none. A
   *  table played before credits says so once, under its wager. */
  function creditCells(g) {
    var c = g.credits;
    var dash = { text: '—', cls: 'ld-amt ld-amt--zero' };
    if (!c) return { wager: dash, net: dash, rating: dash, note: g.money ? 'JUNOX table (retired)' : null };
    var net = c.outcome === 'open' || typeof c.net !== 'number' ? dash : { text: R.credits(c.net, true), cls: R.signClass(c.net) };
    var rating = typeof c.ratingDelta === 'number' ? { text: R.ratingChange(c.ratingDelta), cls: R.signClass(c.ratingDelta) } : dash;
    return { wager: { text: R.credits(c.wager), cls: 'ld-amt' }, net: net, rating: rating, note: c.outcome === 'open' ? 'In play' : c.outcome === 'void' ? 'Returned' : null };
  }

  /** The row's date: when it ended, else began, else was opened. */
  function dateOf(g) { return g.endedAt || g.startedAt || g.createdAt || null; }

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

  /* ---------- the figures ---------- */

  var TIPS = {
    credits: 'Your available credits plus any in play at unfinished tables, including credits Ludum has advanced. Other players see this figure once you have 5 credit-settled games.',
    earnings: 'Payouts minus wagers, over every settled game. Grants and advances never count. Other players see it once you have 5 credit-settled games, and never below 0.',
    rating: 'Each game has its own Skill Rating. 18xx, 18xx+ and 18xx+: LPF share one. It is provisional until 5 rated games; other players see it from then.',
    played: 'Tables played to the end. Your place is among every player with a completed game; ties share a place. It counts activity, not skill.'
  };

  function stat(label, value, small, tipText, cls) {
    return R.el('div', cls ? { class: cls } : null, [
      R.el('dt', null, [label, ' ', R.tip(label, tipText)]),
      R.el('dd', null, [value, small ? R.el('small', { text: small }) : null])
    ]);
  }

  /** The summary strip: Credits, Lifetime Earnings, each game's Skill Rating, games played. */
  function figures(p) {
    var c = p.credits;
    var parts = [
      stat('Credits', R.credits(c.holdings), R.publicState(p.publicCredits, 'settled games'), TIPS.credits),
      stat('Lifetime Earnings', R.el('span', { class: R.signClass(p.lifetimeEarnings), text: R.credits(p.lifetimeEarnings, true) }), R.publicState(p.publicLifetimeEarnings, 'settled games'), TIPS.earnings)
    ];
    p.ratings.forEach(function (r) {
      parts.push(stat('Skill Rating · ' + r.name, R.rating(r.rating), r.established ? 'Established' : 'Provisional · ' + r.games + ' of 5', TIPS.rating));
    });
    var gp = p.gamesPlayed || { count: 0, rank: null, of: 0 };
    parts.push(stat('Games played', String(gp.count), gp.rank === null ? null : 'Rank #' + gp.rank + ' of ' + gp.of, TIPS.played));
    var dl = R.el('dl', { class: 'ld-sum ld-sum--figures ld-sum--' + Math.min(5, parts.length) }, parts);
    var detail = null;
    if (c.inPlay > 0 || c.advanceOutstanding > 0) {
      var bits = ['Available ' + R.credits(c.available), 'In play ' + R.credits(c.inPlay)];
      if (c.advanceOutstanding > 0) bits.push('Ludum advance ' + R.credits(c.advanceOutstanding) + ' (repaid from later winnings)');
      detail = R.el('p', { class: 'ld-sum__line', text: bits.join(' · ') });
    }
    return R.el('div', { class: 'ld-figures' }, [dl, detail]);
  }

  /* ---------- the games ---------- */

  function gameHref(g) { return '/me/game/?id=' + encodeURIComponent(g.gameId); }

  function gameRow(g) {
    var o = R.outcomeOf(g);
    var f = finishOf(g);
    var c = creditCells(g);
    var code = typeof g.tableCode === 'string' && g.tableCode ? g.tableCode : null;
    var rules = Array.isArray(g.rules) && g.rules.length ? g.rules.join(' · ') : '—';
    var mode = g.mode === 'live' ? 'Live' : g.mode === 'async' ? 'Async' : null;
    return R.el('tr', null, [
      R.td('Date', [R.val(R.day(dateOf(g)))]),
      R.td('Game', [R.val(R.el('span', { class: 'ld-game-cell', text: R.gameName(g.game) }), mode)], 'is-key'),
      R.td('Variant rules', [R.val(rules)]),
      R.td('Table', [R.val(R.el('a', { class: 'ld-code-cell', href: gameHref(g), title: code ? null : 'This table’s code was released when it started', text: code || 'Record' }))]),
      R.td('Status', [R.val(R.stamp(o.text, o.kind))]),
      R.td('Finish', [R.val(f.text, f.sub)], 'is-num'),
      R.td('Wager', [R.val(R.el('span', { class: c.wager.cls, text: c.wager.text }), c.note)], 'is-num'),
      R.td('Net credits', [R.val(R.el('span', { class: c.net.cls, text: c.net.text }))], 'is-num'),
      R.td('Rating change', [R.val(R.el('span', { class: c.rating.cls, text: c.rating.text }))], 'is-num'),
      R.go(gameHref(g))
    ]);
  }

  var COLUMNS = [['Date'], ['Game'], ['Variant rules'], ['Table'], ['Status'], ['Finish', true], ['Wager', true], ['Net credits', true], ['Rating change', true], ['']];

  /** The Games table with its two filters and its order (lightweight: selects, no framework). */
  function gamesBlock(games, more) {
    var host = R.el('div', { class: 'ld-record' });
    if (!games.length) { host.appendChild(R.notice('No games yet', 'Tables you sit at on play.netadao.org appear here.', 'wait')); return host; }
    var filter = { game: '', outcome: '', oldest: false };
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
    function draw() {
      var rows = filtered(games, filter);
      count.textContent = rows.length + ' of ' + games.length + ' game' + (games.length === 1 ? '' : 's');
      slot.textContent = '';
      slot.appendChild(rows.length
        ? R.ledger({ label: 'Your games', columns: COLUMNS, rows: rows.map(gameRow), note: more ? 'Older games are not listed here.' : null })
        : R.notice('No games match', 'Choose “All” to see every game.', 'wait'));
    }
    host.appendChild(R.el('div', { class: 'ld-filterhead' }, [bar, count]));
    host.appendChild(slot);
    draw();
    return host;
  }

  /* ---------- cases (the retired escrow's disputes: kept as they were) ---------- */

  function caseRow(g, detail) {
    var m = g.money, d = detail && detail.dispute && detail.dispute.value;
    var left = d ? R.daysUntil(d.resolverTimeoutAt, Date.now()) : null;
    var status = !d ? R.stamp('Disputed', 'held') : d.resolution ? R.stamp(d.resolution === 'uphold' ? 'Upheld' : d.resolution === 'annul' ? 'Annulled' : 'Replaced', 'closed', '/disputes/case/?id=' + m.chainGameId) : R.stamp('Disputed', 'held', '/disputes/case/?id=' + m.chainGameId);
    var deadline = !d ? '—' : d.resolution ? 'Resolved ' + R.day(d.resolvedAt) : null;
    return R.el('tr', null, [
      R.td('Case', [R.el('a', { href: '/disputes/case/?id=' + m.chainGameId, text: m.chainGameId })], 'is-key'),
      R.td('Game', [R.val(R.gameName(g.game), R.el('a', { href: gameHref(g), text: g.tableCode || 'Record' }))]),
      R.td('Disputed', [R.val(d ? R.day(d.disputedAt) : '—')]),
      R.td('Challenger', [R.val(d ? (d.challengerIsYou ? 'You' : 'Another seat') : '—')]),
      R.td('Status', [R.val(status)]),
      R.td('Resolver deadline', [deadline !== null ? R.val(deadline) : R.val(R.day(d.resolverTimeoutAt) + ' · ' + R.clock(d.resolverTimeoutAt), left !== null ? (left > 0 ? left + ' days left' : 'passed') : null)]),
      R.go('/disputes/case/?id=' + m.chainGameId)
    ]);
  }

  function signedOut(frame) {
    frame.textContent = '';
    frame.appendChild(R.rechead({ kicker: 'Profile', title: 'Your record' }));
    frame.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice('Signed out', 'Sign in to see your record.', 'wait', R.el('a', { class: 'ld-btn', href: window.LudumSession.signInUrl('/me/'), text: 'Sign in' }))]));
  }

  function errorNotice(e) {
    var text = e && e.error === 'rate-limited' ? 'Too many requests. Try again in a minute.' : 'Your record is unavailable right now. Try again in a moment.';
    return R.el('div', { class: 'ld-wrap' }, [R.notice('Unavailable', text, 'stop')]);
  }

  function mount(root, session) {
    var frame = root.querySelector('[data-rec-frame]');
    var body = root.querySelector('[data-rec-body]');
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) { signedOut(frame); return; }
      var all = [];
      function page(cursor, n) {
        return session.api('games', cursor === null ? { limit: 50 } : { cursor: cursor, limit: 50 }).then(function (r) {
          all = all.concat(r.games);
          return r.nextCursor !== null && n + 1 < MAX_PAGES ? page(r.nextCursor, n + 1) : { more: r.nextCursor !== null };
        });
      }
      /* The figures are read beside the games; a server without them (or without the competition) shows the games alone. */
      var standing = session.api('profile', {}).catch(function () { return null; });
      return Promise.all([page(null, 0), standing]).then(function (both) {
        var end = both[0], profile = both[1];
        R.profileFrame(frame, who, 'record', {
          kicker: 'Profile', muted: 'Only you can see this page', title: who.account.name,
          meta: [['Public profile', R.el('a', { class: 'ld-link', href: '/players/?name=' + encodeURIComponent(who.account.name), text: 'How others see you' })]]
        });
        body.textContent = '';
        if (profile) body.appendChild(R.section('01', 'r0', 'Your figures', null, [figures(profile)], 'ld-section--figures'));
        var listed = all.filter(function (g) { return !isCancelled(g) || keepsCancelled(g); });
        body.appendChild(R.section(profile ? '02' : '01', 'r1', 'Games', null, [gamesBlock(listed, end.more)]));
        var disputed = all.filter(function (g) { return g.money && g.money.chainGameId && ((g.disputed && g.disputed.value === true) || (g.money.escrow && g.money.escrow.value === 'disputed')); });
        if (!disputed.length) return;
        var casesHost = R.el('div', { class: 'ld-record' }, [R.el('p', { class: 'ld-body-s', text: 'Reading your cases…' })]);
        body.appendChild(R.section(profile ? '03' : '02', 'r2', 'Cases', 'Disputed tables you sat at, and where each one stands.', [casesHost]));
        return Promise.all(disputed.map(function (g) { return session.api('game', { gameId: g.gameId }).catch(function () { return null; }); })).then(function (details) {
          casesHost.textContent = '';
          casesHost.appendChild(R.ledger({ label: 'Your cases', columns: [['Case'], ['Game'], ['Disputed'], ['Challenger'], ['Status'], ['Resolver deadline'], ['']], rows: disputed.map(function (g, i) { return caseRow(g, details[i]); }) }));
        });
      });
    }).catch(function (e) {
      if (e && e.error === 'signed-out') { signedOut(frame); return; }
      body.textContent = '';
      body.appendChild(errorNotice(e));
    });
  }

  window.LudumMeRecord = { isCancelled: isCancelled, keepsCancelled: keepsCancelled, finishOf: finishOf, creditCells: creditCells, filtered: filtered, facetsOf: facetsOf, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-record]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
