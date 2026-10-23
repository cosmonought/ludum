/* Ludum · /me/sign-up/, /me/sign-in/ and /me/recover/ -- the account pages, printed as tickets on the pass's stock (Ludum
 * Profile, owner 2026-10-22; 1830Juno §19). The page is `[data-ludum-auth="sign-up" | "sign-in" | "recover"]`.
 *
 *   Create account   four numbered steps: 1 Player Name (checked as it is typed), 2 Password, 3 the Authorization Wallet
 *                    in the black key field (Connect Keplr, then Approve signature: a signature, never a transaction), 4
 *                    Create account -- a separate act, red only once the wallet is authorized.
 *   Sign in          Sign in with Keplr first (the wallet identifies the account; one signature); Sign in with password
 *                    a press below it (the Player Name and password).
 *   Reset password   the Authorization Wallet approves (no name typed: the wallet decides which account); then the new
 *                    password; then Set new password. Other browsers signed in to the account are signed out.
 *
 * One account and one session for Ludum and Play. A password is read once from its field, sent in one request body and
 * the field is emptied; nothing is stored. Every Keplr text is checked by LudumAuth before Keplr is asked. After signing
 * in: the page's `?return=` (a Ludum path), or `?play=` (a path on play.netadao.org: Play's own sign-in sends players
 * here), else /me/. Needs session.js, pass.js, ticket.js, auth.js and gov.js (Keplr). */
(function () {
  'use strict';
  var S = window.LudumSession;
  var A = window.LudumAuth;
  var P = window.LudumPass;
  var T = window.LudumTicket;
  var el = P && P.el;
  var PLAY_PATH = /^\/(?!\/)[A-Za-z0-9\/_\-?=&.%~]{0,256}$/;

  /** Where to go once signed in (pure): `?play=` (a path on Play), else `?return=` (a Ludum path), else /me/. */
  function destinationOf(search, playOrigin) {
    var play = new URLSearchParams(String(search || '')).get('play');
    if (play !== null && PLAY_PATH.test(play)) return playOrigin + play;
    var back = S.returnPath(search);
    return back === '/' ? '/me/' : back;
  }
  /** The query to carry between the account pages (pure): ?return= or ?play=, as given (already checked on use). */
  function carried(search) {
    var params = new URLSearchParams(String(search || ''));
    var out = new URLSearchParams();
    if (params.get('play') !== null && PLAY_PATH.test(params.get('play'))) out.set('play', params.get('play'));
    else if (params.get('return') !== null) out.set('return', S.returnPath(search));
    var text = out.toString();
    return text ? '?' + text : '';
  }

  var ARROW = function () { return P.svg(P.ARROW_RIGHT); };
  var keplrHere = function () { return !!(window.LudumGov && window.LudumGov.keplr && window.LudumGov.keplr()); };

  /** The ticket: a form (or a section, once issued) on the pass's stock -- main part, the Neta perforation, the stub. */
  function ticket(opts) {
    var h1 = el('h1', { id: opts.id, tabindex: opts.focusHead ? '-1' : null, text: opts.title });
    var head = el('header', { class: 'ld-ticket__head' }, [h1, opts.alt || null]);
    var main = el('div', { class: 'ld-ticket__main' }, [head].concat(opts.main));
    var stub = el('div', { class: 'ld-ticket__stub' + (opts.stubCopy ? ' ld-stubcopy' : '') }, opts.stub);
    var node = el(opts.form ? 'form' : 'section', { class: 'ld-pass ld-ticket', 'aria-labelledby': opts.id, novalidate: opts.form ? '' : null }, [main, el('div', { class: 'ld-pass__perf', 'aria-hidden': 'true' }, [el('i')]), stub]);
    return { node: node, h1: h1, head: head, main: main, stub: stub };
  }
  function stubCopy(label, children) { return el('div', null, [el('p', { class: 'ld-stubcopy__label', text: label })].concat(children)); }
  function note(text) { return el('p', { class: 'ld-stubcopy__note', text: text }); }
  function after(text) { return el('p', { class: 'ld-ticket__after', text: text }); }
  var FUTURE = 'Future sign-ins only require your authorized Keplr wallet and a verification signature.';

  function mountTicket(slot, made, afterText) {
    slot.textContent = '';
    slot.appendChild(made.node);
    if (afterText) slot.appendChild(after(afterText));
  }

  /** The issued ticket: the head becomes the name with its status; focus moves to it; the result is announced. */
  function issued(slot, opts) {
    var made = ticket({
      id: 'tk-done', title: opts.name, focusHead: true, alt: el('p', { class: 'ld-ticket__alt' }, [el('span', { class: 'ld-step__status is-ok', text: opts.status })]),
      main: [el('div', { class: 'ld-welcome', role: 'status' }, [el('p', { class: 'ld-welcome__lede', text: opts.lede }), el('div', { class: 'ld-welcome__acts' }, opts.acts), opts.next ? el('p', { class: 'ld-welcome__next', text: opts.next }) : null])],
      stub: opts.stub, stubCopy: opts.stubCopy
    });
    mountTicket(slot, made, null);
    made.h1.focus();
    return made;
  }

  /* ==================================================================== Sign in */

  function signIn(slot, dest, search) {
    var G = window.LudumGov;
    var lede = el('p', { class: 'ld-key__lede', text: 'Sign in with your Authorization Wallet: Keplr asks for one verification signature. It is free and is not a transaction.' });
    var extra = el('div');
    var keplrBtn = el('button', { class: 'ld-btn ld-btn--red ld-btn--l', type: 'button' }, ['Sign in with Keplr', ARROW()]);
    var acts = el('div', { class: 'ld-key__acts' }, [keplrBtn]);
    var say = el('p', { class: 'ld-say', role: 'status', 'aria-live': 'polite' });
    var band = el('div', { class: 'ld-signin__key', 'data-theme': 'press' }, [lede, extra, acts, say]);

    var nameIn = T.input('si-n', { autocomplete: 'username', field: 'name' });
    var passIn = T.input('si-p', { type: 'password', autocomplete: 'current-password', field: 'password' });
    var formError = el('p', { class: 'ld-formerror', id: 'si-err', role: 'alert', tabindex: '-1', hidden: true });
    var nameField = el('div', { class: 'ld-tfield' }, [el('label', { for: 'si-n', text: 'Player Name' }), nameIn]);
    var passField = el('div', { class: 'ld-tfield' }, [el('label', { for: 'si-p', text: 'Password' }), el('div', { class: 'ld-step__row' }, [passIn, T.reveal(passIn)])]);
    var submit = el('button', { class: 'ld-btn ld-btn--secondary', type: 'submit' }, ['Sign in', ARROW()]);
    var panel = el('div', { class: 'ld-alt__panel', id: 'si-alt', hidden: true }, [formError, nameField, passField, el('div', { class: 'ld-alt__acts' }, [submit]),
      el('p', { class: 'ld-alt__note' }, ['Forgot your password? ', el('a', { class: 'ld-link', href: '/me/recover/' + carried(search) }, ['Reset it with Keplr ', ARROW()])])]);
    var toggle = el('button', { class: 'ld-alt__toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'si-alt' }, [P.svg(P.PLUS), el('span', { text: 'Sign in with password' })]);
    function openPassword(open) { toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); panel.hidden = !open; if (open) nameIn.focus(); }
    toggle.addEventListener('click', function () { openPassword(toggle.getAttribute('aria-expanded') !== 'true'); });

    var made = ticket({
      form: true, id: 'tk-signin', title: 'Sign in',
      main: [band, el('div', { class: 'ld-alt' }, [toggle, panel])],
      stubCopy: true,
      stub: [stubCopy('New to Ludum?', [el('a', { class: 'ld-btn ld-btn--secondary', href: '/me/sign-up/' + carried(search) }, ['Create account ', ARROW()]), note('One account for Ludum and play.netadao.org.')]),
        stubCopy('Staying signed in', [note('Once you’re in, this browser stays signed in. You won’t be asked for a signature on every page.')])]
    });
    mountTicket(slot, made, null);

    function retryButton() {
      var again = el('button', { class: 'ld-btn ld-btn--red ld-btn--l', type: 'button' }, ['Try again', ARROW()]);
      again.addEventListener('click', run);
      return again;
    }
    function trouble(title, text, buttons) { extra.textContent = ''; extra.appendChild(T.msg(title, text)); acts.textContent = ''; buttons.forEach(function (b) { acts.appendChild(b); }); }

    function run() {
      say.textContent = ''; extra.textContent = '';
      if (!keplrHere()) {
        var withPassword = el('button', { class: 'ld-btn ld-btn--yellow', type: 'button', text: 'Sign in with password' });
        withPassword.addEventListener('click', function () { openPassword(true); });
        trouble('Keplr isn’t in this browser', 'Install the Keplr extension, or on a phone open this page in the Keplr app’s browser. You can also sign in with your password.', [T.getKeplr(), withPassword]);
        return;
      }
      acts.textContent = ''; acts.appendChild(keplrBtn);
      T.busy(keplrBtn, 'Waiting for Keplr');
      say.textContent = 'Approve the connection in Keplr.';
      A.signInWithKeplr(S, G, function (stage, info) {
        if (stage === 'wallet') { extra.textContent = ''; extra.appendChild(T.wallet(info.wallet)); }
        if (stage === 'sign') { extra.appendChild(T.check([['Site', T.siteName()], ['Account', 'The one this wallet authorizes'], ['Wallet', A.short(info.wallet)]])); say.textContent = 'Approve the signature in Keplr.'; }
        if (stage === 'session') say.textContent = 'Signing you in.';
      }).then(function () {
        say.textContent = 'Signed in.';
        window.location.assign(dest);
      }, function (e) {
        T.idle(keplrBtn);
        say.textContent = '';
        var k = A.keplrProblem(e, G);
        if (e && e.error === 'wallet-not-authorized') {
          var shown = extra.querySelector('.ld-key__wallet');
          trouble('This wallet isn’t authorized', 'No Ludum account signs in with this wallet. In Keplr, switch to your Authorization Wallet and try again, or create an account.', [retryButton()]);
          if (shown) extra.insertBefore(shown, extra.firstChild);
          return;
        }
        if (k === 'declined' || k === 'no-keplr') { trouble('Signature declined', 'You’re not signed in. Try again, or sign in with your password.', [retryButton()]); return; }
        if (e && e.error === 'already-profiled') { window.location.reload(); return; }
        trouble('You’re not signed in', e && e.local ? e.message : A.sentence(e, 'keplr'), [retryButton()]);
      });
    }
    keplrBtn.addEventListener('click', function () { if (!T.isWaiting(keplrBtn)) run(); });

    function fieldsInvalid(on) {
      [nameField, passField].forEach(function (f) { f.classList.toggle('is-error', on); });
      [nameIn, passIn].forEach(function (i) { if (on) { i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', 'si-err'); } else { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); } });
    }
    made.node.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (panel.hidden) { openPassword(true); return; }
      if (T.isWaiting(submit)) return;
      formError.hidden = true; fieldsInvalid(false);
      var name = nameIn.value.trim();
      var password = passIn.value;
      if (name === '' || password === '') { formError.textContent = 'Enter your Player Name and password.'; formError.hidden = false; (name === '' ? nameIn : passIn).focus(); return; }
      passIn.value = '';
      T.busy(submit, 'Signing in');
      A.signIn(S, { name: name, password: password }).then(function () { window.location.assign(dest); }, function (e) {
        T.idle(submit);
        formError.textContent = A.sentence(e, 'sign-in');
        formError.hidden = false;
        if (!e || e.error === 'invalid-credential' || e.error === 'bad-request') fieldsInvalid(true);
        formError.focus();
      });
    });
  }

  /* ==================================================================== Already signed in */

  function alreadyIn(slot, who, dest) {
    var out = el('button', { class: 'ld-btn ld-btn--secondary', type: 'button', text: 'Sign out' });
    out.addEventListener('click', function () {
      T.busy(out, 'Signing out');
      A.signOut(S).then(function () { window.location.reload(); }, function (e) { T.idle(out); var p = slot.querySelector('.ld-welcome__next'); if (p) p.textContent = A.sentence(e, 'sign-in'); });
    });
    issued(slot, {
      name: who.account.name, status: 'Signed in', lede: 'You’re already signed in on this browser. No signature is needed.',
      acts: [el('a', { class: 'ld-btn ld-btn--red ld-btn--l', href: dest }, ['Continue ', ARROW()]), out],
      next: 'To use another account, sign out first.',
      stubCopy: true,
      stub: [stubCopy('Staying signed in', [note('This browser stays signed in, on Ludum and play.netadao.org, until you sign out.')])]
    });
  }

  /* ==================================================================== Create account */

  function signUp(slot, search) {
    var G = window.LudumGov;
    var state = { name: '', available: false, checking: null, wallet: null, proof: null, proofName: null };

    /* Step 1 */
    var nameIn = T.input('su-n', { name: true, autocomplete: 'username', field: 'name', attrs: { maxlength: '64', required: '', 'aria-describedby': 'su-n-note' } });
    var s1 = T.step(1, { label: 'Player Name', labelFor: 'su-n', errorId: 'su-n-err' });
    s1.body.appendChild(el('div', { class: 'ld-step__row' }, [nameIn]));
    s1.body.appendChild(el('p', { class: 'ld-step__note', id: 'su-n-note' }, ['This is the name displayed on your profile, at game tables, and to other players. ', el('b', { text: 'It is permanent.' })]));
    s1.set('active');

    /* Step 2 */
    var passIn = T.input('su-p', { type: 'password', autocomplete: 'new-password', field: 'password', attrs: { minlength: String(A.PASSWORD_MIN), required: '', 'aria-describedby': 'su-p-note' } });
    var s2 = T.step(2, { label: 'Password', labelFor: 'su-p', errorId: 'su-p-err' });
    s2.body.appendChild(el('div', { class: 'ld-step__row' }, [passIn, T.reveal(passIn)]));
    s2.body.appendChild(el('p', { class: 'ld-step__note', id: 'su-p-note', text: 'Used to authorize a new wallet or as an alternative way to sign in. At least ' + A.PASSWORD_MIN + ' characters.' }));

    /* Step 3: the key field */
    var s3 = T.step(3, { label: 'Authorization wallet' });
    var s3Wallet = el('div');
    var s3Lede = el('p', { class: 'ld-key__lede', text: 'Connect Keplr, then approve a signature that authorizes this wallet for your account.' });
    var s3Extra = el('div');
    var keyBtn = el('button', { class: 'ld-btn ld-btn--yellow', type: 'button', text: 'Connect Keplr' });
    var s3Acts = el('div', { class: 'ld-key__acts' }, [keyBtn]);
    var s3Say = el('p', { class: 'ld-say', role: 'status', 'aria-live': 'polite' });
    [s3Wallet, s3Lede, s3Extra, s3Acts, s3Say].forEach(function (n) { s3.body.appendChild(n); });
    s3.set('todo', { text: 'Not connected' });

    /* Step 4 */
    var go = el('button', { class: 'ld-btn ld-btn--red ld-btn--l ld-btn--block', type: 'submit', 'aria-disabled': 'true', 'aria-describedby': 'su-why', text: 'Create account' });
    var why = el('p', { class: 'ld-go__why', id: 'su-why', text: 'Complete steps 1 to 3 first.' });
    var s4 = T.step(4, { label: 'Create account', errorId: 'su-go-err', errorRole: 'alert' });
    s4.body.appendChild(go);
    s4.body.appendChild(why);

    var made = ticket({
      form: true, id: 'tk-signup', title: 'Create account',
      alt: el('p', { class: 'ld-ticket__alt' }, ['Have an account?', el('a', { class: 'ld-link', href: '/me/sign-in/' + carried(search) }, ['Sign in ', ARROW()])]),
      main: [el('div', { class: 'ld-steplist' }, [s1.node, s2.node])],
      stub: [el('div', { class: 'ld-key', 'data-theme': 'press' }, [s3.node]), el('div', { class: 'ld-go' }, [s4.node])]
    });
    mountTicket(slot, made, FUTURE);

    function nameReady() { return state.available && state.name === nameIn.value.trim(); }
    function passwordReady() { return !A.passwordProblem(passIn.value); }
    function authorized() { return state.proof !== null && state.proofName === nameIn.value.trim() && !A.expired(state.proof); }
    function refreshGo() {
      if (authorized() && nameReady() && passwordReady()) {
        go.removeAttribute('aria-disabled');
        go.textContent = 'Create account'; go.appendChild(ARROW());
        why.textContent = ''; why.appendChild(document.createTextNode('Creates ')); why.appendChild(el('b', { text: state.name })); why.appendChild(document.createTextNode(' and signs you in on Ludum and play.netadao.org.'));
        s4.set('active');
      } else {
        go.setAttribute('aria-disabled', 'true');
        go.textContent = 'Create account';
        why.textContent = nameReady() && passwordReady() ? 'Authorize your wallet first (step 3).' : 'Complete steps 1 to 3 first.';
        s4.set('todo');
      }
    }
    function nameError(status, text) { nameIn.setAttribute('aria-invalid', 'true'); nameIn.setAttribute('aria-describedby', 'su-n-err su-n-note'); s1.set('error', { text: status, kind: 'bad' }).error(text); }
    function nameClear() { nameIn.removeAttribute('aria-invalid'); nameIn.setAttribute('aria-describedby', 'su-n-note'); s1.error(''); }

    /* The name is checked against the server after 400 ms of no typing, and on leaving the field. */
    var timer = null;
    var asked = 0;
    function checkName() {
      clearTimeout(timer);
      var name = nameIn.value.trim();
      if (state.proof !== null && state.proofName !== name) dropProof('changed');
      state.available = false; state.name = name;
      if (name === '') { nameClear(); s1.set('active'); refreshGo(); return; }
      var problem = A.nameProblem(name);
      if (problem) { nameError(Array.from(name).length > A.NAME_MAX ? 'Too long' : 'Not a name', A.sentence(problem, 'create')); refreshGo(); return; }
      nameClear();
      s1.set('active', { text: 'Checking…' });
      var mine = ++asked;
      A.nameCheck(S, name).then(function (r) {
        if (mine !== asked || nameIn.value.trim() !== name) return;
        if (r.available) { state.available = true; s1.set('done', { text: 'Available', kind: 'ok' }); }
        else if (r.problem === 'taken') nameError('Taken', 'Another player already has that name. Choose another.');
        else if (r.problem === 'not-allowed') nameError('Not allowed', 'That name isn’t allowed. Choose another.');
        else nameError('Not a name', A.sentence({ error: 'bad-name' }, 'create'));
        refreshGo();
      }, function (e) {
        if (mine !== asked) return;
        /* An older game server without the check: the name is checked when the account is created. */
        if (e && e.status === 404) { state.available = true; s1.set('done', { text: 'Checked at creation', kind: '' }); refreshGo(); return; }
        s1.set('active', { text: 'Not checked' });
        refreshGo();
      });
    }
    nameIn.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(checkName, 400); s1.set('active', state.available ? null : null); });
    nameIn.addEventListener('blur', checkName);
    passIn.addEventListener('input', function () {
      if (passwordReady()) { s2.error(''); passIn.removeAttribute('aria-invalid'); s2.set('done', { text: 'Set', kind: 'ok' }); } else s2.set('active');
      refreshGo();
    });
    passIn.addEventListener('blur', function () { if (passIn.value && !passwordReady()) { passIn.setAttribute('aria-invalid', 'true'); s2.set('error', { text: 'Too short', kind: 'bad' }).error('A password is at least ' + A.PASSWORD_MIN + ' characters.'); } });

    /* Step 3: Connect Keplr, then Approve signature -- two presses, each its own Keplr window. */
    function keyState(lede, buttonText, status) {
      s3Lede.textContent = ''; if (Array.isArray(lede)) lede.forEach(function (n) { s3Lede.appendChild(typeof n === 'string' ? document.createTextNode(n) : n); }); else s3Lede.textContent = lede;
      s3Acts.textContent = '';
      if (buttonText) { keyBtn.textContent = buttonText; s3Acts.appendChild(keyBtn); }
      if (status) s3.set(status.state, status.st);
    }
    function showWallet() {
      s3Wallet.textContent = '';
      if (state.wallet) s3Wallet.appendChild(T.wallet(state.wallet, state.proof ? null : 'To use a different wallet, switch accounts in Keplr first.'));
    }
    function dropProof(why) {
      state.proof = null; state.proofName = null;
      s3Extra.textContent = '';
      if (why) {
        s3Extra.appendChild(T.msg('Signature expired', 'Your Player Name changed, or too much time passed, since you signed. Approve a new signature.'));
        keyState('', 'Approve signature', { state: 'error', st: { text: 'Sign again', kind: 'bad' } });
      }
      refreshGo();
    }
    function connect() {
      s3Extra.textContent = ''; s3Say.textContent = '';
      if (!keplrHere()) {
        s3.set('error', { text: 'Not found', kind: 'bad' });
        s3Extra.appendChild(T.msg('Keplr isn’t in this browser', 'Install the Keplr extension, then try again. On a phone, open this page in the Keplr app’s browser.'));
        var again = el('button', { class: 'ld-btn ld-btn--yellow', type: 'button', text: 'Try again' });
        again.addEventListener('click', connect);
        s3Acts.textContent = ''; s3Acts.appendChild(T.getKeplr()); s3Acts.appendChild(again);
        return;
      }
      s3Acts.textContent = ''; s3Acts.appendChild(keyBtn);
      T.busy(keyBtn, 'Waiting for Keplr');
      s3Say.textContent = 'Approve the connection in Keplr.';
      Promise.resolve().then(function () { return window.LudumGov.connect(); }).then(function (w) {
        T.idle(keyBtn); s3Say.textContent = '';
        state.wallet = w.address;
        showWallet();
        keyState(['Now approve a signature that authorizes this wallet for ', el('b', { text: nameIn.value.trim() || 'your account' }), '.'], 'Approve signature', { state: 'active', st: { text: 'Connected' } });
        keyBtn.focus();
      }, function (e) {
        T.idle(keyBtn); s3Say.textContent = '';
        var k = A.keplrProblem(e, G);
        s3.set('error', { text: k === 'declined' ? 'Declined' : 'Not connected', kind: 'bad' });
        s3Extra.appendChild(T.msg(k === 'declined' ? 'Connection declined' : 'Keplr didn’t connect', 'Nothing was created or changed. Connect Keplr to authorize a wallet.'));
        keyState('', 'Connect Keplr');
      });
    }
    function approve() {
      s3Extra.textContent = ''; s3Say.textContent = '';
      if (!nameReady()) { nameIn.focus(); if (!state.available) checkName(); s3Say.textContent = 'Choose an available Player Name first (step 1): the signature names it.'; return; }
      var name = nameIn.value.trim();
      T.busy(keyBtn, 'Waiting for Keplr');
      s3.set('active', { text: 'Approve in Keplr' });
      A.authorizeCreate(S, G, { name: name }, function (stage, info) {
        if (stage === 'wallet') { state.wallet = info.wallet; showWallet(); }
        if (stage === 'sign') s3Extra.appendChild(T.check([['Site', T.siteName()], ['Player Name', name], ['Wallet', A.short(info.wallet)]]));
      }).then(function (proof) {
        T.idle(keyBtn);
        state.proof = proof; state.proofName = name;
        s3Extra.textContent = '';
        showWallet();
        keyState(['This wallet is authorized for ', el('b', { text: name }), '. Your account isn’t created yet: finish with step 4.'], null, { state: 'done', st: { text: 'Authorized', kind: 'ok' } });
        refreshGo();
        go.focus();
      }, function (e) {
        T.idle(keyBtn);
        s3Extra.textContent = '';
        var k = A.keplrProblem(e, G);
        if (k === 'declined') { s3.set('error', { text: 'Declined', kind: 'bad' }); s3Extra.appendChild(T.msg('Signature declined', 'Nothing was created or changed. Approve the signature to authorize this wallet.')); keyState('', 'Approve signature'); return; }
        if (e && (e.error === 'name-taken' || e.error === 'name-not-allowed' || e.error === 'bad-name')) { state.available = false; nameError(e.error === 'name-taken' ? 'Taken' : 'Not allowed', A.sentence(e, 'create')); s3.set('active', { text: 'Connected' }); keyState('', 'Approve signature'); nameIn.focus(); refreshGo(); return; }
        s3.set('error', { text: 'Not authorized', kind: 'bad' });
        s3Say.textContent = e && e.local ? e.message : A.sentence(e, 'create');
        keyState('', 'Approve signature');
      });
    }
    keyBtn.addEventListener('click', function () {
      if (T.isWaiting(keyBtn)) return;
      if (state.wallet === null || keyBtn.textContent.indexOf('Connect') === 0) connect(); else approve();
    });

    /* Step 4: create, with the held signature. */
    made.node.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (T.isWaiting(go) && go.getAttribute('aria-busy') === 'true') return;
      var name = nameIn.value.trim();
      if (!nameReady()) { if (!name) nameError('Required', A.sentence({ error: 'bad-name' }, 'create')); nameIn.focus(); return; }
      if (!passwordReady()) { passIn.setAttribute('aria-invalid', 'true'); s2.set('error', { text: 'Too short', kind: 'bad' }).error('A password is at least ' + A.PASSWORD_MIN + ' characters.'); passIn.focus(); return; }
      if (state.proof !== null && A.expired(state.proof)) { dropProof('expired'); keyBtn.focus(); return; }
      if (!authorized()) { (s3Acts.querySelector('button') || keyBtn).focus(); return; }
      var password = passIn.value;
      T.busy(go, 'Creating account');
      s4.error('');
      var status = el('p', { class: 'ld-say', role: 'status', text: 'Creating your account.' });
      s4.body.appendChild(status);
      A.finishCreate(S, { name: name, password: password, proof: state.proof }).then(function () {
        passIn.value = '';
        var since = new Date();
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var dest = destinationOf(window.location.search, S.PLAY_ORIGIN);
        issued(slot, {
          name: name, status: 'Account created', lede: 'Account created. You’re signed in on Ludum and play.netadao.org.',
          acts: [el('a', { class: 'ld-btn ld-btn--red ld-btn--l', href: dest === '/me/' || dest.indexOf('/') === 0 ? '/me/' : dest }, [dest.indexOf(S.PLAY_ORIGIN) === 0 ? 'Back to Play ' : 'Go to your profile ', ARROW()]),
            el('a', { class: 'ld-play ld-play--s', href: 'https://play.netadao.org', 'aria-label': 'Play, on play.netadao.org' }, [el('span', { class: 'ld-play__word', text: 'Play' }), P.svg('<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 18 18 6M8 6h10v10"/></svg>')])],
          next: FUTURE,
          stub: [el('div', { class: 'ld-key', 'data-theme': 'press' }, [el('dl', { class: 'ld-issued' }, [
            el('div', null, [el('dt', { text: 'Player Name' }), el('dd', { class: 'is-name', text: name })]),
            el('div', null, [el('dt', { text: 'Authorization Wallet' }), el('dd', { title: state.wallet, text: A.short(state.wallet) })]),
            el('div', null, [el('dt', { text: 'Sign in with' }), el('dd', { text: 'Keplr, or your password' })]),
            el('div', null, [el('dt', { text: 'Member since' }), el('dd', { text: months[since.getUTCMonth()] + ' ' + since.getUTCFullYear() })])
          ])])]
        });
      }, function (e) {
        T.idle(go);
        if (status.parentNode) status.parentNode.removeChild(status);
        var code = e && e.error;
        if (code === 'display-name-taken' || code === 'name-taken' || code === 'name-not-allowed' || code === 'bad-name') { state.available = false; dropProof(null); nameError(code === 'name-not-allowed' ? 'Not allowed' : code === 'bad-name' ? 'Not a name' : 'Taken', A.sentence(e, 'create')); s3.set('active', { text: 'Sign again', kind: 'bad' }); keyState('', 'Approve signature'); nameIn.focus(); refreshGo(); return; }
        if (code === 'bad-password') { s2.set('error', { text: 'Too short', kind: 'bad' }).error(A.sentence(e, 'create')); passIn.focus(); return; }
        if (code === 'wallet-unavailable') {
          dropProof(null);
          s3.set('error', { text: 'In use', kind: 'bad' });
          s3Extra.textContent = '';
          s3Extra.appendChild(T.msg('Wallet already in use', 'Another account holds this wallet, or released it less than 24 hours ago. In Keplr, switch to a different wallet, then connect again.'));
          state.wallet = null; s3Wallet.textContent = '';
          keyState('', 'Connect again');
          keyBtn.focus();
          return;
        }
        if ((e && e.why === 'expired') || code === 'authorization-invalid' || code === 'authorization-used') { dropProof('expired'); keyBtn.focus(); return; }
        if (code === 'already-profiled') { window.location.reload(); return; }
        s4.error(A.sentence(e, 'create') + ' Nothing was created.');
      });
    });
    nameIn.focus();
  }

  /* ==================================================================== Reset password */

  function recover(slot, search) {
    var G = window.LudumGov;
    var held = null;

    var s1 = T.step(1, { label: 'Authorization wallet' });
    var s1Wallet = el('div');
    var s1Lede = el('p', { class: 'ld-key__lede', text: 'Your Authorization Wallet proves the account is yours. Keplr asks for one signature; it is free and is not a transaction.' });
    var s1Extra = el('div');
    var keyBtn = el('button', { class: 'ld-btn ld-btn--yellow', type: 'button', text: 'Reset with Keplr' });
    var s1Acts = el('div', { class: 'ld-key__acts' }, [keyBtn]);
    var s1Say = el('p', { class: 'ld-say', role: 'status', 'aria-live': 'polite' });
    [s1Wallet, s1Lede, s1Extra, s1Acts, s1Say].forEach(function (n) { s1.body.appendChild(n); });
    s1.set('active', { text: 'Not connected' });

    var passIn = T.input('rp-p', { type: 'password', autocomplete: 'new-password', field: 'password', attrs: { minlength: String(A.PASSWORD_MIN), 'aria-describedby': 'rp-note' } });
    var s2 = T.step(2, { label: 'New password', labelFor: 'rp-p', errorId: 'rp-err' });
    s2.body.appendChild(el('div', { class: 'ld-step__row' }, [passIn, T.reveal(passIn)]));
    s2.body.appendChild(el('p', { class: 'ld-step__note', id: 'rp-note', text: 'At least ' + A.PASSWORD_MIN + ' characters. Used to authorize a new wallet or as an alternative way to sign in.' }));

    var set = el('button', { class: 'ld-btn ld-btn--red ld-btn--l', type: 'submit', 'aria-disabled': 'true', 'aria-describedby': 'rp-why', text: 'Set new password' });
    var why = el('p', { class: 'ld-go__why', id: 'rp-why', text: 'Approve with your wallet first (step 1).' });
    var s3 = T.step(3, { label: 'Set it', errorId: 'rp-go-err', errorRole: 'alert' });
    s3.body.appendChild(set);
    s3.body.appendChild(why);

    var made = ticket({
      form: true, id: 'tk-reset', title: 'Reset password',
      alt: el('p', { class: 'ld-ticket__alt' }, ['Remembered it?', el('a', { class: 'ld-link', href: '/me/sign-in/' + carried(search) }, ['Sign in ', ARROW()])]),
      main: [el('div', { class: 'ld-key', 'data-theme': 'press' }, [s1.node]), el('div', { class: 'ld-steplist' }, [s2.node, s3.node])],
      stubCopy: true,
      stub: [stubCopy('Which account?', [note('The wallet decides. The account’s name appears once the new password is set.')]),
        stubCopy('Afterwards', [note('You’re signed in here, and other browsers signed in to the account are signed out.')])]
    });
    mountTicket(slot, made, null);

    function trouble(status, title, text, buttons) {
      s1.set('error', { text: status, kind: 'bad' });
      s1Extra.textContent = ''; s1Extra.appendChild(T.msg(title, text));
      s1Acts.textContent = ''; buttons.forEach(function (b) { s1Acts.appendChild(b); });
    }
    function button(text, onPress) { var b = el('button', { class: 'ld-btn ld-btn--yellow', type: 'button', text: text }); b.addEventListener('click', onPress); return b; }
    function approve() {
      s1Extra.textContent = ''; s1Say.textContent = '';
      if (!keplrHere()) { trouble('Not found', 'Keplr isn’t in this browser', 'Resetting needs the account’s Authorization Wallet in Keplr. Install the extension, or on a phone open this page in the Keplr app’s browser.', [T.getKeplr(), button('Try again', approve)]); return; }
      s1Acts.textContent = ''; s1Acts.appendChild(keyBtn);
      T.busy(keyBtn, 'Waiting for Keplr');
      s1.set('active', { text: 'Connecting' });
      s1Say.textContent = 'Approve the connection in Keplr.';
      A.authorizeReset(S, G, function (stage, info) {
        if (stage === 'wallet') { s1Wallet.textContent = ''; s1Wallet.appendChild(T.wallet(info.wallet)); }
        if (stage === 'sign') { s1.set('active', { text: 'Approve in Keplr' }); s1Say.textContent = ''; s1Extra.appendChild(T.check([['Site', T.siteName()], ['Password for', 'The account this wallet authorizes'], ['Wallet', A.short(info.wallet)]])); }
      }).then(function (proof) {
        held = proof;
        T.idle(keyBtn);
        s1Extra.textContent = ''; s1Say.textContent = '';
        s1Acts.textContent = '';
        s1.set('done', { text: 'Approved', kind: 'ok' });
        s1Lede.textContent = '';
        s1Lede.textContent = 'Approved. Set the new password below within a few minutes.';
        set.removeAttribute('aria-disabled');
        why.textContent = '';
        s2.set('active'); s3.set('active');
        passIn.focus();
      }, function (e) {
        T.idle(keyBtn);
        s1Say.textContent = '';
        var k = A.keplrProblem(e, G);
        if (e && e.error === 'wallet-not-authorized') { trouble('Not authorized', 'This wallet isn’t authorized', 'No Ludum account signs in with this wallet. In Keplr, switch to the account’s Authorization Wallet and try again.', [button('Try again', approve)]); return; }
        if (k === 'declined') { trouble('Declined', 'Signature declined', 'Nothing was changed. Approve the signature to reset the password.', [button('Reset with Keplr', approve)]); return; }
        if (e && e.error === 'already-profiled') { window.location.assign('/me/account/?change=password'); return; }
        trouble('Not approved', 'Nothing was changed', e && e.local ? e.message : A.sentence(e, 'reset'), [button('Reset with Keplr', approve)]);
      });
    }
    keyBtn.addEventListener('click', function () { if (!T.isWaiting(keyBtn)) approve(); });

    made.node.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (set.getAttribute('aria-busy') === 'true') return;
      if (held === null) { keyBtn.focus(); return; }
      var chosen = passIn.value;
      if (A.passwordProblem(chosen)) { passIn.setAttribute('aria-invalid', 'true'); passIn.setAttribute('aria-describedby', 'rp-err rp-note'); s2.set('error', { text: 'Too short', kind: 'bad' }).error('A password is at least ' + A.PASSWORD_MIN + ' characters.'); passIn.focus(); return; }
      passIn.removeAttribute('aria-invalid'); s2.error('');
      if (A.expired(held)) { held = null; set.setAttribute('aria-disabled', 'true'); trouble('Sign again', 'Signature expired', 'The approval is single-use and lasts a few minutes. Approve a new one, then set the password.', [button('Reset with Keplr', approve)]); s2.set('todo'); s3.set('todo'); return; }
      T.busy(set, 'Setting password');
      A.finishReset(S, { proof: held, newPassword: chosen }).then(function (r) {
        passIn.value = '';
        /* The account the wallet authorizes, named by the server now that the wallet has signed. */
        var name = r && r.profile && typeof r.profile.name === 'string' ? r.profile.name : 'your account';
        held = null;
        issued(slot, {
          name: name, status: 'Password reset', lede: 'Your new password is set and you’re signed in. Other browsers signed in to ' + name + ' were signed out.',
          acts: [el('a', { class: 'ld-btn ld-btn--red ld-btn--l', href: destinationOf(window.location.search, S.PLAY_ORIGIN) }, ['Continue ', ARROW()]), el('a', { class: 'ld-btn ld-btn--secondary', href: '/me/account/' }, ['Account ', ARROW()])],
          stubCopy: true,
          stub: [stubCopy('Signing in', [note('Sign in with your Authorization Wallet in Keplr, or with ' + name + ' and the new password.')])]
        });
      }, function (e) {
        T.idle(set);
        passIn.value = '';
        if (e && (e.why === 'expired' || e.error === 'invalid-credential' || e.error === 'authorization-used')) {
          held = null; set.setAttribute('aria-disabled', 'true'); why.textContent = 'Approve with your wallet first (step 1).';
          trouble('Sign again', 'Signature expired', 'The approval is single-use and lasts a few minutes. Approve a new one, then set the password.', [button('Reset with Keplr', approve)]);
          s2.set('todo'); s3.set('todo');
          return;
        }
        if (e && e.error === 'wallet-not-authorized') {
          held = null; set.setAttribute('aria-disabled', 'true'); why.textContent = 'Approve with your wallet first (step 1).';
          trouble('Not authorized', 'This wallet isn’t authorized', 'No Ludum account signs in with this wallet. In Keplr, switch to the account’s Authorization Wallet and try again.', [button('Reset with Keplr', approve)]);
          s2.set('todo'); s3.set('todo');
          return;
        }
        if (e && e.error === 'bad-password') { s2.set('error', { text: 'Too short', kind: 'bad' }).error(A.sentence(e, 'reset')); passIn.focus(); return; }
        s3.error(A.sentence(e, 'reset'));
      });
    });
    keyBtn.focus();
  }

  /* ==================================================================== mount */

  function mount(root) {
    var kind = root.getAttribute('data-ludum-auth');
    var slot = root.querySelector('[data-pass-slot]');
    var search = window.location.search;
    var dest = destinationOf(search, S.PLAY_ORIGIN);
    return S.whoami().catch(function () { return null; }).then(function (who) {
      if (who && who.signedIn === true) {
        /* A signed-in player on Reset password goes to Account with Change password open. */
        if (kind === 'recover') { window.location.replace('/me/account/?change=password'); return; }
        alreadyIn(slot, who, dest);
        return;
      }
      if (kind === 'sign-in') signIn(slot, dest, search);
      else if (kind === 'sign-up') signUp(slot, search);
      else recover(slot, search);
    });
  }

  window.LudumAuthPage = { mount: mount, destinationOf: destinationOf, carried: carried };
  function start() {
    var root = document.querySelector('[data-ludum-auth]');
    if (root && S && A && P && T) mount(root);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
