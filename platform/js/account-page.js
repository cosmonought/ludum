/* Ludum · /me/account/ -- your profile, Account (Ludum Profile "the pass", owner 2026-10-22). The same pass and tabs as
 * Games, then four private facts, each with at most one action:
 *   Player Name           permanent (one name, for signing in and everywhere you are shown); no action.
 *   Authorization Wallet  signs you in through Keplr. Change wallet: your password, then this wallet's approval, then the
 *                         new wallet's acceptance -- nothing changes until the new wallet accepts. A wallet another
 *                         account holds, or released less than 24 hours ago, is refused (wallet exclusivity, unchanged).
 *   Password              Change password: confirm with the current password OR a Keplr signature from the
 *                         Authorization Wallet, then the new one. This browser stays signed in; others are signed out.
 *   Sessions              Sign out other sessions.
 * Every change is Play's own handler (`auth/*`); the wallet address, the password state and the sessions never reach a
 * public page. Needs session.js, records.js, pass.js, ticket.js, auth.js and gov.js (Keplr). */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var P = window.LudumPass;
  var T = window.LudumTicket;
  var el = P.el;

  /* ---------- pure (pinned by platform/tests/records.test.mjs) ---------- */

  /** The four rows' values and notes for this account (pure). */
  function rowsOf(who) {
    var a = who.account;
    var w = a.authorizationWallet;
    return {
      name: a.name,
      wallet: w ? { address: w.address, short: shortAddress(w.address), since: R.day(w.since) } : null,
      password: typeof a.passwordSetAt === 'string' ? 'Changed ' + R.day(a.passwordSetAt) : 'Set'
    };
  }
  function shortAddress(address) { var s = String(address || ''); return s.length > 16 ? s.slice(0, 9) + '…' + s.slice(-5) : s; }
  function sessionsText(n) { return n === 0 ? 'No other session was signed in.' : 'Signed out ' + n + ' other session' + (n === 1 ? '' : 's') + '.'; }

  /* ---------- the rows ---------- */

  function row(label, value, note, action, more) {
    return el('div', null, [
      el('dt', { text: label }),
      el('dd', null, [value, el('span', { class: 'ld-account__note' }, [note])]),
      el('dd', { class: 'ld-account__act' }, action ? [action] : []),
      more || null
    ]);
  }

  /** A panel in its row, opened by the row's button (aria-expanded); Cancel closes it and gives the focus back. */
  function disclosure(button, build) {
    var holder = el('dd', { class: 'ld-account__more', hidden: true });
    function close() { holder.hidden = true; holder.textContent = ''; button.setAttribute('aria-expanded', 'false'); button.focus(); }
    button.addEventListener('click', function () {
      if (button.getAttribute('aria-expanded') === 'true') { close(); return; }
      holder.textContent = '';
      holder.appendChild(build(close));
      holder.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      var first = holder.querySelector('input:not([disabled]), button:not([aria-disabled="true"])');
      if (first) first.focus();
    });
    return holder;
  }

  function keplrMissing(G) { return !G || typeof G.keplr !== 'function' || !G.keplr(); }

  /* ---------- Change password ---------- */

  function passwordPanel(session, who, close) {
    var A = window.LudumAuth;
    var G = window.LudumGov;
    var name = who.account.name;
    var wallet = who.account.authorizationWallet ? who.account.authorizationWallet.address : null;
    var held = { password: null, proof: null };
    var id = 'cp-' + Math.random().toString(36).slice(2, 7);

    var current = T.input(id + '-cur', { type: 'password', autocomplete: 'current-password' });
    var confirmBtn = el('button', { class: 'ld-btn ld-btn--ink', type: 'button', text: 'Confirm' });
    var keplrBtn = el('button', { class: 'ld-btn ld-btn--yellow', type: 'button', text: 'Approve with Keplr' });
    var keySay = el('p', { class: 'ld-say', role: 'status', 'aria-live': 'polite' });
    var keyin = el('div', { class: 'ld-keyin', 'data-theme': 'press' }, [el('p', { class: 'ld-key__lede', text: 'Approve with your Authorization Wallet instead: no current password needed.' }), el('div', { class: 'ld-key__acts' }, [keplrBtn]), keySay]);
    var s1 = T.step(1, { label: 'Confirm it’s you', errorId: id + '-e1' });
    var confirmBody = el('div', null, [
      el('div', { class: 'ld-tfield' }, [el('label', { for: current.id, text: 'Current password' }), el('div', { class: 'ld-step__row' }, [current, confirmBtn])]),
      el('div', { class: 'ld-or', 'aria-hidden': 'true', text: 'or' }), keyin
    ]);
    s1.body.appendChild(confirmBody);
    s1.set('active');

    var next = T.input(id + '-new', { type: 'password', autocomplete: 'new-password', attrs: { minlength: String(A.PASSWORD_MIN), disabled: '', 'aria-describedby': id + '-note' } });
    var show = T.reveal(next);
    show.disabled = true;
    var s2 = T.step(2, { label: 'New password', labelFor: next.id, errorId: id + '-e2' });
    s2.body.appendChild(el('div', { class: 'ld-step__row' }, [next, show]));
    s2.body.appendChild(el('p', { class: 'ld-step__note', id: id + '-note', text: 'At least ' + A.PASSWORD_MIN + ' characters.' }));

    var save = el('button', { class: 'ld-btn ld-btn--red', type: 'submit', 'aria-disabled': 'true', text: 'Set new password' });
    var s3 = T.step(3, { label: 'Save', errorId: id + '-e3', errorRole: 'alert' });
    s3.body.appendChild(save);

    var cancel = el('button', { class: 'ld-btn ld-btn--secondary ld-btn--s', type: 'button', text: 'Cancel' });
    cancel.addEventListener('click', function () { held.password = null; held.proof = null; close(); });
    var form = el('form', { class: 'ld-change', role: 'group', 'aria-labelledby': id + '-h', novalidate: '' }, [
      el('div', { class: 'ld-change__head' }, [el('h3', { id: id + '-h', text: 'Change password' }), el('p', { text: 'Confirm with your current password, or with Keplr.' })]),
      s1.node, s2.node, s3.node,
      el('div', { class: 'ld-change__foot' }, [el('p', { text: 'Nothing changes until you save.' }), cancel])
    ]);

    function confirmed(how) {
      s1.error('');
      s1.set('done', { text: 'Confirmed', kind: 'ok' });
      confirmBody.replaceWith(el('p', { class: 'ld-step__note', text: how === 'keplr' ? 'Confirmed with your Authorization Wallet.' : 'Confirmed with your password.' }));
      next.disabled = false; show.disabled = false;
      save.removeAttribute('aria-disabled');
      s2.set('active'); s3.set('active');
      next.focus();
    }
    confirmBtn.addEventListener('click', function () {
      if (T.isWaiting(confirmBtn)) return;
      var typed = current.value;
      if (typed === '') { s1.set('error', { text: 'Not confirmed', kind: 'bad' }).error('Enter your current password, or approve with Keplr.'); current.focus(); return; }
      T.busy(confirmBtn, 'Checking');
      A.confirm(session, typed).then(function () { held.password = typed; current.value = ''; T.idle(confirmBtn); confirmed('password'); }, function (e) {
        T.idle(confirmBtn);
        current.value = '';
        current.setAttribute('aria-invalid', 'true');
        current.setAttribute('aria-describedby', id + '-e1');
        s1.set('error', { text: 'Not confirmed', kind: 'bad' }).error(A.sentence(e, 'confirm'));
        current.focus();
      });
    });
    keplrBtn.addEventListener('click', function () {
      if (T.isWaiting(keplrBtn)) return;
      if (keplrMissing(G)) { keySay.textContent = 'Keplr isn’t in this browser. Confirm with your current password instead.'; return; }
      T.busy(keplrBtn, 'Waiting for Keplr');
      keySay.textContent = 'Approve in Keplr.';
      A.authorizeChange(session, G, { account: name, authorizationWallet: wallet }, function () {}).then(function (proof) {
        held.proof = proof; T.idle(keplrBtn); keySay.textContent = ''; confirmed('keplr');
      }, function (e) {
        T.idle(keplrBtn);
        var k = A.keplrProblem(e, G);
        keySay.textContent = k === 'declined' ? 'Signature declined. Nothing was changed.' : e && e.local ? e.message : A.sentence(e, 'keplr');
      });
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (save.getAttribute('aria-disabled') === 'true') { (held.password || held.proof ? next : current).focus(); return; }
      var chosen = next.value;
      var short = A.passwordProblem(chosen);
      if (short) { s2.set('error', { text: 'Too short', kind: 'bad' }).error(A.sentence(short, 'change')); next.setAttribute('aria-invalid', 'true'); next.focus(); return; }
      s2.error(''); next.removeAttribute('aria-invalid');
      T.busy(save, 'Saving');
      var done = held.proof ? A.finishChange(session, { proof: held.proof, newPassword: chosen }) : A.changePassword(session, { currentPassword: held.password, newPassword: chosen });
      done.then(function () {
        held.password = null; held.proof = null; next.value = '';
        var finished = el('div', { class: 'ld-change', role: 'status' }, [
          el('div', { class: 'ld-change__head' }, [el('h3', { text: 'Password changed' })]),
          T.step(3, { label: 'New password' }).set('done', { text: 'Set', kind: 'ok' }).body.parentNode,
          el('div', { class: 'ld-change__foot' }, [el('p', { text: '' }), el('button', { class: 'ld-btn ld-btn--secondary ld-btn--s', type: 'button', text: 'Done' })])
        ]);
        finished.querySelector('.ld-step__body').appendChild(el('p', { class: 'ld-step__note', text: 'Use it from now on. Other browsers signed in to ' + name + ' were signed out; this one stays signed in.' }));
        finished.querySelector('.ld-change__foot button').addEventListener('click', close);
        form.replaceWith(finished);
        finished.querySelector('.ld-change__foot button').focus();
      }, function (e) {
        T.idle(save);
        next.value = '';
        if (e && e.local && e.why === 'expired') { held.proof = null; s1.set('error', { text: 'Sign again', kind: 'bad' }).error('The approval is single-use and lasts a few minutes. Close this and approve again.'); return; }
        if (e && e.error === 'bad-password') { s2.set('error', { text: 'Too short', kind: 'bad' }).error(A.sentence(e, 'change')); next.focus(); return; }
        s3.set('error', { text: 'Not saved', kind: 'bad' }).error(A.sentence(e, held.proof ? 'keplr' : 'change') + ' Nothing was changed.');
      });
    });
    return form;
  }

  /* ---------- Change wallet ---------- */

  function walletPanel(session, who, close, onChanged) {
    var A = window.LudumAuth;
    var G = window.LudumGov;
    var name = who.account.name;
    var current = who.account.authorizationWallet.address;
    var id = 'cw-' + Math.random().toString(36).slice(2, 7);
    var operation = null;

    var pw = T.input(id + '-pw', { type: 'password', autocomplete: 'current-password', attrs: { 'aria-label': 'Password' } });
    var confirmBtn = el('button', { class: 'ld-btn ld-btn--ink', type: 'button', text: 'Confirm' });
    var s1 = T.step(1, { label: 'Confirm your password', errorId: id + '-e1' });
    var s1Body = el('div', { class: 'ld-step__row' }, [pw, confirmBtn]);
    s1.body.appendChild(s1Body);
    s1.set('active');

    var s2 = T.step(2, { label: 'Approve with your current wallet' });
    var approveLede = el('p', { class: 'ld-key__lede', text: 'Next, this wallet approves the change in Keplr.' });
    var approveBtn = el('button', { class: 'ld-btn ld-btn--yellow', type: 'button', text: 'Approve with Keplr', hidden: true });
    var s2Extra = el('div');
    var s2Say = el('p', { class: 'ld-say', role: 'status', 'aria-live': 'polite' });
    s2.body.appendChild(T.wallet(current, null, 'Current wallet'));
    s2.body.appendChild(approveLede);
    s2.body.appendChild(s2Extra);
    s2.body.appendChild(el('div', { class: 'ld-key__acts' }, [approveBtn]));
    s2.body.appendChild(s2Say);

    var s3 = T.step(3, { label: 'Accept with the new wallet' });
    var acceptLede = el('p', { class: 'ld-key__lede', text: 'Then the new wallet accepts it.' });
    var acceptBtn = el('button', { class: 'ld-btn ld-btn--yellow', type: 'button', text: 'Connect and accept', hidden: true });
    var s3Extra = el('div');
    var s3Say = el('p', { class: 'ld-say', role: 'status', 'aria-live': 'polite' });
    s3.body.appendChild(acceptLede);
    s3.body.appendChild(s3Extra);
    s3.body.appendChild(el('div', { class: 'ld-key__acts' }, [acceptBtn]));
    s3.body.appendChild(s3Say);

    var cancel = el('button', { class: 'ld-btn ld-btn--secondary ld-btn--s', type: 'button', text: 'Cancel' });
    cancel.addEventListener('click', close);
    var panel = el('div', { class: 'ld-change', role: 'group', 'aria-labelledby': id + '-h' }, [
      el('div', { class: 'ld-change__head' }, [el('h3', { id: id + '-h', text: 'Change wallet' }), el('p', { text: 'Nothing changes until the new wallet accepts.' })]),
      s1.node,
      el('div', { class: 'ld-key', 'data-theme': 'press' }, [s2.node]),
      el('div', { class: 'ld-key', 'data-theme': 'press' }, [s3.node]),
      el('div', { class: 'ld-change__foot' }, [el('p', { text: 'You can stop at any step.' }), cancel])
    ]);

    function reconfirm() {
      operation = null;
      s1.set('error', { text: 'Not confirmed', kind: 'bad' }).error('Confirm your password again: the confirmation lasts five minutes.');
      s1Body.hidden = false; approveBtn.hidden = true; acceptBtn.hidden = true;
      s2.set('todo'); s3.set('todo');
      pw.focus();
    }
    function keplrTrouble(e, extra, say, again) {
      var k = A.keplrProblem(e, G);
      extra.textContent = '';
      if (k === 'no-keplr') { extra.appendChild(T.msg('Keplr isn’t in this browser', 'Changing the wallet needs Keplr. Install the extension, or on a phone open this page in the Keplr app’s browser.')); extra.appendChild(el('div', { class: 'ld-key__acts' }, [T.getKeplr()])); return 'Not found'; }
      if (k === 'declined') { extra.appendChild(T.msg('Signature declined', 'Nothing was changed. ' + again)); return 'Declined'; }
      if (e && e.error === 'reauth-required') { reconfirm(); return null; }
      if (e && e.error === 'wallet-unavailable') { extra.appendChild(T.msg('That wallet can’t be used', 'Another account holds it, or released it less than 24 hours ago. Nothing was changed. In Keplr, switch to another wallet and connect again.')); return 'Unavailable'; }
      say.textContent = e && e.local ? e.message : A.sentence(e, 'wallet');
      return 'Not done';
    }

    confirmBtn.addEventListener('click', function () {
      if (T.isWaiting(confirmBtn)) return;
      var typed = pw.value;
      pw.value = '';
      if (typed === '') { s1.set('error', { text: 'Not confirmed', kind: 'bad' }).error('Enter your password.'); pw.focus(); return; }
      T.busy(confirmBtn, 'Checking');
      A.confirm(session, typed).then(function () {
        T.idle(confirmBtn);
        s1.error('').set('done', { text: 'Confirmed', kind: 'ok' });
        s1Body.hidden = true;
        s2.set('active');
        approveLede.textContent = 'Approve the change in Keplr with this wallet.';
        approveBtn.hidden = false;
        approveBtn.focus();
      }, function (e) {
        T.idle(confirmBtn);
        pw.setAttribute('aria-invalid', 'true');
        s1.set('error', { text: 'Not confirmed', kind: 'bad' }).error(A.sentence(e, 'confirm').replace(', or approve with Keplr', ''));
        pw.focus();
      });
    });

    approveBtn.addEventListener('click', function () {
      if (T.isWaiting(approveBtn)) return;
      s2Extra.textContent = ''; s2Say.textContent = '';
      if (keplrMissing(G)) { s2.set('error', { text: keplrTrouble(null, s2Extra, s2Say, ''), kind: 'bad' }); return; }
      T.busy(approveBtn, 'Waiting for Keplr');
      s2.set('active', { text: 'Approve in Keplr' });
      A.approveRelease(session, G, { account: name, current: current }, function (stage) {
        if (stage === 'sign') s2Extra.appendChild(T.check([['Site', T.siteName()], ['Player Name', name], ['Wallet', A.short(current)]]));
      }).then(function (r) {
        operation = r.operation;
        T.idle(approveBtn); approveBtn.hidden = true;
        s2Extra.textContent = '';
        s2.set('done', { text: 'Approved', kind: 'ok' });
        approveLede.textContent = 'This wallet approved the change.';
        s3.set('active');
        acceptLede.textContent = 'In Keplr, switch to the wallet you want to use. Then connect it and accept: Keplr shows a message naming ' + T.siteName() + ', ' + name + ' and the new wallet.';
        acceptBtn.hidden = false;
        acceptBtn.focus();
      }, function (e) {
        T.idle(approveBtn);
        var status = keplrTrouble(e, s2Extra, s2Say, 'Approve again to go on.');
        if (status) s2.set('error', { text: status, kind: 'bad' });
      });
    });

    acceptBtn.addEventListener('click', function () {
      if (T.isWaiting(acceptBtn) || operation === null) return;
      s3Extra.textContent = ''; s3Say.textContent = '';
      if (keplrMissing(G)) { s3.set('error', { text: keplrTrouble(null, s3Extra, s3Say, ''), kind: 'bad' }); return; }
      T.busy(acceptBtn, 'Waiting for Keplr');
      s3.set('active', { text: 'Approve in Keplr' });
      var newWallet = null;
      A.acceptWallet(session, G, { account: name, current: current, operation: operation }, function (stage, info) {
        if (stage === 'wallet' && info) { newWallet = info.wallet; s3Extra.appendChild(T.wallet(info.wallet, null, 'New wallet')); }
        if (stage === 'sign') s3Extra.appendChild(T.check([['Site', T.siteName()], ['Player Name', name], ['Wallet', A.short(newWallet)]]));
      }).then(function (r) {
        var done = el('div', { class: 'ld-change', role: 'status' }, [
          el('div', { class: 'ld-change__head' }, [el('h3', { text: 'Wallet changed' })]),
          T.step(3, { label: 'New Authorization Wallet' }).set('done', { text: 'Accepted', kind: 'ok' }).body.parentNode,
          el('div', { class: 'ld-change__foot' }, [el('p', { text: '' }), el('button', { class: 'ld-btn ld-btn--secondary ld-btn--s', type: 'button', text: 'Done' })])
        ]);
        var body = done.querySelector('.ld-step__body');
        body.appendChild(el('p', { class: 'ld-step__note ld-step__note--mono', title: r.wallet, text: A.short(r.wallet) }));
        body.appendChild(el('p', { class: 'ld-step__note', text: 'Sign in with this wallet from now on. ' + A.short(current) + ' no longer signs in to ' + name + '.' }));
        done.querySelector('.ld-change__foot button').addEventListener('click', close);
        panel.replaceWith(done);
        done.querySelector('.ld-change__foot button').focus();
        onChanged(r.wallet);
      }, function (e) {
        T.idle(acceptBtn);
        acceptBtn.textContent = 'Connect again';
        var status = keplrTrouble(e, s3Extra, s3Say, 'Accept again with the new wallet.');
        if (e && (e.error === 'authorization-invalid' || e.error === 'authorization-used' || e.error === 'stale')) {
          /* The approval is gone (spent, expired or replaced): start again from the current wallet. */
          operation = null; acceptBtn.hidden = true; approveBtn.hidden = false;
          s2.set('active', { text: 'Approve again', kind: 'bad' });
          s3.set('todo');
          s2Say.textContent = A.sentence(e, 'wallet');
          approveBtn.focus();
          return;
        }
        if (status) s3.set('error', { text: status, kind: 'bad' });
      });
    });
    return panel;
  }

  /* ---------- Sessions ---------- */

  function sessionsAction(session, note) {
    var A = window.LudumAuth;
    var button = el('button', { class: 'ld-btn ld-btn--secondary ld-btn--s', type: 'button', text: 'Sign out other sessions' });
    var slot = el('dd', { class: 'ld-account__more', hidden: true });
    function run() {
      T.busy(button, 'Signing out');
      A.signOutOthers(session).then(function (r) {
        T.idle(button);
        slot.hidden = true; slot.textContent = '';
        note.textContent = sessionsText(r && typeof r.signedOut === 'number' ? r.signedOut : 0) + ' You stay signed in here.';
      }, function (e) {
        T.idle(button);
        if (e && e.error === 'reauth-required') {
          slot.textContent = '';
          slot.appendChild(A.confirmPanel(session, { onDone: function () { slot.hidden = true; slot.textContent = ''; run(); }, onCancel: function () { slot.hidden = true; slot.textContent = ''; button.focus(); } }));
          slot.hidden = false;
          var input = slot.querySelector('input');
          if (input) input.focus();
          return;
        }
        note.textContent = A.sentence(e, 'wallet');
      });
    }
    button.addEventListener('click', function () { if (!T.isWaiting(button)) run(); });
    return { button: button, slot: slot };
  }

  /* ---------- the page ---------- */

  function render(slot, session, who) {
    var v = rowsOf(who);
    var walletValue = el('span', { class: 'ld-account__value ld-account__value--mono', title: v.wallet ? v.wallet.address : '', text: v.wallet ? v.wallet.short : 'None' });
    var walletBtn = el('button', { class: 'ld-btn ld-btn--secondary ld-btn--s', type: 'button', 'aria-expanded': 'false', text: 'Change wallet' });
    var walletMore = disclosure(walletBtn, function (close) {
      return walletPanel(session, who, close, function (address) {
        who.account.authorizationWallet = { address: address, since: new Date().toISOString() };
        walletValue.textContent = shortAddress(address);
        walletValue.setAttribute('title', address);
      });
    });
    var pwValue = el('span', { class: 'ld-account__value ld-account__value--mono', text: v.password });
    var pwBtn = el('button', { class: 'ld-btn ld-btn--secondary ld-btn--s', type: 'button', 'aria-expanded': 'false', text: 'Change password' });
    var pwMore = disclosure(pwBtn, function (close) { return passwordPanel(session, who, function () { close(); pwValue.textContent = 'Changed ' + R.day(new Date().toISOString()); }); });
    var sessionsNote = el('span', { text: 'You stay signed in here until you sign out. Pages don’t ask for a signature.' });
    var sessions = sessionsAction(session, sessionsNote);
    slot.appendChild(el('section', { class: 'ld-panel', 'aria-labelledby': 'panel-account' }, [
      el('h2', { class: 'ld-sr', id: 'panel-account', text: 'Account' }),
      el('dl', { class: 'ld-account' }, [
        row('Player Name', el('span', { class: 'ld-account__value', text: v.name }), 'Your name at every table, on your profile and for signing in. It is permanent.', null),
        row('Authorization Wallet', walletValue, 'Signs you in through Keplr.' + (v.wallet ? ' Set ' + v.wallet.since + '.' : '') + ' Changing it needs your password, this wallet’s approval and the new wallet’s acceptance.', v.wallet ? walletBtn : null, walletMore),
        row('Password', pwValue, 'Used to authorize a new wallet or as an alternative way to sign in. You can change it with the current password or with Keplr.', pwBtn, pwMore),
        row('Sessions', el('span', { class: 'ld-account__value ld-account__value--mono', text: 'Signed in on this browser' }), sessionsNote, sessions.button, sessions.slot)
      ])
    ]));
    return { changePassword: pwBtn };
  }

  function mount(root, session) {
    var slot = root.querySelector('[data-pass-slot]');
    var figures = session.api('profile', {});
    figures.catch(function () { return null; });
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) {
        slot.textContent = '';
        slot.appendChild(el('div', { class: 'ld-none' }, [el('b', { text: 'Signed out' }), el('p', { text: 'Sign in to see your account.' }),
          el('p', null, [el('a', { class: 'ld-btn', href: window.LudumSession.signInUrl('/me/account/') }, ['Sign in ', P.svg(P.ARROW_RIGHT)])])]));
        return;
      }
      slot.textContent = '';
      var passSlot = el('div', null, [P.pass(null, { name: who.account.name })]);
      slot.appendChild(passSlot);
      slot.appendChild(P.passFoot());
      var tabsSlot = el('div', null, [P.tabsRow(who, 'account', { daoMember: R.rememberedMember(window.localStorage, Date.now(), R.accountOf(who)) })]);
      slot.appendChild(tabsSlot);
      R.checkMembership(who).then(function (member) { if (member !== null) tabsSlot.replaceChildren(P.tabsRow(who, 'account', { daoMember: member })); });
      var drawn = render(slot, session, who);
      figures.then(function (profile) { passSlot.replaceChildren(P.pass(P.figuresOfProfile(profile, who))); }, function () { /* the shell stays */ });
      /* ?change=password (a signed-in player who opened /me/recover/): the panel opens at once. */
      if (/[?&]change=password\b/.test(window.location.search)) drawn.changePassword.click();
    }).catch(function () {
      slot.textContent = '';
      slot.appendChild(el('div', { class: 'ld-none', role: 'alert' }, [el('b', { text: 'Your account can’t be read right now' }), el('p', { text: 'Try again in a moment.' })]));
    });
  }

  window.LudumAccountPage = { rowsOf: rowsOf, sessionsText: sessionsText, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-account]');
    if (root && window.LudumSession && R && P && T) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
