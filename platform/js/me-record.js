/* Ludum · /me/ — Profile · Your record (AccountRecord): the head (games played, total paid to you, last played), the
 * profile tabs, the Games ledger and the Cases ledger, as designed. Reads `session`, `games` (every page, up to
 * MAX_PAGES) and, for each disputed table only, `game` (whose dispute says who challenged).
 *
 * JUNOX (escrow money, integer ujunox strings) and in-game dollars are never mixed. A figure the server marks
 * unavailable is shown as "—", never filled in. Needs session.js and records.js.
 *
 * Phase 4: the Games ledger is the completed-game history (and tables in play): a table cancelled before the deal is
 * not a game, so it has no finish and no result; one that held escrow money keeps an audit line under "Cancelled
 * tables" (its refund), and one nobody funded is not listed. Finish is your rank as the server recorded it. */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var MAX_PAGES = 10;

  var TABLE_STAMP = {
    waiting: ['Waiting', ''], active: ['Playing', ''], completed: ['Complete', 'closed'], cancelled: ['Cancelled', 'closed'],
    expired: ['Expired', 'closed'], archived: ['Archived', 'closed']
  };

  /** The Result cell's model (pure): the signed net in JUNOX and the line under it. */
  function resultOf(g) {
    var m = g.money;
    if (!m) return { text: '—', cls: 'ld-amt ld-amt--zero', sub: 'Free table' };
    var escrow = m.escrow && m.escrow.value;
    var net = m.net && m.net.value ? m.net.value.amount : null;
    if (escrow === 'disputed') return { text: 'Held', cls: 'ld-amt ld-amt--held', sub: 'Disputed', caseId: m.chainGameId };
    if (net === null) {
      var live = g.table && (g.table.value === 'active' || g.table.value === 'waiting');
      return { text: '—', cls: 'ld-amt ld-amt--zero', sub: live ? 'Still playing' : 'Not yet known' };
    }
    var back = (BigInt(net) + BigInt(m.anteGross.amount)).toString();
    var sub = escrow === 'annulled' ? 'Annulled · ' + R.junox(back) + ' refunded' : escrow === 'cancelled' ? 'Cancelled · ' + R.junox(back) + ' refunded' : 'Paid ' + R.junox(back);
    return { text: R.junox(net, true), cls: R.amountClass(net), sub: sub };
  }

  /** Phase 4 (pure): a table cancelled or expired before the deal is never a game -- no result, no rank, never a loss.
   *  The server says so (`history`, API §5.3); a server without that field is read from the table's own status. */
  function isCancelled(g) {
    if (g.history && g.history.value) return g.history.value === 'cancelled';
    var t = g.table && g.table.value;
    return t === 'cancelled' || t === 'expired' || (t === 'archived' && !g.startedAt);
  }

  /** Phase 4 (pure): the Finish cell -- your rank in the game's own standings (ties share a rank, as the game ranks
   *  them), from the server's recorded result; "—" when no result is recorded (a free table's needs a replay). */
  function finishOf(g) {
    var r = g.inGame && g.inGame.rank;
    if (!r || typeof r.value !== 'number') return { text: '—', sub: null };
    var tied = g.inGame.tied && g.inGame.tied.value === true;
    return { text: R.ordinal(r.value), sub: 'of ' + g.playerCount + (tied ? ' · tied' : '') };
  }

  /** Phase 4 (pure): a cancelled table's escrow line -- what came back, never a signed result. Null for a table no
   *  escrow game was bound to: nothing was funded, so there is nothing to account for. */
  function refundOf(g) {
    var m = g.money;
    if (!m || !m.chainGameId) return null;
    var escrow = m.escrow && m.escrow.value;
    var net = m.net && m.net.value ? m.net.value.amount : null;
    if (net === null || escrow !== 'cancelled') return { text: '—', cls: 'ld-amt ld-amt--zero', sub: escrow === 'funding' ? 'Refund pending' : 'Not yet known' };
    return { text: R.junox((BigInt(net) + BigInt(m.anteGross.amount)).toString()), cls: 'ld-amt ld-amt--zero', sub: 'Refunded' };
  }

  /** The head's three figures (pure), from every summary read. */
  function headOf(games) {
    var paid = BigInt(0), anyPaid = false, last = null;
    games.forEach(function (g) {
      var m = g.money, cancelled = isCancelled(g);
      /* A cancelled table counts only what the escrow actually refunded (never an expected deposit). */
      if (m && m.net && m.net.value && m.escrow && m.escrow.value !== 'disputed' && (!cancelled || m.escrow.value === 'cancelled')) {
        paid += BigInt(m.net.value.amount) + BigInt(m.anteGross.amount);
        anyPaid = true;
      }
      if (cancelled) return;
      var at = g.endedAt || g.startedAt || g.createdAt;
      if (at && (last === null || at > last)) last = at;
    });
    var played = games.filter(function (g) { return g.startedAt !== null; }).length;
    return { played: played, paid: anyPaid ? R.junox(paid.toString()) + ' JUNOX' : '—', last: last ? R.day(last) : '—' };
  }

  function gameName(g) { return g.variant || (g.product && g.product.name) || 'Game'; }
  function gameHref(g) { return '/me/game/?id=' + encodeURIComponent(g.gameId); }

  function gameRow(g) {
    var st = TABLE_STAMP[g.table && g.table.value] || ['—', 'closed'];
    var r = resultOf(g);
    var sub = r.caseId ? R.el('span', null, [r.sub + ' · ', R.el('a', { class: 'ld-inline', href: '/disputes/case/?id=' + r.caseId, text: 'case ' + r.caseId })]) : r.sub;
    var f = finishOf(g);
    return R.el('tr', null, [
      R.td('Game', [gameName(g)], 'is-key'),
      R.td('Table', [R.val(R.el('a', { href: gameHref(g) }, [R.idSpan(g.gameId)]))]),
      R.td('Status', [R.val(R.stamp(st[0], st[1]))]),
      R.td('Finish', [R.val(f.text, f.sub)], 'is-num'),
      R.td('Ante · JUNOX', [R.val(anteCell(g))], 'is-num'),
      R.td('Result · JUNOX', [R.val(R.el('span', { class: r.cls, text: r.text }), sub)], 'is-num'),
      R.go(gameHref(g))
    ]);
  }

  function anteCell(g) { return g.money ? R.el('span', { class: 'ld-amt', text: R.junox(g.money.anteGross.amount) }) : R.el('span', { class: 'ld-amt ld-amt--zero', text: '—' }); }

  /** Phase 4: a cancelled table that held escrow money -- its audit line (the full ledger is on its record page). */
  function cancelledRow(g, refund) {
    var st = TABLE_STAMP[g.table && g.table.value] || ['Cancelled', 'closed'];
    return R.el('tr', null, [
      R.td('Game', [gameName(g)], 'is-key'),
      R.td('Table', [R.val(R.el('a', { href: gameHref(g) }, [R.idSpan(g.gameId)]))]),
      R.td('Status', [R.val(R.stamp(st[0], st[1]))]),
      R.td('Ante · JUNOX', [R.val(anteCell(g))], 'is-num'),
      R.td('Refund · JUNOX', [R.val(R.el('span', { class: refund.cls, text: refund.text }), refund.sub)], 'is-num'),
      R.go(gameHref(g))
    ]);
  }

  function caseRow(g, detail) {
    var m = g.money, d = detail && detail.dispute && detail.dispute.value;
    var left = d ? R.daysUntil(d.resolverTimeoutAt, Date.now()) : null;
    var status = !d ? R.stamp('Disputed', 'held') : d.resolution ? R.stamp(d.resolution === 'uphold' ? 'Upheld' : d.resolution === 'annul' ? 'Annulled' : 'Replaced', 'closed', '/disputes/case/?id=' + m.chainGameId) : R.stamp('Disputed', 'held', '/disputes/case/?id=' + m.chainGameId);
    var deadline = !d ? '—' : d.resolution ? 'Resolved ' + R.day(d.resolvedAt) : null;
    return R.el('tr', null, [
      R.td('Case', [R.el('a', { href: '/disputes/case/?id=' + m.chainGameId, text: m.chainGameId })], 'is-key'),
      R.td('Game · table', [R.val(gameName(g), R.idSpan(g.gameId))]),
      R.td('Disputed', [R.val(d ? R.day(d.disputedAt) : '—')]),
      R.td('Challenger', [R.val(d ? (d.challengerIsYou ? 'You' : 'Another seat') : '—')]),
      R.td('Status', [R.val(status)]),
      R.td('Resolver deadline', [deadline !== null ? R.val(deadline) : R.val(R.day(d.resolverTimeoutAt) + ' · ' + R.clock(d.resolverTimeoutAt), left !== null ? (left > 0 ? left + ' days left' : 'passed') : null)]),
      R.go('/disputes/case/?id=' + m.chainGameId)
    ]);
  }

  function howDecided() {
    var steps = [
      ['Challenge', 'Inside a table’s challenge window, a player submits a challenge to the result.'],
      ['Review', 'Neta DAO’s Ludum DAO reviews challenges and may contact players for further information through Neta DAO’s Discord server.'],
      ['Resolution', 'The Ludum DAO votes and executes a resolution.']
    ];
    return R.el('div', { style: 'margin-top:32px' }, [R.el('details', { class: 'ld-disclose' }, [
      R.el('summary', null, [R.el('span', { text: 'How a dispute is decided' })]),
      R.el('div', { class: 'ld-disclose__body' }, [R.el('ol', { class: 'ld-vflow' }, steps.map(function (s) {
        return R.el('li', null, [R.el('span', { class: 'ld-vflow__name', text: s[0] }), R.el('span', { class: 'ld-vflow__text', text: s[1] })]);
      }))])
    ])]);
  }

  function signedOut(frame) {
    frame.textContent = '';
    frame.appendChild(R.rechead({ kicker: 'Profile', title: 'Your record', dek: 'Your games and cases on Ludum, from Play’s records and the Juno escrow.' }));
    var href = window.LudumSession.signInUrl('/me/');
    frame.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice('Signed out', 'Sign in to see your record. One account for Ludum and play.netadao.org.', 'wait', R.el('a', { class: 'ld-btn', href: href, text: 'Sign in' }))]));
  }

  function errorNotice(e) {
    var text = e && e.error === 'rate-limited' ? 'Too many requests. Try again in a minute.' : 'Your record is unavailable right now. Nothing is shown rather than an old value.';
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
          return r.nextCursor !== null && n + 1 < MAX_PAGES ? page(r.nextCursor, n + 1) : { more: r.nextCursor !== null, asOf: r.asOf };
        });
      }
      return page(null, 0).then(function (end) {
        var head = headOf(all);
        R.profileFrame(frame, who, 'record', {
          kicker: 'Profile', muted: 'Only you can see this page', title: who.account.name,
          dek: 'Your games and cases on Ludum, from Play’s records and the Juno escrow.',
          meta: [['Games played', String(head.played)], ['Total paid to you', head.paid], ['Last played', head.last]]
        });
        body.textContent = '';
        /* Phase 4: cancelled tables are not games. Those that held escrow money keep their audit line below. */
        var played = all.filter(function (g) { return !isCancelled(g); });
        var refunds = [];
        all.forEach(function (g) { var refund = isCancelled(g) ? refundOf(g) : null; if (refund) refunds.push(cancelledRow(g, refund)); });
        var games = played.length
          ? R.ledger({ columns: [['Game'], ['Table'], ['Status'], ['Finish', true], ['Ante', true, 'JUNOX'], ['Result', true, 'JUNOX'], ['']], rows: played.map(gameRow),
              note: 'Finish is your place in the game’s own standings; tied players share a place. Result is what the escrow paid or refunded you, less your ante; network fees are not included. A disputed table’s payout is held until its case is resolved; a free table has no ante.' + (end.more ? ' Older tables are not listed here.' : '') })
          : R.notice('No games yet', 'Tables you sit at on play.netadao.org appear here.', 'wait');
        var parts = [games];
        if (refunds.length) parts.push(R.ledger({ title: 'Cancelled tables', columns: [['Game'], ['Table'], ['Status'], ['Ante', true, 'JUNOX'], ['Refund', true, 'JUNOX'], ['']], rows: refunds,
          note: 'Cancelled before the deal: not games, so no finish and no result. The escrow refunds each deposit’s net ante; the network subsidy is not refunded.' }));
        body.appendChild(R.section('01', 'r1', 'Games', 'Every game you have played or are playing, newest first.', [R.el('div', { class: 'ld-record' }, parts)]));
        var disputed = all.filter(function (g) { return g.money && g.money.chainGameId && ((g.disputed && g.disputed.value === true) || (g.money.escrow && g.money.escrow.value === 'disputed')); });
        var casesHost = R.el('div', { class: 'ld-record' }, [R.el('p', { class: 'ld-body-s', text: disputed.length ? 'Reading your cases…' : '' })]);
        body.appendChild(R.section('02', 'r2', 'Cases', 'Disputed tables you sat at, and where each one stands.', [casesHost, howDecided()]));
        if (!disputed.length) { casesHost.textContent = ''; casesHost.appendChild(R.notice('No cases', 'None of your tables has been disputed.', 'wait')); return; }
        return Promise.all(disputed.map(function (g) { return session.api('game', { gameId: g.gameId }).catch(function () { return null; }); })).then(function (details) {
          casesHost.textContent = '';
          casesHost.appendChild(R.ledger({ columns: [['Case'], ['Game · table'], ['Disputed'], ['Challenger'], ['Status'], ['Resolver deadline'], ['']], rows: disputed.map(function (g, i) { return caseRow(g, details[i]); }),
            note: 'A case is the dispute of one table’s money; it never changes the game’s result.' }));
        });
      });
    }).catch(function (e) {
      if (e && e.error === 'signed-out') { signedOut(frame); return; }
      body.textContent = '';
      body.appendChild(errorNotice(e));
    });
  }

  window.LudumMeRecord = { resultOf: resultOf, headOf: headOf, isCancelled: isCancelled, finishOf: finishOf, refundOf: refundOf, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-record]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
