/* Ludum · /me/sign-in/, /me/sign-up/ and /me/recover/ — Ludum's own sign-in, account creation and "Forgot password?"
 * (1830Juno docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md §15). The page is `[data-ludum-auth="sign-in" | "sign-up" |
 * "recover"]`; it draws the form in the records layer (rechead, field, input, button, notice) and leaves on success for
 * the page's `?return=` path (a Ludum path matching ^/[a-z0-9/_-]{0,128}$, else "/").
 *
 * One account and one session for Ludum and Play: the account made here is the account on play.netadao.org, and
 * signing in here signs Play in. A password is read once from its field, sent in one request body and the field is
 * emptied; nothing is stored. Creating an account and "Forgot password?" need the Authorization Wallet's signature in
 * Keplr (LudumAuth checks the text first; it is never a transaction).
 */
(function () {
  'use strict';
  var R = window.LudumRecords;
  var A = window.LudumAuth;
  var S = window.LudumSession;

  var WALLET_EXPLAINED = [
    'This wallet proves ownership of your account and lets you recover it if you forget your password. It does not need to be your main wallet. Neta DAO never controls it and cannot access its funds — the private key and seed phrase never leave Keplr.',
    'You may prefer a dedicated Keplr wallet just for account authorization, and other wallets for your games. Signing is free: it is not a transaction and moves nothing.'
  ];

  function field(id, label, input, hint) {
    return R.el('div', { class: 'ld-field' }, [R.el('label', { class: 'ld-field__label', for: id, text: label }), hint ? R.el('p', { class: 'ld-field__hint', id: id + '-hint', text: hint }) : null, input]);
  }
  function input(id, type, autocomplete, extra) {
    var attrs = { class: 'ld-input', id: id, name: id, type: type, autocomplete: autocomplete, autocapitalize: 'none', spellcheck: 'false', required: 'required' };
    for (var k in extra || {}) attrs[k] = extra[k];
    return R.el('input', attrs);
  }
  function link(href, text) { return R.el('a', { class: 'ld-link', href: href, text: text }); }
  function withReturn(page, back) { return page + '?return=' + encodeURIComponent(back); }

  /** The form's frame: a status line (polite), an error (alert), the submit button and the links below it. */
  function shell(kind, title, dek) {
    var frame = document.querySelector('[data-rec-frame]');
    frame.textContent = '';
    frame.appendChild(R.rechead({ kicker: 'Account', muted: 'One account for Ludum and play.netadao.org', title: title, dek: dek }));
    var body = document.querySelector('[data-rec-body]');
    body.textContent = '';
    return body;
  }

  function doneNotice(body, title, text, back) {
    body.textContent = '';
    body.appendChild(R.el('div', { class: 'ld-wrap au-wrap' }, [R.notice(title, text, '', R.el('a', { class: 'ld-btn', href: back, text: 'Continue' }))]));
  }

  function signedInNotice(body, who, back) {
    var out = R.el('button', { class: 'ld-btn ld-btn--secondary', type: 'button', text: 'Sign out' });
    var err = R.el('p', { class: 'ld-field__error', role: 'alert', hidden: true });
    out.addEventListener('click', function () {
      out.disabled = true;
      A.signOut(S).then(function () { window.location.reload(); }, function (e) { out.disabled = false; err.textContent = A.sentence(e, 'sign-in'); err.hidden = false; });
    });
    body.appendChild(R.el('div', { class: 'ld-wrap au-wrap' }, [R.notice('Signed in', 'You are signed in as ' + who.account.name + ' (' + who.account.username + '). To use another account, sign out first.', '',
      R.el('div', { class: 'au-actions' }, [R.el('a', { class: 'ld-btn', href: back, text: 'Continue' }), out])), err]));
  }

  function form(body, label, fields, submitText, links) {
    var status = R.el('p', { class: 'ld-body-s au-status', role: 'status', 'aria-live': 'polite' });
    var error = R.el('p', { class: 'ld-field__error', role: 'alert', hidden: true });
    var submit = R.el('button', { class: 'ld-btn', type: 'submit', text: submitText });
    var f = R.el('form', { class: 'ld-stack au-form', novalidate: 'novalidate', 'aria-label': label }, fields.concat([error, R.el('div', { class: 'au-actions' }, [submit]), status,
      links && links.length ? R.el('p', { class: 'ld-body-s au-links' }, links.reduce(function (acc, l, i) { if (i) acc.push(' · '); acc.push(l); return acc; }, [])) : null]));
    body.appendChild(R.el('div', { class: 'ld-wrap au-wrap' }, [f]));
    return {
      form: f, submit: submit,
      fail: function (text, extra) { error.textContent = text; error.hidden = false; status.textContent = ''; submit.disabled = false; submit.textContent = submitText; if (extra) status.appendChild(extra); },
      clear: function () { error.hidden = true; error.textContent = ''; },
      busy: function (text, button) { status.textContent = text; submit.disabled = true; if (button) submit.textContent = button; }
    };
  }

  function errorText(e, context) { return e && e.local ? e.message : e && e.error ? A.sentence(e, context) : e && e.message ? e.message : A.sentence(null, context); }
  /** A game server without Ludum's own account actions (an older release: `auth/*` answers 404): Play's sign-in is offered. */
  function playFallback(e, back) {
    if (!e || e.status !== 404) return null;
    return R.el('p', { class: 'ld-body-s' }, ['Signing in here is not available yet. ', R.el('a', { class: 'ld-link', href: S.playSignInUrl(back), text: 'Sign in on play.netadao.org' }), ' — it is the same account.']);
  }

  function signIn(body, back) {
    var u = input('au-username', 'text', 'username', { maxlength: '64' });
    var p = input('au-password', 'password', 'current-password', { maxlength: '1024' });
    var ui = form(body, 'Sign in', [field('au-username', 'Username', u), field('au-password', 'Password', p)], 'Sign in',
      [link(withReturn('/me/sign-up/', back), 'Create an account'), link(withReturn('/me/recover/', back), 'Forgot password?')]);
    ui.form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      ui.clear();
      var username = u.value.trim();
      var password = p.value;
      if (username === '' || password === '') { ui.fail('Enter your username and password.'); (username === '' ? u : p).focus(); return; }
      p.value = '';
      ui.busy('Signing in…', 'Signing in…');
      A.signIn(S, { username: username, password: password }).then(function () { window.location.assign(back); }, function (e) { ui.fail(errorText(e, 'sign-in'), playFallback(e, back)); p.focus(); });
    });
    u.focus();
  }

  function walletBlock(purpose) {
    var lines = purpose === 'create' ? WALLET_EXPLAINED : ['Switch Keplr to the Authorization Wallet you chose when you created the account — a wallet you only used for games can’t recover it. Every other device signed in to the account is signed out; your seats, tables and game wallets don’t change.'];
    return R.el('div', { class: 'ld-stack au-wallet' }, [R.el('p', { class: 'ld-label', text: purpose === 'create' ? 'Authorization Wallet' : 'Your account’s Authorization Wallet' })].concat(lines.map(function (t) { return R.el('p', { class: 'ld-body-s', text: t }); })));
  }

  function stepText(step) {
    if (step === 'keplr') return 'Connecting Keplr…';
    if (step === 'sign') return 'Keplr will show the message. Check it names ' + window.location.origin + ', then sign. Nothing is a transaction.';
    if (step === 'create') return 'Creating your account…';
    if (step === 'recover') return 'Setting the new password…';
    return '';
  }

  function signUp(body, back) {
    var u = input('au-username', 'text', 'username', { maxlength: '64', 'aria-describedby': 'au-username-hint' });
    var n = input('au-name', 'text', 'nickname', { maxlength: '24', 'aria-describedby': 'au-name-hint' });
    var p = input('au-password', 'password', 'new-password', { maxlength: '1024', minlength: String(A.PASSWORD_MIN), 'aria-describedby': 'au-password-hint' });
    var ui = form(body, 'Create an account', [
      field('au-username', 'Username', u, 'For signing in; never shown to other players. No spaces.'),
      field('au-name', 'Display name', n, 'Shown at your tables, on Ludum and on play.netadao.org. Names are unique; you may change it once before your first game.'),
      field('au-password', 'Password', p, 'At least ' + A.PASSWORD_MIN + ' characters.'),
      walletBlock('create')
    ], 'Sign with Keplr and create account', [link(withReturn('/me/sign-in/', back), 'I already have an account')]);
    ui.form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      ui.clear();
      var password = p.value;
      var problem = A.usernameProblem(u.value) || A.passwordProblem(password) || (n.value.trim() === '' || Array.from(n.value.trim()).length > A.NAME_MAX ? { error: 'bad-name' } : null);
      if (problem) { ui.fail(A.sentence(problem, 'create')); return; }
      if (!window.LudumGov || !window.LudumGov.keplr || !window.LudumGov.keplr()) { ui.fail('Keplr isn’t available in this browser. Install the Keplr extension (or open this site in the Keplr app’s browser) to create an account.'); return; }
      ui.busy('Connecting Keplr…', 'Waiting for Keplr…');
      A.createAccount(S, window.LudumGov, { username: u.value, name: n.value, password: password }, function (step) { ui.busy(stepText(step)); }).then(function () {
        p.value = '';
        doneNotice(body, 'Account created', 'Welcome. You are signed in on Ludum and play.netadao.org.', back);
      }, function (e) { ui.fail(errorText(e, 'create'), playFallback(e, back)); });
    });
    u.focus();
  }

  function recover(body, back) {
    var u = input('au-username', 'text', 'username', { maxlength: '64' });
    var p = input('au-password', 'password', 'new-password', { maxlength: '1024', minlength: String(A.PASSWORD_MIN), 'aria-describedby': 'au-password-hint' });
    var ui = form(body, 'Forgot password', [field('au-username', 'Username', u), field('au-password', 'New password', p, 'At least ' + A.PASSWORD_MIN + ' characters.'), walletBlock('recover')],
      'Sign with Keplr and set the new password', [link(withReturn('/me/sign-in/', back), 'Back to sign in')]);
    ui.form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      ui.clear();
      var password = p.value;
      var problem = A.passwordProblem(password) || A.usernameProblem(u.value);
      if (problem) { ui.fail(problem.error === 'bad-username' ? 'Enter the account’s username.' : A.sentence(problem, 'recover')); return; }
      if (!window.LudumGov || !window.LudumGov.keplr || !window.LudumGov.keplr()) { ui.fail('Keplr isn’t available in this browser. Recovery needs the account’s Authorization Wallet in Keplr.'); return; }
      ui.busy('Connecting Keplr…', 'Waiting for Keplr…');
      A.recover(S, window.LudumGov, { username: u.value, newPassword: password }, function (step) { ui.busy(stepText(step)); }).then(function (r) {
        p.value = '';
        var others = r && typeof r.signedOut === 'number' && r.signedOut > 0 ? ' ' + r.signedOut + ' other session' + (r.signedOut === 1 ? ' was' : 's were') + ' signed out.' : '';
        doneNotice(body, 'Password set', 'Your new password is set and you are signed in.' + others, back);
      }, function (e) { ui.fail(errorText(e, 'recover'), playFallback(e, back)); });
    });
    u.focus();
  }

  var TITLES = {
    'sign-in': ['Sign in', 'Your username and password, the same as on play.netadao.org.'],
    'sign-up': ['Create an account', 'Your player account for every Neta DAO game.'],
    recover: ['Forgot password', 'Recover your account with its Authorization Wallet.']
  };

  function mount(root) {
    var kind = root.getAttribute('data-ludum-auth');
    if (!Object.prototype.hasOwnProperty.call(TITLES, kind)) return Promise.resolve();
    var back = S.returnPath(window.location.search);
    var body = shell(kind, TITLES[kind][0], TITLES[kind][1]);
    return S.whoami().catch(function () { return null; }).then(function (who) {
      if (who && who.signedIn === true) { signedInNotice(body, who, back); return; }
      if (kind === 'sign-in') signIn(body, back); else if (kind === 'sign-up') signUp(body, back); else recover(body, back);
    });
  }

  window.LudumAuthPage = { mount: mount, stepText: stepText };
  function start() {
    var root = document.querySelector('[data-ludum-auth]');
    if (root && S && R && A) mount(root);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
