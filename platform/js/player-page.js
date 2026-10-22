/* Ludum · /players/?name=<display name> — a player's PUBLIC profile (1830Juno §18, owner policy 2026-10-22: all of it
 * from the account's first day). Identity: the name every table shows and the month they joined. Experience: completed
 * games, unique opponents, activity rank. Performance: Credits, Lifetime Earnings (never below 0) and each game's own
 * Skill Rating, labelled Provisional until 5 rated games in that game. Every figure is the server's (`player`), never
 * counted here. Anyone may read it, signed in or not. Nothing private is ever here: no username, wallet, advance, entry
 * or signed figure -- the server never sends one. Needs session.js and records.js. */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var NAME_MAX = 64;

  /** The name asked for (pure): the `name` query value, trimmed, or null. */
  function nameOf(search) {
    var raw = new URLSearchParams(String(search || '')).get('name');
    if (raw === null) return null;
    var name = raw.trim();
    return name === '' || name.length > NAME_MAX ? null : name;
  }

  var TIPS = {
    completed: 'Games played to the end. Cancelled games and games still in play do not count.',
    opponents: 'Different players met in completed games. Each counts once.',
    rank: 'Place among all players by completed games; ties share a place. It counts activity, not skill.',
    credits: 'Credits held now, including any in play at unfinished tables.',
    earnings: 'Payouts minus wagers, over settled games. Never shown below 0.',
    rating: 'Each game has its own Skill Rating, starting at 1,500. It is provisional until 5 rated games in that game.'
  };

  var count = function (n) { return typeof n === 'number' && isFinite(n) ? String(n) : '—'; };
  /** A figure's value as the server gives it ("—" when it gives none). */
  var valueOf = function (figure, format) { return figure && typeof figure.value === 'number' ? format(figure.value) : '—'; };

  /** What the page shows (pure; pinned by platform/tests/records.test.mjs): the month joined, and the two groups of
   *  stats, each {label, value, small, tip}. */
  function profileOf(p) {
    var rank = p.activityRank && typeof p.activityRank.rank === 'number' ? p.activityRank : null;
    var experience = [
      { label: 'Completed Games', value: count(p.completedGames), small: null, tip: TIPS.completed },
      { label: 'Unique Opponents', value: count(p.uniqueOpponents), small: null, tip: TIPS.opponents },
      { label: 'Activity Rank', value: rank ? '#' + rank.rank : '—', small: rank ? 'of ' + rank.of : p.completedGames === 0 ? 'Not ranked yet' : null, tip: TIPS.rank }
    ];
    var performance = [
      { label: 'Credits', value: valueOf(p.credits, function (v) { return R.credits(v); }), small: null, tip: TIPS.credits },
      { label: 'Lifetime Earnings', value: valueOf(p.lifetimeEarnings, function (v) { return R.credits(v); }), small: null, tip: TIPS.earnings }
    ];
    (p.ratings || []).forEach(function (r) {
      var f = r.rating || {};
      var provisional = f.state === 'provisional';
      performance.push({ label: 'Skill Rating · ' + r.name, value: valueOf(f, R.rating), small: provisional ? 'Provisional · ' + (f.games || 0) + ' of ' + (f.needed || 5) : null, tip: TIPS.rating });
    });
    return { memberSince: typeof p.memberSince === 'string' ? R.month(p.memberSince) : null, experience: experience, performance: performance };
  }

  function strip(stats) {
    return R.el('dl', { class: 'ld-sum ld-sum--figures ld-sum--' + Math.min(5, stats.length) }, stats.map(function (s) {
      return R.el('div', null, [R.el('dt', null, [s.label, ' ', R.tip(s.label, s.tip)]), R.el('dd', null, [s.value, s.small ? R.el('small', { text: s.small }) : null])]);
    }));
  }

  function finder(initial) {
    var input = R.el('input', { class: 'ld-input', id: 'pl-find', maxlength: String(NAME_MAX), autocomplete: 'off', spellcheck: 'false', value: initial || '' });
    var go = R.el('button', { class: 'ld-btn ld-btn--secondary', type: 'submit', text: 'Find' });
    var f = R.el('form', { class: 'ld-findplayer', role: 'search', 'aria-label': 'Find a player' }, [R.el('label', { class: 'ld-field__label', for: 'pl-find', text: 'Find a player' }), R.el('div', { class: 'au-actions' }, [input, go])]);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = input.value.trim();
      if (name) window.location.assign('/players/?name=' + encodeURIComponent(name));
    });
    return f;
  }

  function render(frame, body, p, who) {
    var own = who && who.signedIn === true && who.account && typeof who.account.name === 'string' && who.account.name.toLowerCase() === p.name.toLowerCase();
    var shown = profileOf(p);
    var meta = [];
    if (shown.memberSince) meta.push(['Member Since', shown.memberSince]);
    if (own) meta.push(['Your record', R.el('a', { class: 'ld-link', href: '/me/', text: 'Everything, privately' })]);
    frame.textContent = '';
    frame.appendChild(R.rechead({ kicker: null, muted: own ? 'This is how other players see you' : null, title: p.name, meta: meta }));
    body.textContent = '';
    body.appendChild(R.section(null, 'pl-experience', 'Experience', null, [strip(shown.experience)]));
    body.appendChild(R.section(null, 'pl-performance', 'Performance', null, [strip(shown.performance), R.el('div', { class: 'ld-findrow' }, [finder('')])]));
  }

  function stop(frame, body, title, label, text, kind, initial) {
    frame.textContent = '';
    frame.appendChild(R.rechead({ kicker: null, title: title }));
    body.textContent = '';
    body.appendChild(R.el('div', { class: 'ld-wrap ld-stack' }, [label ? R.notice(label, text, kind) : null, finder(initial)]));
  }

  function mount(root, session) {
    var frame = root.querySelector('[data-rec-frame]');
    var body = root.querySelector('[data-rec-body]');
    var name = nameOf(window.location.search);
    if (name === null) { stop(frame, body, 'Players', null, null, null, ''); return Promise.resolve(); }
    var who = session.whoami().catch(function () { return null; });
    return session.api('player', { name: name }).then(function (answer) {
      document.title = answer.player.name + ' — Ludum';
      return who.then(function (w) { render(frame, body, answer.player, w); });
    }, function (e) {
      if (e && e.error === 'not-found') stop(frame, body, 'Players', 'No player by that name', 'Check the spelling: names are the ones shown at the tables.', 'wait', name);
      else stop(frame, body, 'Players', 'Unavailable', 'Player profiles can’t be read right now. Try again in a moment.', 'stop', name);
    });
  }

  window.LudumPlayerPage = { nameOf: nameOf, profileOf: profileOf, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-player]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
