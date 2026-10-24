/* Ludum · LudumAuth -- Ludum's own account actions (1830Juno docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md §15, §19; the
 * owner's final authentication policy, 2026-10-22):
 *   - ONE Player Name, for signing in and for everything other players see (players can't change it; Ludum staff may);
 *   - Sign in with Keplr is primary (the Authorization Wallet approves one SIGN-IN signature); the Player Name and
 *     password are the alternative;
 *   - a forgotten password is reset with the Authorization Wallet alone (the wallet identifies the account);
 *   - a password change is confirmed with the current password OR a Keplr signature;
 *   - Change wallet: the password, then the CURRENT wallet's approval, then the NEW wallet's acceptance.
 *
 * ONE account database and ONE session for Ludum and Play: every action here is `LudumSession.auth(...)`, served by
 * Play's own account handlers, which set or clear the same host-only `__Host-gs_session` cookie. Nothing here stores a
 * password, a token or a cookie: a password is read from its field, sent in one request body, and forgotten.
 *
 * The Authorization Wallet signs only account actions, in Keplr (ADR-036: never a transaction, never a fee). Before
 * Keplr is asked, the server's text is PARSED and checked against exactly what this page asked for -- the purpose,
 * this site, the wallet Keplr is on (and, where this page knows it, the account) -- the same check Play makes
 * (1830Juno frontend/src/utils/profileAuthorizationV1.ts), so no other kind of action can be signed through this page.
 * Signing and acting are separate steps: a signature is held (with its expiry) until the player acts.
 *
 *   LudumAuth.parseAuthorization(text) / checkAuthorization(text, expect)    the text check
 *   LudumAuth.sentence(error, context)          a refusal in the account's words
 *   LudumAuth.keplrProblem(error, G)            "no-keplr" | "declined" | "switched" | "failed" | null
 *   LudumAuth.nameCheck(S, name)                the server's availability answer
 *   LudumAuth.signIn(S, {name, password})       start a session if needed, then sign in with the password
 *   LudumAuth.signInWithKeplr(S, G, step)       connect, SIGN-IN text, check, sign, sign in
 *   LudumAuth.authorizeCreate(S, G, {name}, step) / finishCreate(S, {name, password, proof})
 *   LudumAuth.authorizeReset(S, G, step) / finishReset(S, {proof, newPassword})          (signed out, by the wallet)
 *   LudumAuth.confirm(S, password)              "Confirm it's you" (the password checked; the five-minute window)
 *   LudumAuth.changePassword(S, {currentPassword, newPassword})
 *   LudumAuth.authorizeChange(S, G, {account, authorizationWallet}, step) / finishChange(S, {proof, newPassword})
 *   LudumAuth.approveRelease(S, G, {account, current}, step)                Change wallet, step 2
 *   LudumAuth.acceptWallet(S, G, {account, current, operation}, step)       Change wallet, step 3
 *   LudumAuth.signOutOthers(S) / signOut(S)
 *   LudumAuth.confirmPanel(S, {onDone, onCancel})  the "Confirm it's you" panel (the password; no staff action uses it)
 *   LudumAuth.confirmStaffAction(S, G, {route, body, account, authorizationWallet}, step)   v1.7: a staff change approved
 *                                               in Keplr (STAFF-CONFIRM, its digest computed here); approveStaffAction
 *                                               draws it in a key field
 */
(function (root) {
  'use strict';

  var TAG = '18COSMOS/PROFILE-AUTHORIZATION/v1';
  var NOT_A_TRANSACTION = 'This is not a transaction: it moves no funds and grants no permission to spend.';
  var SENTENCES = {
    CREATE: 'make this wallet the Authorization Wallet of a new account.',
    RECOVER: 'recover this account and set a new password.',
    'REPLACE-APPROVE': "approve replacing this account's Authorization Wallet.",
    'REPLACE-ACCEPT': "make this wallet this account's new Authorization Wallet.",
    'SIGN-IN': 'sign in to this account.',
    'REPLACE-RELEASE': "approve replacing this account's Authorization Wallet with the wallet that accepts next.",
    /* v1.7 (owner, 2026-10-23): a privileged staff action, confirmed by the staff member's own Authorization Wallet --
       its text carries `Action` and `Action digest` after `Purpose` (Play's profileAuthorizationV1.ts, line for line). */
    'STAFF-CONFIRM': "confirm this staff action with this account's Authorization Wallet."
  };
  var HEX_64 = /^[0-9a-f]{64}$/;
  /** v1.7: each confirmable staff route's fields, in canonical order (Play's server/src/ludum/staffConfirm.ts). */
  var STAFF_FIELDS = {
    'staff-rename': ['name', 'to', 'former', 'reason'],
    'staff-role': ['name', 'role', 'action', 'reason'],
    'staff-former-name': ['name', 'former', 'action', 'reason'],
    'moderation-decide': ['caseId', 'revision', 'status', 'note'],
    /* LUDUM RESULT REVIEW: a prepared appeal resolution, and the Ludum DAO's decision recorded by its proposal number */
    'appeal-propose': ['caseId', 'outcome', 'standings', 'responsible', 'rationale'],
    'appeal-dao': ['caseId', 'proposalId']
  };
  var JUNO = /^juno1[02-9ac-hj-np-z]{38}$/;
  var HEX_32 = /^[0-9a-f]{32}$/;
  var ASCII_LINE = /^[\x20-\x7e]{1,200}$/;
  var PASSWORD_MIN = 12;
  var NAME_MAX = 24;

  function accountLine(v, max) {
    if (typeof v !== 'string' || v !== v.trim()) return false;
    var points = Array.from(v);
    if (points.length < 1 || points.length > (max || 64)) return false;
    return points.every(function (p) { var c = p.codePointAt(0); return !(c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029); });
  }
  function signerFor(f) {
    if (f.purpose === 'CREATE' || f.purpose === 'RECOVER' || f.purpose === 'SIGN-IN' || f.purpose === 'REPLACE-RELEASE' || f.purpose === 'STAFF-CONFIRM') return f.replaces === null ? f.authorizationWallet : null;
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
    var staff = f.purpose === 'STAFF-CONFIRM';
    if (staff && (!accountLine(f.action, 240) || !HEX_64.test(f.actionDigest || ''))) return null;
    if (!staff && (f.action !== undefined || f.actionDigest !== undefined)) return null;
    return [TAG, f.appName + ': ' + SENTENCES[f.purpose], NOT_A_TRANSACTION, 'Purpose: ' + f.purpose]
      .concat(staff ? ['Action: ' + f.action, 'Action digest: ' + f.actionDigest] : [])
      .concat(['Site: ' + f.site, 'Account: ' + f.account,
        'Authorization wallet: ' + f.authorizationWallet, 'Replaces: ' + (f.replaces === null ? 'none' : f.replaces), 'Signer: ' + f.signer,
        'Operation: ' + f.operation, 'Nonce: ' + f.nonce, 'Expires: ' + new Date(f.expiresAt).toISOString()]).join('\n');
  }

  /** The fields of an authorization text, or null when it is not exactly one (Play's parser, line for line). */
  function parseAuthorization(text) {
    if (typeof text !== 'string' || text.length > 4096) return null;
    var lines = text.split('\n');
    /* STAFF-CONFIRM: two more lines (Action, Action digest) after Purpose; every other purpose: twelve. */
    var staff = lines[3] === 'Purpose: STAFF-CONFIRM';
    var s = staff ? 2 : 0;
    if (lines.length !== 12 + s || lines[0] !== TAG || lines[2] !== NOT_A_TRANSACTION) return null;
    function field(at, label) { var p = label + ': '; return lines[at].indexOf(p) === 0 ? lines[at].slice(p.length) : null; }
    var purpose = field(3, 'Purpose');
    if (purpose === null || !Object.prototype.hasOwnProperty.call(SENTENCES, purpose)) return null;
    var tail = ': ' + SENTENCES[purpose];
    var intro = lines[1].length > tail.length && lines[1].slice(-tail.length) === tail ? lines[1].slice(0, -tail.length) : null;
    var f = { appName: intro, purpose: purpose, site: field(4 + s, 'Site'), account: field(5 + s, 'Account'), authorizationWallet: field(6 + s, 'Authorization wallet'),
      replaces: field(7 + s, 'Replaces'), signer: field(8 + s, 'Signer'), operation: field(9 + s, 'Operation'), nonce: field(10 + s, 'Nonce') };
    if (staff) { f.action = field(4, 'Action'); f.actionDigest = field(5, 'Action digest'); }
    var expires = field(11 + s, 'Expires');
    for (var k in f) if (f[k] === null) return null;
    if (expires === null) return null;
    var at = Date.parse(expires);
    if (!isFinite(at) || new Date(at).toISOString() !== expires) return null;
    f.expiresAt = at;
    if (f.replaces === 'none') f.replaces = null;
    return compose(f) === text ? f : null;
  }

  /** Null when `text` is exactly the expected action ({purpose, site, account, signer, authorizationWallet, now; replaces?,
   *  operation?}). `account` null: the WALLET identifies the account (Sign in with Keplr, a reset) -- any one account. */
  function checkAuthorization(text, e) {
    var f = parseAuthorization(text);
    if (f === null) return 'The server’s authorization message wasn’t in the expected form, so nothing was signed.';
    if (f.purpose !== e.purpose) return 'The server asked Keplr to sign for a different account action, so nothing was signed.';
    if (f.site !== e.site) return 'The authorization message names another site, so nothing was signed.';
    if (e.account !== null && f.account.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ') !== String(e.account).trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')) return 'The authorization message names another account, so nothing was signed.';
    if (f.signer !== e.signer) return 'The authorization message is for another wallet than the one Keplr is on, so nothing was signed.';
    if (f.authorizationWallet !== e.authorizationWallet) return 'The authorization message names another Authorization Wallet, so nothing was signed.';
    if (e.replaces !== undefined && f.replaces !== e.replaces) return 'The authorization message replaces another wallet than your current one, so nothing was signed.';
    if (e.operation !== undefined && f.operation !== e.operation) return 'The authorization message belongs to another request, so nothing was signed.';
    if (e.purpose === 'STAFF-CONFIRM' && (typeof e.actionDigest !== 'string' || f.actionDigest !== e.actionDigest)) return 'The confirmation message is for a different change than the one on this page, so nothing was signed.';
    if (f.expiresAt <= e.now) return 'The authorization message has expired. Start again.';
    return null;
  }

  /* ---------- v1.7: a privileged staff action, approved with the staff member's own Authorization Wallet ---------- */

  /** The action's canonical form: [route, each field in the route's order, null for one not sent] (pure). */
  function canonicalAction(route, body) {
    var fields = STAFF_FIELDS[route];
    if (!fields) return null;
    return JSON.stringify([route].concat(fields.map(function (k) { return body && Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined ? body[k] : null; })));
  }
  /** SHA-256 (lowercase hex) of the canonical form, as the server computes it. Resolves the hex. */
  function actionDigest(route, body) {
    var canonical = canonicalAction(route, body);
    var subtle = root.crypto && root.crypto.subtle;
    if (canonical === null || !subtle || typeof root.TextEncoder !== 'function') return Promise.reject(local('This browser cannot compute the change’s digest, so nothing was signed.'));
    return subtle.digest('SHA-256', new root.TextEncoder().encode(canonical)).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    });
  }

  /** Approve one staff change (or a moderation decision) in Keplr: connect (Keplr must be on this account's Authorization
   *  Wallet), the STAFF-CONFIRM text minted for exactly this request (`staff-confirm`), checked -- this site, this
   *  account, this wallet, the digest this page computes from the very body it will send -- then signed. Off chain: no
   *  transaction, no fee. Resolves the three fields the request carries. `input`: {route, body, account,
   *  authorizationWallet}. */
  function confirmStaffAction(S, G, input, step) {
    step = step || function () {};
    if (!STAFF_FIELDS[input.route]) return Promise.reject(local('That isn’t a change this page can approve.'));
    step('keplr');
    var digest = actionDigest(input.route, input.body);
    return keplrCall(G.connect()).then(function (w) {
      if (input.authorizationWallet && w.address !== input.authorizationWallet) throw local('Keplr is on ' + short(w.address) + '. Switch Keplr to your Authorization Wallet (' + short(input.authorizationWallet) + ') and try again. Nothing was signed or changed.', 'wrong-wallet');
      step('wallet', { wallet: w.address });
      return Promise.all([digest, S.api('staff-confirm', Object.assign({ route: input.route }, input.body))]).then(function (r) {
        var text = r[1] && r[1].text;
        var f = checked(text, { purpose: 'STAFF-CONFIRM', site: site(), account: input.account, signer: w.address, authorizationWallet: w.address, actionDigest: r[0], now: Date.now() });
        step('sign', { account: f.account, wallet: w.address, action: f.action });
        return keplrCall(G.signArbitrary(w.address, text)).then(function (signed) {
          return { confirmOperation: r[1].operation, confirmPubKey: signed.pubKey, confirmSignature: signed.signature };
        });
      });
    });
  }

  /** What a refused approval says (pure). `e`: a Keplr problem, this page's own refusal, or the server's answer. */
  function staffApprovalSentence(e, G) {
    /* The server's answers first: a refusal from the server is never mistaken for a Keplr problem. */
    if (e && e.error === 'confirmation-required') return 'That approval didn’t check out (it expired, was already used, or was for another change). Nothing was changed. Approve again.';
    if (e && e.error === 'conflict' && e.detail === 'no-authorization-wallet') return 'This account has no Authorization Wallet, so it cannot approve staff changes.';
    if (e && e.error === 'not-found') return 'This change isn’t yours to approve.';
    if (e && e.error) return sentence(e, 'staff');
    if (e && e.local) return e.message;
    var k = keplrProblem(e, G);
    if (k === 'no-keplr') return 'Keplr isn’t in this browser. Staff changes are approved with your Authorization Wallet in Keplr: install the extension, then try again. Nothing was changed.';
    if (k === 'declined') return 'The approval was declined in Keplr. Nothing was changed.';
    return 'Keplr couldn’t complete the approval. Nothing was changed. Try again.';
  }

  /** The approval in a key field drawn in `slot`: what Keplr is asked, the checklist (Site, Account, Action, Wallet),
   *  then the proof. Rejects with the error, its sentence already shown in the field. */
  function approveStaffAction(S, G, input, slot) {
    var el = root.LudumRecords.el;
    slot.textContent = '';
    var say = el('p', { class: 'ld-tx__status', role: 'status', text: 'Approve the connection in Keplr.' });
    var list = el('div');
    slot.appendChild(el('div', { class: 'ld-key', 'data-theme': 'press' }, [el('div', { class: 'ld-tx', 'data-theme': 'press' }, [
      el('p', { class: 'ld-tx__warn' }, [el('span', null, [el('b', { text: 'Approve with your Authorization Wallet.' }), ' Keplr asks for one signature over exactly this change. It is a signature, not a transaction: nothing moves and there is no fee.'])]),
      list, say])]));
    return confirmStaffAction(S, G, input, function (stage, info) {
      if (stage === 'wallet') say.textContent = 'Preparing the approval…';
      if (stage === 'sign') {
        list.appendChild(el('dl', { class: 'ld-key__wallet', style: 'margin:0' }, [el('dt', { text: 'Site' }), el('dd', { text: root.location ? root.location.host : '' }),
          el('dt', { text: 'Account' }), el('dd', { text: info.account }), el('dt', { text: 'Action' }), el('dd', { text: info.action }),
          el('dt', { text: 'Wallet' }), el('dd', { text: short(info.wallet) })]));
        say.textContent = 'Approve the signature in Keplr.';
      }
    }).then(function (proof) { say.textContent = 'Approved. Recording the change…'; return proof; }, function (e) {
      say.setAttribute('role', 'alert');
      say.textContent = staffApprovalSentence(e, G);
      throw e;
    });
  }

  /** A refusal in the account's words. `context`: "sign-in" | "create" | "reset" | "change" | "confirm" | "wallet". */
  function sentence(err, context) {
    var code = err && typeof err.error === 'string' ? err.error : 'unavailable';
    switch (code) {
      case 'invalid-credential':
        if (context === 'sign-in') return 'That Player Name and password don’t match an account.';
        if (context === 'confirm' || context === 'change') return 'That password isn’t right. Try again, or approve with Keplr.';
        if (context === 'reset' || context === 'keplr') return 'The signature didn’t check out, or it took too long. Nothing was changed. Approve a new one.';
        return 'That didn’t work. Check it and try again.';
      case 'name-taken': case 'display-name-taken': return 'Another player already has that name. Choose another.';
      case 'name-not-allowed': return 'That name isn’t allowed. Choose another.';
      case 'bad-name': return 'A player name is 1 to ' + NAME_MAX + ' characters, with a letter or a number.';
      case 'bad-password': return err.problem === 'too-long' ? 'That password is too long.' : 'A password is at least ' + PASSWORD_MIN + ' characters.';
      case 'wallet-not-authorized': return 'No Ludum account signs in with this wallet.';
      case 'wallet-unavailable': return 'Another account holds this wallet, or released it less than 24 hours ago. Nothing was changed.';
      case 'authorization-invalid': return 'The signature didn’t check out, or it took too long. Nothing was changed. Approve a new one.';
      case 'authorization-used': return 'That signature was already used. Approve a new one.';
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
      case 'reauth-required': return 'Confirm your password again: the confirmation lasts five minutes.';
      case 'same-wallet': return 'That is already your Authorization Wallet. In Keplr, switch to the wallet you want to use.';
      case 'stale': return 'Your Authorization Wallet changed in the meantime. Nothing was changed. Start again.';
      case 'bad-request':
        if (context === 'sign-in') return sentence({ error: 'invalid-credential' }, context);
        return 'The game server did not accept that request. Try again.';
      default: return 'The game server could not be reached. Try again in a moment.';
    }
  }

  /** What went wrong in Keplr, for the page's states: no Keplr here, a declined connection or signature, Keplr moved to
   *  another account, or anything else. Null: not a Keplr problem. */
  function keplrProblem(e, G) {
    if (!G || typeof G.keplr !== 'function' || !G.keplr()) return 'no-keplr';
    if (!e || e.error || e.local) return null;
    var m = String(e.message || '');
    if (/declined|didn.t connect/i.test(m)) return 'declined';
    if (/another account than the one shown/i.test(m)) return 'switched';
    return 'failed';
  }

  function local(message, why) { var e = new Error(message); e.local = true; if (why) e.why = why; return e; }
  function short(address) { return String(address).slice(0, 9) + '…' + String(address).slice(-5); }
  function site() { return root.location ? root.location.origin : ''; }
  function texts(minted) { return minted && Array.isArray(minted.texts) ? minted.texts : []; }
  function checked(text, expect) { var refusal = checkAuthorization(text, expect); if (refusal !== null) throw local(refusal, 'text'); return parseAuthorization(text); }
  function keplrCall(promise) { return promise.then(null, function (e) { if (e && !e.error) e.keplr = true; throw e; }); }

  /** This browser's session: the current one, or a new signed-out one (a reset, ended one is replaced only here, on the
   *  player's own press). */
  function start(S) {
    return S.auth('start', {}).catch(function (e) {
      if (e && e.status === 401 && e.error === 'session-ended') return S.auth('start', { fresh: true });
      throw e;
    });
  }

  function passwordProblem(p) { return Array.from(String(p || '')).length < PASSWORD_MIN ? { error: 'bad-password', problem: 'too-short' } : null; }
  /** A Player Name as the page can tell before asking (pure): null, or the problem ("bad-name"). The server decides
   *  availability and what is allowed. */
  function nameProblem(n) {
    var t = String(n || '').trim();
    var points = Array.from(t);
    return points.length < 1 || points.length > NAME_MAX || !/[\p{L}\p{N}]/u.test(t) ? { error: 'bad-name' } : null;
  }

  function nameCheck(S, name) { return S.api('name-check', { name: String(name) }); }

  function signIn(S, input) {
    return start(S).then(function () { return S.auth('sign-in', { name: input.name, password: input.password }); });
  }

  /** What a wallet-identified SIGN-IN or signed-out RECOVER text says for its account (1830Juno section 19, owner review
   *  2026-10-22): the server mints it for the wallet alone and names no account, so a wallet address never leads to a
   *  Player Name before the wallet has signed. The account is known from the server's answer once it has. */
  var WALLET_ACCOUNT = 'the account this wallet authorizes';

  /** The proof of one checked, signed text, held until the player acts: {operation, pubKey, signature, wallet, account,
   *  expiresAt} -- `account` null for a wallet-identified text (it names none). */
  function proofOf(minted, text, signed, wallet) {
    var f = parseAuthorization(text);
    return { operation: minted.operation, pubKey: signed.pubKey, signature: signed.signature, wallet: wallet, account: f.account === WALLET_ACCOUNT ? null : f.account, expiresAt: f.expiresAt };
  }
  /** Whether a held proof has run out (the page says "Signature expired" without sending it). */
  function expired(proof, now) { return !proof || proof.expiresAt <= (now === undefined ? Date.now() : now); }

  /** Sign in with Keplr: connect; the SIGN-IN text for this wallet -- naming no account -- is checked (this site, this
   *  wallet); Keplr signs; the signature signs this browser in to the account the wallet authorizes (409
   *  wallet-not-authorized, told only now, when it authorizes none). `step(name, info)`: "keplr", "wallet" ({wallet}),
   *  "sign" ({wallet}), "session". Resolves {account: the Player Name, from the answer; wallet; answer}. */
  function signInWithKeplr(S, G, step) {
    step = step || function () {};
    step('keplr');
    return start(S).then(function () { return keplrCall(G.connect()); }).then(function (w) {
      step('wallet', { wallet: w.address });
      return S.auth('authorization', { purpose: 'sign-in', wallet: w.address }).then(function (minted) {
        var text = texts(minted)[0] && texts(minted)[0].text;
        checked(text, { purpose: 'SIGN-IN', site: site(), account: WALLET_ACCOUNT, signer: w.address, authorizationWallet: w.address, now: Date.now() });
        step('sign', { wallet: w.address });
        return keplrCall(G.signArbitrary(w.address, text)).then(function (signed) {
          step('session', { wallet: w.address });
          return S.auth('keplr-sign-in', { operation: minted.operation, pubKey: signed.pubKey, signature: signed.signature }).then(function (r) { return { account: r && r.profile ? r.profile.name : null, wallet: w.address, answer: r }; });
        });
      });
    });
  }

  /** Create account, step 3: connect; the CREATE text for this Player Name (checked: this site, this name, this wallet);
   *  Keplr signs. Nothing is created: the proof is held for step 4. `step`: "keplr", "wallet" ({wallet}), "sign". */
  function authorizeCreate(S, G, input, step) {
    step = step || function () {};
    var name = String(input.name || '').trim();
    var problem = nameProblem(name);
    if (problem) return Promise.reject(problem);
    step('keplr');
    return start(S).then(function () { return keplrCall(G.connect()); }).then(function (w) {
      step('wallet', { wallet: w.address });
      return S.auth('authorization', { purpose: 'create', name: name, wallet: w.address }).then(function (minted) {
        var text = texts(minted)[0] && texts(minted)[0].text;
        checked(text, { purpose: 'CREATE', site: site(), account: name, signer: w.address, authorizationWallet: w.address, now: Date.now() });
        step('sign', { account: name, wallet: w.address });
        return keplrCall(G.signArbitrary(w.address, text)).then(function (signed) { return proofOf(minted, text, signed, w.address); });
      });
    });
  }
  /** Create account, step 4: the account, with the held proof. */
  function finishCreate(S, input) {
    var problem = nameProblem(input.name) || passwordProblem(input.password);
    if (problem) return Promise.reject(problem);
    if (expired(input.proof)) return Promise.reject(local('Signature expired', 'expired'));
    var p = input.proof;
    return S.auth('create', { name: String(input.name).trim(), password: input.password, operation: p.operation, pubKey: p.pubKey, signature: p.signature });
  }

  /** Reset password, step 1 (signed out): connect; the RECOVER text for this wallet -- naming no account -- is checked
   *  (this site, this wallet); Keplr signs; the proof is held for step 3, which learns the account (or, 409
   *  wallet-not-authorized, that the wallet authorizes none). */
  function authorizeReset(S, G, step) {
    step = step || function () {};
    step('keplr');
    return start(S).then(function () { return keplrCall(G.connect()); }).then(function (w) {
      step('wallet', { wallet: w.address });
      return S.auth('authorization', { purpose: 'recover', wallet: w.address }).then(function (minted) {
        var text = texts(minted)[0] && texts(minted)[0].text;
        checked(text, { purpose: 'RECOVER', site: site(), account: WALLET_ACCOUNT, signer: w.address, authorizationWallet: w.address, now: Date.now() });
        step('sign', { wallet: w.address });
        return keplrCall(G.signArbitrary(w.address, text)).then(function (signed) { return proofOf(minted, text, signed, w.address); });
      });
    });
  }
  /** Reset password, step 3 (and Change password with Keplr, step 3): the new password with the held proof. */
  function finishReset(S, input) {
    var problem = passwordProblem(input.newPassword);
    if (problem) return Promise.reject(problem);
    if (expired(input.proof)) return Promise.reject(local('Signature expired', 'expired'));
    var p = input.proof;
    return S.auth('recover', { operation: p.operation, pubKey: p.pubKey, signature: p.signature, newPassword: input.newPassword });
  }

  /** "Change password" with the current password: one request, the current and the new (this browser keeps a fresh
   *  session; every other one is signed out). */
  function changePassword(S, input) {
    var p = passwordProblem(input.newPassword);
    if (p) return Promise.reject(p);
    if (String(input.currentPassword || '') === '') return Promise.reject({ error: 'invalid-credential' });
    return S.auth('password', { currentPassword: input.currentPassword, newPassword: input.newPassword });
  }

  /** "Change password", step 1 with Keplr (signed in): Keplr must be on this account's Authorization Wallet (refused
   *  before anything is signed otherwise); the RECOVER text names this account; Keplr signs; the proof is held. */
  function authorizeChange(S, G, input, step) {
    step = step || function () {};
    step('keplr');
    return keplrCall(G.connect()).then(function (w) {
      if (input.authorizationWallet && w.address !== input.authorizationWallet) throw local('Keplr is on ' + short(w.address) + '. Switch Keplr to your Authorization Wallet (' + short(input.authorizationWallet) + ') and try again. Nothing was signed.', 'wrong-wallet');
      step('wallet', { wallet: w.address });
      return S.auth('authorization', { purpose: 'recover', wallet: w.address }).then(function (minted) {
        var text = texts(minted)[0] && texts(minted)[0].text;
        checked(text, { purpose: 'RECOVER', site: site(), account: input.account, signer: w.address, authorizationWallet: w.address, now: Date.now() });
        step('sign', { account: input.account, wallet: w.address });
        return keplrCall(G.signArbitrary(w.address, text)).then(function (signed) { return proofOf(minted, text, signed, w.address); });
      });
    });
  }
  var finishChange = finishReset;

  /** "Change wallet", step 2 (after "Confirm it's you"): Keplr on the CURRENT wallet; the REPLACE-RELEASE text (this site,
   *  this account, the current wallet signing for itself) checked, signed and sent: the server verifies it now. Resolves
   *  {operation}. */
  function approveRelease(S, G, input, step) {
    step = step || function () {};
    step('keplr');
    return keplrCall(G.connect()).then(function (w) {
      if (w.address !== input.current) throw local('Keplr is on ' + short(w.address) + '. Switch Keplr to your current Authorization Wallet (' + short(input.current) + ') to approve. Nothing was signed.', 'wrong-wallet');
      return S.auth('wallet-challenge', {}).then(function (minted) {
        var text = texts(minted)[0] && texts(minted)[0].text;
        checked(text, { purpose: 'REPLACE-RELEASE', site: site(), account: input.account, signer: input.current, authorizationWallet: input.current, now: Date.now() });
        step('sign', { account: input.account, wallet: w.address });
        return keplrCall(G.signArbitrary(w.address, text)).then(function (signed) {
          step('send');
          return S.auth('wallet-approve', { operation: minted.operation, pubKey: signed.pubKey, signature: signed.signature }).then(function () { return { operation: minted.operation }; });
        });
      });
    });
  }

  /** "Change wallet", step 3: Keplr on the NEW wallet; its REPLACE-ACCEPT text (this site, this account, the new wallet,
   *  replacing exactly the current one, the same operation) checked and signed; the replacement is made. Resolves the
   *  server's {authorizationWallet}. */
  function acceptWallet(S, G, input, step) {
    step = step || function () {};
    step('keplr');
    return keplrCall(G.connect()).then(function (w) {
      if (w.address === input.current) throw local('Keplr is still on your current Authorization Wallet. In Keplr, switch to the wallet you want to use, then connect again. Nothing was signed.', 'same-wallet');
      step('wallet', { wallet: w.address });
      return S.auth('wallet-challenge', { operation: input.operation, newWallet: w.address }).then(function (minted) {
        var text = texts(minted)[0] && texts(minted)[0].text;
        checked(text, { purpose: 'REPLACE-ACCEPT', site: site(), account: input.account, signer: w.address, authorizationWallet: w.address, replaces: input.current, operation: input.operation, now: Date.now() });
        step('sign', { account: input.account, wallet: w.address });
        return keplrCall(G.signArbitrary(w.address, text)).then(function (signed) {
          step('send');
          return S.auth('wallet-replace', { operation: input.operation, acceptPubKey: signed.pubKey, acceptSignature: signed.signature }).then(function (r) { return { wallet: w.address, answer: r }; });
        });
      });
    });
  }

  function confirm(S, password) { return S.auth('confirm', { password: password }); }
  function signOutOthers(S) { return S.auth('sign-out-others', {}); }

  function signOut(S) {
    var R = root.LudumRecords;
    return S.whoami().catch(function () { return null; }).then(function (who) {
      return S.auth('sign-out', {}).catch(function (e) { if (e && e.status === 401) return {}; throw e; }).then(function (r) {
        if (R && R.forgetMembership) R.forgetMembership(root.localStorage, who && who.signedIn ? who.account.username : null);
        return r;
      });
    });
  }

  /* ---------- the "Confirm it's you" panel (moderation decisions; records layer: field, input, button, error) ---------- */
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
        if (e && e.status === 404 && S.confirmUrl) { error.appendChild(document.createTextNode(' ')); error.appendChild(el('a', { class: 'ld-link', href: S.confirmUrl(), text: 'Confirm it’s you on play.netadao.org' })); }
      });
    });
    cancel.addEventListener('click', function () { if (opts && opts.onCancel) opts.onCancel(); });
    return form;
  }

  var api = {
    parseAuthorization: parseAuthorization, checkAuthorization: checkAuthorization, sentence: sentence, keplrProblem: keplrProblem, start: start,
    passwordProblem: passwordProblem, nameProblem: nameProblem, nameCheck: nameCheck, expired: expired, short: short,
    signIn: signIn, signInWithKeplr: signInWithKeplr, authorizeCreate: authorizeCreate, finishCreate: finishCreate,
    authorizeReset: authorizeReset, finishReset: finishReset, changePassword: changePassword, authorizeChange: authorizeChange, finishChange: finishChange,
    approveRelease: approveRelease, acceptWallet: acceptWallet, confirm: confirm, signOutOthers: signOutOthers, signOut: signOut, confirmPanel: confirmPanel,
    canonicalAction: canonicalAction, actionDigest: actionDigest, confirmStaffAction: confirmStaffAction, approveStaffAction: approveStaffAction, staffApprovalSentence: staffApprovalSentence,
    PASSWORD_MIN: PASSWORD_MIN, NAME_MAX: NAME_MAX
  };
  root.LudumAuth = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
