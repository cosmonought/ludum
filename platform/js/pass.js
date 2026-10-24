/* Ludum · LudumPass -- the player's pass (Ludum Profile, Direction A "the pass", owner 2026-10-22): one composition for
 * every profile, public (/players/?name=) and your own (/me/, /me/account/). Three bands inside a 2px edge: the MAIN
 * part (the name; Credits; Lifetime Earnings and Activity Rank; each game's Skill Rating plate down the right side), a
 * PERFORATION in the Neta colours, and the STUB (Experience: Games Played, Unique Opponents, Member Since).
 *
 * Every figure is the server's (1830Juno §18/§19: `player`, or the own `profile` with its `standing`), never counted
 * here. Credits and Lifetime Earnings are always shown; a Skill Rating is "Provisional" until five rated games in its
 * game, with five punches (aria-hidden: the words beside them say the same). Activity Rank counts activity, not skill;
 * with no game played it reads "Not ranked yet". No avatar, no mark: the name, in Anton, is the identity.
 *
 *   LudumPass.figuresOfPlayer(player)          the public `player` answer, as the pass reads it (pure)
 *   LudumPass.figuresOfProfile(profile, who)   the own `profile` answer (+ the session), as the pass reads it (pure)
 *   LudumPass.nameSize(name)                   "" | "m" | "s": the name's step (10, 18, 64 characters) (pure)
 *   LudumPass.plateOf(domain)                  {modifier, lockup}: a game's own field and name (pure)
 *   LudumPass.platesLayout(n)                  "" | "stack" | "dense" (pure)
 *   LudumPass.pass(figures, {id})              the <article> (figures null: the shell, figures still being read)
 *   LudumPass.passFoot()                       "How these figures are counted" and "Find a player"
 *   LudumPass.tabsRow(session, current, opts)  the private tabs (Games, Account; Moderation, Disputes where held)
 */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ESTABLISHED_AT = 5;
  var MAX_PLATES = 6;

  /* ---------- pure ---------- */

  var whole = function (n) { return typeof n === 'number' && isFinite(n) ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '—'; };
  var month = function (yyyyMm) { var m = /^(\d{4})-(\d{2})$/.exec(String(yyyyMm || '')); return m ? MONTHS[Number(m[2]) - 1] + ' ' + m[1] : '—'; };
  var count = function (n) { return typeof n === 'number' && isFinite(n) ? n : null; };
  var valueOf = function (f) { return f && typeof f.value === 'number' && isFinite(f.value) ? f.value : null; };

  function rating(domain, name, f) {
    var games = f && typeof f.games === 'number' ? f.games : 0;
    var established = f && f.state === 'established';
    return { domain: String(domain || ''), name: String(name || ''), value: valueOf(f), established: established, games: games, needed: established ? 0 : (f && typeof f.needed === 'number' ? f.needed : ESTABLISHED_AT) };
  }

  /** The public `player` answer as the pass reads it. */
  function figuresOfPlayer(p) {
    var rank = p && p.activityRank && typeof p.activityRank.rank === 'number' ? { rank: p.activityRank.rank, of: p.activityRank.of } : null;
    return {
      name: String(p.name),
      credits: valueOf(p.credits),
      earnings: valueOf(p.lifetimeEarnings),
      rank: rank,
      completed: count(p.completedGames),
      opponents: count(p.uniqueOpponents),
      memberSince: typeof p.memberSince === 'string' ? p.memberSince : null,
      ratings: (p.ratings || []).map(function (r) { return rating(r.domain, r.name, r.rating); })
    };
  }

  /** Your own `profile` answer (v1.6: with its `standing`) and your session, as the pass reads them: exactly the public
   *  figures (`public*`), never the private breakdown. */
  function figuresOfProfile(profile, who) {
    var s = profile.standing || null;
    var played = profile.gamesPlayed || null;
    var rank = s && s.activityRank ? s.activityRank : played && typeof played.rank === 'number' ? { rank: played.rank, of: played.of } : null;
    return {
      name: String(who && who.account ? who.account.name : ''),
      credits: valueOf(profile.publicCredits),
      earnings: valueOf(profile.publicLifetimeEarnings),
      rank: rank ? { rank: rank.rank, of: rank.of } : null,
      completed: s ? count(s.completedGames) : played ? count(played.count) : null,
      opponents: s ? count(s.uniqueOpponents) : null,
      memberSince: s && typeof s.memberSince === 'string' ? s.memberSince : who && who.account && typeof who.account.memberSince === 'string' ? who.account.memberSince : null,
      ratings: (profile.ratings || []).map(function (r) { return rating(r.domain, r.name, r.public); })
    };
  }

  /** The name's step: up to 10 characters the full size; 11-18 one step down ("m"); 19-64 ("s"), wrapping at spaces. */
  function nameSize(name) {
    var n = Array.from(String(name || '')).length;
    return n <= 10 ? '' : n <= 18 ? 'm' : 's';
  }

  /** A game's plate: its own field (Project 18XX: gold on its warm black, the default) and its name's lockup. */
  function plateOf(domain, name) {
    if (domain === 'steel-meridian') return { modifier: 'ld-plate--sm', lockup: ['Steel Mer', ['b', 'i'], 'dian'] };
    if (domain === '20-cosmos') return { modifier: 'ld-plate--c20', lockup: [['b', '20'], ' Cosmos'] };
    if (domain === 'project-18xx') return { modifier: '', lockup: ['Project ', ['b', '18XX']] };
    return { modifier: '', lockup: [String(name || domain)] };
  }

  /** One plate fills the corner; two or three stack; four to six are dense rows. */
  function platesLayout(n) { return n <= 1 ? '' : n <= 3 ? 'stack' : 'dense'; }

  /** The plates in the order the design gives: most played first (the server's order on ties). At most six. */
  function platesOrder(ratings) {
    return ratings.map(function (r, at) { return { r: r, at: at }; }).sort(function (a, b) { return b.r.games - a.r.games || a.at - b.at; }).slice(0, MAX_PLATES).map(function (e) { return e.r; });
  }

  /* ---------- DOM ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) {
      if (k === 'text') node.textContent = attrs[k]; else if (k === 'class') node.className = attrs[k]; else node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (children || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function svg(markup) { var s = document.createElement('span'); s.innerHTML = markup; return s.firstChild; }
  var ARROW_RIGHT = '<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12h17M14 6l6 6-6 6"/></svg>';
  var PLUS = '<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h16"/><path class="ld-plus-v" d="M12 4v16"/></svg>';

  function lockupNodes(parts) { return parts.map(function (p) { return typeof p === 'string' ? p : el(p[0], { text: p[1] }); }); }

  function plate(r) {
    var p = plateOf(r.domain, r.name);
    var state;
    if (r.established) {
      state = [el('span', { class: 'ld-plate__word', text: 'Established' }), el('span', { class: 'ld-plate__count' }, [el('span', null, [String(r.games), el('span', { class: 'ld-plate__unit', text: ' rated games' })])])];
    } else {
      var punched = Math.max(0, Math.min(ESTABLISHED_AT, r.games));
      var holes = [];
      for (var i = 0; i < ESTABLISHED_AT; i += 1) holes.push(el('i', { class: i < punched ? 'is-punched' : null }));
      state = [el('span', { class: 'ld-plate__word', text: 'Provisional' }), el('span', { class: 'ld-plate__count' }, [
        el('span', { class: 'ld-punches', 'aria-hidden': 'true' }, holes),
        el('span', null, [punched + ' of ' + ESTABLISHED_AT, el('span', { class: 'ld-plate__unit', text: ' rated games' })])
      ])];
    }
    return el('div', { class: 'ld-plate' + (p.modifier ? ' ' + p.modifier : '') + (r.established ? ' is-established' : '') }, [
      el('dt', { class: 'ld-plate__head' }, [el('span', { class: 'ld-plate__label', text: 'Skill Rating' }), el('span', { class: 'ld-plate__game' }, lockupNodes(p.lockup))]),
      el('dd', { class: 'ld-plate__num', text: whole(r.value) }),
      el('dd', { class: 'ld-plate__state' }, state)
    ]);
  }

  function rankValue(f) {
    if (f === null) return el('dd', { text: '—' });
    if (!f.rank) return el('dd', { class: 'is-none', text: f.completed === 0 ? 'Not ranked yet' : '—' });
    return el('dd', null, [el('span', { class: 'ld-fig__hash', text: '#' }), String(f.rank.rank), el('span', { class: 'ld-fig__of', text: 'of ' + whole(f.rank.of) })]);
  }

  /** The pass. `f` null: the shell while the figures are read (the name, if known, and dashes). */
  function pass(f, opts) {
    opts = opts || {};
    var id = opts.id || 'pass-name';
    var name = f ? f.name : opts.name || '';
    var size = nameSize(name);
    var plates = f ? platesOrder(f.ratings) : [];
    var layout = platesLayout(plates.length);
    var heading = el('h1', { class: 'ld-pass__name' + (size ? ' ld-pass__name--' + size : ''), id: id, tabindex: opts.focusable ? '-1' : null, text: name || ' ' });
    var stub = [['Games Played', f ? (f.completed === null ? '—' : whole(f.completed)) : '—'], ['Unique Opponents', f ? (f.opponents === null ? '—' : whole(f.opponents)) : '—'], ['Member Since', f ? month(f.memberSince) : '—']];
    return el('article', { class: 'ld-pass', 'aria-labelledby': id, 'aria-busy': f ? null : 'true' }, [
      el('div', { class: 'ld-pass__main' }, [
        el('header', { class: 'ld-pass__head' }, [heading]),
        el('dl', { class: 'ld-perf' }, [el('div', { class: 'ld-fig ld-fig--credits' }, [el('dt', { text: 'Credits' }), el('dd', { text: f ? whole(f.credits) : '—' })])]),
        plates.length
          ? el('dl', { class: 'ld-plates' + (layout ? ' ld-plates--' + layout : '') }, plates.map(plate))
          : el('dl', { class: 'ld-plates' }, [el('div', { class: 'ld-plate' }, [
              el('dt', { class: 'ld-plate__head' }, [el('span', { class: 'ld-plate__label', text: 'Skill Rating' }), el('span', { class: 'ld-plate__game' }, lockupNodes(plateOf('project-18xx').lockup))]),
              el('dd', { class: 'ld-plate__num', text: '—' }), el('dd', { class: 'ld-plate__state' }, [el('span', { class: 'ld-plate__word', text: f ? '' : 'Reading' })])
            ])]),
        el('dl', { class: 'ld-perf' }, [
          el('div', { class: 'ld-fig ld-fig--earn' }, [el('dt', { text: 'Lifetime Earnings' }), el('dd', { text: f ? whole(f.earnings === null ? null : Math.max(0, f.earnings)) : '—' })]),
          el('div', { class: 'ld-fig ld-fig--rank' }, [el('dt', null, ['Activity Rank', el('small', { text: 'by games played' })]), rankValue(f)])
        ])
      ]),
      el('div', { class: 'ld-pass__perf', 'aria-hidden': 'true' }, [el('i')]),
      el('dl', { class: 'ld-pass__stub', 'aria-label': 'Experience' }, stub.map(function (s) { return el('div', null, [el('dt', { text: s[0] }), el('dd', { text: s[1] })]); }))
    ]);
  }

  var COUNTED = [
    ['Credits', 'Credits held now, including any staked at tables still in play.'],
    ['Skill Rating', 'One per game, starting at 1,500. Provisional until five rated games in that game; each one punches a hole.'],
    ['Lifetime Earnings', 'Payouts minus wagers, over settled games. Never shown below 0.'],
    ['Activity Rank', 'Place among all players by games played; ties share a place. It measures activity, not skill.'],
    ['Games Played', 'Games played to the end, and games the table clock ended after a player ran out of time. Cancelled games, games every player agreed to annul and games still in play do not count.'],
    ['Unique Opponents', 'Different players met in games played. Each counts once.']
  ];

  /** The one line under the pass: "How these figures are counted" (closed) and "Find a player". */
  function passFoot() {
    return el('div', { class: 'ld-passfoot' }, [
      el('details', { class: 'ld-how' }, [
        el('summary', null, [svg(PLUS), el('span', { text: 'How these figures are counted' })]),
        el('dl', null, COUNTED.map(function (c) { return el('div', null, [el('dt', { text: c[0] }), el('dd', { text: c[1] })]); }))
      ]),
      el('a', { class: 'ld-link', href: '/players/' }, ['Find a player ', svg(ARROW_RIGHT)])
    ]);
  }

  /** The private tabs under your own pass: links to their pages (`aria-current` on this one), Moderation for a conduct
   *  reviewer (the server's `roles.reviewer`: v1.7, a Moderator in the staff log too), Disputes for every signed-in
   *  account (LUDUM RESULT REVIEW: appeals are open, and each player follows their own there); "Only you see these" once,
   *  on the row. `opts.games`: the count beside Games, when known. v1.7 (owner, 2026-10-23): `opts.moderation` (active
   *  cases) beside Moderation -- only when read and above 0. Disputes has no count. `opts.daoMember` is no longer read. */
  function tabsRow(session, current, opts) {
    opts = opts || {};
    var positive = function (n) { return typeof n === 'number' && n > 0 ? n : undefined; };
    var tabs = [{ key: 'games', href: '/me/', text: 'Games', count: opts.games }, { key: 'account', href: '/me/account/', text: 'Account' }];
    if (session && session.roles && session.roles.reviewer === true) tabs.push({ key: 'moderation', href: '/moderation/', text: 'Moderation', count: positive(opts.moderation) });
    /* LUDUM RESULT REVIEW: appeals are open, and every player follows their own on Disputes -- the tab is every signed-in
       account's (never with a count). */
    if (session && session.signedIn === true) tabs.push({ key: 'disputes', href: '/disputes/', text: 'Disputes' });
    return el('div', { class: 'ld-tabsrow' }, [
      el('nav', { class: 'ld-ptabs', 'aria-label': 'Your profile' }, tabs.map(function (t) {
        return el('a', { href: t.href, 'aria-current': t.key === current ? 'page' : null }, [t.text, typeof t.count === 'number' ? el('span', { class: 'ld-ptabs__count', text: ' ' + t.count }) : null]);
      })),
      el('span', { class: 'ld-private', text: 'Only you see these' })
    ]);
  }

  var api = {
    figuresOfPlayer: figuresOfPlayer, figuresOfProfile: figuresOfProfile, nameSize: nameSize, plateOf: plateOf, platesLayout: platesLayout,
    platesOrder: platesOrder, pass: pass, passFoot: passFoot, tabsRow: tabsRow, el: el, svg: svg, ARROW_RIGHT: ARROW_RIGHT, PLUS: PLUS, whole: whole, month: month
  };
  root.LudumPass = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
