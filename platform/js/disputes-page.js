/* Ludum · /disputes/ and /disputes/case/?id=<caseId> -- the Disputes tab of your profile and the appeal it opens.
 *
 * LUDUM RESULT REVIEW (owner policy, 2026-10-25). A Credit game's result is provisional until every seated player has
 * confirmed it (or let the 30-minute review run out) or the Ludum DAO has decided a timely appeal. Appeals are filed on
 * Play, from the Game Over screen; this tab is where they are followed:
 *
 *   - every player: "Your appeals" -- each appeal of a game you played, its status, and the case page (`appeals-mine`,
 *     `appeal-case`): the result under appeal, the filings, every resolution the Appeals staff prepared with exactly what
 *     it would pay, and the Ludum DAO's decision;
 *   - the Appeals staff (`appeal.review`) and the Admins who appoint them (`appeals.manage`): the queue (`appeals-queue`);
 *     on a case, the investigation notes and findings (`appeal-note`), the audit trail, and -- Appeals staff only --
 *     a prepared resolution (`appeal-propose`), approved in Keplr with their own Authorization Wallet (one signature over
 *     exactly that resolution, not a transaction);
 *   - the Ludum DAO: a resolution is decided by the DAO's vote on a TEXT proposal (no message: it can execute nothing)
 *     carrying the resolution's digest. A DAO member may make that proposal from the case page (gov.js
 *     `buildTextProposal`, simulated, then signed in Keplr -- the chain decides who may propose). Appeals staff or an
 *     Admin then record the decision by its proposal number (`appeal-dao`): Play's server reads the proposal on chain
 *     against the pinned DAO and applies an approved resolution once. A rejected one is never applied.
 *
 * The page decides nothing and grants nothing: who sees a case, who may write, and what a decision does are the
 * server's. The digest each resolution names is checked again in this browser from the record shown (SHA-256 of its
 * canonical JSON). No inline script (§2.4). Everything from the server or the chain is set as text. */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var P = window.LudumPass;
  var W = window.LudumWork;
  var CASE_ID = /^ap_[0-9a-f]{24}$/;
  var NOTE_MAX = 4000;
  var RATIONALE_MAX = 4000;

  var STATUS = { investigating: 'Being investigated', proposed: 'Resolution prepared', decided: 'Decided by the Ludum DAO', settled: 'Settled' };
  var OUTCOME = { uphold: 'Uphold the result', annul: 'Annul the game', correct: 'Correct the standings', forfeit: 'Forfeiture' };
  var OUTCOME_LINE = {
    uphold: 'the result stands as proposed, and settles as shown',
    annul: 'the game is annulled: every wager is returned and no Skill Rating changes',
    correct: 'the standings are corrected, and the game settles by the ordinary rules on the corrected standings',
    forfeit: 'the game is decided by forfeiture'
  };
  var GROUND = { 'rules-error': 'Material rules error', 'illegal-move': 'Illegal move the game allowed', 'engine-failure': 'Engine failure or bug',
    'settlement-error': 'Incorrect standings or settlement', cheating: 'Cheating', collusion: 'Collusion' };
  var SETTLEMENT = { pending: 'On hold', settled: 'Settled', released: 'Wagers returned' };

  function el(tag, attrs, children) { return P.el(tag, attrs, children); }
  function arrow() { return P.svg(P.ARROW_RIGHT); }
  function perms(who) { return who && who.staff && Array.isArray(who.staff.permissions) ? who.staff.permissions : []; }
  /** Appeals staff or an Admin who appoints them: sees the queue and the team (pure). */
  function seesAppealsTeam(who) { var p = perms(who); return p.indexOf('appeal.review') !== -1 || p.indexOf('appeals.manage') !== -1; }
  /** Appeals staff: writes notes and prepares resolutions (pure). */
  function prepares(who) { return perms(who).indexOf('appeal.review') !== -1; }

  /** "ap_3f9c1a0b…" -> "3F9C-1A0B": the reference Play prints beside an appeal (pure). */
  function caseRef(caseId) { return String(caseId).replace(/^ap_/, '').slice(0, 8).toUpperCase().replace(/^(.{4})(.{4})$/, '$1-$2'); }
  function stateOf(status) { return W.state(STATUS[status] || status, status === 'proposed' ? 'due' : status === 'settled' || status === 'decided' ? 'done' : ''); }
  function ratingText(points) { return points === null || points === undefined ? '—' : points === 0 ? '0' : (points > 0 ? '+' : '−') + Math.abs(points).toFixed(4); }
  function when(isoText) { return isoText ? R.day(isoText).replace(/ \d{4}$/, '') + ' · ' + R.clock(isoText) : '—'; }

  /* ---------- the resolution's digest, checked here: SHA-256 of its canonical JSON (the server's `canonicalJson`) ---------- */

  /** Keys sorted, undefined dropped, everything else JSON (pure; byte for byte the server's). */
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value !== null && typeof value === 'object') {
      return '{' + Object.keys(value).sort().filter(function (k) { return value[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + canonical(value[k]); }).join(',') + '}';
    }
    return JSON.stringify(value);
  }
  /** Resolves the record's digest (hex), or null when this browser cannot compute one. */
  function digestOf(record) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle || typeof window.TextEncoder !== 'function') return Promise.resolve(null);
    return subtle.digest('SHA-256', new window.TextEncoder().encode(canonical(record))).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    }, function () { return null; });
  }

  /** The Ludum DAO's text proposal for one prepared resolution: what it does seat by seat, the rationale (quoted, so no
   *  line of it can pass for a resolution line), the record itself, and exactly one resolution line (pure). */
  function proposalText(view, proposal) {
    var lines = ['The Appeals staff’s resolution of appeal ' + caseRef(view.caseId) + ' (revision ' + proposal.revision + '): ' + (OUTCOME[proposal.outcome] || proposal.outcome) + ' — ' + (OUTCOME_LINE[proposal.outcome] || '') + '.', '',
      'Seat by seat (Credits paid; Skill Rating change):'];
    proposal.consequences.forEach(function (c) { lines.push('- ' + c.name + ': ' + c.payout + ' Credits; ' + (c.ratingChange === null ? 'no rating change' : ratingText(c.ratingChange))); });
    lines.push('', 'Rationale:');
    String(proposal.rationale).split(/\r?\n/).forEach(function (line) { lines.push('> ' + line); });
    lines.push('', 'The resolution record (canonical JSON; its SHA-256 is the digest below):', canonical(proposal.record), '', proposal.daoLine);
    return { title: 'Ludum appeal ' + view.caseId, description: lines.join('\n') };
  }

  /** "playerId:netWorth:place,..." in seat order, as `appeal-propose` takes corrected standings (pure). */
  function standingsParam(rows) { return rows.map(function (r) { return r.playerId + ':' + r.netWorth + ':' + r.place; }).join(','); }

  /** The newest resolution not rejected and not yet decided: what the DAO is (or should be) voting on (pure). */
  function pendingProposal(view) {
    if (view.outcome) return null;
    var open = view.proposals.filter(function (p) { return p.decision === null; });
    return open.length ? open[open.length - 1] : null;
  }

  /* ================= the tab ================= */

  function about() {
    return W.workfoot('How appeals work', [
      ['The review', 'When a Credit game ends, every seated player has 30 minutes, after the ceremony, to confirm the result or appeal it, on Play. Doing nothing counts as confirming. When every player has confirmed, the game settles at once.'],
      ['An appeal', 'A timely appeal puts the game’s Credits, Skill Ratings and ranking on hold. A player who has not confirmed may join it or add grounds. There is no fee and no wallet signature.'],
      ['The Appeals staff', 'They investigate and prepare a resolution — uphold the result, annul the game, or correct the standings — with exactly what it would pay. They decide nothing.'],
      ['The Ludum DAO', 'Decides by voting on a text proposal that names the resolution’s digest. Play’s server reads the vote on chain and applies an approved resolution once; a rejected one is never applied, and a new one may be prepared.'],
      ['Conduct reports', 'A report about a player’s behaviour is made at the table on Play and reviewed by Moderators. It is not an appeal.']
    ], [el('a', { class: 'ld-link', href: '/governance/' }, ['Ludum DAO proposals', arrow()])]);
  }

  function casesLedger(cases, caption) {
    var rows = cases.map(function (c) {
      return el('tr', null, [
        W.cell('Case', [el('a', { class: 'ld-wl__title', href: '/disputes/case/?id=' + encodeURIComponent(c.caseId), text: 'Appeal ' + caseRef(c.caseId) }),
          el('span', { class: 'ld-wl__sub', text: c.grounds.map(function (g) { return GROUND[g] || g; }).join(' · ') })], 'c-case c-wide'),
        W.cell('Status', [stateOf(c.status)], 'c-status'),
        W.cell('Game', [R.shortId(c.gameId)], 'c-who'),
        W.cell('Players appealing', [String(c.appellants)], 'c-n is-num'),
        W.cell('Filed', [when(c.filedAt)], 'c-open'),
        W.cell('Resolution', [c.outcome ? OUTCOME[c.outcome] || c.outcome : c.proposal ? OUTCOME[c.proposal.outcome] + ' (prepared)' : '—'], 'c-last')
      ]);
    });
    return W.ledger({ cls: 'cases', caption: caption, columns: [{ text: 'Case' }, { text: 'Status' }, { text: 'Game' }, { text: 'Players appealing', num: true }, { text: 'Filed', small: 'UTC' }, { text: 'Resolution' }], rows: rows, empty: 'No appeals.' });
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
    return W.block({ title: 'Appeals team', count: String(members.length), note: 'Everyone who holds the Appeals role. They investigate appeals and prepare resolutions; they decide none, and the role carries no Ludum DAO membership or vote. An Admin appoints or removes a member from Manage on the player’s profile.' },
      [W.ledger({ cls: 'team', caption: 'The Appeals team', columns: [{ text: 'Member' }, { text: 'Roles' }, { text: 'On the team since' }], rows: rows, empty: 'No one holds the Appeals role.' })]);
  }

  function retryBlock(host, title, again) {
    var b = el('button', { class: 'ld-btn ld-btn--s ld-btn--secondary', type: 'button', text: 'Try again' });
    b.addEventListener('click', again);
    W.fill(host, [W.block({ title: title }, [W.none(title + ' couldn’t be read', 'Nothing older is shown.', { bad: true, action: b })])]);
  }

  function signedInPage(slot, who, session) {
    W.profileTop(slot, session, who, 'disputes');
    var panel = el('section', { class: 'ld-panel', 'aria-label': 'Disputes' }, [el('h2', { class: 'ld-sr', text: 'Disputes' })]);
    slot.appendChild(panel);
    var mineFig = el('span', { text: '—' });
    var standing = [['Your appeals', mineFig]];
    if (seesAppealsTeam(who)) standing.push(['Your roles', W.roles(who.staff.roles)]);
    panel.appendChild(W.workhead('Appeals of a Credit game’s result. While an appeal is open the result is provisional: its Credits and Skill Ratings wait for the Ludum DAO’s decision.', standing));
    var mineHost = el('div', null, [W.reading('Reading your appeals…')]);
    panel.appendChild(mineHost);
    var queueHost = seesAppealsTeam(who) ? el('div', null, [W.reading('Reading the queue…')]) : null;
    var teamHost = seesAppealsTeam(who) ? el('div', null, [W.reading('Reading the team…')]) : null;
    if (queueHost) panel.appendChild(queueHost);
    if (teamHost) panel.appendChild(teamHost);
    panel.appendChild(about());

    function readMine() {
      W.fill(mineHost, [W.reading('Reading your appeals…')]);
      return session.api('appeals-mine', {}).then(function (answer) {
        var cases = Array.isArray(answer.cases) ? answer.cases : [];
        mineFig.textContent = String(cases.length);
        W.fill(mineHost, [W.block({ title: 'Your appeals', count: String(cases.length), note: cases.length ? 'Every appeal of a game you played, whoever filed it. Open one for its result, its filings, the prepared resolutions and the Ludum DAO’s decision.' : null },
          [cases.length ? casesLedger(cases, 'Appeals of games you played, newest first') : W.none('No appeals', 'An appeal is filed on Play, from the Game Over screen of a Credit game, during its 30-minute review. Any appeal of a game you played appears here.', { role: 'status' })])]);
      }, function (e) {
        if (e && e.error === 'not-found') { mineFig.textContent = '0'; W.fill(mineHost, [W.block({ title: 'Your appeals' }, [W.none('No appeals', 'This server keeps no appeals.', { role: 'status' })])]); return; }
        retryBlock(mineHost, 'Your appeals', readMine);
      });
    }
    function readQueue() {
      W.fill(queueHost, [W.reading('Reading the queue…')]);
      return session.api('appeals-queue', {}).then(function (answer) {
        var cases = Array.isArray(answer.cases) ? answer.cases : [];
        var keys = ['investigating', 'proposed', 'decided', 'settled'];
        var count = function (k) { return cases.filter(function (c) { return k === 'all' || c.status === k; }).length; };
        var table = casesLedger(cases, 'Every appeal: being investigated first, then prepared, decided and settled');
        var tableHost = el('div', null, [table]);
        var filter = W.chips('Filter appeals', [{ key: 'all', text: 'All', count: cases.length }].concat(keys.map(function (k) { return { key: k, text: STATUS[k], count: count(k) }; })), function (key) {
          var shown = cases.filter(function (c) { return key === 'all' || c.status === key; });
          W.fill(tableHost, [casesLedger(shown, 'Appeals: ' + (key === 'all' ? 'all' : STATUS[key]))]);
          filter.setCount(shown.length);
        }, ['appeal', 'appeals']);
        filter.setCount(cases.length);
        var active = count('investigating') + count('proposed');
        W.fill(queueHost, [W.block({ title: 'Appeals queue', count: active + ' open', read: 'Read ' + R.clock(new Date().toISOString()), note: 'Staff only. Being investigated first, then prepared resolutions awaiting the Ludum DAO, then decided and settled appeals.' }, [filter.node, tableHost])]);
      }, function (e) {
        if (e && e.error === 'not-found') { W.fill(queueHost, []); return; }
        retryBlock(queueHost, 'Appeals queue', readQueue);
      });
    }
    function readTeam() {
      W.fill(teamHost, [W.reading('Reading the team…')]);
      return session.api('staff-team', {}).then(function (team) { W.fill(teamHost, [teamBlock(team)]); }, function (e) {
        if (e && e.error === 'not-found') { W.fill(teamHost, []); return; }
        retryBlock(teamHost, 'Appeals team', readTeam);
      });
    }
    return Promise.all([readMine(), queueHost ? readQueue() : null, teamHost ? readTeam() : null]);
  }

  function signedOutPage(slot, session) {
    var panel = el('section', { class: 'ld-panel', 'aria-labelledby': 'dp-h' }, [el('h1', { class: 'ld-sr', id: 'dp-h', text: 'Disputes' }),
      W.none('Sign in to see your appeals', 'Appeals of a Credit game’s result are filed on Play and followed here, by the players of that game.', { role: 'status', action: el('a', { class: 'ld-btn ld-btn--s', href: session.signInUrl('/disputes/') }, ['Sign in', arrow()]) }), about()]);
    W.fill(slot, [panel]);
  }

  /* ================= one appeal ================= */

  function casePage(slot, who, session, caseId) {
    W.fill(slot, [W.reading('Reading the appeal…')]);
    return session.api('appeal-case', { caseId: caseId }).then(function (answer) { drawCase(slot, who, session, answer.case, null); });
  }

  function seatsLedger(seats, caption, provisional) {
    return W.ledger({ cls: 'counts', caption: caption, columns: [{ text: 'Place', num: true }, { text: 'Player' }, { text: 'Net worth', num: true }, { text: 'Credits', num: true }, { text: 'Rating', num: true }],
      rows: seats.slice().sort(function (a, b) { return a.place - b.place; }).map(function (s) {
        return el('tr', null, [W.cell('Place', [String(s.place)], 'is-num'), W.cell('Player', [s.name], 'c-wide'), W.cell('Net worth', [s.netWorth === null ? '—' : '$' + s.netWorth], 'is-num'),
          W.cell('Credits' + (provisional ? ' (provisional)' : ''), [String(s.payout)], 'is-num'), W.cell('Rating', [ratingText(s.ratingChange)], 'is-num')]);
      }) });
  }

  function drawCase(slot, who, session, view, flash) {
    document.title = 'Appeal ' + caseRef(view.caseId) + ' — Ludum';
    var staff = view.you && view.you.staff === true;
    var grounds = view.grounds.map(function (g) { return GROUND[g] || g; }).join(', ');
    var head = W.recordHead({
      back: { href: '/disputes/', text: 'Disputes' }, kicker: 'Appeal · ' + caseRef(view.caseId), title: view.result.outcome === 'foreclosed' ? 'Appeal of a foreclosed game' : 'Appeal of a game’s result',
      dek: view.appellants + (view.appellants === 1 ? ' player' : ' players') + ' appealed, on: ' + grounds + '.',
      facts: [['Status', stateOf(view.status)], ['Credits and ratings', SETTLEMENT[view.settlement] || view.settlement], ['Filed', when(view.filedAt)], ['Game', R.shortId(view.gameId)]]
    });
    var body = el('div', { class: 'ld-recbody' });
    W.fill(slot, [head, W.recsource([staff ? 'Appeals staff see the notes and the audit trail; the players of the game see the rest.' : 'You see this appeal as a player of its game.']), body]);
    if (flash) body.appendChild(el('p', { class: 'ld-recorded', role: 'status', text: flash }));

    /* The result under appeal. */
    var pending = view.settlement === 'pending';
    var r = view.result;
    body.appendChild(W.block({ title: 'The result under appeal', read: 'Ended ' + when(r.endedAt), note: pending ? 'Provisional: nothing in this table has been paid or rated. It settles only as the Ludum DAO decides.' : null }, [W.stack([
      seatsLedger(r.seats, 'The proposed result', pending),
      W.facts([
        r.foreclosure ? ['How it ended', 'Clock foreclosure of ' + ((r.seats.filter(function (s) { return s.playerId === r.foreclosure.defaulter; })[0] || {}).name || 'a player')] : ['How it ended', 'At the game’s end, by final net worth'],
        ['Review closed', when(r.reviewDeadline)],
        ['Game log', view.evidence.logLen.toLocaleString('en-US') + ' entries · hash ' + R.shortHash(view.evidence.logHash)],
        view.evidence.boardDigest ? ['Final board', 'digest ' + R.shortHash(view.evidence.boardDigest)] : null,
        ['Kept', 'The game’s log and record are kept for this appeal, beyond the usual seven days.']
      ])
    ])]));

    /* The filings. */
    body.appendChild(W.block({ title: 'Filings', count: String(view.filings.length) }, [W.docket(view.filings.map(function (f) {
      return { when: [R.day(f.at).replace(/ \d{4}$/, ''), ' · ' + R.clock(f.at).replace(' UTC', '')], what: f.name + ' — ' + f.grounds.map(function (g) { return GROUND[g] || g; }).join(', '), line: '“' + f.statement + '”' };
    }))]));

    /* The resolutions, each with its digest checked here. */
    var resolutions = el('div', null, view.proposals.length ? [] : [W.none('No resolution yet', 'The Appeals staff are investigating. A prepared resolution appears here with exactly what it would pay.', { role: 'status' })]);
    view.proposals.slice().reverse().forEach(function (p) {
      var check = el('span', { text: 'checking…' });
      digestOf(p.record).then(function (hex) { check.textContent = hex === null ? 'not checked in this browser' : hex === p.digest ? 'matches the record' : 'DOES NOT MATCH the record'; });
      var decision = p.decision === null ? 'Not decided' : (p.decision.verdict === 'approved' ? 'Approved' : 'Rejected') + ' by the Ludum DAO — proposal ' + p.decision.proposalId + ' (' + p.decision.status + '), recorded ' + when(p.decision.at);
      resolutions.appendChild(W.block({ title: 'Revision ' + p.revision + ': ' + (OUTCOME[p.outcome] || p.outcome), read: 'Prepared ' + when(p.preparedAt) + ' by ' + p.preparedBy }, [W.stack([
        W.facts([['What it does', OUTCOME_LINE[p.outcome] || p.outcome], ['The Ludum DAO', decision], ['Rationale', '“' + p.rationale + '”']]),
        W.ledger({ cls: 'counts', caption: 'Revision ' + p.revision + ', seat by seat', columns: [{ text: 'Player' }, { text: 'Credits', num: true }, { text: 'Rating', num: true }],
          rows: p.consequences.map(function (c) { return el('tr', null, [W.cell('Player', [c.name], 'c-wide'), W.cell('Credits', [String(c.payout)], 'is-num'), W.cell('Rating', [c.ratingChange === null ? 'No change' : ratingText(c.ratingChange)], 'is-num')]); }) }),
        W.facts([['Digest', R.shortHash(p.digest)], ['Checked here', check]]),
        W.code(p.daoLine, 'The resolution line its Ludum DAO proposal carries')
      ])]));
    });
    body.appendChild(W.block({ title: 'Resolutions', count: String(view.proposals.length), note: 'Prepared by the Appeals staff, decided by the Ludum DAO. A rejected revision is never applied; a new one may be prepared.' }, [resolutions]));

    /* The Ludum DAO's step. */
    body.appendChild(daoBlock(who, session, view, slot));

    /* Staff: the investigation, a prepared resolution, the audit trail. */
    if (staff) {
      body.appendChild(notesBlock(who, session, view, slot));
      if (prepares(who) && !view.outcome) body.appendChild(proposeBlock(who, session, view, slot));
      body.appendChild(W.block({ title: 'Audit trail', read: 'All times UTC', note: 'Every step of the case, kept for good.' }, [W.docket(view.trail.map(function (t) {
        return { when: [R.day(t.at).replace(/ \d{4}$/, ''), ' · ' + R.clock(t.at).replace(' UTC', '')], what: t.kind, by: t.by };
      }))]));
    }
    if (flash) { var h1 = slot.querySelector ? slot.querySelector('[tabindex]') : null; if (h1 && h1.focus) h1.focus(); }
  }

  /* ---------- the Ludum DAO: make the proposal (a member), record its decision (staff) ---------- */

  function daoBlock(who, session, view, slot) {
    var host = el('div');
    var proposal = pendingProposal(view);
    var children = [];
    if (view.outcome) {
      var decided = view.proposals.filter(function (p) { return p.decision && p.decision.verdict === 'approved'; })[0];
      children.push(W.none('Decided', 'The Ludum DAO approved revision ' + (decided ? decided.revision : '?') + ' (' + (OUTCOME[view.outcome] || view.outcome) + ')' + (decided ? ', proposal ' + decided.decision.proposalId : '') + '. ' + (view.settlement === 'pending' ? 'Play’s server is applying it.' : 'It is applied.'), { role: 'status' }));
    } else if (proposal) {
      var text = proposalText(view, proposal);
      children.push(el('p', { class: 'ld-block__note', text: 'Revision ' + proposal.revision + ' waits for the Ludum DAO. A DAO member makes this text proposal (it carries no message, so it can execute nothing on chain); once the vote ends, Appeals staff or an Admin record its number here and Play’s server reads the result on chain.' }));
      children.push(W.details('The proposal’s exact text', [W.code('Title: ' + text.title + '\n\n' + text.description, 'The text proposal')]));
      var memberSlot = el('div');
      children.push(memberSlot);
      R.checkMembership(who).then(function (member) { if (member) W.fill(memberSlot, [proposeToDao(text)]); });
    } else {
      children.push(W.none('Nothing for the DAO yet', view.proposals.length ? 'Every prepared revision was decided. The Appeals staff may prepare a new one.' : 'No resolution has been prepared yet.', { role: 'status' }));
    }
    if (view.you && view.you.staff && !view.outcome && view.proposals.length) children.push(recordDecision(who, session, view, slot));
    W.fill(host, [W.block({ title: 'The Ludum DAO' }, children)]);
    return host;
  }

  /** A DAO member makes the text proposal: the exact message shown, simulated, then signed in Keplr. The chain decides
   *  whether this wallet may propose; the pins must match the chain and the page must not be framed by a foreign site. */
  function proposeToDao(text) {
    var G = window.LudumGov;
    var box = el('div', { class: 'ld-tx', 'data-theme': 'press' });
    var status = el('p', { class: 'ld-tx__status', role: 'status', text: 'Connect Keplr with your Ludum DAO wallet to make this proposal.' });
    if (!G) return el('div');
    var spec;
    try { spec = G.buildTextProposal(text.title, text.description); } catch (e) { return W.none('This proposal can’t be made here', String(e && e.message), { bad: true }); }
    var go = el('button', { class: 'ld-btn ld-btn--yellow ld-btn--s', type: 'button', text: 'Make the proposal with Keplr' });
    W.fill(box, [el('p', { class: 'ld-tx__warn' }, [el('span', null, [el('b', { text: 'This is a transaction.' }), ' It creates a Ludum DAO proposal and costs a small network fee, paid by the wallet that signs. Keplr shows the same message and the fee before you approve.'])]),
      el('p', { class: 'ld-tx__label', text: 'Ludum DAO · the message Keplr will be asked to sign' }), W.code('contract: ' + spec.contract + '\nfunds: []\nmsg: ' + JSON.stringify(spec.msg, null, 2), 'The proposal message'), el('div', null, [go]), status]);
    go.addEventListener('click', function () {
      if (go.getAttribute('aria-disabled') === 'true') return;
      if (!G.framingAllowed(window)) { status.textContent = 'Open this page in its own tab to make a proposal.'; return; }
      go.setAttribute('aria-disabled', 'true');
      var reader = G.makeReader();
      var wallet = null;
      status.textContent = 'Checking the Ludum DAO’s pins on chain…';
      G.readLivePins(reader).then(function (live) {
        var problems = G.checkPins(live);
        if (problems.length) throw new Error('The Ludum DAO on chain differs from its pins (' + problems.join('; ') + '), so nothing is proposed.');
        return G.connect();
      }).then(function (w) {
        wallet = w;
        return G.readGovernor(reader, w.address);
      }).then(function (g) {
        if (!g.governor) throw new Error('This wallet (' + R.shortAddress(wallet.address) + ') may not make Ludum DAO proposals.');
        status.textContent = 'Simulating… (nothing is signed yet)';
        return G.prepare(reader, spec, wallet);
      }).then(function (prep) {
        status.textContent = 'Simulation passed. Approve in Keplr.';
        return G.signAndBroadcast(reader, spec, wallet, prep);
      }).then(function (r) {
        status.textContent = r.pending ? 'Broadcast as ' + r.txhash + '; not yet seen in a block. Its proposal will appear on the Ludum DAO’s page.' : 'Proposed (' + r.txhash + '). It is on the Ludum DAO’s page; once the vote ends, its number is recorded here.';
      }, function (e) {
        go.removeAttribute('aria-disabled');
        status.setAttribute('role', 'alert');
        status.textContent = e && e.message ? e.message : 'The proposal could not be made. Nothing was sent.';
      });
    });
    return el('div', null, [W.sub('You are a Ludum DAO member'), box]);
  }

  function confirmedCall(who, session, route, body, confirmSlot) {
    var A = window.LudumAuth, G = window.LudumGov;
    var held = who && who.account && who.account.authorizationWallet;
    return A.approveStaffAction(session, G, { route: route, body: body, account: who.account.name, authorizationWallet: held && typeof held.address === 'string' ? held.address : null }, confirmSlot)
      .then(function (proof) {
        var sent = {};
        Object.keys(body).forEach(function (k) { sent[k] = body[k]; });
        Object.keys(proof).forEach(function (k) { sent[k] = proof[k]; });
        return session.api(route, sent);
      }, function () { throw { stopped: true }; });
  }

  function refusal(e) {
    var A = window.LudumAuth, G = window.LudumGov;
    if (e && e.error === 'confirmation-required') return A.staffApprovalSentence(e, G);
    if (e && e.error === 'conflict') return e.reason || 'That isn’t possible now. Reload the appeal.';
    if (e && e.error === 'bad-request') return e.detail || 'Those fields aren’t complete.';
    if (e && e.error === 'unavailable') return 'Play couldn’t reach what it needs just now' + (e.detail ? ' (' + e.detail + ')' : '') + '. Nothing changed. Try again.';
    if (e && e.error === 'not-found') return 'This isn’t available to you.';
    return 'That could not be recorded. Nothing changed.';
  }

  /** Staff record the DAO's decision by its proposal number; the server reads and verifies it on chain. */
  function recordDecision(who, session, view, slot) {
    var input = el('input', { class: 'ld-pinput', id: 'ap-pid', inputmode: 'numeric', autocomplete: 'off', maxlength: '16' });
    var error = el('p', { class: 'ld-step__error', role: 'alert', hidden: true });
    var confirmSlot = el('div', { class: 'au-confirm-slot' });
    var label = el('span', { text: 'Record the decision' });
    var go = el('button', { class: 'ld-btn ld-btn--s', type: 'button' }, [label, arrow()]);
    go.addEventListener('click', function () {
      error.hidden = true;
      var id = String(input.value || '').trim();
      if (!/^[1-9]\d{0,15}$/.test(id) || Number(id) > Number.MAX_SAFE_INTEGER) { error.textContent = 'A proposal number is a whole number, as the Ludum DAO’s page shows it.'; error.hidden = false; return; }
      go.disabled = true;
      label.textContent = 'Approve in Keplr';
      confirmedCall(who, session, 'appeal-dao', { caseId: view.caseId, proposalId: Number(id) }, confirmSlot).then(function (answer) {
        var said = answer.verdict === 'approved' ? 'The Ludum DAO approved it: the resolution is applied once.' : answer.verdict === 'rejected' ? 'The Ludum DAO rejected it: that revision will never be applied. A new one may be prepared.' : 'The proposal is still open: nothing is decided yet.';
        drawCase(slot, who, session, answer.case, 'Proposal ' + id + ': ' + said);
      }, function (e) {
        go.disabled = false;
        label.textContent = 'Record the decision';
        if (e && e.stopped) return;
        confirmSlot.textContent = '';
        error.textContent = refusal(e);
        error.hidden = false;
      });
    });
    return el('div', { class: 'ld-pfield', style: 'margin-top:18px' }, [W.sub('Record the Ludum DAO’s decision'),
      el('label', { class: 'ld-step__label', for: 'ap-pid', text: 'Proposal number' }),
      el('p', { class: 'ld-step__note', style: 'margin:0 0 8px', text: 'Play’s server reads that proposal on chain: it must be the Ludum DAO’s, carry no message, and name exactly one of this appeal’s resolutions. Passed or executed applies it; rejected rules it out; open decides nothing. Approved in Keplr with your Authorization Wallet — a signature, not a transaction.' }),
      input, error, confirmSlot, el('div', { style: 'margin-top:12px' }, [go])]);
  }

  /** Staff notes and findings: staff-only, never shown to the players. Appeals staff write them. */
  function notesBlock(who, session, view, slot) {
    var items = view.notes.map(function (n) { return { when: [R.day(n.at).replace(/ \d{4}$/, ''), ' · ' + R.clock(n.at).replace(' UTC', '')], what: n.category === 'finding' ? 'Finding' : 'Note', line: n.text, by: n.by }; });
    var children = [items.length ? W.docket(items) : W.none('No notes yet', null)];
    if (prepares(who) && !view.outcome) {
      var category = 'note';
      var text = el('textarea', { class: 'ld-ptextarea', id: 'ap-note', maxlength: String(NOTE_MAX) });
      var error = el('p', { class: 'ld-step__error', role: 'alert', hidden: true });
      var go = el('button', { class: 'ld-btn ld-btn--s ld-btn--secondary', type: 'button', text: 'Add to the case' });
      go.addEventListener('click', function () {
        error.hidden = true;
        var value = String(text.value || '').trim();
        if (!value) { error.textContent = 'Write the note first.'; error.hidden = false; return; }
        go.disabled = true;
        session.api('appeal-note', { caseId: view.caseId, category: category, text: value }).then(function (answer) { drawCase(slot, who, session, answer.case, 'Added to the case.'); }, function (e) {
          go.disabled = false;
          error.textContent = refusal(e);
          error.hidden = false;
        });
      });
      children.push(el('div', { class: 'ld-pfield', style: 'margin-top:18px' }, [
        W.choices({ legend: 'Add', name: 'ap-cat', row: true, options: [{ value: 'note', name: 'A note', line: 'What you looked at, asked or found out.', checked: true }, { value: 'finding', name: 'A finding', line: 'What the evidence shows.' }], onChange: function (v) { category = v; } }),
        el('label', { class: 'ld-step__label', for: 'ap-note', text: 'Text' }), text, error, el('div', { style: 'margin-top:12px' }, [go])]));
    }
    return W.block({ title: 'Investigation', count: String(view.notes.length), note: 'Staff only: never shown to the players. Kept with the case for good.' }, children);
  }

  /** Appeals staff prepare a resolution: its outcome, corrected standings when correcting, the rationale -- the server
   *  computes what it pays by the settlement's own rules, and the digest the DAO will vote on. */
  function proposeBlock(who, session, view, slot) {
    var outcome = null;
    var seats = view.result.seats;
    var scored = view.result.outcome === 'scored';
    var standingsHost = el('div', { hidden: true });
    var inputs = seats.map(function (s, i) {
      var nw = el('input', { class: 'ld-pinput', id: 'ap-nw-' + i, inputmode: 'numeric', value: s.netWorth === null ? '' : String(s.netWorth) });
      var place = el('input', { class: 'ld-pinput', id: 'ap-pl-' + i, inputmode: 'numeric', value: String(s.place) });
      if (s.netWorth !== null) nw.value = String(s.netWorth);
      place.value = String(s.place);
      return { playerId: s.playerId, name: s.name, nw: nw, place: place };
    });
    W.fill(standingsHost, [W.sub('The corrected standings, seat by seat'), W.ledger({ cls: 'counts', caption: 'Corrected standings', columns: [{ text: 'Player' }, { text: 'Net worth', num: true }, { text: 'Place', num: true }],
      rows: inputs.map(function (x) { return el('tr', null, [W.cell('Player', [x.name], 'c-wide'), W.cell('Net worth', [x.nw], 'is-num'), W.cell('Place', [x.place], 'is-num')]); }) })]);
    var rationale = el('textarea', { class: 'ld-ptextarea', id: 'ap-why', maxlength: String(RATIONALE_MAX), 'aria-describedby': 'ap-why-hint' });
    var error = el('p', { class: 'ld-step__error', role: 'alert', hidden: true });
    var confirmSlot = el('div', { class: 'au-confirm-slot' });
    var label = el('span', { text: 'Prepare the resolution' });
    var go = el('button', { class: 'ld-btn ld-btn--red', type: 'button' }, [label, arrow()]);
    var options = [
      { value: 'uphold', name: OUTCOME.uphold, line: 'The proposed result stands and settles as shown.' },
      { value: 'annul', name: OUTCOME.annul, line: 'Every wager is returned and no Skill Rating changes.' },
      { value: 'correct', name: OUTCOME.correct, line: 'Enter the corrected net worths and places; the game settles by the ordinary rules on them.', disabled: !scored, why: 'A foreclosure has no standings to correct: uphold or annul it.' },
      { value: 'forfeit', name: OUTCOME.forfeit, disabled: true, why: 'Not available: the Credit rule for a forfeiture awaits the owner’s approval.' }
    ];
    go.addEventListener('click', function () {
      error.hidden = true;
      if (!outcome) { error.textContent = 'Choose an outcome.'; error.hidden = false; return; }
      var why = String(rationale.value || '').trim();
      if (!why) { error.textContent = 'Write the rationale: the Ludum DAO reads it in the proposal.'; error.hidden = false; return; }
      var body = { caseId: view.caseId, outcome: outcome, rationale: why };
      if (outcome === 'correct') {
        var rows = inputs.map(function (x) { return { playerId: x.playerId, netWorth: String(x.nw.value || '').trim(), place: String(x.place.value || '').trim() }; });
        if (!rows.every(function (x) { return /^\d{1,12}$/.test(x.netWorth) && /^[1-7]$/.test(x.place); })) { error.textContent = 'Each corrected standing is a whole net worth and a place from 1 to 7.'; error.hidden = false; return; }
        body.standings = standingsParam(rows);
      }
      go.disabled = true;
      label.textContent = 'Approve in Keplr';
      confirmedCall(who, session, 'appeal-propose', body, confirmSlot).then(function (answer) {
        var latest = answer.case.proposals[answer.case.proposals.length - 1];
        drawCase(slot, who, session, answer.case, 'Prepared: revision ' + (latest ? latest.revision : '') + ' (' + OUTCOME[outcome] + '). It now waits for the Ludum DAO.');
      }, function (e) {
        go.disabled = false;
        label.textContent = 'Prepare the resolution';
        if (e && e.stopped) return;
        confirmSlot.textContent = '';
        error.textContent = e && e.error === 'conflict' && e.detail === 'not-approved' ? 'A forfeiture can’t be prepared until the owner approves its Credit rule.' : refusal(e);
        error.hidden = false;
      });
    });
    var form = el('form', { novalidate: 'novalidate' }, [
      W.choices({ legend: 'Resolve the appeal by', name: 'ap-out', options: options, onChange: function (v) { outcome = v; standingsHost.hidden = v !== 'correct'; } }),
      standingsHost,
      el('div', { class: 'ld-pfield', style: 'margin-top:18px' }, [
        el('label', { class: 'ld-step__label', for: 'ap-why', text: 'Rationale' }),
        el('p', { class: 'ld-step__note', id: 'ap-why-hint', style: 'margin:0 0 8px', text: 'Why this outcome, from the evidence. The Ludum DAO reads it in the proposal, which is public on chain, and the players read it here.' }),
        rationale]),
      error, confirmSlot, el('div', { style: 'margin-top:18px' }, [go]),
      el('p', { class: 'ld-step__note', text: 'You approve the resolution in Keplr with your Authorization Wallet: one signature over exactly this resolution, not a transaction. Play’s server computes what it pays and its digest; the Ludum DAO decides.' })
    ]);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    return W.block({ title: 'Prepare a resolution', note: view.proposals.length ? 'A new revision replaces none: every revision and the DAO’s decision on it are kept.' : null }, [form]);
  }

  function stop(slot, title, text, action) { W.fill(slot, [W.none(title, text, { bad: true, action: action })]); }

  function mount(root, session) {
    var slot = root.querySelector('[data-pass-slot]');
    var mode = root.getAttribute('data-ludum-disputes');
    return session.whoami().then(function (who) {
      if (mode === 'case') {
        if (!who || who.signedIn !== true) { stop(slot, 'Signed out', 'Sign in to see this appeal. It is shown to the players of its game and the Appeals staff.', el('a', { class: 'ld-btn ld-btn--s', href: session.signInUrl('/disputes/') }, ['Sign in', arrow()])); return; }
        var id = new URLSearchParams(window.location.search).get('id');
        if (!id || !CASE_ID.test(id)) { stop(slot, 'No appeal chosen', 'Open an appeal from the Disputes tab.', el('a', { class: 'ld-link', href: '/disputes/', text: 'Disputes' })); return; }
        return casePage(slot, who, session, id);
      }
      if (!who || who.signedIn !== true) { signedOutPage(slot, session); return; }
      return signedInPage(slot, who, session);
    }).catch(function (e) {
      if (e && e.error === 'not-found') stop(slot, 'Not available', 'This appeal is not available to you: it does not exist, or you did not play its game.', el('a', { class: 'ld-link', href: '/disputes/', text: 'Disputes' }));
      else stop(slot, 'Unavailable', 'Disputes could not be read just now. Nothing is shown rather than an old value.');
    });
  }

  window.LudumDisputes = { seesAppealsTeam: seesAppealsTeam, prepares: prepares, caseRef: caseRef, canonical: canonical, digestOf: digestOf, proposalText: proposalText, standingsParam: standingsParam, pendingProposal: pendingProposal, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-disputes]');
    if (root && window.LudumSession && R && P && W) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
