/* Ludum · /moderation/ and /moderation/case/?id=<caseId> -- the Moderation tab of your profile and the Conduct case it
 * opens (Ludum Profile design, owner 2026-10-23: ProfileModeration, ConductCase). Moderators only.
 *
 * The authority is Play's: the Ludum routes `moderation-queue`, `moderation-case` and `moderation-decide` answer 404 to
 * anyone who is not a reviewer -- one bound at Play's startup, or (v1.7) an account the staff log gives the Moderator
 * role, read at every request -- never list a case the reviewer is a party to, and take a decision only with the
 * reviewer's own Authorization Wallet approval of exactly that decision (v1.7, owner 2026-10-23: Keplr, never the
 * password; LudumAuth.approveStaffAction -- one off-chain signature, no transaction, no fee). The team roster is the
 * server's `staff-team` answer. Who holds a role is decided by the server alone: nothing here grants
 * or asks for one, and this page hides nothing the server would show and decides nothing itself.
 *
 * The tab opens exactly as /me/ does: your pass, the line under it, the tab row with Moderation current, then the panel
 * (its scope and your standing; Cases; Team; "What a decision does"). The case opens on a record head printed on the
 * pass's stock, then the blocks Decide, Evidence, Parties, History.
 *
 * Confidential: parties are display names, seat ids and account fingerprints, never a username, wallet or id. Nothing
 * is kept in this browser. */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var P = window.LudumPass;
  var W = window.LudumWork;
  var CASE_ID = /^cc_[0-9a-f]{32}$/;

  /** Play's transitions (frontend/src/utils/conductReport.ts CONDUCT_TRANSITIONS); the server checks them again. */
  var TRANSITIONS = {
    open: ['under-review', 'no-violation', 'conduct-confirmed', 'escalated'],
    'under-review': ['no-violation', 'conduct-confirmed', 'escalated'],
    escalated: ['under-review', 'no-violation', 'conduct-confirmed'],
    'no-violation': ['under-review'],
    'conduct-confirmed': ['under-review']
  };
  var LABEL = { open: 'Open', 'under-review': 'Under review', 'no-violation': 'No violation', 'conduct-confirmed': 'Conduct confirmed', escalated: 'Escalated' };
  var MOVE = { 'under-review': 'Under review', 'no-violation': 'No violation', 'conduct-confirmed': 'Conduct issue confirmed', escalated: 'Escalated' };
  var LINE = {
    'under-review': 'You are looking at it. The case stays active.',
    'no-violation': 'Nothing to act on. The case closes; it can be reopened to Under review.',
    'conduct-confirmed': 'The report is borne out. The case closes; it can be reopened to Under review.',
    escalated: 'Needs another look. The case stays active.'
  };
  var FILTER = { all: null, open: ['open'], review: ['under-review'], escalated: ['escalated'], closed: ['no-violation', 'conduct-confirmed'] };
  var ACTIVE = ['open', 'escalated', 'under-review'];
  var NOTE_MAX = 1000;
  var CAN = { 'case.review': 'Reviews conduct cases', 'appeal.review': 'Prepares appeals', 'player.rename': 'Changes Player Names', 'moderator.manage': 'Appoints Moderators',
    'appeals.manage': 'Appoints Appeals staff', 'name.reserve': 'Reserves former names' };

  /** The filter counts (pure). */
  function counts(cases) {
    var out = {};
    Object.keys(FILTER).forEach(function (k) { out[k] = FILTER[k] === null ? cases.length : cases.filter(function (c) { return FILTER[k].indexOf(c.status) !== -1; }).length; });
    return out;
  }
  /** Active cases first (open, escalated, under review), then decided ones; newest report first within each (pure). */
  function ordered(cases) {
    var rank = function (c) { var i = ACTIVE.indexOf(c.status); return i === -1 ? ACTIVE.length : 0; };
    return cases.slice().sort(function (a, b) { return rank(a) - rank(b) || (b.lastReportAt || 0) - (a.lastReportAt || 0); });
  }
  /** A case's state, with its shape: due (someone must act), under way, or settled. */
  function stateOf(status) {
    return W.state(LABEL[status] || status, status === 'open' || status === 'escalated' ? 'due' : status === 'no-violation' || status === 'conduct-confirmed' ? 'done' : '');
  }
  function iso(ms) { return typeof ms === 'number' ? new Date(ms).toISOString() : null; }
  function shortWhen(ms) { var i = iso(ms); return i ? R.day(i).replace(/ \d{4}$/, '') + ' · ' + R.clock(i).replace(' UTC', '') : '—'; }
  function el(tag, attrs, children) { return P.el(tag, attrs, children); }

  function panelOf(title) { return el('section', { class: 'ld-panel', 'aria-label': title }, [el('h2', { class: 'ld-sr', text: title })]); }

  function decisionFoot() {
    return W.workfoot('What a decision does', [
      ['A decision', 'Records a status and a note for reviewers. It changes no game, seat, profile or payout, and no player is told.'],
      ['Separate from appeals', 'Conduct review is Play’s, by its reviewers. It never touches a table’s credits, a result or a Ludum DAO vote. Appeals are a separate team’s, and aren’t open yet.'],
      ['Approved in Keplr', 'Each decision is approved with your Authorization Wallet in Keplr: one signature over exactly that decision, not a transaction.'],
      ['Roles', 'One account per person. Roles add up: an Admin who moderates holds both roles on the same account.']
    ], []);
  }

  /* ================= the tab: cases and the team ================= */
  function queuePage(slot, who, session) {
    var top = W.profileTop(slot, session, who, 'moderation');
    var panel = panelOf('Moderation');
    slot.appendChild(panel);
    var myRoles = who.staff && who.staff.roles && who.staff.roles.length ? who.staff.roles : ['moderator'];
    var activeFig = el('span', { text: '—' });
    panel.appendChild(W.workhead('Conduct reports from Play’s tables: one case per table, reporter, reported player and category. A case is a request to look, not a finding. Cases you’re a party to are never shown to you.',
      [['Your roles', W.roles(myRoles)], ['Active cases', activeFig]]));
    var casesHost = el('div', null, [W.reading('Reading the cases…')]);
    var teamHost = el('div', null, [W.reading('Reading the team…')]);
    panel.appendChild(casesHost);
    panel.appendChild(teamHost);
    panel.appendChild(decisionFoot());

    function drawCases(q, readAt) {
      var cases = ordered(q.cases);
      var n = counts(cases);
      var active = cases.filter(function (c) { return ACTIVE.indexOf(c.status) !== -1; }).length;
      activeFig.textContent = String(active);
      top.setCounts({ moderation: active });
      var tbody = el('tbody');
      var table = W.ledger({ cls: 'cases', caption: 'Conduct cases, active first, then newest report', columns: [{ text: 'Case' }, { text: 'Status' }, { text: 'Reported' }, { text: 'Reports', num: true }, { text: 'Opened', small: 'UTC' }, { text: 'Last report' }], rows: [], empty: '' });
      table.replaceChild(tbody, table.querySelector('tbody'));
      var filter = W.chips('Filter cases', [
        { key: 'all', text: 'All', count: n.all }, { key: 'open', text: 'Open', count: n.open }, { key: 'review', text: 'Under review', count: n.review },
        { key: 'escalated', text: 'Escalated', count: n.escalated }, { key: 'closed', text: 'Decided', count: n.closed }
      ], draw, ['case', 'cases']);
      function draw(key) {
        tbody.textContent = '';
        var shown = cases.filter(function (c) { return FILTER[key] === null || FILTER[key].indexOf(c.status) !== -1; });
        shown.forEach(function (c) {
          var href = '/moderation/case/?id=' + encodeURIComponent(c.caseId);
          tbody.appendChild(el('tr', null, [
            W.cell('Case', [el('a', { class: 'ld-wl__title', href: href, 'aria-label': c.categoryLabel + ', ' + c.reported.nickname, text: c.categoryLabel }), el('span', { class: 'ld-wl__sub', title: c.caseId, text: c.caseId.slice(0, 9) + '…' })], 'c-case c-wide'),
            W.cell('Status', [stateOf(c.status)], 'c-status'),
            W.cell('Reported', [c.reported.nickname, el('span', { class: 'ld-wl__sub', text: c.reported.account })], 'c-who'),
            W.cell('Reports', [String(c.reports)], 'c-n is-num'),
            W.cell('Opened · UTC', [shortWhen(c.createdAt)], 'c-open'),
            W.cell('Last report', [shortWhen(c.lastReportAt)], 'c-last')
          ]));
        });
        if (!shown.length) {
          var all = el('button', { class: 'ld-link', type: 'button', text: 'Show all' });
          all.addEventListener('click', function () { filter.node.querySelector('button').click(); });
          tbody.appendChild(el('tr', { class: 'ld-wl__empty' }, [el('td', { colspan: '6' }, ['No case is in this filter. ', all])]));
        }
        filter.setCount(shown.length);
      }
      var unread = q.unreadable ? ' ' + q.unreadable + ' case' + (q.unreadable === 1 ? '' : 's') + ' could not be read just now and ' + (q.unreadable === 1 ? 'is' : 'are') + ' not listed.' : '';
      if (!cases.length) {
        casesHost.replaceChildren(W.block({ title: 'Cases', count: '0 active', read: 'Read ' + R.clock(readAt) }, [W.none('Nothing to review', 'No conduct case is open. Cases you’re a party to are never listed or counted.' + unread)]));
        return;
      }
      draw('all');
      casesHost.replaceChildren(W.block({ title: 'Cases', count: active + ' active', read: 'Read ' + R.clock(readAt), note: 'Active cases first (open, escalated, under review), then decided ones; newest report first within each. Parties appear by display name and account fingerprint, never by wallet.' + unread }, [filter.node, table]));
    }

    function drawTeam(team) {
      var members = team.members.filter(function (m) { return m.roles.indexOf('moderator') !== -1; });
      var rows = members.map(function (m) {
        var can = m.can.filter(function (p) { return Object.prototype.hasOwnProperty.call(CAN, p); }).map(function (p) { return CAN[p]; }).join(' · ');
        return el('tr', { class: m.you ? 'is-you' : null }, [
          W.cell('Member', [el('a', { class: 'ld-wl__name', href: '/players/?name=' + encodeURIComponent(m.name), text: m.name }), m.you ? el('span', { class: 'ld-wl__you', text: '(you)' }) : null], 'c-name c-wide'),
          W.cell('Roles', [W.roles(m.roles)], 'c-roles c-wide'),
          W.cell('Can', [el('span', { text: can || '—' })], 'c-can c-wide'),
          W.cell('On the team since', [m.since ? R.day(m.since) : m.configured ? 'Set on the server' : '—'], 'c-since c-wide')
        ]);
      });
      teamHost.replaceChildren(W.block({ title: 'Team', count: String(members.length), note: 'Everyone who holds the Moderator role. A member who is also an Admin is listed once, with both roles. An Admin appoints or removes a Moderator from Manage on the player’s profile; Admin itself is granted only by the operator.' },
        [W.ledger({ cls: 'team', caption: 'The moderation team', columns: [{ text: 'Member' }, { text: 'Roles' }, { text: 'Can' }, { text: 'On the team since' }], rows: rows, empty: 'No one holds the Moderator role.' })]));
    }

    function retry(host, what, again) {
      var b = el('button', { class: 'ld-btn ld-btn--s ld-btn--secondary', type: 'button', text: 'Try again' });
      b.addEventListener('click', again);
      host.replaceChildren(W.block({ title: what }, [W.none(what + ' couldn’t be read', 'Nothing older is shown.', { bad: true, action: b })]));
    }
    function readCases() {
      casesHost.replaceChildren(W.reading('Reading the cases…'));
      return session.api('moderation-queue', {}).then(function (q) { drawCases(q, new Date().toISOString()); }, function (e) {
        if (e && e.error === 'not-found') { casesHost.replaceChildren(W.none('Not available', 'This tab is for Moderators. Your role may have changed; reload the page.', { bad: true })); return; }
        retry(casesHost, 'Cases', readCases);
      });
    }
    function readTeam() {
      teamHost.replaceChildren(W.reading('Reading the team…'));
      return session.api('staff-team', {}).then(drawTeam, function (e) {
        if (e && e.error === 'not-found') { teamHost.textContent = ''; return; }
        retry(teamHost, 'Team', readTeam);
      });
    }
    return Promise.all([readCases(), readTeam()]);
  }

  /* ================= one case: the record head, then Decide, Evidence, Parties, History ================= */
  function casePage(slot, who, session, caseId) {
    slot.replaceChildren(W.reading('Reading the case…'));
    return session.api('moderation-case', { caseId: caseId }).then(function (view) { drawCase(slot, session, view.case, null, new Date().toISOString()); });
  }

  function drawCase(slot, session, c, flash, readAt) {
    document.title = c.categoryLabel + ' — Conduct case — Ludum';
    var ev = c.evidence;
    var dek = c.reporter.nickname + ' reported ' + c.reported.nickname + ' at table ' + R.shortId(c.gameId) + (ev.table.money ? ', a retired real-money table' : '') + '.' + (c.reports > 1 ? ' ' + (c.reports - 1) + ' later report' + (c.reports > 2 ? 's were' : ' was') + ' added.' : '');
    var head = W.recordHead({
      back: { href: '/moderation/', text: 'Moderation' }, staff: true, kicker: 'Conduct case · ' + c.caseId.slice(0, 9) + '…', title: c.categoryLabel, dek: dek,
      facts: [['Status', stateOf(c.status)], ['Revision', String(c.revision)], ['Opened', shortWhen(c.createdAt) + ' UTC'], ['Reports', String(c.reports) + (c.lastReportAt ? ' · last ' + shortWhen(c.lastReportAt) : '')]]
    });
    var body = el('div', { class: 'ld-recbody' });
    slot.replaceChildren(head, W.recsource(['Conduct review is Play’s, for its reviewers · read ' + R.day(readAt).replace(/ \d{4}$/, '') + ', ' + R.clock(readAt)]), body);

    /* Decide */
    var moves = TRANSITIONS[c.status] || [];
    var chosen = null;
    var note = el('textarea', { class: 'ld-ptextarea', id: 'cc-n', maxlength: String(NOTE_MAX), 'aria-describedby': 'cc-n-hint' });
    var used = el('span', { text: '0 / 1,000' });
    note.addEventListener('input', function () { used.textContent = note.value.length.toLocaleString('en-US') + ' / 1,000'; });
    var error = el('p', { class: 'ld-step__error', role: 'alert', hidden: true });
    var goLabel = el('span', { text: 'Record the decision' });
    var go = el('button', { class: 'ld-btn ld-btn--red', type: 'button' }, [goLabel, P.svg(P.ARROW_RIGHT)]);
    var confirmSlot = el('div', { class: 'au-confirm-slot' });
    var form = el('form', { novalidate: 'novalidate' }, [
      W.choices({ legend: 'Move the case from ' + (LABEL[c.status] || c.status) + ' to', name: 'cc-s', options: moves.map(function (to) { return { value: to, name: MOVE[to], line: LINE[to] }; }), onChange: function (v) { chosen = v; } }),
      el('div', { class: 'ld-pfield', style: 'margin-top:18px' }, [
        el('label', { class: 'ld-step__label', for: 'cc-n', text: 'Note' }),
        el('p', { class: 'ld-step__note', id: 'cc-n-hint', style: 'margin:0 0 8px', text: 'Kept with the case for reviewers. Never shown to the players.' }),
        note, el('div', { class: 'ld-pfield__foot' }, [el('span', { text: 'Reviewers only' }), used])
      ]),
      error, confirmSlot, el('div', { style: 'margin-top:18px' }, [go]),
      el('p', { class: 'ld-step__note', text: 'You approve the decision in Keplr with your Authorization Wallet: one signature over exactly this move and note, not a transaction.' })
    ]);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    function decide() {
      error.hidden = true;
      if (!chosen) { error.textContent = 'Choose where the case moves.'; error.hidden = false; return; }
      go.disabled = true;
      goLabel.textContent = 'Approve in Keplr';
      var bodyJson = { caseId: c.caseId, revision: c.revision, status: chosen };
      if (note.value.trim() !== '') bodyJson.note = note.value;
      /* v1.7: approved in Keplr by this reviewer's own Authorization Wallet (exactly this decision: the case, its
         revision, the move and the note), then sent with the approval. */
      var A = window.LudumAuth, G = window.LudumGov;
      session.whoami().then(function (who) {
        var held = who && who.account && who.account.authorizationWallet;
        return A.approveStaffAction(session, G, { route: 'moderation-decide', body: bodyJson, account: who.account.name, authorizationWallet: held && typeof held.address === 'string' ? held.address : null }, confirmSlot)
          .then(function (proof) {
            var sent = {};
            Object.keys(bodyJson).forEach(function (k) { sent[k] = bodyJson[k]; });
            Object.keys(proof).forEach(function (k) { sent[k] = proof[k]; });
            return session.api('moderation-decide', sent);
          }, function () { throw { stopped: true }; });
      }).then(function (r) {
        drawCase(slot, session, r.case, 'Recorded: the case is now ' + (LABEL[r.case.status] || r.case.status) + '.', new Date().toISOString());
      }, function (e) {
        go.disabled = false;
        goLabel.textContent = 'Record the decision';
        if (e && e.stopped) return;
        confirmSlot.textContent = '';
        if (e && e.error === 'confirmation-required') {
          error.textContent = A.staffApprovalSentence(e, G);
        } else if (e && e.error === 'conflict') {
          error.textContent = e.detail === 'stale' ? 'Another reviewer moved this case meanwhile. Reload it and decide again.' : (e.reason || 'That move is not allowed now.');
        } else if (e && e.error === 'not-found') {
          error.textContent = 'This case is not available to you.';
        } else {
          error.textContent = 'The decision could not be recorded. Nothing changed.';
        }
        error.hidden = false;
      });
    }
    go.addEventListener('click', decide);
    var side = W.stack([
      flash ? el('p', { class: 'ld-recorded', role: 'status', text: flash }) : null,
      W.none('Not a sanction', 'A decision records a status and a note. It changes no game, seat, profile or payout, and no player is told.'),
      c.related && c.related.known ? W.facts([
        ['Other cases naming ' + c.reported.nickname, c.related.total + ' in all · ' + c.related.active + ' active · from ' + c.related.reporters + ' reporter' + (c.related.reporters === 1 ? '' : 's') + ' at ' + c.related.games + ' table' + (c.related.games === 1 ? '' : 's')],
        ['Their outcomes', c.related.confirmed + ' confirmed · ' + c.related.closedNoViolation + ' no violation']
      ]) : el('p', { class: 'ld-block__note', text: 'Other cases naming this account could not be counted just now.' })
    ]);
    body.appendChild(W.block({ title: 'Decide', note: moves.length ? 'Only the moves Play allows from ' + (LABEL[c.status] || c.status) + '.' : null },
      [W.twocol(moves.length ? form : W.none('No moves', 'Play allows no decision from ' + (LABEL[c.status] || c.status) + '.'), side)]));

    /* Evidence */
    var logLine = ev.log.captured ? ev.log.entries.toLocaleString('en-US') + ' entries · hash ' + R.shortHash(ev.log.hash) + ' · re-hashed now: ' + (c.verification.verified === true ? 'matches' : c.verification.verified === false ? 'DOES NOT MATCH' : 'not checked') : 'Not captured (the game was held)';
    var keys = [['offers', 'Offers'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['rescinded', 'Rescinded'], ['forgone', 'Forgone'], ['undos', 'Undos'], ['passes', 'Passes'], ['actions', 'Actions']];
    var who1 = c.reporter.nickname + ' · reporter', who2 = c.reported.nickname + ' · reported';
    var countsLedger = el('div', null, [W.sub('Counts · whole game'), W.ledger({ cls: 'counts', caption: 'Counts, whole game', columns: [{ text: '' }, { text: who1, num: true }, { text: who2, num: true }],
      rows: keys.map(function (k) { return el('tr', null, [el('td', { text: k[1] }), W.cell(who1, [String(ev.counts.reporter[k[0]])], 'is-num'), W.cell(who2, [String(ev.counts.reported[k[0]])], 'is-num')]); }) })]);
    var chat = el('div', null, [W.sub('Chat · between the two parties'), ev.chat && ev.chat.lines.length ? W.ledger({ cls: 'chat', caption: 'Chat between the two parties, as the server kept it', columns: [{ text: 'When' }, { text: 'Who' }, { text: 'Line' }],
      rows: ev.chat.lines.map(function (l) { return el('tr', null, [W.cell('When', [shortWhen(l.at)]), W.cell('Who', [l.by === 'reporter' ? c.reporter.nickname : c.reported.nickname]), W.cell('Line', [l.text], 'c-wide')]); }) }) : el('p', { class: 'ld-block__note', text: ev.chat ? 'No chat between them.' : 'No chat was available to read.' })]);
    body.appendChild(W.block({ title: 'Evidence', read: 'Facts the server kept at each report' }, [W.stack([W.facts([
      ['Log pointer, first report', logLine],
      ['Check', c.verification.detail],
      /* v1.7 (owner, 2026-10-24): the retired escrow is evidence only for the old money tables it held -- kept there. */
      ev.table.money ? ['Retired real-money escrow', ev.money ? 'Phase ' + (ev.money.phase || 'unknown') + (ev.money.held ? ' · held' : '') : 'Not readable then'] : null,
      ['Reporter’s note', c.note === null ? 'None' : '“' + c.note + '”'],
      ['Not captured', ev.not_captured.length ? ev.not_captured.join('; ') : 'Nothing missing']
    ]), W.twocol(countsLedger, chat)])]));

    /* Parties */
    body.appendChild(W.block({ title: 'Parties', note: 'Accounts are fingerprints: stable, but never a username, wallet or id.' }, [W.ledger({ cls: 'parties', caption: 'The two parties', columns: [{ text: 'Role' }, { text: 'Seat' }, { text: 'Display name' }, { text: 'Account' }, { text: 'Seated since' }],
      rows: [['Reporter', c.reporter], ['Reported', c.reported]].map(function (p) { return el('tr', null, [W.cell('Role', [p[0]]), W.cell('Seat', [p[1].playerId]), W.cell('Display name', [p[1].nickname]), W.cell('Account', [p[1].account]), W.cell('Seated since', [shortWhen(p[1].joinedAt)])]); }) })]));

    /* History */
    var items = [{ at: c.createdAt, what: 'Reported', line: c.categoryLabel + (c.note ? '. “' + c.note + '”' : '.'), by: c.reporter.nickname + (ev.log.captured ? ' · log at ' + ev.log.entries : ''), aside: W.state('Open', 'due') }];
    c.rereports.forEach(function (r) { items.push({ at: r.at, what: 'Report added', line: r.note ? '“' + r.note + '”' : 'Still happening. A fresh log pointer and counts were taken.', by: c.reporter.nickname + (r.log.captured ? ' · log at ' + r.log.entries : '') }); });
    c.history.forEach(function (h) { items.push({ at: h.at, what: LABEL[h.to] || h.to, line: h.note ? '“' + h.note + '”' : '', by: h.byYou ? 'You' : 'Reviewer ' + h.reviewer, aside: stateOf(h.to) }); });
    items.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    body.appendChild(W.block({ title: 'History', read: 'All times UTC', note: 'Every report and decision, kept for good: a case at its limit takes no more decisions, and nothing is dropped.' },
      [W.docket(items.map(function (i) { var t = iso(i.at); return { when: [t ? R.day(t).replace(/ \d{4}$/, '') : '—', t ? ' · ' + R.clock(t).replace(' UTC', '') : ''], what: i.what, line: i.line, by: i.by, aside: i.aside }; }))]));
    if (flash) { var h1 = slot.querySelector('h1'); if (h1) h1.focus(); }
  }

  function stop(slot, title, text, action) { slot.replaceChildren(W.none(title, text, { bad: true, action: action })); }

  function mount(root, session) {
    var slot = root.querySelector('[data-pass-slot]');
    var mode = root.getAttribute('data-ludum-moderation');
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) {
        stop(slot, 'Signed out', 'Sign in first. Moderation is for the platform’s Moderators.', el('a', { class: 'ld-btn ld-btn--s', href: window.LudumSession.signInUrl('/moderation/'), text: 'Sign in' }));
        return;
      }
      if (!who.roles || who.roles.reviewer !== true) {
        W.profileTop(slot, session, who, null);
        var panel = panelOf('Moderation');
        panel.appendChild(W.none('Not available', 'This tab is for Moderators.', { action: el('a', { class: 'ld-link', href: '/me/', text: 'Your games' }) }));
        slot.appendChild(panel);
        return;
      }
      if (mode === 'case') {
        var id = new URLSearchParams(window.location.search).get('id');
        if (!id || !CASE_ID.test(id)) { stop(slot, 'No case chosen', 'Open a case from the Moderation tab.', el('a', { class: 'ld-link', href: '/moderation/', text: 'Moderation' })); return; }
        return casePage(slot, who, session, id);
      }
      return queuePage(slot, who, session);
    }).catch(function (e) {
      if (e && e.error === 'not-found') stop(slot, 'Not available', mode === 'case' ? 'This case is not available to you: it does not exist, or you are a party to it.' : 'This tab is for Moderators.', el('a', { class: 'ld-link', href: '/moderation/', text: 'Moderation' }));
      else stop(slot, 'Unavailable', 'Moderation could not be read just now. Nothing is shown rather than an old value.');
    });
  }

  window.LudumModeration = { TRANSITIONS: TRANSITIONS, counts: counts, ordered: ordered, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-moderation]');
    if (root && window.LudumSession && R && P && W) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
