/* Ludum · /players/ -- a player's PUBLIC profile (`?name=`), or the PLAYERS page: find a player by name, or browse everyone
 * A to Z (Ludum Profile "the pass", owner 2026-10-22; 1830Juno §19).
 *
 * `?name=<Player Name>`: the pass -- exactly what the server's public `player` answer says (§18: every figure from the
 * account's first day; a Skill Rating Provisional until five rated games in its game), then one line under it ("How these
 * figures are counted", "Find a player"). No username, wallet, id, advance or signed figure ever reaches this page. An
 * unknown name: "No player is called ...", with the search.
 *
 * No `name`: the Players page (`players`): the search (the start of any word in a name, case-insensitive; the match
 * underlined), then whole-row links -- the name, the month the player joined, an arrow -- 50 a page, A to Z. No ranks, no
 * figures, no leaderboard. `?q=` and `?page=` keep the page addressable. Needs session.js and pass.js.
 */
(function () {
  'use strict';
  var P = window.LudumPass;
  var NAME_MAX = 64;
  var QUERY_MAX = 64;

  /** The profile asked for (pure): the `name` query value, trimmed, or null. */
  function nameOf(search) {
    var raw = new URLSearchParams(String(search || '')).get('name');
    if (raw === null) return null;
    var name = raw.trim();
    return name === '' || name.length > NAME_MAX ? null : name;
  }
  /** The directory asked for (pure): {query, page}. */
  function directoryOf(search) {
    var params = new URLSearchParams(String(search || ''));
    var query = (params.get('q') || '').trim().slice(0, QUERY_MAX);
    var page = parseInt(params.get('page') || '1', 10);
    return { query: query, page: isFinite(page) && page >= 1 && page <= 1000 ? page : 1 };
  }
  /** Where the query matches the start of a word in `name`, case-insensitively (pure): [start, end] or null. The server
   *  decides who matches; this only marks it. */
  function matchOf(name, query) {
    var q = String(query || '').normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
    if (!q) return null;
    var lower = String(name).normalize('NFKC').toLocaleLowerCase('en-US');
    if (lower.length !== String(name).length) return null;
    for (var at = 0; at < lower.length; at += 1) {
      var start = at === 0 || !/[\p{L}\p{N}]/u.test(lower.charAt(at - 1));
      if (start && lower.slice(at, at + q.length) === q) return [at, at + q.length];
    }
    return null;
  }
  /** The count line (pure). */
  function countLine(total, query) {
    if (query) return total + ' player' + (total === 1 ? '' : 's') + ' matching “' + query + '”';
    return 'All ' + total + ' player' + (total === 1 ? '' : 's') + ', A to Z';
  }

  var el = P.el;

  function search(initial) {
    var input = el('input', { class: 'ld-pinput', id: 'pl-q', name: 'q', value: initial || '', maxlength: String(QUERY_MAX), autocomplete: 'off', spellcheck: 'false', placeholder: 'Player Name' });
    return el('form', { class: 'ld-search', role: 'search', action: '/players/', 'aria-label': 'Find a player' }, [
      el('label', { for: 'pl-q', text: 'Find a player' }), input,
      el('button', { class: 'ld-btn ld-btn--secondary', type: 'submit' }, ['Find ', P.svg(P.ARROW_RIGHT)])
    ]);
  }

  function none(name, extra) {
    return el('div', { class: 'ld-none' }, [el('b', { text: 'No player is called “' + name + '”' }), el('p', { text: 'Check the spelling: names are the ones shown at the tables. ' + (extra || 'Search matches the start of any word in a name.') })]);
  }

  function row(player, query) {
    var m = matchOf(player.name, query);
    var label = m ? [player.name.slice(0, m[0]), el('mark', { text: player.name.slice(m[0], m[1]) }), player.name.slice(m[1])] : [player.name];
    return el('li', null, [
      el('a', { href: '/players/?name=' + encodeURIComponent(player.name) }, label),
      el('span', { class: 'ld-dir__since', text: 'Member since ' + P.month(player.memberSince) }),
      P.svg(P.ARROW_RIGHT)
    ]);
  }

  function pageHref(query, page) {
    var params = new URLSearchParams();
    if (query) params.set('q', query);
    if (page > 1) params.set('page', String(page));
    var text = params.toString();
    return '/players/' + (text ? '?' + text : '');
  }

  /** The Players page. */
  function directory(slot, session, asked) {
    slot.textContent = '';
    var results = el('div', { 'aria-live': 'polite' }, [el('p', { class: 'ld-dirhead', text: 'Reading the players…' })]);
    slot.appendChild(el('header', { class: 'ld-phead' }, [el('h1', { text: 'Players' }), search(asked.query)]));
    slot.appendChild(results);
    document.title = (asked.query ? '“' + asked.query + '” — ' : '') + 'Players — Ludum';
    return session.api('players', asked.query ? { query: asked.query, page: asked.page } : { page: asked.page }).then(function (answer) {
      results.textContent = '';
      if (!answer.players.length) {
        results.appendChild(asked.query ? none(asked.query) : el('div', { class: 'ld-none' }, [el('b', { text: 'No players yet' }), el('p', { text: 'Players appear here once they create an account.' })]));
        return;
      }
      results.appendChild(el('div', { class: 'ld-dirhead' }, [el('p', { text: countLine(answer.total, asked.query) }), answer.pages > 1 ? el('p', { text: 'Page ' + answer.page + ' of ' + answer.pages }) : null]));
      results.appendChild(el('ol', { class: 'ld-dir' }, answer.players.map(function (p) { return row(p, asked.query); })));
      if (answer.pages > 1) {
        results.appendChild(el('nav', { class: 'ld-pager', 'aria-label': 'Pages' }, [
          answer.page > 1 ? el('a', { class: 'ld-link', href: pageHref(asked.query, answer.page - 1), text: '← Previous' }) : el('span'),
          answer.page < answer.pages ? el('a', { class: 'ld-link', href: pageHref(asked.query, answer.page + 1) }, ['Next ', P.svg(P.ARROW_RIGHT)]) : el('span')
        ]));
      }
    }, function (e) {
      results.textContent = '';
      /* An older game server without the directory: the exact name still opens its profile. */
      if (e && e.status === 404 && asked.query) { window.location.replace('/players/?name=' + encodeURIComponent(asked.query)); return; }
      results.appendChild(el('div', { class: 'ld-none' }, [el('b', { text: 'Players can’t be read right now' }), el('p', { text: e && e.error === 'rate-limited' ? 'Too many searches. Try again in a minute.' : 'Try again in a moment.' })]));
    });
  }

  /** A player's public profile. */
  function profile(slot, session, name) {
    slot.textContent = '';
    var shell = P.pass(null, { name: name, id: 'pass-name' });
    slot.appendChild(shell);
    document.title = name + ' — Ludum';
    return session.api('player', { name: name }).then(function (answer) {
      var figures = P.figuresOfPlayer(answer.player);
      document.title = figures.name + ' — Ludum';
      slot.replaceChild(P.pass(figures, { id: 'pass-name' }), shell);
      slot.appendChild(P.passFoot());
    }, function (e) {
      slot.textContent = '';
      document.title = 'Players — Ludum';
      slot.appendChild(el('header', { class: 'ld-phead' }, [el('h1', { text: 'Players' }), search(name)]));
      if (e && e.error === 'not-found') slot.appendChild(none(name));
      else slot.appendChild(el('div', { class: 'ld-none', role: 'alert' }, [el('b', { text: 'This profile can’t be read right now' }), el('p', { text: 'Try again in a moment.' })]));
    });
  }

  function mount(root, session) {
    var slot = root.querySelector('[data-pass-slot]');
    var name = nameOf(window.location.search);
    return name === null ? directory(slot, session, directoryOf(window.location.search)) : profile(slot, session, name);
  }

  window.LudumPlayerPage = { nameOf: nameOf, directoryOf: directoryOf, matchOf: matchOf, countLine: countLine, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-player]');
    if (root && window.LudumSession && P) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
