/* Ludum · /me/ — the signed-in account's games and finances (Lane C).
   Reads only through LudumSession (platform/js/session.js, Lane A): whoami() and api('games' | 'game', body).
   Every figure the server sends is a Fact with a provenance (docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md §4); every value
   shown here carries a marker saying which. JUNOX (escrow money, integer ujunox strings) and in-game dollars are kept in
   separate columns and are never summed, compared or formatted alike.
   No inline script: this file mounts itself on [data-ludum-history] once the document is parsed.
   Pure helpers are exposed on window.LudumHistory so platform/tests/history.test.mjs can pin them. */
(function () {
  'use strict';

  var PROVENANCE = {
    'chain-confirmed': { mark: 'C', cls: 'chain', label: 'Chain-confirmed (quorum read)' },
    'chain-observed': { mark: 'O', cls: 'observed', label: 'Chain-observed (single read)' },
    'server-recorded': { mark: 'S', cls: 'server', label: 'Server-recorded, not a chain fact' },
    'pending': { mark: 'P', cls: 'pending', label: 'Pending, not yet seen on chain' },
    'unavailable': { mark: '—', cls: 'unavailable', label: 'Unavailable' }
  };
  var ENTRY_LABEL = {
    ante_gross: 'Ante deposited', subsidy: 'of which network subsidy', bond_posted: 'Challenge bond posted',
    bond_returned: 'Challenge bond returned', bond_forfeited: 'Challenge bond to the pool', payout: 'Payout', refund: 'Refund'
  };
  /* Direction of each entry kind; 0 = informational (already inside another entry, never added again). */
  var ENTRY_SIGN = { ante_gross: -1, subsidy: 0, bond_posted: -1, bond_returned: 1, bond_forfeited: 0, payout: 1, refund: 1 };

  /* ---------- pure helpers ---------- */

  /** Integer base units (ujunox) → "1.336628 JUNOX". Strings only; never a JS number. */
  function formatJunox(amount, opts) {
    var s = String(amount);
    if (!/^-?\d+$/.test(s)) return 'invalid';
    var neg = s.charAt(0) === '-';
    var digits = (neg ? s.slice(1) : s).replace(/^0+(?=\d)/, '');
    while (digits.length < 7) digits = '0' + digits;
    var whole = digits.slice(0, -6).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var text = whole + '.' + digits.slice(-6) + ' JUNOX';
    var zero = /^0+$/.test(digits);
    if (neg && !zero) return '−' + text;
    if (opts && opts.signed && !zero) return '+' + text;
    return text;
  }

  /** In-game dollars (InGameMoney.dollars, a whole number) → "$7,400 in-game". Never JUNOX. */
  function formatDollars(dollars) {
    if (typeof dollars !== 'number' || !isFinite(dollars) || Math.floor(dollars) !== dollars) return 'invalid';
    var text = String(Math.abs(dollars)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (dollars < 0 ? '−$' : '$') + text + ' in-game';
  }

  function provenanceOf(fact) {
    var p = fact && PROVENANCE[fact.provenance] ? fact.provenance : 'unavailable';
    var base = PROVENANCE[p];
    var detail = base.label;
    if (fact && fact.height) detail += ' at height ' + fact.height;
    else if (fact && fact.observedAt) detail += ', read ' + fact.observedAt;
    if (fact && fact.reason) detail += ': ' + fact.reason;
    return { provenance: p, mark: base.mark, cls: base.cls, title: detail };
  }

  /** The ante is a Junox, not a Fact: it is the table's server-recorded terms until the chain read confirms it (§5). */
  function anteFact(money) {
    var escrow = money && money.escrow;
    if (escrow && (escrow.provenance === 'chain-confirmed' || escrow.provenance === 'chain-observed')) return { value: money.anteGross, provenance: escrow.provenance, height: escrow.height, observedAt: escrow.observedAt };
    return { value: money ? money.anteGross : null, provenance: money ? 'server-recorded' : 'unavailable', reason: money ? undefined : 'no stake' };
  }

  function dateOf(iso) { return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(iso) ? iso.slice(0, 10) : '—'; }

  /** B1's case page, relative to this origin; null unless the id is a chain game id. */
  function caseHref(chainGameId) { return typeof chainGameId === 'string' && /^\d{1,20}$/.test(chainGameId) ? '/disputes/case/?id=' + chainGameId : null; }

  /** One ledger row, as text + provenance per cell. JUNOX cells and in-game cells are separate keys. */
  function rowModel(g) {
    var money = g.money;
    function cell(fact, text) { return { text: text, prov: provenanceOf(fact) }; }
    function valueText(fact, fmt) { return fact && fact.value !== null && fact.value !== undefined ? fmt(fact.value) : 'unavailable'; }
    var ante = anteFact(money);
    var dispute;
    if (!money) dispute = { text: 'No stake', prov: provenanceOf(g.disputed), href: null };
    else if (g.disputed && g.disputed.value === true) dispute = { text: 'Case #' + money.chainGameId, prov: provenanceOf(g.disputed), href: caseHref(money.chainGameId) };
    else dispute = { text: valueText(g.disputed, function (v) { return v ? 'Disputed' : 'None'; }), prov: provenanceOf(g.disputed), href: null };
    return {
      gameId: g.gameId,
      product: { text: g.product && g.product.name ? g.product.name : 'Game', sub: g.variant || '' },
      date: { text: dateOf(g.createdAt) },
      table: cell(g.table, valueText(g.table, String)),
      escrow: money ? cell(money.escrow, valueText(money.escrow, String)) : { text: 'No stake', prov: null },
      junox: {
        ante: money ? cell(ante, formatJunox(money.anteGross.amount)) : { text: '—', prov: null },
        net: money ? cell(money.net, valueText(money.net, function (v) { return formatJunox(v.amount, { signed: true }); })) : { text: '—', prov: null }
      },
      inGame: {
        rank: cell(g.inGame.rank, valueText(g.inGame.rank, function (v) { return '#' + v + ' of ' + g.playerCount; })),
        worth: cell(g.inGame.finalNetWorth, valueText(g.inGame.finalNetWorth, function (v) { return formatDollars(v.dollars); }))
      },
      dispute: dispute
    };
  }

  /** The detail drawer's entry lines: label, signed amount text, provenance. Amounts of unavailable entries are not shown. */
  function entryLines(ledger) {
    if (!ledger) return [];
    return ledger.entries.map(function (e) {
      var sign = ENTRY_SIGN[e.kind];
      var known = e.fact && e.fact.provenance !== 'unavailable';
      var text = !known ? 'unavailable' : sign === 0 ? '(' + formatJunox(e.amount.amount) + ')' : (sign < 0 ? '−' : '+') + formatJunox(e.amount.amount);
      return { kind: e.kind, label: ENTRY_LABEL[e.kind] || e.kind, text: text, informational: sign === 0, prov: provenanceOf(e.fact) };
    });
  }

  function errorText(json) {
    var code = json && json.error;
    if (code === 'signed-out') return 'You are signed out.';
    if (code === 'rate-limited') return 'Too many requests. Try again in a minute.';
    if (code === 'not-found') return 'That game is not in your history.';
    if (code === 'unavailable') return 'History is unavailable right now.';
    return 'Something went wrong reading your history.';
  }

  /* ---------- DOM (textContent only: nothing from the server is parsed as HTML) ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined) {
      if (k === 'text') node.textContent = attrs[k]; else if (k === 'class') node.className = attrs[k]; else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  function marker(prov) {
    if (!prov) return null;
    return el('abbr', { class: 'me-prov me-prov--' + prov.cls, title: prov.title, 'aria-label': prov.title, text: prov.mark });
  }

  function valueCell(label, c, cls) {
    return el('td', { 'data-label': label, class: cls || null }, [el('span', { text: c.text }), c.prov ? ' ' : null, marker(c.prov)]);
  }

  function renderProfile(root, who) {
    var box = root.querySelector('[data-me-profile]');
    if (!box) return;
    box.textContent = '';
    if (!who || who.signedIn !== true) {
      var href = who && who.signInUrl ? who.signInUrl : (window.LudumSession && LudumSession.signInUrl ? LudumSession.signInUrl('/me/') : null);
      box.appendChild(el('p', { class: 'ld-lede', text: 'Sign in on Play to see your games and finances here.' }));
      if (href) box.appendChild(el('p', { class: 'me-actions' }, [el('a', { class: 'ld-btn', href: href, text: 'Sign in on Play' })]));
      return false;
    }
    var a = who.account;
    box.appendChild(el('p', { class: 'me-name', text: a.name }));
    var facts = el('dl', { class: 'me-facts' }, [
      el('dt', { class: 'ld-label-s', text: 'Username' }), el('dd', { text: '@' + a.username }),
      el('dt', { class: 'ld-label-s', text: 'Member since' }), el('dd', { text: a.memberSince }),
      el('dt', { class: 'ld-label-s', text: 'Authorization Wallet' }),
      el('dd', { class: 'me-mono', text: a.authorizationWallet ? a.authorizationWallet.address + ' (since ' + a.authorizationWallet.since + ')' : 'None linked' })
    ]);
    box.appendChild(facts);
    if (who.manageUrl) box.appendChild(el('p', { class: 'me-actions' }, [el('a', { class: 'ld-btn ld-btn--secondary', href: who.manageUrl, text: 'Manage account on Play' })]));
    return true;
  }

  function renderRows(tbody, games, open) {
    games.forEach(function (g) {
      var m = rowModel(g);
      var dispute = m.dispute.href
        ? el('td', { 'data-label': 'Dispute' }, [el('a', { class: 'ld-link', href: m.dispute.href, text: m.dispute.text }), ' ', marker(m.dispute.prov)])
        : valueCell('Dispute', m.dispute);
      var button = el('button', { class: 'ld-btn ld-btn--secondary me-open', type: 'button', text: 'Details' });
      button.addEventListener('click', function () { open(g.gameId, button); });
      tbody.appendChild(el('tr', null, [
        el('td', { 'data-label': 'Product', class: 'is-key' }, [el('span', { text: m.product.text }), m.product.sub ? el('span', { class: 'me-sub', text: m.product.sub }) : null]),
        el('td', { 'data-label': 'Date', text: m.date.text }),
        valueCell('Table', m.table),
        valueCell('Escrow', m.escrow),
        valueCell('Ante (JUNOX)', m.junox.ante, 'is-num me-junox'),
        valueCell('Net (JUNOX)', m.junox.net, 'is-num me-junox'),
        valueCell('Rank (in-game)', m.inGame.rank, 'is-num me-ingame'),
        valueCell('Net worth (in-game $)', m.inGame.worth, 'is-num me-ingame'),
        dispute,
        el('td', { 'data-label': '' }, [button])
      ]));
    });
  }

  function renderDetail(body, d) {
    body.textContent = '';
    var m = rowModel(d);
    body.appendChild(el('p', { class: 'ld-label', text: m.product.text + ' · ' + m.date.text + (d.joinCode ? ' · ' + d.joinCode : '') }));
    if (d.money) {
      var lines = entryLines(d.ledger);
      var rows = lines.map(function (l) {
        return el('tr', { class: l.informational ? 'me-info' : null }, [el('td', { class: 'is-key', 'data-label': 'Entry', text: l.label }), el('td', { class: 'is-num', 'data-label': 'JUNOX' }, [el('span', { text: l.text }), ' ', marker(l.prov)])]);
      });
      if (d.ledger) rows.push(el('tr', { class: 'me-net' }, [el('td', { class: 'is-key', 'data-label': 'Entry', text: 'Net' }), valueCell('JUNOX', m.junox.net, 'is-num')]));
      body.appendChild(el('figure', { class: 'ld-ledger ld-ledger--stack me-entries' }, [
        el('figcaption', { class: 'ld-ledger__cap' }, [el('span', { class: 'ld-ledger__title', text: 'Escrow ledger' }), el('span', { class: 'ld-label', text: 'JUNOX · escrow #' + (d.money.chainGameId || '—') })]),
        el('div', { class: 'ld-ledger__scroll' }, [el('table', null, [el('thead', null, [el('tr', null, [el('th', { scope: 'col', text: 'Entry' }), el('th', { scope: 'col', class: 'is-num', text: 'JUNOX' })])]), el('tbody', null, rows)])]),
        el('p', { class: 'ld-ledger__note', text: 'Bracketed lines are informational: already inside the deposit or the bond. Network fees are not included.' })
      ]));
    }
    var seatRows = d.seats.map(function (s) {
      return el('tr', { class: s.you ? 'me-you' : null }, [
        el('td', { class: 'is-key', 'data-label': 'Seat', text: s.displayName + (s.you ? ' (you)' : '') }),
        valueCell('Rank (in-game)', { text: s.rank.value !== null ? '#' + s.rank.value : 'unavailable', prov: provenanceOf(s.rank) }, 'is-num'),
        valueCell('Net worth (in-game $)', { text: s.finalNetWorth.value !== null ? formatDollars(s.finalNetWorth.value.dollars) : 'unavailable', prov: provenanceOf(s.finalNetWorth) }, 'is-num')
      ]);
    });
    body.appendChild(el('figure', { class: 'ld-ledger ld-ledger--stack me-seats' }, [
      el('figcaption', { class: 'ld-ledger__cap' }, [el('span', { class: 'ld-ledger__title', text: 'The table' }), el('span', { class: 'ld-label', text: 'In-game dollars · not money' })]),
      el('div', { class: 'ld-ledger__scroll' }, [el('table', null, [el('thead', null, [el('tr', null, [el('th', { scope: 'col', text: 'Seat' }), el('th', { scope: 'col', class: 'is-num', text: 'Rank' }), el('th', { scope: 'col', class: 'is-num', text: 'Net worth' })])]), el('tbody', null, seatRows)])])
    ]));
    if (d.dispute) {
      var dv = d.dispute.value;
      var p = provenanceOf(d.dispute);
      var box = el('div', { class: 'me-dispute' }, [el('p', { class: 'ld-label', text: 'Dispute' })]);
      if (dv) {
        box.appendChild(el('p', null, [el('span', { text: (dv.challengerIsYou ? 'You challenged' : 'Another seat challenged') + ' on ' + dateOf(dv.disputedAt) + ', bond ' + formatJunox(dv.bond.amount) + '. ' + (dv.resolution ? 'Resolved: ' + dv.resolution + ' (' + dateOf(dv.resolvedAt) + ').' : 'Awaiting the resolver until ' + dateOf(dv.resolverTimeoutAt) + '.') }), ' ', marker(p)]));
      } else {
        box.appendChild(el('p', null, [el('span', { text: 'Details unavailable.' }), ' ', marker(p)]));
      }
      var href = d.money ? caseHref(d.money.chainGameId) : null;
      if (href) box.appendChild(el('p', null, [el('a', { class: 'ld-btn ld-btn--ink', href: href, text: 'Open the case' })]));
      body.appendChild(box);
    }
  }

  function mount(root, session) {
    var tbody = root.querySelector('[data-me-rows]');
    var status = root.querySelector('[data-me-status]');
    var more = root.querySelector('[data-me-more]');
    var games = root.querySelector('[data-me-games]');
    var dialog = root.querySelector('[data-me-drawer]');
    var drawerBody = root.querySelector('[data-me-drawer-body]');
    var cursor = null;
    function say(text) { if (status) status.textContent = text; }
    function call(path, body) {
      return Promise.resolve().then(function () { return session.api(path, body); })
        .then(function (json) { if (json && json.error) throw json; return json; });
    }
    function open(gameId, from) {
      if (!dialog || !drawerBody) return;
      drawerBody.textContent = 'Loading…';
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      call('game', { gameId: gameId }).then(function (d) { renderDetail(drawerBody, d); }, function (e) { drawerBody.textContent = errorText(e); });
      dialog.addEventListener('close', function () { if (from) from.focus(); }, { once: true });
    }
    function page() {
      say('Loading your games…');
      if (more) more.hidden = true;
      return call('games', cursor === null ? {} : { cursor: cursor }).then(function (r) {
        renderRows(tbody, r.games, open);
        cursor = r.nextCursor;
        if (more) more.hidden = cursor === null;
        say(tbody.children.length === 0 ? 'No games yet.' : 'As of ' + r.asOf + '.');
      }, function (e) { say(errorText(e)); });
    }
    if (more) more.addEventListener('click', page);
    var close = root.querySelector('[data-me-close]');
    if (close && dialog) close.addEventListener('click', function () { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); });
    return Promise.resolve().then(function () { return session.whoami(); }).then(function (who) {
      if (!renderProfile(root, who)) { if (games) games.hidden = true; return; }
      if (games) games.hidden = false;
      return page();
    }, function () { say('Your session could not be checked. Try again later.'); });
  }

  var api = { formatJunox: formatJunox, formatDollars: formatDollars, provenanceOf: provenanceOf, anteFact: anteFact, rowModel: rowModel, entryLines: entryLines, caseHref: caseHref, errorText: errorText, mount: mount };
  window.LudumHistory = api;

  function start() {
    var root = document.querySelector('[data-ludum-history]');
    if (!root) return;
    if (!window.LudumSession) { var s = root.querySelector('[data-me-status]'); if (s) s.textContent = 'Account services are unavailable.'; return; }
    mount(root, window.LudumSession);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
