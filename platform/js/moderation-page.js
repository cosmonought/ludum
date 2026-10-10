/* Ludum · /moderation/ and /moderation/case/?id=<caseId> — Profile · Moderation (AccountModeration) and the Conduct
 * case it opens (ConductCase). RESTRICTED: Play's listed conduct reviewers only.
 *
 * The authority is Play's: the Ludum routes `moderation-queue`, `moderation-case` and `moderation-decide` answer 404 to
 * anyone who is not a reviewer bound at Play's startup, never list a case the reviewer is a party to, and take a
 * decision only under a live "Confirm it's you" (403 reauth-required with Play's confirmation link: the password is
 * typed on Play, never here). This page hides nothing the server would show and decides nothing itself.
 *
 * Confidential: parties are display names, seat ids and account fingerprints, never a username, wallet or id. Nothing
 * is kept in this browser except, for the length of one "Confirm it's you" round trip, which case to reopen. */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var RESUME_KEY = 'ludum.moderation.resume';
  var CASE_ID = /^cc_[0-9a-f]{32}$/;

  /** Play's transitions (frontend/src/utils/conductReport.ts CONDUCT_TRANSITIONS); the server checks them again. */
  var TRANSITIONS = {
    open: ['under-review', 'no-violation', 'conduct-confirmed', 'escalated'],
    'under-review': ['no-violation', 'conduct-confirmed', 'escalated'],
    escalated: ['under-review', 'no-violation', 'conduct-confirmed'],
    'no-violation': ['under-review'],
    'conduct-confirmed': ['under-review']
  };
  var LABEL = { open: 'Open', 'under-review': 'Under review', 'no-violation': 'No violation / closed', 'conduct-confirmed': 'Conduct issue confirmed', escalated: 'Escalated' };
  var LINE = {
    'under-review': 'You are looking at it. The case stays active.',
    'no-violation': 'Nothing to act on. The case closes; it can be reopened to Under review.',
    'conduct-confirmed': 'The report is borne out. The case closes; it can be reopened to Under review.',
    escalated: 'Needs another look. The case stays active.'
  };
  var FILTER = { all: null, open: ['open'], review: ['under-review'], escalated: ['escalated'], closed: ['no-violation', 'conduct-confirmed'] };
  var NOTE_MAX = 1000;

  /** The filter counts (pure). */
  function counts(cases) {
    var out = {};
    Object.keys(FILTER).forEach(function (k) { out[k] = FILTER[k] === null ? cases.length : cases.filter(function (c) { return FILTER[k].indexOf(c.status) !== -1; }).length; });
    return out;
  }
  function stampOf(status) {
    return R.stamp(LABEL[status] || status, status === 'escalated' ? 'held' : status === 'no-violation' || status === 'conduct-confirmed' ? 'closed' : '');
  }
  function iso(ms) { return typeof ms === 'number' ? new Date(ms).toISOString() : null; }
  function shortWhen(ms) { var i = iso(ms); return i ? R.day(i).replace(/ \d{4}$/, '') + ' · ' + R.clock(i).replace(' UTC', '') : '—'; }

  function restricted() {
    return R.el('div', { class: 'ld-restricted', role: 'note' }, [R.el('span', { class: 'ld-restricted__band', 'aria-hidden': 'true' }), R.el('p', null, ['Restricted · Moderation ', R.el('span', { text: '— reviewers only. Cases you are a party to are withheld from you.' })])]);
  }
  function stop(body, label, text, action) { body.textContent = ''; body.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice(label, text, 'stop', action)])); }

  /* ================= the queue ================= */
  function queuePage(frame, body, who, session) {
    R.profileFrame(frame, who, 'moderation', { kicker: 'Profile', muted: 'Only you can see this page', title: who.account.name, dek: 'Conduct reports from Play’s tables, for its listed reviewers.' });
    frame.appendChild(restricted());
    return session.api('moderation-queue', {}).then(function (q) {
      body.textContent = '';
      var cases = q.cases.slice();
      var n = counts(cases);
      var tbody = R.el('tbody', null, []);
      var countLabel = R.el('span', { class: 'ld-filters__count', 'aria-live': 'polite' });
      function draw(filter) {
        tbody.textContent = '';
        var shown = cases.filter(function (c) { return FILTER[filter] === null || FILTER[filter].indexOf(c.status) !== -1; });
        shown.forEach(function (c) {
          var href = '/moderation/case/?id=' + encodeURIComponent(c.caseId);
          tbody.appendChild(R.el('tr', null, [
            R.td('Case', [R.el('a', { href: href, title: c.caseId, text: c.caseId.slice(0, 11) + '…' })], 'is-key'),
            R.td('Table', [R.val(R.idSpan(c.gameId))]),
            R.td('Category', [R.val(c.categoryLabel)]),
            R.td('Reported', [R.val(c.reported.nickname, c.reported.account)]),
            R.td('Reports', [R.val(String(c.reports))], 'is-num'),
            R.td('Opened (UTC)', [R.val(shortWhen(c.createdAt))]),
            R.td('Last report', [R.val(shortWhen(c.lastReportAt))]),
            R.td('Status', [R.val(stampOf(c.status))]),
            R.go(href)
          ]));
        });
        countLabel.textContent = shown.length + (shown.length === 1 ? ' case' : ' cases');
      }
      var filters = R.el('div', { class: 'ld-tabs', role: 'group', 'aria-label': 'Filter cases' }, [['all', 'All'], ['open', 'Open'], ['review', 'Under review'], ['escalated', 'Escalated'], ['closed', 'Decided']].map(function (f) {
        var b = R.el('button', { type: 'button', 'aria-pressed': f[0] === 'all' ? 'true' : 'false' }, [f[1] + ' ', R.el('span', { class: 'ld-tabs__count', text: String(n[f[0]]) })]);
        b.addEventListener('click', function () { Array.prototype.forEach.call(b.parentNode.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); draw(f[0]); });
        return b;
      }));
      draw('all');
      var ledgerEl = cases.length
        ? R.el('figure', { class: 'ld-ledger ld-ledger--stack' }, [R.el('div', { class: 'ld-ledger__scroll', tabindex: '0', role: 'region', 'aria-label': 'Conduct cases' }, [R.el('table', null, [
            R.el('thead', null, [R.el('tr', null, ['Case', 'Table', 'Category', 'Reported', 'Reports', 'Opened (UTC)', 'Last report', 'Status', ''].map(function (t) { return R.el('th', { scope: 'col', class: t === 'Reports' ? 'is-num' : null, text: t }); }))]), tbody])]),
            R.el('p', { class: 'ld-ledger__note', text: 'Parties appear by display name and account fingerprint, never by username, wallet or id.' + (q.unreadable ? ' ' + q.unreadable + ' case' + (q.unreadable === 1 ? '' : 's') + ' could not be read just now and ' + (q.unreadable === 1 ? 'is' : 'are') + ' not listed.' : '') })])
        : R.notice('No cases', 'There is nothing to review.' + (q.unreadable ? ' ' + q.unreadable + ' could not be read just now.' : ''), 'wait');
      body.appendChild(R.section('01', 'm1', 'Conduct review', 'Reports made at Play’s tables, one case per table, reporter, reported player and category, newest first. A case is a request to look, not a finding. Your own cases are never listed or counted.', [
        cases.length ? R.el('div', { class: 'ld-filters', style: 'margin-bottom:16px' }, [filters, countLabel]) : null, ledgerEl
      ]));
      body.appendChild(R.section('02', 'm2', 'What this review can and cannot do', null, [R.el('div', { class: 'ld-twocol' }, [
        R.notice('Separate from money and appeals', 'Conduct review belongs to Play’s server and its listed reviewers. It never touches a table’s money, a dispute or a Ludum DAO vote; those are the escrow’s and the DAO’s.', ''),
        R.notice('No sanctions here', 'A decision records a status and a note. It changes no game, seat, profile or payout, and no player is told. Any action beyond that is not defined.', '')
      ])]));
    });
  }

  /* ================= one case ================= */
  function casePage(frame, body, who, session, caseId) {
    return session.api('moderation-case', { caseId: caseId }).then(function (view) { drawCase(frame, body, session, view.case, null); });
  }

  function drawCase(frame, body, session, c, flash) {
    document.title = 'Conduct case — Moderation — Ludum';
    frame.textContent = '';
    frame.appendChild(restricted());
    frame.appendChild(R.rechead({
      back: { href: '/moderation/', text: 'Moderation' }, muted: 'Conduct review · Case', no: R.el('span', { class: 'ld-id', title: c.caseId, text: R.shortId(c.caseId) }),
      title: c.categoryLabel,
      dek: c.reporter.nickname + ' reported ' + c.reported.nickname + ' at table ' + R.shortId(c.gameId) + (c.evidence.table.money ? ', a real-money table' : ', a free table') + '.' + (c.reports > 1 ? ' ' + (c.reports - 1) + ' later report' + (c.reports > 2 ? 's' : '') + ' added.' : ''),
      meta: [['Status', stampOf(c.status)], ['Revision', String(c.revision)], ['Opened', R.day(iso(c.createdAt)) + ' · ' + R.clock(iso(c.createdAt))]]
    }));
    body.textContent = '';

    /* 01 Decide */
    var moves = TRANSITIONS[c.status] || [];
    var chosen = null;
    var choices = R.el('fieldset', { class: 'ld-choices' }, [R.el('legend', { text: 'Move the case from ' + (LABEL[c.status] || c.status) + ' to' })].concat(moves.map(function (to) {
      var input = R.el('input', { type: 'radio', name: 'cc-s', value: to });
      input.addEventListener('change', function () { chosen = to; });
      return R.el('label', { class: 'ld-choice' }, [input, R.el('span', { class: 'ld-choice__box', 'aria-hidden': 'true' }), R.el('span', { class: 'ld-choice__name', text: LABEL[to] }), R.el('span', { class: 'ld-choice__line', text: LINE[to] || '' })]);
    })));
    var note = R.el('textarea', { class: 'ld-textarea', id: 'cc-n', maxlength: String(NOTE_MAX) });
    var used = R.el('span', { text: '0 / 1,000' });
    note.addEventListener('input', function () { used.textContent = note.value.length + ' / 1,000'; });
    var error = R.el('p', { class: 'ld-field__error', role: 'alert', hidden: true });
    var go = R.el('button', { class: 'ld-btn', type: 'button', text: 'Record the decision' });
    var form = R.el('form', { class: 'ld-form' }, [choices, R.el('div', { class: 'ld-field' }, [
      R.el('label', { class: 'ld-field__label', for: 'cc-n', text: 'Note' }),
      R.el('p', { class: 'ld-field__hint', text: 'Kept with the case for reviewers. Never shown to the players.' }),
      note, R.el('div', { class: 'ld-field__foot' }, [R.el('span', { text: 'Reviewers only' }), used])
    ]), error, R.el('div', null, [go])]);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    go.addEventListener('click', function () {
      error.hidden = true;
      if (!chosen) { error.textContent = 'Choose where the case moves.'; error.hidden = false; return; }
      go.disabled = true;
      var bodyJson = { caseId: c.caseId, revision: c.revision, status: chosen };
      if (note.value.trim() !== '') bodyJson.note = note.value;
      session.api('moderation-decide', bodyJson).then(function (r) {
        drawCase(frame, body, session, r.case, 'Recorded: the case is now ' + (LABEL[r.case.status] || r.case.status) + '.');
      }, function (e) {
        go.disabled = false;
        if (e && e.error === 'reauth-required') {
          try { window.sessionStorage.setItem(RESUME_KEY, c.caseId); } catch (x) { /* the reviewer reopens the case */ }
          error.textContent = '';
          error.appendChild(document.createTextNode('A decision needs “Confirm it’s you” on Play first. Your choice is not saved. '));
          error.appendChild(R.el('a', { class: 'ld-link', href: e.confirmUrl || window.LudumSession.confirmUrl('/moderation/'), text: 'Confirm it’s you on Play' }));
        } else if (e && e.error === 'conflict') {
          error.textContent = e.detail === 'stale' ? 'Another reviewer moved this case meanwhile. Reload it and decide again.' : (e.reason || 'That move is not allowed now.');
        } else if (e && e.error === 'not-found') {
          error.textContent = 'This case is not available to you.';
        } else {
          error.textContent = 'The decision could not be recorded. Nothing changed.';
        }
        error.hidden = false;
      });
    });
    var decideBody = moves.length ? form : R.notice('No moves', 'Play allows no decision from ' + (LABEL[c.status] || c.status) + '.', 'wait');
    var side = R.el('div', { class: 'ld-stack' }, [
      flash ? R.notice('Recorded', flash, '') : null,
      R.notice('Not a sanction', 'A decision records a status and a note. It changes no game, seat, profile or payout, and no player is told.', ''),
      c.related && c.related.known ? R.el('dl', { class: 'ld-facts' }, [
        R.el('dt', { text: 'Other cases naming ' + c.reported.nickname }), R.el('dd', { text: c.related.total + ' in all · ' + c.related.active + ' active · from ' + c.related.reporters + ' reporter' + (c.related.reporters === 1 ? '' : 's') + ' at ' + c.related.games + ' table' + (c.related.games === 1 ? '' : 's') }),
        R.el('dt', { text: 'Their outcomes' }), R.el('dd', { text: c.related.confirmed + ' confirmed · ' + c.related.closedNoViolation + ' no violation' })
      ]) : R.el('p', { class: 'ld-body-s', text: 'Other cases naming this account could not be counted just now.' })
    ]);
    body.appendChild(R.section('01', 'cd1', 'Decide', moves.length ? 'Only the moves Play allows from ' + (LABEL[c.status] || c.status) + '.' : null, [R.el('div', { class: 'ld-twocol ld-twocol--wide' }, [decideBody, side])]));

    /* 02 Evidence */
    var ev = c.evidence;
    var logLine = ev.log.captured ? ev.log.entries.toLocaleString('en-US') + ' entries · hash ' + R.shortHash(ev.log.hash) + ' · re-hashed now: ' + (c.verification.verified === true ? 'matches' : c.verification.verified === false ? 'DOES NOT MATCH' : 'not checked') : 'Not captured (the game was held)';
    var facts = R.el('dl', { class: 'ld-facts' }, [
      R.el('dt', { text: 'Log pointer, first report' }), R.el('dd', { text: logLine }),
      R.el('dt', { text: 'Check' }), R.el('dd', { text: c.verification.detail }),
      R.el('dt', { text: 'Money at the table' }), R.el('dd', { text: ev.table.money ? (ev.money ? 'Real money · phase ' + (ev.money.phase || 'unknown') + (ev.money.held ? ' · held' : '') : 'Real money · not readable then') : 'A free table: no money, no dispute' }),
      R.el('dt', { text: 'Reporter’s note' }), R.el('dd', { text: c.note === null ? 'None' : '“' + c.note + '”' }),
      R.el('dt', { text: 'Not captured' }), R.el('dd', { text: ev.not_captured.length ? ev.not_captured.join('; ') : 'Nothing missing' })
    ]);
    var keys = [['offers', 'Offers'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['rescinded', 'Rescinded'], ['forgone', 'Forgone'], ['undos', 'Undos'], ['passes', 'Passes'], ['actions', 'Actions']];
    var countsLedger = R.ledger({ title: 'Counts', unit: 'Whole game · facts, not motives', columns: [[''], [c.reporter.nickname + ' · reporter', true], [c.reported.nickname + ' · reported', true]],
      rows: keys.map(function (k) { return R.el('tr', null, [R.td('', [R.val(k[1])]), R.td(c.reporter.nickname + ' · reporter', [R.val(String(ev.counts.reporter[k[0]]))], 'is-num'), R.td(c.reported.nickname + ' · reported', [R.val(String(ev.counts.reported[k[0]]))], 'is-num')]); }) });
    var chat = ev.chat && ev.chat.lines.length ? R.ledger({ title: 'Chat', unit: 'Between the two parties, as the server kept it', columns: [['When'], ['Who'], ['Line']],
      rows: ev.chat.lines.map(function (l) { return R.el('tr', null, [R.td('When', [R.val(shortWhen(l.at))]), R.td('Who', [R.val(l.by === 'reporter' ? c.reporter.nickname : c.reported.nickname)]), R.td('Line', [R.val(l.text)])]); }) }) : R.el('p', { class: 'ld-body-s', text: ev.chat ? 'No chat between them.' : 'No chat was available to read.' });
    body.appendChild(R.section('02', 'cd2', 'Evidence', 'Facts the server kept at each report.', [R.el('div', { class: 'ld-stack' }, [facts, R.el('div', { class: 'ld-twocol' }, [countsLedger, chat])])]));

    /* 03 Parties */
    var parties = [['Reporter', c.reporter], ['Reported', c.reported]];
    body.appendChild(R.section('03', 'cd3', 'Parties', null, [R.ledger({ columns: [['Role'], ['Seat'], ['Display name'], ['Account'], ['Seated since']],
      rows: parties.map(function (p) { return R.el('tr', null, [R.td('Role', [R.val(p[0])]), R.td('Seat', [R.val(p[1].playerId)]), R.td('Display name', [R.val(p[1].nickname)]), R.td('Account', [R.val(p[1].account)]), R.td('Seated since', [R.val(shortWhen(p[1].joinedAt))])]); }),
      note: 'Accounts are fingerprints: stable, but never a username, wallet or id.' })]));

    /* 04 History */
    var items = [{ at: iso(c.createdAt), what: 'Reported', line: c.categoryLabel + (c.note ? '. “' + c.note + '”' : '.'), by: [c.reporter.nickname + (ev.log.captured ? ' · log at ' + ev.log.entries : '')], aside: R.stamp('Open', '') }];
    c.rereports.forEach(function (r) { items.push({ at: iso(r.at), what: 'Report added', line: r.note ? '“' + r.note + '”' : 'Still happening. A fresh log pointer and counts were taken.', by: [c.reporter.nickname + (r.log.captured ? ' · log at ' + r.log.entries : '')] }); });
    c.history.forEach(function (h) { items.push({ at: iso(h.at), what: LABEL[h.to] || h.to, line: h.note ? '“' + h.note + '”' : '', by: [h.byYou ? 'You' : 'Reviewer ' + h.reviewer], aside: stampOf(h.to) }); });
    items.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    body.appendChild(R.section('04', 'cd4', 'History', 'Every report and decision, kept for good: a case at its limit takes no more decisions, and nothing is dropped.', [R.el('ol', { class: 'ld-docket' }, items.map(R.docketItem))]));
  }

  function mount(root, session) {
    var frame = root.querySelector('[data-rec-frame]');
    var body = root.querySelector('[data-rec-body]');
    var mode = root.getAttribute('data-ludum-moderation');
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) {
        frame.textContent = '';
        stop(body, 'Signed out', 'Sign in on Play first. Moderation is for Play’s listed reviewers.', R.el('a', { class: 'ld-btn', href: window.LudumSession.signInUrl('/moderation/'), text: 'Sign in on Play' }));
        return;
      }
      if (!who.roles || who.roles.reviewer !== true) {
        R.profileFrame(frame, who, null, { kicker: 'Profile', title: who.account.name });
        stop(body, 'Not available', 'This page is for Play’s listed conduct reviewers.', R.el('a', { class: 'ld-link', href: '/me/', text: 'Your record' }));
        return;
      }
      if (mode === 'case') {
        var id = new URLSearchParams(window.location.search).get('id');
        if (!id || !CASE_ID.test(id)) { stop(body, 'No case chosen', 'Open a case from the review queue.', R.el('a', { class: 'ld-link', href: '/moderation/', text: 'Moderation' })); return; }
        return casePage(frame, body, who, session, id);
      }
      /* Back from "Confirm it's you": reopen the case the decision was for (once). */
      var resume = null;
      try { resume = window.sessionStorage.getItem(RESUME_KEY); window.sessionStorage.removeItem(RESUME_KEY); } catch (x) { resume = null; }
      if (resume && CASE_ID.test(resume)) { window.location.replace('/moderation/case/?id=' + resume); return; }
      return queuePage(frame, body, who, session);
    }).catch(function (e) {
      if (e && e.error === 'not-found') stop(body, 'Not available', mode === 'case' ? 'This case is not available to you: it does not exist, or you are a party to it.' : 'This page is for Play’s listed conduct reviewers.', R.el('a', { class: 'ld-link', href: '/moderation/', text: 'Moderation' }));
      else stop(body, 'Unavailable', 'The review could not be read just now. Nothing is shown rather than an old value.');
    });
  }

  window.LudumModeration = { TRANSITIONS: TRANSITIONS, counts: counts, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-moderation]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
