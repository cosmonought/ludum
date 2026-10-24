/* Ludum · /disputes/ -- the Disputes tab of your profile.
 *
 * LUDUM v1.7 (owner, 2026-10-24): the retired JUNOX escrow's disputes are no Ludum feature, and appeals of a game's
 * result are not open yet. So this tab is a neutral page: your pass, the line under it, the tab row with Disputes
 * current, then one panel that says appeals aren't open and that nothing is waiting. It reads no chain, counts nothing
 * and shows no wallet. The Ludum DAO's own proposals are one link away (/governance/).
 *
 * The tab is drawn (pass.js tabsRow) for a Ludum DAO member, for the Appeals team (the server's `appeal.review`), and on
 * this page itself. Staff who prepare or appoint appeals -- `appeal.review` or `appeals.manage`, as the server sends
 * them -- also see who is on the Appeals team, from the server's `staff-team` answer. Who holds a role is decided by the
 * server alone; nothing here grants one. The Appeals team decides nothing and holds no Ludum DAO membership or vote.
 *
 * No inline script (§2.4): the page loads ludum.js, session.js, records.js, pass.js, work.js, auth.js, account-menu.js,
 * this file and page-init.js. Everything from the server is set as text. */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var P = window.LudumPass;
  var W = window.LudumWork;

  function el(tag, attrs, children) { return P.el(tag, attrs, children); }
  function arrow() { return P.svg(P.ARROW_RIGHT); }
  function perms(who) { return who && who.staff && Array.isArray(who.staff.permissions) ? who.staff.permissions : []; }
  /** Whether this session sees the Appeals team's roster (pure). */
  function seesAppealsTeam(who) { var p = perms(who); return p.indexOf('appeal.review') !== -1 || p.indexOf('appeals.manage') !== -1; }

  var NOT_OPEN = 'Appeals aren’t open yet';
  var NOT_OPEN_TEXT = 'Nothing can be appealed here for now, and nothing is waiting. Completed games, results and standings stand as they were recorded.';

  function about() {
    return W.workfoot('About appeals', [
      ['Not open yet', 'When appeals open, a player will be able to ask for a completed game to be looked at again, from this tab. Until then, every result stands as recorded.'],
      ['Conduct reports', 'A report about a player’s behaviour is made at the table on Play and reviewed by Moderators. It is not an appeal.'],
      ['The Ludum DAO', 'The DAO’s own proposals and votes are on its page, read live from Juno.']
    ], [el('a', { class: 'ld-link', href: '/governance/' }, ['Ludum DAO proposals', arrow()])]);
  }

  function teamBlock(team) {
    var members = team.members.filter(function (m) { return m.roles.indexOf('appeals') !== -1; });
    var rows = members.map(function (m) {
      return el('tr', { class: m.you ? 'is-you' : null }, [
        W.cell('Member', [el('a', { class: 'ld-wl__name', href: '/players/?name=' + encodeURIComponent(m.name), text: m.name }), m.you ? el('span', { class: 'ld-wl__you', text: '(you)' }) : null], 'c-name c-wide'),
        W.cell('Roles', [W.roles(m.roles)], 'c-roles c-wide'),
        W.cell('On the team since', [m.since ? R.day(m.since) : '—'], 'c-since c-wide')
      ]);
    });
    return W.block({ title: 'Appeals team', count: String(members.length), note: 'Everyone who holds the Appeals role. They will prepare appeals once appeals open; they decide none, and the role carries no Ludum DAO membership or vote. An Admin appoints or removes a member from Manage on the player’s profile.' },
      [W.ledger({ cls: 'team', caption: 'The Appeals team', columns: [{ text: 'Member' }, { text: 'Roles' }, { text: 'On the team since' }], rows: rows, empty: 'No one holds the Appeals role.' })]);
  }

  function signedInPage(slot, who, session) {
    W.profileTop(slot, session, who, 'disputes');
    var panel = el('section', { class: 'ld-panel', 'aria-label': 'Disputes' }, [el('h2', { class: 'ld-sr', text: 'Disputes' })]);
    slot.appendChild(panel);
    panel.appendChild(W.workhead('Appeals of a game’s result will be made here once they open.', null));
    /* In its own slot, as the team's block is: the panel's rhythm (pass.css) spaces one slotted block from the next. */
    panel.appendChild(el('div', null, [W.block({ title: 'Appeals' }, [W.none(NOT_OPEN, NOT_OPEN_TEXT, { role: 'status' })])]));
    var teamHost = null;
    if (seesAppealsTeam(who)) {
      teamHost = el('div', null, [W.reading('Reading the team…')]);
      panel.appendChild(teamHost);
    }
    panel.appendChild(about());
    if (!teamHost) return Promise.resolve();
    function readTeam() {
      W.fill(teamHost, [W.reading('Reading the team…')]);
      return session.api('staff-team', {}).then(function (team) { W.fill(teamHost, [teamBlock(team)]); }, function (e) {
        if (e && e.error === 'not-found') { W.fill(teamHost, []); return; }
        var b = el('button', { class: 'ld-btn ld-btn--s ld-btn--secondary', type: 'button', text: 'Try again' });
        b.addEventListener('click', readTeam);
        W.fill(teamHost, [W.block({ title: 'Appeals team' }, [W.none('The team couldn’t be read', 'Nothing older is shown.', { bad: true, action: b })])]);
      });
    }
    return readTeam();
  }

  function signedOutPage(slot, session) {
    var panel = el('section', { class: 'ld-panel', 'aria-labelledby': 'dp-h' }, [el('h1', { class: 'ld-sr', id: 'dp-h', text: 'Disputes' }),
      W.none(NOT_OPEN, NOT_OPEN_TEXT, { role: 'status', action: el('a', { class: 'ld-btn ld-btn--s', href: session.signInUrl('/disputes/') }, ['Sign in', arrow()]) }), about()]);
    W.fill(slot, [panel]);
  }

  function mount(root, session) {
    var slot = root.querySelector('[data-pass-slot]');
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) { signedOutPage(slot, session); return; }
      return signedInPage(slot, who, session);
    }).catch(function () {
      W.fill(slot, [W.none('Unavailable', 'Your profile could not be read just now. Nothing is shown rather than an old value.', { bad: true })]);
    });
  }

  window.LudumDisputes = { seesAppealsTeam: seesAppealsTeam, mount: mount, NOT_OPEN: NOT_OPEN };
  function start() {
    var root = document.querySelector('[data-ludum-disputes]');
    if (root && window.LudumSession && R && P && W) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
