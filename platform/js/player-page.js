/* Ludum · /players/?name=<display name> — a player's PUBLIC profile: the name every table shows and their public figures
 * (1830Juno §16 `player`): Credits and Lifetime Earnings once the player has 5 credit-settled games (Lifetime Earnings
 * never below 0), each game's Skill Rating once they have 5 rated games in it; before then, only how far along they are.
 * Anyone may read it, signed in or not. Nothing private is ever here: no username, wallet, advance, entry or signed
 * figure -- the server never sends one. Needs session.js and records.js. */
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
  /** One public figure as {value, small} (pure): the figure once public, else how far along. */
  function shown(figure, format, unit) {
    if (figure && figure.state === 'established') return { value: format(figure.value), small: null };
    var games = figure && typeof figure.games === 'number' ? figure.games : 0;
    var needed = figure && typeof figure.needed === 'number' ? figure.needed : 5;
    return { value: 'Not shown yet', small: games + ' of ' + needed + ' ' + unit };
  }

  var TIPS = {
    credits: 'Shown once a player has 5 credit-settled games.',
    earnings: 'Payouts minus wagers over settled games, shown once a player has 5 credit-settled games. Never shown below 0.',
    rating: 'Each game has its own Skill Rating, shown once a player has 5 rated games in it.'
  };

  function stat(label, s, tipText) {
    return R.el('div', null, [R.el('dt', null, [label, ' ', R.tip(label, tipText)]), R.el('dd', { class: s.small ? 'is-pending' : null }, [s.value, s.small ? R.el('small', { text: s.small }) : null])]);
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
    frame.textContent = '';
    frame.appendChild(R.rechead({ kicker: 'Player', muted: own ? 'This is how other players see you' : null, title: p.name,
      meta: own ? [['Your record', R.el('a', { class: 'ld-link', href: '/me/', text: 'Everything, privately' })]] : null }));
    body.textContent = '';
    var parts = [
      stat('Credits', shown(p.credits, function (v) { return R.credits(v); }, 'settled games'), TIPS.credits),
      stat('Lifetime Earnings', shown(p.lifetimeEarnings, function (v) { return R.credits(v); }, 'settled games'), TIPS.earnings)
    ];
    p.ratings.forEach(function (r) { parts.push(stat('Skill Rating · ' + r.name, shown(r.rating, R.rating, 'rated games'), TIPS.rating)); });
    body.appendChild(R.section('01', 'pl1', 'Public figures', null, [R.el('dl', { class: 'ld-sum ld-sum--figures ld-sum--' + Math.min(5, parts.length) }, parts), R.el('div', { class: 'ld-findrow' }, [finder('')])]));
  }

  function stop(frame, body, title, label, text, kind, initial) {
    frame.textContent = '';
    frame.appendChild(R.rechead({ kicker: 'Player', title: title }));
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

  window.LudumPlayerPage = { nameOf: nameOf, shown: shown, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-player]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
