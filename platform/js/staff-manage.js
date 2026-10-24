/* Ludum · LudumManage -- staff's Manage row under another player's pass on /players/?name= (Ludum Profile design, "Staff:
 * Manage", owner 2026-10-23). Only a session holding `staff.view` sees it, and never on its own profile. Its rows are the
 * Account tab's:
 *   Player Name     Change Player Name: the new name (checked as typed), the former name (Release, the default, or
 *                   Reserve), a required reason, then a dashed summary and the red "Change to ...".
 *   Former names    each with its date and state; the newest can be reserved or released (one step, a required reason).
 *   Staff roles     the account's roles; an Admin appoints or removes a Moderator here (owner, 2026-10-23: Admin itself
 *                   moves only by the server operator's command).
 * then the player's append-only audit history (staff only). Every control follows a PERMISSION the server sends with the
 * player (`can`), never a role name: a Moderator sees them aria-disabled, "Changing it is for Admins only for now." Every
 * change is approved in Keplr by the staff member's own Authorization Wallet (owner, 2026-10-23: never the password) --
 * one off-chain signature over exactly that change, no transaction, no fee -- and sent with the approval; the server
 * checks the approval and the permission again. The reason and the staff names stay here: the renamed player is told
 * only the new name (account-menu.js). Everything from the server is set as text. Needs session.js, records.js, pass.js,
 * work.js, gov.js (Keplr) and auth.js. */
(function (root) {
  'use strict';
  var P = root.LudumPass;
  var W = root.LudumWork;
  var R = root.LudumRecords;
  var el = P.el;
  var ADMINS_ONLY = 'Changing it is for Admins only for now.';
  var REASON_MAX = 300;
  var ROLE = { admin: 'Admin', moderator: 'Moderator' };
  var serial = 0;
  function nextId(prefix) { serial += 1; return prefix + '-' + serial; }

  /* ---------- pure (pinned by platform/tests/records.test.mjs) ---------- */

  /** Whether this session sees Manage on `name`'s profile: staff (`staff.view`), and not its own. */
  function seesManage(who, name) {
    var perms = who && who.signedIn === true && who.staff && Array.isArray(who.staff.permissions) ? who.staff.permissions : [];
    return perms.indexOf('staff.view') !== -1 && !(who.account && who.account.name === name);
  }
  /** One audit entry's Change, in words. */
  function auditChange(row) {
    var role = ROLE[row.role] || row.role;
    switch (row.kind) {
      case 'player-renamed':
        return 'Player Name: ' + row.from + ' → ' + row.to + ' · former name ' + (row.former === 'reserved' ? 'reserved' : 'released') +
          (row.outcome === 'refused' ? ' · refused: nothing changed' : row.outcome === 'unconfirmed' ? ' · not yet confirmed' : '');
      case 'name-reserved': return 'Former name reserved: ' + row.name;
      case 'name-released': return 'Former name released: ' + row.name;
      case 'role-granted': return 'Role given: ' + role;
      case 'role-revoked': return 'Role removed: ' + role;
      default: return String(row.kind);
    }
  }
  /** Who made it: their Player Name and the role they used, or the server operator. */
  function auditBy(row) {
    var by = row.by || {};
    if (by.role === 'operator') return 'Server operator';
    return (by.name || 'A former staff account') + ' · ' + (ROLE[by.role] || by.role);
  }
  /** The newest former name (the one its row acts on), or null. */
  function newestFormer(list) {
    return (list || []).reduce(function (best, f) { return !best || f.until > best.until ? f : best; }, null);
  }
  function formerWord(state) { return state === 'reserved' ? 'Reserved' : state === 'taken' ? 'Another player’s now' : 'Released'; }
  /** A refusal, in staff's words. `ctx`: "rename" | "former" | "role"; `to`: the name asked for. */
  function refusal(e, ctx, to) {
    var code = e && e.error, detail = e && e.detail;
    if (code === 'conflict') {
      switch (detail) {
        case 'taken': return 'Another player took ' + to + ' a moment ago. Nothing was changed. Choose another name.';
        case 'reserved': return 'That name is reserved: it was another player’s, and an Admin kept it from reuse. Choose another.';
        case 'unchanged': return ctx === 'rename' ? 'That is this player’s name already. Nothing was changed.' : 'Nothing to change: it is that way already.';
        case 'not-allowed': return ctx === 'rename' ? 'That name isn’t allowed. Choose another.' : (e.reason || 'That change isn’t allowed. Nothing was changed.');
        case 'bad-name': return 'A Player Name is 1 to ' + (root.LudumAuth ? root.LudumAuth.NAME_MAX : 24) + ' characters, with a letter or a number.';
        case 'bad-reason': return 'Give a reason of up to ' + REASON_MAX + ' characters. It’s kept in the audit history.';
        case 'self': return 'Staff don’t change their own account here. Nothing was changed.';
        default: return (e.reason ? e.reason + ' ' : '') + 'The server refused it. Nothing was changed.';
      }
    }
    if (code === 'forbidden') return ADMINS_ONLY;
    if (code === 'not-found') return 'This player can’t be found any more. Reload the page.';
    if (code === 'unavailable' && detail === 'outcome-unknown') return 'The game server could not confirm whether it was saved. Reload this page and read the audit history before trying again.';
    if (code === 'rate-limited') return 'Too many requests. Try again in a minute.';
    return 'The game server could not be reached. Nothing was changed. Try again in a moment.';
  }

  /* ---------- small pieces ---------- */

  function arrow() { return P.svg(P.ARROW_RIGHT); }
  function button(text, cls) {
    var label = el('span', { text: text });
    var b = el('button', { class: 'ld-btn ld-btn--s' + (cls ? ' ' + cls : ' ld-btn--secondary'), type: 'button' }, [label]);
    b.label = label;
    return b;
  }
  function busy(b, text) { b.saved = b.label.textContent; b.label.textContent = text; b.setAttribute('aria-busy', 'true'); b.disabled = true; }
  function idle(b) { if (b.saved !== undefined) b.label.textContent = b.saved; b.removeAttribute('aria-busy'); b.disabled = false; }
  function stamp(iso) { return R.day(iso) + ' · ' + R.clock(iso).replace(' UTC', ''); }
  function note(text, id) { return el('span', { class: 'ld-account__note', id: id || null, text: text }); }
  function row(label, value, notes, action, more) {
    return el('div', null, [el('dt', { text: label }), el('dd', null, [value].concat(notes)), el('dd', { class: 'ld-account__act' }, action ? [action] : []), more || null]);
  }
  /** A row's button for a staff-only action: live when the server says the caller may, else aria-disabled with the reason. */
  function guarded(b, allowed, whyId) {
    if (!allowed) { b.setAttribute('aria-disabled', 'true'); b.setAttribute('aria-describedby', whyId); }
    return b;
  }
  /** A panel in its row, opened by the row's button (aria-expanded); Cancel or Done closes it and gives the focus back. */
  function disclosure(trigger, holder, build) {
    function close() { holder.hidden = true; holder.textContent = ''; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
    trigger.addEventListener('click', function () {
      if (trigger.getAttribute('aria-disabled') === 'true') return;
      if (trigger.getAttribute('aria-expanded') === 'true') { close(); return; }
      holder.textContent = '';
      holder.appendChild(build(close));
      holder.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      var first = holder.querySelector('input:not([disabled]), textarea');
      if (first) first.focus();
    });
    return close;
  }
  /** One numbered step: {node, set(kind, status, ok), error(text)}. kind: "" | "active" | "done" | "error". */
  function step(no, label, content) {
    var status = el('span', { class: 'ld-step__status' });
    var error = el('p', { class: 'ld-step__error', role: 'alert', hidden: true });
    var node = el('div', { class: 'ld-step' }, [el('span', { class: 'ld-step__mark', 'aria-hidden': 'true', text: String(no) }),
      el('div', { class: 'ld-step__body' }, [el('div', { class: 'ld-step__top' }, [label, status])].concat(content).concat([error]))]);
    return {
      node: node,
      set: function (kind, text, mood) {
        node.className = 'ld-step' + (kind ? ' is-' + kind : '');
        status.className = 'ld-step__status' + (mood ? ' is-' + mood : '');
        status.textContent = text || '';
        if (kind !== 'error') { error.hidden = true; error.textContent = ''; }
        return this;
      },
      error: function (text) { error.textContent = text || ''; error.hidden = !text; return this; }
    };
  }
  /** v1.7: approve `body` for `route` in Keplr with this staff member's own Authorization Wallet (the key field is drawn
   *  in `slot`), then send it with the approval. Resolves the server's answer. Rejects with {stopped: true} when no
   *  approval came of it (the slot says why: nothing was sent), or with the server's refusal of the change. */
  function approveAndSend(session, who, route, body, slot) {
    var A = root.LudumAuth;
    var G = root.LudumGov;
    var held = who && who.account && who.account.authorizationWallet;
    var input = { route: route, body: body, account: who.account.name, authorizationWallet: held && typeof held.address === 'string' ? held.address : null };
    return A.approveStaffAction(session, G, input, slot).then(function (proof) {
      var sent = {};
      Object.keys(body).forEach(function (k) { sent[k] = body[k]; });
      Object.keys(proof).forEach(function (k) { sent[k] = proof[k]; });
      return session.api(route, sent).then(function (answer) { slot.textContent = ''; return answer; }, function (e) {
        if (e && e.error === 'confirmation-required') {
          slot.textContent = '';
          slot.appendChild(el('p', { class: 'ld-step__error', role: 'alert', text: A.staffApprovalSentence(e, G) }));
          throw { stopped: true };
        }
        slot.textContent = '';
        throw e;
      });
    }, function () { throw { stopped: true }; });
  }
  function recorded(by) { return el('p', { class: 'ld-recorded', text: 'Recorded in the audit history · ' + R.day(new Date().toISOString()) + ', ' + R.clock(new Date().toISOString()) + ' · by ' + by }); }
  function reasonField(id, hint) {
    var input = el('textarea', { class: 'ld-ptextarea', id: id, maxlength: String(REASON_MAX), 'aria-describedby': id + '-note' });
    return { input: input, note: el('p', { class: 'ld-step__note', id: id + '-note', text: hint }) };
  }
  function reasonOf(input) { var v = String(input.value || '').trim(); return v && Array.from(v).length <= REASON_MAX ? v : null; }

  /* ---------- Change Player Name: four steps ---------- */

  function renamePanel(session, who, view, close, done) {
    var A = root.LudumAuth;
    var current = view.name;
    var id = nextId('rn');
    var state = { name: '', available: false, fate: 'release', asked: 0 };
    var nameIn = el('input', { class: 'ld-pinput ld-pinput--name', id: id + '-n', maxlength: String(A.NAME_MAX), autocomplete: 'off', spellcheck: 'false', 'aria-describedby': id + '-n-note' });
    var s1 = step(1, el('label', { class: 'ld-step__label', for: id + '-n', text: 'New Player Name' }), [
      el('div', { class: 'ld-step__row' }, [nameIn]),
      el('p', { class: 'ld-step__note', id: id + '-n-note' }, ['1 to ' + A.NAME_MAX + ' characters, not another player’s and not reserved. Now: ', el('b', { text: current }), '.'])]);
    var choices = W.choices({ legend: 'What happens to ' + current, legendSr: true, name: id + '-f', options: [
      { value: 'release', name: 'Release ' + current, line: 'Another player may register it.', checked: true },
      { value: 'reserve', name: 'Reserve ' + current, line: 'Nobody else can register it while it’s reserved. For impersonation or moderation reasons.' }
    ], onChange: function (v) { state.fate = v; s2.set('done', v === 'reserve' ? 'Reserve' : 'Release', 'ok'); summary(); } });
    var s2 = step(2, el('span', { class: 'ld-step__label', text: 'The former name' }), [choices, el('p', { class: 'ld-step__note', text: 'Either way, ' + current + ' stays in this player’s audit history and is never shown publicly.' })]);
    var why = reasonField(id + '-r', 'Required. Kept in the audit history with your name and the time; other staff can read it. If you reserve the former name, say why.');
    var s3 = step(3, el('label', { class: 'ld-step__label', for: id + '-r', text: 'Reason' }), [why.input, why.note]);
    var names = el('p', { class: 'ld-confirm__names' });
    var fateLine = el('span');
    var signLine = el('span');
    var confirmBox = el('div', { class: 'ld-confirm' }, [names, el('ul', null, [
      el('li', null, [el('span', { text: 'Shown at once on the profile, at tables, in past standings and in the Players directory.' })]),
      el('li', null, [fateLine]),
      el('li', null, [signLine]),
      el('li', null, [el('span', { text: 'They’re told in Ludum on their next visit: the new name, with no reason and no staff name.' })]),
      el('li', null, [el('span', { text: 'Recorded in the audit history: you, the time, the reason and what happened to ' + current + '.' })]),
      el('li', null, [el('span', { text: 'You approve it in Keplr with your Authorization Wallet: one signature, not a transaction.' })])
    ])]);
    var go = button('Change name');
    go.className = 'ld-btn ld-btn--red';
    go.setAttribute('type', 'submit');
    go.appendChild(arrow());
    var confirmSlot = el('div');
    var s4 = step(4, el('span', { class: 'ld-step__label', text: 'Confirm' }), [confirmBox, el('div', { style: 'margin-top:16px' }, [go]), confirmSlot]);
    var cancel = button('Cancel');
    cancel.addEventListener('click', close);
    var form = el('form', { class: 'ld-change', role: 'group', 'aria-labelledby': id + '-h', novalidate: '' }, [
      el('div', { class: 'ld-change__head' }, [el('h3', { id: id + '-h', text: 'Change Player Name' }), el('p', { text: 'Admins only. Recorded in the audit history.' })]),
      s1.node, s2.node, s3.node, s4.node,
      el('div', { class: 'ld-change__foot' }, [el('p', { text: 'Nothing changes until you approve it in Keplr.' }), cancel])
    ]);
    s1.set('active'); s2.set('done', 'Release', 'ok');

    function summary() {
      var to = state.name || 'the new name';
      names.textContent = '';
      names.appendChild(el('s', { text: current }));
      names.appendChild(arrow());
      names.appendChild(el('span', { text: state.name || '…' }));
      fateLine.textContent = '';
      fateLine.appendChild(el('b', { text: current + ' is ' + (state.fate === 'reserve' ? 'reserved' : 'released') + ':' }));
      fateLine.appendChild(document.createTextNode(state.fate === 'reserve' ? ' nobody else can register it while it’s reserved.' : ' another player may register it.'));
      signLine.textContent = '';
      signLine.appendChild(document.createTextNode('The player signs in with '));
      signLine.appendChild(el('b', { text: to }));
      signLine.appendChild(document.createTextNode(' when they use a password. Keplr sign-in doesn’t change.'));
      go.label.textContent = state.name ? 'Change to ' + state.name : 'Change name';
      var ready = state.available && reasonOf(why.input) !== null;
      if (ready) go.removeAttribute('aria-disabled'); else go.setAttribute('aria-disabled', 'true');
      s4.set(ready ? 'active' : '');
    }
    function bad(status, text) { state.available = false; nameIn.setAttribute('aria-invalid', 'true'); nameIn.setAttribute('aria-describedby', id + '-n-err ' + id + '-n-note'); s1.set('error', status, 'bad').error(text); summary(); }
    function clean() { nameIn.removeAttribute('aria-invalid'); nameIn.setAttribute('aria-describedby', id + '-n-note'); s1.error(''); }
    var fold = function (s) { return String(s).normalize('NFKC').toLocaleLowerCase('en-US'); };
    var ownReserved = function (n) { return (view.formerNames || []).some(function (f) { return f.state === 'reserved' && fold(f.name) === fold(n); }); };
    var timer = null;
    function check() {
      clearTimeout(timer);
      var name = String(nameIn.value || '').trim();
      state.name = name; state.available = false;
      if (name === '') { clean(); s1.set('active'); summary(); return; }
      if (name === current) { bad('Unchanged', 'That is this player’s name now.'); return; }
      var problem = A.nameProblem(name);
      if (problem) { bad(Array.from(name).length > A.NAME_MAX ? 'Too long' : 'Not a name', A.sentence(problem, 'create')); return; }
      clean();
      /* The same name in another spelling (Kestral -> KESTRAL) is this player's own: the server decides. */
      if (fold(name) === fold(current)) { state.available = true; s1.set('done', 'Available', 'ok'); summary(); return; }
      s1.set('active', 'Checking…');
      summary();
      var mine = ++state.asked;
      A.nameCheck(session, name).then(function (r) {
        if (mine !== state.asked || String(nameIn.value || '').trim() !== name) return;
        if (r.available || (r.problem === 'unavailable' && ownReserved(name))) { state.available = true; s1.set('done', 'Available', 'ok'); summary(); }
        else if (r.problem === 'taken') bad('Taken', 'Another player has that name. Choose another.');
        else if (r.problem === 'unavailable') bad('Reserved', 'That name is reserved: it was another player’s, and an Admin kept it from reuse. Choose another.');
        else if (r.problem === 'not-allowed') bad('Not allowed', 'That name isn’t allowed. Choose another.');
        else bad('Not a name', A.sentence({ error: 'bad-name' }, 'create'));
      }, function () {
        if (mine !== state.asked) return;
        s1.set('active', 'Not checked');
        s1.error('The name could not be checked just now. Leave the field to try again.');
        summary();
      });
    }
    nameIn.addEventListener('input', function () { clearTimeout(timer); state.available = false; timer = setTimeout(check, 400); summary(); });
    nameIn.addEventListener('blur', check);
    why.input.addEventListener('input', function () {
      if (reasonOf(why.input)) { why.input.removeAttribute('aria-invalid'); s3.set('done', 'Given', 'ok'); } else s3.set('active');
      summary();
    });

    function send() {
      var reason = reasonOf(why.input);
      if (!state.available) {
        if (!state.name) s1.set('error', 'Missing', 'bad').error('Enter the new Player Name.');
        else if (s1.node.className.indexOf('is-error') === -1) s1.error('Wait for the name to be checked, or leave the field to check it.');
        nameIn.focus();
        return;
      }
      if (!reason) { why.input.setAttribute('aria-invalid', 'true'); s3.set('error', 'Missing', 'bad').error('Give a reason. It’s kept in the audit history.'); why.input.focus(); return; }
      s4.error('');
      busy(go, 'Approve in Keplr');
      var to = state.name;
      approveAndSend(session, who, 'staff-rename', { name: current, to: to, former: state.fate, reason: reason }, confirmSlot).then(function (r) {
        idle(go);
        done({ kind: 'renamed', from: current, to: r.player.name, former: state.fate, view: r.player });
      }, function (e) {
        idle(go);
        if (e && e.stopped) return;
        if (e && e.error === 'conflict' && (e.detail === 'taken' || e.detail === 'reserved')) bad(e.detail === 'taken' ? 'Taken' : 'Reserved', refusal(e, 'rename', to));
        s4.set('error').error(refusal(e, 'rename', to));
      });
    }
    form.addEventListener('submit', function (ev) { ev.preventDefault(); if (!go.disabled) send(); });
    summary();
    return form;
  }

  function renamedPanel(who, flash, close) {
    var done = button('Done');
    done.addEventListener('click', close);
    return el('div', { class: 'ld-change', role: 'status' }, [
      el('div', { class: 'ld-change__head' }, [el('h3', { text: 'Player Name changed' })]),
      el('div', { class: 'ld-step is-done' }, [el('span', { class: 'ld-step__mark', 'aria-hidden': 'true', text: '4' }), el('div', { class: 'ld-step__body' }, [
        el('div', { class: 'ld-step__top' }, [el('span', { class: 'ld-step__label', text: 'Changed' }), el('span', { class: 'ld-step__status is-ok', text: 'Recorded' })]),
        el('p', { class: 'ld-confirm__names', style: 'margin-top:8px' }, [el('s', { text: flash.from }), arrow(), el('b', { style: 'font-weight:400', text: flash.to })]),
        el('p', { class: 'ld-step__note', text: flash.from + ' is ' + (flash.former === 'reserve' ? 'reserved' : 'released') + '. ' + flash.to + ' will be told on their next visit.' }),
        recorded(who.account.name)
      ])]),
      el('div', { class: 'ld-change__foot' }, [el('p', { text: 'The audit history below has the entry.' }), done])
    ]);
  }

  /* ---------- one-step panels: a former name, a Moderator ---------- */

  function oneStep(session, opts, close) {
    var id = nextId('os');
    var why = reasonField(id + '-r', opts.hint);
    var s1 = step(1, el('label', { class: 'ld-step__label', for: id + '-r', text: 'Reason' }), [why.input, why.note]);
    var go = button(opts.action);
    go.className = 'ld-btn' + (opts.red ? ' ld-btn--red' : '');
    go.setAttribute('type', 'submit');
    go.appendChild(arrow());
    var confirmSlot = el('div');
    var errorP = el('p', { class: 'ld-step__error', role: 'alert', hidden: true });
    var cancel = button('Cancel');
    cancel.addEventListener('click', close);
    var form = el('form', { class: 'ld-change', role: 'group', 'aria-labelledby': id + '-h', novalidate: '' }, [
      el('div', { class: 'ld-change__head' }, [el('h3', { id: id + '-h', text: opts.title }), el('p', { text: opts.lede })]),
      s1.node,
      el('div', { style: 'margin-top:16px' }, [go]), errorP, confirmSlot,
      el('div', { class: 'ld-change__foot' }, [el('p', { text: 'Nothing changes until you approve it in Keplr.' }), cancel])
    ]);
    s1.set('active');
    why.input.addEventListener('input', function () { if (reasonOf(why.input)) { why.input.removeAttribute('aria-invalid'); s1.set('done', 'Given', 'ok'); } else s1.set('active'); });
    function send() {
      var reason = reasonOf(why.input);
      if (!reason) { why.input.setAttribute('aria-invalid', 'true'); s1.set('error', 'Missing', 'bad').error('Give a reason. It’s kept in the audit history.'); why.input.focus(); return; }
      errorP.hidden = true;
      busy(go, 'Approve in Keplr');
      approveAndSend(session, opts.who, opts.route, opts.body(reason), confirmSlot).then(function (r) { idle(go); opts.done(r); }, function (e) {
        idle(go);
        if (e && e.stopped) return;
        errorP.textContent = refusal(e, opts.ctx, null); errorP.hidden = false;
      });
    }
    form.addEventListener('submit', function (ev) { ev.preventDefault(); if (!go.disabled) send(); });
    return form;
  }

  /* ---------- Manage ---------- */

  /**
   * Draw Manage for `name` in `host` (appended after the pass's line). `onRenamed(newName)` lets the page redraw the pass,
   * its title and its address. Resolves when the player has been read (or could not be).
   */
  function mount(host, session, who, name, onRenamed) {
    var id = nextId('mg');
    var tabs = el('div', { class: 'ld-tabsrow' }, [
      el('nav', { class: 'ld-ptabs', 'aria-label': 'Staff' }, [el('a', { href: '#' + id, 'aria-current': 'page', text: 'Manage' })]),
      el('span', { class: 'ld-private ld-private--staff', text: 'Only staff see this' })
    ]);
    var panel = el('section', { class: 'ld-panel', id: id, 'aria-labelledby': id + '-h' }, [el('h2', { class: 'ld-sr', id: id + '-h', text: 'Manage ' + name }), W.reading('Reading the player’s staff record…')]);
    host.appendChild(tabs);
    host.appendChild(panel);

    function read(target, flash) {
      return session.api('staff-player', { name: target }).then(function (r) { draw(r.player, flash); }, function (e) {
        W.fill(panel, [el('h2', { class: 'ld-sr', id: id + '-h', text: 'Manage ' + target }),
          W.none(e && e.error === 'not-found' ? 'Not available' : 'Manage can’t be read right now', e && e.error === 'not-found' ? 'This player’s staff record isn’t available to you.' : 'Try again in a moment.', { bad: true })]);
      });
    }

    function draw(view, flash) {
      /* "Admins only for now": said once, in the first row whose action is off; each such button points to it. */
      var whyId = id + '-admins';
      var adminsSaid = false;
      function adminsOnly() { if (adminsSaid) return null; adminsSaid = true; return el('span', { class: 'ld-account__note', id: whyId, text: ADMINS_ONLY }); }

      /* Player Name */
      var nameBtn = guarded(button('Change Player Name'), view.can.rename, whyId);
      nameBtn.setAttribute('aria-expanded', 'false');
      var nameMore = el('dd', { class: 'ld-account__more', hidden: true });
      disclosure(nameBtn, nameMore, function (close) {
        return renamePanel(session, who, view, close, function (result) {
          if (onRenamed) onRenamed(result.to);
          draw(result.view, result);
        });
      });
      var nameNotes = [note('Shown on the profile, at tables and in standings, and used for password sign-in. Players can’t change it after registration; Admins can, and every change is recorded in the audit history.')];
      if (!view.can.rename) nameNotes.push(adminsOnly());

      /* Former names */
      var newest = newestFormer(view.formerNames);
      var formerValue = view.formerNames.length
        ? el('ul', { class: 'ld-former' }, view.formerNames.slice().sort(function (a, b) { return a.until < b.until ? 1 : -1; }).map(function (f) {
          return el('li', null, [el('span', { class: 'ld-former__name', text: f.name }), el('span', { class: 'ld-former__when', text: 'until ' + R.day(f.until) }),
            W.state(formerWord(f.state), f.state === 'released' ? 'done' : f.state === 'reserved' ? 'due' : '')]);
        }))
        : el('span', { class: 'ld-account__value ld-account__value--mono', text: 'None' });
      var formerBtn = null, formerMore = el('dd', { class: 'ld-account__more', hidden: true });
      if (newest && newest.state !== 'taken') {
        var reserve = newest.state === 'released';
        formerBtn = guarded(button((reserve ? 'Reserve ' : 'Release ') + newest.name), view.can.reserve, whyId);
        formerBtn.setAttribute('aria-expanded', 'false');
        disclosure(formerBtn, formerMore, function (close) {
          return oneStep(session, {
            title: (reserve ? 'Reserve ' : 'Release ') + newest.name,
            lede: reserve ? 'Nobody else can register it while it’s reserved. Admins only. Recorded in the audit history.' : 'Another player may register it again. Admins only. Recorded in the audit history.',
            hint: 'Required. Kept in the audit history with your name and the time; other staff can read it.',
            action: (reserve ? 'Reserve ' : 'Release ') + newest.name, ctx: 'former', red: false, who: who, route: 'staff-former-name',
            body: function (reason) { return { name: view.name, former: newest.name, action: reserve ? 'reserve' : 'release', reason: reason }; },
            done: function (r) { draw(r.player, { kind: 'former', name: newest.name, reserved: reserve }); }
          }, close);
        });
      }
      var formerNotes = [note('Only staff see these. A released name can be registered again; a reserved one can’t.')];
      if (formerBtn && !view.can.reserve) formerNotes.push(adminsOnly());

      /* Staff roles */
      var isModerator = view.roles.indexOf('moderator') !== -1;
      var roleBtn = null, roleMore = el('dd', { class: 'ld-account__more', hidden: true });
      if (view.can.moderator && !view.you) {
        roleBtn = button(isModerator ? 'Remove Moderator' : 'Appoint Moderator');
        roleBtn.setAttribute('aria-expanded', 'false');
        disclosure(roleBtn, roleMore, function (close) {
          return oneStep(session, {
            title: isModerator ? 'Remove ' + view.name + ' as a Moderator' : 'Appoint ' + view.name + ' a Moderator',
            lede: isModerator ? 'They stop reviewing conduct cases at once, on every device. Recorded in the audit history.' : 'They review conduct cases from their profile’s Moderation tab. Recorded in the audit history.',
            hint: 'Required. Kept in the audit history with your name and the time; other staff can read it.',
            action: isModerator ? 'Remove Moderator' : 'Appoint Moderator', ctx: 'role', red: isModerator, who: who, route: 'staff-role',
            body: function (reason) { return { name: view.name, role: 'moderator', action: isModerator ? 'remove' : 'appoint', reason: reason }; },
            done: function () { return read(view.name, { kind: 'role', appointed: !isModerator }); }
          }, close);
        });
      }
      var roleNotes = [note('Admin and Moderator are roles on one account, never separate accounts. ' + (view.can.moderator ? 'Admins appoint and remove Moderators here; Admin itself is set on the server.' : 'They’re assigned by Admins.'))];

      /* A change just made: said in its row, with the audit line. */
      if (flash && flash.kind === 'renamed') { nameMore.appendChild(renamedPanel(who, flash, function () { nameMore.hidden = true; nameMore.textContent = ''; nameBtn.focus(); })); nameMore.hidden = false; }
      if (flash && flash.kind === 'former') { formerNotes.unshift(el('span', { class: 'ld-account__note', role: 'status' }, [el('b', { text: flash.name + ' is ' + (flash.reserved ? 'reserved' : 'released') + '. ' }), recorded(who.account.name)])); }
      if (flash && flash.kind === 'role') { roleNotes.unshift(el('span', { class: 'ld-account__note', role: 'status' }, [el('b', { text: flash.appointed ? view.name + ' is a Moderator now. ' : view.name + ' is no longer a Moderator. ' }), recorded(who.account.name)])); }

      var audit = view.audit.slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      var auditBlock = el('div', { class: 'ld-audit' }, [W.block({ title: 'Audit history', count: audit.length ? String(audit.length) : null,
        note: 'Every staff change to this player, newest first: who made it, when, and why. Entries are never edited or removed.' },
        [W.ledger({ cls: 'audit', caption: 'Audit history for this player, newest first', columns: [{ text: 'When', small: 'UTC' }, { text: 'Change' }, { text: 'By' }, { text: 'Reason' }],
          empty: 'No staff changes to this player yet.',
          rows: audit.map(function (a) {
            return el('tr', null, [W.cell('When · UTC', [stamp(a.at)], 'c-when'), W.cell('Change', [auditChange(a)], 'c-change c-wide'), W.cell('By', [auditBy(a)], 'c-by'),
              W.cell('Reason', [el('span', { style: 'font-family:var(--font-sans)', text: a.reason })], 'c-reason c-wide')]);
          }) })])]);

      W.fill(panel, [
        el('h2', { class: 'ld-sr', id: id + '-h', text: 'Manage ' + view.name }),
        el('dl', { class: 'ld-account' }, [
          row('Player Name', el('span', { class: 'ld-account__value', text: view.name }), nameNotes, nameBtn, nameMore),
          row('Former names', formerValue, formerNotes, formerBtn, formerMore),
          row('Staff roles', W.roles(view.roles), roleNotes, roleBtn, roleMore)
        ]),
        auditBlock
      ]);
      if (flash && flash.kind === 'renamed') { var done = nameMore.querySelector('button'); if (done) done.focus(); }
    }

    return read(name, null);
  }

  var api = { seesManage: seesManage, auditChange: auditChange, auditBy: auditBy, newestFormer: newestFormer, refusal: refusal, mount: mount, ADMINS_ONLY: ADMINS_ONLY };
  root.LudumManage = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
