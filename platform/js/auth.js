/* Ludum · LudumAuth — Ludum's own sign-in, account creation, "Forgot password?", "Confirm it's you" and sign-out.
 *
 * The contract: 1830Juno docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md §15. ONE account database and ONE session for Ludum
 * and Play: every action here is `LudumSession.auth(...)`, served by Play's own account handlers, which set or clear the
 * same host-only `__Host-gs_session` cookie on play.netadao.org. Signing in here signs Play in; signing out here signs
 * Play out. Nothing here stores a password, a token or a cookie: a password is read from its field once, sent in one
 * request body, and the field is emptied.
 *
 * The Authorization Wallet signs only account actions (creating the account, "Forgot password?"), in Keplr (ADR-036:
 * never a transaction). Before Keplr is asked, the server's text is PARSED and checked against exactly what this page
 * asked for -- the purpose, this site, the account, the wallet Keplr is on -- the same check Play makes
 * (1830Juno frontend/src/utils/profileAuthorizationV1.ts), so no other kind of action can be signed through this page.
 *
 *   LudumAuth.parseAuthorization(text)          the text's fields, or null when it is not exactly one
 *   LudumAuth.checkAuthorization(text, expect)  null when it is exactly the expected action; else why nothing is signed
 *   LudumAuth.sentence(error, context)          a refusal in the account's words
 *   LudumAuth.signIn(S, {username, password})   start a session if needed, then sign in
 *   LudumAuth.createAccount(S, G, {...}, step)  start, mint CREATE, check, Keplr signs, create
 *   LudumAuth.recover(S, G, {...}, step)        start, mint RECOVER, check, Keplr signs, recover
 *   LudumAuth.confirm(S, password)              "Confirm it's you" (the five-minute window sensitive actions need)
 *   LudumAuth.signOut(S)                        ends the shared session (both sites), and forgets this account's
 *                                               remembered DAO membership
 *   LudumAuth.confirmPanel(S, {onDone, onCancel})  the "Confirm it's you" panel (moderation decisions use it)
 */
(function (root) {
  'use strict';

  var TAG = '18COSMOS/PROFILE-AUTHORIZATION/v1';
  var NOT_A_TRANSACTION = 'This is not a transaction: it moves no funds and grants no permission to spend.';
  var SENTENCES = {
    CREATE: 'make this wallet the Authorization Wallet of a new account.',
    RECOVER: 'recover this account and set a new password.',
    'REPLACE-APPROVE': "approve replacing this account's Authorization Wallet.",
    'REPLACE-ACCEPT': "make this wallet this account's new Authorization Wallet."
  };
  var JUNO = /^juno1[02-9ac-hj-np-z]{38}$/;
  var HEX_32 = /^[0-9a-f]{32}$/;
  var ASCII_LINE = /^[\x20-\x7e]{1,200}$/;
  var PASSWORD_MIN = 12;
  var USERNAME_MAX = 64;
  var NAME_MAX = 24;

  function accountLine(v) {
    if (typeof v !== 'string' || v !== v.trim()) return false;
    var points = Array.from(v);
    if (points.length < 1 || points.length > 64) return false;
    return points.every(function (p) { var c = p.codePointAt(0); return !(c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029); });
  }
  function signerFor(f) {
    if (f.purpose === 'CREATE' || f.purpose === 'RECOVER') return f.replaces === null ? f.authorizationWallet : null;
    if (f.replaces === null || f.replaces === f.authorizationWallet) return null;
    return f.purpose === 'REPLACE-APPROVE' ? f.replaces : f.purpose === 'REPLACE-ACCEPT' ? f.authorizationWallet : null;
  }
  function compose(f) {
    if (!Object.prototype.hasOwnProperty.call(SENTENCES, f.purpose)) return null;
    if (!HEX_32.test(f.nonce) || !HEX_32.test(f.operation) || !Number.isSafeInteger(f.expiresAt) || f.expiresAt <= 0) return null;
    if (!accountLine(f.account) || !ASCII_LINE.test(f.appName) || f.appName !== f.appName.trim() || !ASCII_LINE.test(f.site) || f.site !== f.site.trim()) return null;
    var wallets = [f.authorizationWallet, f.signer].concat(f.replaces === null ? [] : [f.replaces]);
    if (!wallets.every(function (w) { return typeof w === 'string' && JUNO.test(w); })) return null;
    if (signerFor(f) !== f.signer) return null;
    return [TAG, f.appName + ': ' + SENTENCES[f.purpose], NOT_A_TRANSACTION, 'Purpose: ' + f.purpose, 'Site: ' + f.site, 'Account: ' + f.account,
      'Authorization wallet: ' + f.authorizationWallet, 'Replaces: ' + (f.replaces === null ? 'none' : f.replaces), 'Signer: ' + f.signer,
      'Operation: ' + f.operation, 'Nonce: ' + f.nonce, 'Expires: ' + new Date(f.expiresAt).toISOString()].join('\n');
  }

  /** The fields of an authorization text, or null when it is not exactly one (Play's parser, line for line). */
  function parseAuthorization(text) {
    if (typeof text !== 'string' || text.length > 4096) return null;
    var lines = text.split('\n');
    if (lines.length !== 12 || lines[0] !== TAG || lines[2] !== NOT_A_TRANSACTION) return null;
    function field(at, label) { var p = label + ': '; return lines[at].indexOf(p) === 0 ? lines[at].slice(p.length) : null; }
    var purpose = field(3, 'Purpose');
    if (purpose === null || !Object.prototype.hasOwnProperty.call(SENTENCES, purpose)) return null;
    var tail = ': ' + SENTENCES[purpose];
    var intro = lines[1].length > tail.length && lines[1].slice(-tail.length) === tail ? lines[1].slice(0, -tail.length) : null;
    var f = { appName: intro, purpose: purpose, site: field(4, 'Site'), account: field(5, 'Account'), authorizationWallet: field(6, 'Authorization wallet'),
      replaces: field(7, 'Replaces'), signer: field(8, 'Signer'), operation: field(9, 'Operation'), nonce: field(10, 'Nonce') };
    var expires = field(11, 'Expires');
    for (var k in f) if (f[k] === null) return null;
    if (expires === null) return null;
    var at = Date.parse(expires);
    if (!isFinite(at) || new Date(at).toISOString() !== expires) return null;
    f.expiresAt = at;
    if (f.replaces === 'none') f.replaces = null;
    return compose(f) === text ? f : null;
  }

  /** Null when `text` is exactly the expected action ({purpose, site, account, signer, authorizationWallet, now}). */
  function checkAuthorization(text, e) {
    var f = parseAuthorization(text);
    if (f === null) return 'The server’s authorization message wasn’t in the expected form, so nothing was signed.';
    if (f.purpose !== e.purpose) return 'The server asked Keplr to sign for a different account action, so nothing was signed.';
    if (f.site !== e.site) return 'The authorization message names another site, so nothing was signed.';
    if (f.account.normalize('NFKC').toLowerCase() !== String(e.account).trim().normalize('NFKC').toLowerCase()) return 'The authorization message names another account, so nothing was signed.';
    if (f.signer !== e.signer) return 'The authorization message is for another wallet than the one Keplr is on, so nothing was signed.';
    if (f.authorizationWallet !== e.authorizationWallet) return 'The authorization message names another Authorization Wallet, so nothing was signed.';
    if (f.expiresAt <= e.now) return 'The authorization message has expired. Start again.';
    return null;
  }

  /** A refusal in the account's words (Play's sentences). `context`: "sign-in" | "create" | "recover" | "confirm". */
  function sentence(err, context) {
    var code = err && typeof err.error === 'string' ? err.error : 'unavailable';
    switch (code) {
      case 'invalid-credential':
        if (context === 'sign-in') return 'That username and password don’t match an account. Check them and try again.';
        if (context === 'confirm') return 'That password doesn’t match this account. Check it and try again.';
        if (context === 'recover') return 'That didn’t recover an account. Check the username, and that Keplr is on the account’s Authorization Wallet — a wallet you only used for games can’t recover it.';
        return 'That didn’t work. Check it and try again.';
      case 'username-taken': return 'That username is taken. Choose another.';
      case 'display-name-taken': return 'Another player already has that display name. Choose another.';
      case 'bad-username': return 'A username is 1 to ' + USERNAME_MAX + ' characters, with no spaces.';
      case 'bad-password': return err.problem === 'too-long' ? 'That password is too long.' : 'A password is at least ' + PASSWORD_MIN + ' characters.';
      case 'bad-name': return 'A display name is 1 to ' + NAME_MAX + ' characters.';
      case 'authorization-invalid': return 'The wallet’s signature didn’t check out (or it took too long). Nothing was changed — try again and sign the new message.';
      case 'authorization-used': return 'That signature was already used. Try again and sign the new message.';
      case 'bad-wallet': return 'That isn’t a Juno wallet address.';
      case 'legacy-account': return 'That account was made before Authorization Wallets and is retired. Create a new account to keep playing.';
      case 'busy': return 'The game server is busy checking sign-ins. Try again in a moment.';
      case 'rate-limited': {
        var s = Math.max(1, Math.ceil((err.retryAfterMs == null ? 5000 : err.retryAfterMs) / 1000));
        return 'Too many attempts. Wait ' + s + ' second' + (s === 1 ? '' : 's') + ' and try again.';
      }
      case 'already-profiled': return 'This browser is already signed in. Sign out first to use another account.';
      case 'has-tables': return 'This browser still holds tables from before accounts existed. Create the account on play.netadao.org to keep them.';
      case 'not-authenticated': case 'session-ended': return 'This browser’s session was reset. Try again.';
      case 'profile-required': return 'Sign in or create an account first.';
      case 'not-found': return 'The game server doesn’t offer this here yet.';
      case 'bad-request':
        if (context === 'sign-in' || context === 'confirm' || context === 'recover') return sentence({ error: 'invalid-credential' }, context);
        return 'The game server did not accept that request. Try again.';
      default: return 'The game server could not be reached. Try again in a moment.';
    }
  }

  /** This browser's session: the current one, or a new signed-out one (a reset, ended one is replaced only here, on the
   *  player's own press). */
  function start(S) {
    return S.auth('start', {}).catch(function (e) {
      if (e && e.status === 401 && e.error === 'session-ended') return S.auth('start', { fresh: true });
      throw e;
    });
  }

  function usernameProblem(u) {
    var t = String(u || '').trim();
    return t === '' || Array.from(t).length > USERNAME_MAX || /\s/.test(t) ? { error: 'bad-username' } : null;
  }
  function passwordProblem(p) { return Array.from(String(p || '')).length < PASSWORD_MIN ? { error: 'bad-password', problem: 'too-short' } : null; }

  function signIn(S, input) {
    return start(S).then(function () { return S.auth('sign-in', { username: input.username, password: input.password }); });
  }

  function site() { return root.location ? root.location.origin : ''; }

  /** Mint, check, and have Keplr sign one CREATE / RECOVER text. `step(name)` reports progress ("keplr", "sign"). */
  function signedProof(S, G, purpose, username, step) {
    step('keplr');
    return G.connect().then(function (w) {
      return S.auth('authorization', { purpose: purpose === 'CREATE' ? 'create' : 'recover', username: username, wallet: w.address }).then(function (minted) {
        var text = minted && minted.texts && minted.texts[0] && minted.texts[0].text;
        var refusal = checkAuthorization(text, { purpose: purpose, site: site(), account: username, signer: w.address, authorizationWallet: w.address, now: Date.now() });
        if (refusal !== null) { var e = new Error(refusal); e.local = true; throw e; }
        step('sign');
        return G.signArbitrary(w.address, text).then(function (signed) { return { operation: minted.operation, pubKey: signed.pubKey, signature: signed.signature, wallet: w.address }; });
      });
    });
  }

  function createAccount(S, G, input, step) {
    var p = usernameProblem(input.username) || passwordProblem(input.password) || (String(input.name || '').trim() === '' || Array.from(String(input.name).trim()).length > NAME_MAX ? { error: 'bad-name' } : null);
    if (p) return Promise.reject(p);
    step = step || function () {};
    return start(S).then(function () { return signedProof(S, G, 'CREATE', input.username.trim(), step); }).then(function (proof) {
      step('create');
      return S.auth('create', { username: input.username.trim(), password: input.password, name: String(input.name).trim(), operation: proof.operation, pubKey: proof.pubKey, signature: proof.signature });
    });
  }

  function recover(S, G, input, step) {
    var p = usernameProblem(input.username) || passwordProblem(input.newPassword);
    if (p) return Promise.reject(p);
    step = step || function () {};
    return start(S).then(function () { return signedProof(S, G, 'RECOVER', input.username.trim(), step); }).then(function (proof) {
      step('recover');
      return S.auth('recover', { operation: proof.operation, pubKey: proof.pubKey, signature: proof.signature, newPassword: input.newPassword });
    });
  }

  function confirm(S, password) { return S.auth('confirm', { password: password }); }

  function signOut(S) {
    var R = root.LudumRecords;
    return S.whoami().catch(function () { return null; }).then(function (who) {
      return S.auth('sign-out', {}).catch(function (e) { if (e && e.status === 401) return {}; throw e; }).then(function (r) {
        if (R && R.forgetMembership) R.forgetMembership(root.localStorage, who && who.signedIn ? who.account.username : null);
        return r;
      });
    });
  }

  /* ---------- the "Confirm it's you" panel (records layer: field, input, button, error) ---------- */
  function confirmPanel(S, opts) {
    var R = root.LudumRecords;
    var el = R.el;
    var id = 'cf-pass-' + Math.random().toString(36).slice(2, 8);
    var input = el('input', { class: 'ld-input', id: id, type: 'password', autocomplete: 'current-password', required: 'required' });
    var error = el('p', { class: 'ld-field__error', role: 'alert', hidden: true });
    var go = el('button', { class: 'ld-btn', type: 'submit', text: 'Confirm' });
    var cancel = el('button', { class: 'ld-btn ld-btn--secondary', type: 'button', text: 'Cancel' });
    var field = el('div', { class: 'ld-field' }, [el('label', { class: 'ld-field__label', for: id, text: 'Password' }),
      el('p', { class: 'ld-field__hint', text: 'For your security, confirm it’s you. Your confirmation lasts five minutes, on Ludum and on play.netadao.org.' }), input, error]);
    var form = el('form', { class: 'ld-stack au-confirm', novalidate: 'novalidate', 'aria-label': 'Confirm it’s you' }, [el('p', { class: 'ld-label', text: 'Confirm it’s you' }), field, el('div', { class: 'au-actions' }, [go, cancel])]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var typed = input.value;
      input.value = '';
      error.hidden = true; field.classList.remove('is-error');
      if (typed === '') { error.textContent = 'Enter your password.'; error.hidden = false; field.classList.add('is-error'); input.focus(); return; }
      go.disabled = true;
      confirm(S, typed).then(function () { if (opts && opts.onDone) opts.onDone(); }, function (e) {
        go.disabled = false;
        error.textContent = sentence(e, 'confirm'); error.hidden = false; field.classList.add('is-error'); input.focus();
        /* An older game server without Ludum's own confirmation: Play's "Confirm it's you" is the way. */
        if (e && e.status === 404 && S.confirmUrl) { error.appendChild(document.createTextNode(' ')); error.appendChild(el('a', { class: 'ld-link', href: S.confirmUrl(), text: 'Confirm it’s you on play.netadao.org' })); }
      });
    });
    cancel.addEventListener('click', function () { if (opts && opts.onCancel) opts.onCancel(); });
    return form;
  }

  var api = {
    parseAuthorization: parseAuthorization, checkAuthorization: checkAuthorization, sentence: sentence, start: start,
    usernameProblem: usernameProblem, passwordProblem: passwordProblem, signIn: signIn, createAccount: createAccount, recover: recover,
    confirm: confirm, signOut: signOut, confirmPanel: confirmPanel, PASSWORD_MIN: PASSWORD_MIN, NAME_MAX: NAME_MAX, USERNAME_MAX: USERNAME_MAX
  };
  root.LudumAuth = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
