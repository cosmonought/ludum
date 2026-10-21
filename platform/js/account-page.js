/* Ludum · /me/account/ — Profile · Your account: your name (its one change, while it is still yours to use), the username
 * you sign in with, your password, your Authorization Wallet (changed here: both wallets sign in Keplr), and the facts
 * players at your tables see. Reads `session` and `account`; writes `display-name` (the server decides) and, through
 * Play's own account handlers (`auth/*`), the password and the Authorization Wallet.
 *
 * The name's states (the owner's rule): "changeable" -- one change before the first game, offered; "locked-seated" -- a
 * seat is held at a table that has not started: offered, with why it is locked; "changed" (used) and "locked-playing"
 * (a game has begun) -- nothing is offered and nothing is said: the server still refuses every later change. */
(function () {
  'use strict';
  var R = window.LudumRecords;

  /** What the name row offers (pure): "change" (the form), "locked" (the form, closed, with why), or "none". */
  function nameOffer(view) {
    if (view.state === 'changeable') return 'change';
    if (view.state === 'locked-seated') return 'locked';
    return 'none';
  }
  /** What a refused change means to the player (pure). */
  function refusalText(e) {
    var d = e && e.detail;
    if (d === 'taken') return 'Another player already has that name. Choose another.';
    if (d === 'unchanged') return 'That is your name already.';
    if (d === 'already-changed') return 'Your one change is already used.';
    if (d === 'locked-playing') return 'A game has started, so the name is locked.';
    if (d === 'locked-seated') return 'You hold a seat at a table that has not started. Leave it to change your name.';
    if (d === 'bad-name') return 'A name is 1 to 24 characters, with no control characters and no spaces at either end.';
    if (e && e.error === 'signed-out') return 'You are signed out. Sign in and try again.';
    if (e && e.error === 'rate-limited') return 'Too many requests. Try again in a minute.';
    return 'The change could not be saved. Nothing changed.';
  }

  function nameRow(view, onSave) {
    var offer = nameOffer(view);
    if (offer === 'none') return R.el('dd', null, [R.el('strong', { text: view.name })]);
    var input = R.el('input', { class: 'ld-input', id: 'dn-name', value: view.name, maxlength: '24', autocomplete: 'nickname', spellcheck: 'false', disabled: offer === 'locked' ? 'disabled' : null });
    var error = R.el('p', { class: 'ld-field__error', role: 'alert', hidden: true });
    var confirm = R.el('label', { class: 'ld-check', for: 'dn-sure' }, [R.el('input', { type: 'checkbox', id: 'dn-sure', disabled: offer === 'locked' ? 'disabled' : null }), 'I understand I can change my name only once.']);
    var save = R.el('button', { class: 'ld-btn', type: 'button', text: 'Change name', disabled: offer === 'locked' ? 'disabled' : null });
    var hint = offer === 'locked' ? 'Leave the table you are seated at to change your name.' : 'You can change it once, before your first game.';
    var field = R.el('div', { class: 'ld-field' }, [R.el('label', { class: 'ld-field__label ld-sr', for: 'dn-name', text: 'Name' }), R.el('p', { class: 'ld-field__hint', text: hint }), input, error, confirm, R.el('div', null, [save])]);
    save.addEventListener('click', function () {
      var box = confirm.querySelector('input');
      error.hidden = true;
      field.classList.remove('is-error');
      if (!box.checked) { error.textContent = 'Tick the box first: the change can’t be undone.'; error.hidden = false; return; }
      save.disabled = true;
      onSave(input.value).catch(function (e) {
        save.disabled = false;
        field.classList.add('is-error');
        error.textContent = refusalText(e);
        error.hidden = false;
      });
    });
    return R.el('dd', null, [field]);
  }

  /** What players at your tables see (the facts Play shows them), as plain facts. */
  function tablemateFacts(facts) {
    if (!facts.value) return R.notice('Unavailable', 'These facts could not be read just now.', 'wait');
    var f = facts.value;
    var completed = typeof f.completedGames === 'number' ? f.completedGames : null;
    var opponents = typeof f.opponents === 'number' ? f.opponents : null;
    var rows = [
      ['Member since', R.month(f.memberSince)],
      ['Completed games', completed === null ? '—' : String(completed)],
      ['Players met', opponents === null ? '—' : String(opponents)],
      ['Authorization Wallet since', f.authorizationWalletSince ? R.month(f.authorizationWalletSince) : '—']
    ];
    return R.el('dl', { class: 'ld-facts' }, rows.reduce(function (out, r) { return out.concat([R.el('dt', { text: r[0] }), R.el('dd', { text: r[1] })]); }, []));
  }

  function render(frame, body, who, acct, session) {
    R.profileFrame(frame, who, 'account', { kicker: 'Profile', muted: 'Only you can see this page', title: acct.displayName.name });
    body.textContent = '';
    var a = who.account;
    var dl = R.el('dl', { class: 'ld-facts' }, [
      R.el('dt', { text: 'Name' }),
      nameRow(acct.displayName, function (name) {
        return session.api('display-name', { name: name }).then(function (r) {
          acct.displayName = r.displayName;
          render(frame, body, who, acct, session);
          var nav = document.querySelector('.ld-nav__who span:not(.ld-nav__who-mark)');
          if (nav) nav.textContent = r.displayName.name;
        });
      }),
      R.el('dt', { text: 'Sign-in username' }), R.el('dd', { text: a.username }),
      R.el('dt', { text: 'Password' }), R.el('dd', null, [passwordControls(a, session)]),
      R.el('dt', { text: 'Authorization Wallet' }), R.el('dd', null, [walletControls(a, session)])
    ]);
    var right = R.el('div', null, [R.el('p', { class: 'ld-label', style: 'margin-bottom:12px', text: 'What players at your tables see' }), tablemateFacts(acct.tablemates)]);
    body.appendChild(R.section('01', 'd1', 'Account', null, [R.el('div', { class: 'ld-twocol' }, [R.el('div', { class: 'ld-stack' }, [dl]), right])]));
  }

  /* ---------- small forms in place ---------- */

  /** A form: a label, its fields, an error line, a primary and a Cancel button. `onSubmit(busy)` returns a promise. */
  function form(title, children, submitText, onSubmit, onCancel, context) {
    var A = window.LudumAuth;
    var error = R.el('p', { class: 'ld-field__error', role: 'alert', hidden: true });
    var go = R.el('button', { class: 'ld-btn', type: 'submit', text: submitText });
    var cancel = R.el('button', { class: 'ld-btn ld-btn--secondary', type: 'button', text: 'Cancel' });
    var f = R.el('form', { class: 'ld-stack', novalidate: 'novalidate', 'aria-label': title }, [R.el('p', { class: 'ld-label', text: title })].concat(children).concat([error, R.el('div', { class: 'au-actions' }, [go, cancel])]));
    cancel.addEventListener('click', onCancel);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      error.hidden = true;
      go.disabled = true;
      onSubmit(function (busyText) { go.textContent = busyText; }).then(function () { go.disabled = false; go.textContent = submitText; }, function (e) {
        go.disabled = false; go.textContent = submitText;
        error.textContent = e && e.local ? e.message : e && e.message && !e.error ? e.message : A.sentence(e, context);
        error.hidden = false;
      });
    });
    return f;
  }

  function passwordField(id, label, autocomplete, hint) {
    var input = R.el('input', { class: 'ld-input', id: id, type: 'password', autocomplete: autocomplete, maxlength: '1024', spellcheck: 'false', autocapitalize: 'off' });
    var parts = [R.el('label', { class: 'ld-field__label', for: id, text: label })];
    if (hint) parts.push(R.el('p', { class: 'ld-field__hint', text: hint }));
    parts.push(input);
    return { field: R.el('div', { class: 'ld-field' }, parts), input: input };
  }
  function devices(n) { return n === 0 ? 'No other devices were signed in.' : 'Signed out ' + n + ' other device' + (n === 1 ? '' : 's') + '.'; }

  /** "Change password" and "Forgot current password?" -- each its own small form in place. */
  function passwordControls(a, session) {
    var A = window.LudumAuth;
    var box = R.el('div', { class: 'ld-stack', 'data-pw': '' });
    var changeBtn = R.el('button', { class: 'ld-btn ld-btn--secondary', type: 'button', text: 'Change password', 'data-pw-change': '' });
    var forgotBtn = R.el('button', { class: 'ld-btn ld-btn--secondary', type: 'button', text: 'Forgot current password?', 'data-pw-forgot': '' });
    var status = R.el('p', { class: 'ld-field__hint', role: 'status', 'data-pw-status': '' });
    var slot = R.el('div');
    function menu() { slot.textContent = ''; changeBtn.disabled = false; forgotBtn.disabled = false; }
    function done(message) { menu(); status.textContent = message; }
    changeBtn.addEventListener('click', function () {
      status.textContent = '';
      changeBtn.disabled = true; forgotBtn.disabled = false;
      var current = passwordField('pw-current', 'Current password', 'current-password');
      var next = passwordField('pw-new', 'New password', 'new-password', 'At least ' + A.PASSWORD_MIN + ' characters.');
      var f = form('Change password', [current.field, next.field], 'Change password', function (busy) {
        var input = { currentPassword: current.input.value, newPassword: next.input.value };
        current.input.value = ''; next.input.value = '';
        busy('Changing…');
        return A.changePassword(session, input).then(function (r) { done('Password changed. ' + devices(r && typeof r.signedOut === 'number' ? r.signedOut : 0)); });
      }, menu, 'change');
      f.setAttribute('data-pw-form', 'change');
      slot.textContent = ''; slot.appendChild(f); current.input.focus();
    });
    forgotBtn.addEventListener('click', function () {
      status.textContent = '';
      forgotBtn.disabled = true; changeBtn.disabled = false;
      var next = passwordField('pw-reset', 'New password', 'new-password', 'At least ' + A.PASSWORD_MIN + ' characters.');
      var wallet = a.authorizationWallet ? a.authorizationWallet.address : null;
      var explain = R.el('p', { class: 'ld-field__hint', 'data-pw-explain': '', text: 'Your Authorization Wallet' + (wallet ? ' (' + R.shortAddress(wallet) + ')' : '') + ' approves the new password in Keplr. It is a message, not a transaction.' });
      var f = form('Reset a forgotten password', [explain, next.field], 'Approve in Keplr and set password', function (busy) {
        var chosen = next.input.value;
        next.input.value = '';
        return A.resetSignedIn(session, window.LudumGov, { username: a.username, authorizationWallet: wallet, newPassword: chosen }, function (step) {
          busy(step === 'keplr' ? 'Connecting Keplr…' : step === 'sign' ? 'Approve in Keplr…' : 'Setting the new password…');
        }).then(function (r) { done('New password set. ' + devices(r && typeof r.signedOut === 'number' ? r.signedOut : 0)); });
      }, menu, 'reset');
      f.setAttribute('data-pw-form', 'reset');
      slot.textContent = ''; slot.appendChild(f); next.input.focus();
    });
    box.appendChild(R.el('div', { class: 'au-actions' }, [changeBtn, forgotBtn]));
    box.appendChild(slot);
    box.appendChild(status);
    return box;
  }

  /** v1.3: "Change Authorization Wallet", here: Confirm it's you (the password), then the NEW wallet accepts in Keplr,
   *  then the CURRENT one approves; the game server checks both signatures, the wallet's availability (another
   *  account's, or released less than 24 hours ago, is refused) and records the change. */
  function walletControls(a, session) {
    var A = window.LudumAuth;
    var G = window.LudumGov;
    var current = a.authorizationWallet ? a.authorizationWallet.address : null;
    var box = R.el('div', { class: 'ld-stack', 'data-wallet': '' });
    var shown = R.el('span', { class: 'ld-id', title: current || '', text: current ? R.shortAddress(current) : 'None' });
    var changeBtn = R.el('button', { class: 'ld-btn ld-btn--secondary', type: 'button', text: 'Change', 'data-wallet-change': '' });
    var status = R.el('p', { class: 'ld-field__hint', role: 'status', 'data-wallet-status': '' });
    var slot = R.el('div');
    function menu() { slot.textContent = ''; changeBtn.disabled = false; }
    function show(node) { slot.textContent = ''; slot.appendChild(node); }
    function confirmFirst() {
      show(A.confirmPanel(session, { onDone: stepOne, onCancel: menu }));
    }
    function stepOne() {
      var f = form('Change Authorization Wallet · 1 of 2', [R.el('p', { class: 'ld-field__hint', text: 'In Keplr, switch to the wallet you want to use, then continue. It signs once to accept: a message, not a transaction.' })], 'Use the wallet Keplr is on', function (busy) {
        return A.acceptNewWallet(session, G, { username: a.username, current: current }, function (step) { busy(step === 'keplr' ? 'Connecting Keplr…' : 'Sign in Keplr…'); }).then(stepTwo, function (e) {
          if (e && e.error === 'reauth-required') { confirmFirst(); return; }
          throw e;
        });
      }, menu, 'wallet');
      f.setAttribute('data-wallet-step', '1');
      show(f);
    }
    function stepTwo(pending) {
      var f = form('Change Authorization Wallet · 2 of 2', [R.el('p', { class: 'ld-field__hint', text: 'The new wallet (' + R.shortAddress(pending.next) + ') accepted. Now switch Keplr back to your current Authorization Wallet (' + R.shortAddress(current) + ') and approve.' })], 'Approve with the current wallet', function (busy) {
        return A.approveWithCurrent(session, G, { username: a.username, current: current }, pending, function (step) { busy(step === 'keplr' ? 'Connecting Keplr…' : step === 'sign' ? 'Approve in Keplr…' : 'Changing…'); }).then(function (r) {
          var next = r && r.authorizationWallet && typeof r.authorizationWallet.address === 'string' ? r.authorizationWallet.address : pending.next;
          current = next;
          a.authorizationWallet = { address: next, since: new Date().toISOString() };
          shown.textContent = R.shortAddress(next);
          shown.setAttribute('title', next);
          menu();
          status.textContent = 'Your Authorization Wallet is now ' + R.shortAddress(next) + '.';
        }, function (e) {
          if (e && (e.error === 'authorization-invalid' || e.error === 'authorization-used' || e.error === 'stale')) { var again = new Error(A.sentence(e, 'wallet')); again.local = true; stepOneWith(again.message); return; }
          throw e;
        });
      }, function () { menu(); status.textContent = 'Nothing was changed.'; }, 'wallet');
      f.setAttribute('data-wallet-step', '2');
      show(f);
    }
    function stepOneWith(message) { stepOne(); var err = slot.querySelector('.ld-field__error'); if (err) { err.textContent = message; err.hidden = false; } }
    changeBtn.addEventListener('click', function () { status.textContent = ''; changeBtn.disabled = true; confirmFirst(); });
    box.appendChild(R.el('div', { class: 'au-actions ld-wallet-row' }, [shown, current ? changeBtn : null]));
    box.appendChild(slot);
    box.appendChild(status);
    return box;
  }

  function mount(root, session) {
    var frame = root.querySelector('[data-rec-frame]');
    var body = root.querySelector('[data-rec-body]');
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) {
        frame.textContent = '';
        frame.appendChild(R.rechead({ kicker: 'Profile', title: 'Your account' }));
        frame.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice('Signed out', 'Sign in to see your account.', 'wait', R.el('a', { class: 'ld-btn', href: window.LudumSession.signInUrl('/me/account/'), text: 'Sign in' }))]));
        return;
      }
      return session.api('account', {}).then(function (acct) { render(frame, body, who, acct, session); });
    }).catch(function () {
      body.textContent = '';
      body.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice('Unavailable', 'Your account could not be read just now. Try again in a moment.', 'stop')]));
    });
  }

  window.LudumAccountPage = { nameOffer: nameOffer, refusalText: refusalText, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-account]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
