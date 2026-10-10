/* Ludum · /me/account/ — Profile · Your account (AccountDetails): the display name and its states (DisplayName), the
 * username, the Authorization Wallet, and the facts players at your tables see. Reads `session` and `account`; writes
 * only `display-name` (the account's ONE change, before its first game; the server decides and says why not).
 *
 * The DisplayName states (the owner's rule): "changeable" — a field with one change left, refusing a name another
 * player has; "changed" — the change is used; "locked-playing" — a game has started; "locked-seated" — a seat is held
 * at a table that has not started. v1.2: sign-in, sign-out and "Confirm it's you" are Ludum's own too (one account and
 * one session with play.netadao.org); changing the password or the Authorization Wallet stays on play.netadao.org. */
(function () {
  'use strict';
  var R = window.LudumRecords;

  /** The sentence beside a locked or used name (pure). */
  function stateLine(view) {
    if (view.state === 'changed') return 'Changed on ' + R.day(view.changedAt) + '. Your one change is used.';
    if (view.state === 'locked-playing') return 'Locked when your first game began.';
    if (view.state === 'locked-seated') return 'Locked while you hold a seat at a table that has not started. Leave the table to change it.';
    return 'One change before your first game. Names are unique.';
  }
  /** What a refused change means to the player (pure). */
  function refusalText(e) {
    var d = e && e.detail;
    if (d === 'taken') return 'Another player already has that name. Choose another.';
    if (d === 'unchanged') return 'That is your name already.';
    if (d === 'already-changed') return 'Your one change is already used.';
    if (d === 'locked-playing') return 'A game has started, so the name is locked.';
    if (d === 'locked-seated') return 'You hold a seat at a table that has not started. Leave it to change your name.';
    if (d === 'bad-name') return 'A name is 1 to 24 characters, and the same once cleaned (no control characters, no leading or trailing spaces).';
    if (e && e.error === 'signed-out') return 'You are signed out. Sign in and try again.';
    if (e && e.error === 'rate-limited') return 'Too many requests. Try again in a minute.';
    return 'The change could not be saved. Nothing changed.';
  }

  function nameField(view, onSave) {
    if (view.state !== 'changeable') return R.el('dd', null, [R.el('strong', { text: view.name }), ' · ' + stateLine(view) + ' Shown at your tables, on Ludum and on play.netadao.org.']);
    var input = R.el('input', { class: 'ld-input', id: 'dn-name', value: view.name, maxlength: '24', autocomplete: 'nickname', spellcheck: 'false' });
    var error = R.el('p', { class: 'ld-field__error', role: 'alert', hidden: true });
    var confirm = R.el('label', { class: 'ld-check', for: 'dn-sure' }, [R.el('input', { type: 'checkbox', id: 'dn-sure' }), 'I understand this is my one change. It cannot be undone.']);
    var save = R.el('button', { class: 'ld-btn', type: 'button', text: 'Change name' });
    var field = R.el('div', { class: 'ld-field' }, [
      R.el('label', { class: 'ld-field__label', for: 'dn-name', text: 'Display name' }),
      R.el('p', { class: 'ld-field__hint', text: stateLine(view) + ' Shown at your tables, on Ludum and on play.netadao.org.' }),
      input, error,
      R.el('div', { class: 'ld-field__foot' }, [R.el('span', { text: '1 change left' }), R.el('span', { text: '24 characters at most' })]),
      confirm, R.el('div', null, [save])
    ]);
    save.addEventListener('click', function () {
      var box = confirm.querySelector('input');
      error.hidden = true;
      field.classList.remove('is-error');
      if (!box.checked) { error.textContent = 'Tick the box first: the change cannot be undone.'; error.hidden = false; return; }
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

  function factsLedger(facts) {
    if (!facts.value) return R.notice('Unavailable', 'What players at your tables see could not be read just now.', 'wait');
    var f = facts.value;
    var rows = [
      ['Account age', R.val('Member since ' + R.month(f.memberSince), f.accountAgeDays + ' days, counted in whole weeks')],
      ['Completed games', R.val(String(f.completedMoneyGames), 'real-money games')],
      ['Open disputes', R.val(String(f.unresolvedDisputes))],
      ['Disputed games', R.val(String(f.disputedGames), 'tables with a challenge, resolved or not')],
      ['Inactivity exits', R.val(f.inactivityExits === 0 ? 'None' : String(f.inactivityExits))],
      ['Prior relationships', R.val(f.establishedOpponents === null ? '—' : String(f.establishedOpponents), 'established opponents you have completed real-money games with')]
    ];
    return R.ledger({ columns: [['Fact'], ['Yours']], rows: rows.map(function (r) { return R.el('tr', null, [R.td('Fact', [r[0]], 'is-key'), R.td('Yours', [r[1]])]); }),
      note: 'Facts from Play’s records, not a rating. None of them proves who controls an account.' });
  }

  function render(frame, body, who, acct, session) {
    R.profileFrame(frame, who, 'account', { kicker: 'Profile', muted: 'Only you can see this page', title: acct.displayName.name, dek: 'Your player account for every Neta DAO game.' });
    body.textContent = '';
    var a = who.account;
    var dl = R.el('dl', { class: 'ld-facts' }, [
      R.el('dt', { text: 'Display name' }),
      nameField(acct.displayName, function (name) {
        return session.api('display-name', { name: name }).then(function (r) {
          acct.displayName = r.displayName;
          render(frame, body, who, acct, session);
          var nav = document.querySelector('.ld-nav__who span:not(.ld-nav__who-mark)');
          if (nav) nav.textContent = r.displayName.name;
        });
      }),
      R.el('dt', { text: 'Username' }), R.el('dd', { text: a.username + ' · for signing in; never shown to other players' }),
      R.el('dt', { text: 'Authorization Wallet' }),
      R.el('dd', null, a.authorizationWallet ? [R.el('span', { class: 'ld-id', title: a.authorizationWallet.address, text: R.shortAddress(a.authorizationWallet.address) }), ' · since ' + R.day(a.authorizationWallet.since) + ' · signs account actions only'] : ['None']),
      R.el('dt', { text: 'Payout wallets' }), R.el('dd', { text: 'Chosen at each table, on play.netadao.org. Each game record names the one it paid.' }),
      R.el('dt', { text: 'Signed in' }), R.el('dd', { text: 'One account and one session for Ludum and play.netadao.org: signing out here signs out there too.' }),
      R.el('dt', { text: 'Password and Authorization Wallet' }), R.el('dd', null, [R.el('a', { class: 'ld-link ld-link--out', href: who.manageUrl || window.LudumSession.PLAY_ORIGIN + '/' }, ['Change on play.netadao.org', R.icon('arrow-out')])])
    ]);
    var right = R.el('div', null, [R.el('p', { class: 'ld-label', style: 'margin-bottom:12px', text: 'What players at your tables see' }), factsLedger(acct.tablemates)]);
    body.appendChild(R.section('01', 'd1', 'Account', 'Your player account for every Neta DAO game.', [R.el('div', { class: 'ld-twocol' }, [R.el('div', { class: 'ld-stack' }, [dl]), right])]));
  }

  function mount(root, session) {
    var frame = root.querySelector('[data-rec-frame]');
    var body = root.querySelector('[data-rec-body]');
    return session.whoami().then(function (who) {
      if (!who || who.signedIn !== true) {
        frame.textContent = '';
        frame.appendChild(R.rechead({ kicker: 'Profile', title: 'Your account' }));
        frame.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice('Signed out', 'Sign in to see your account. One account for Ludum and play.netadao.org.', 'wait', R.el('a', { class: 'ld-btn', href: window.LudumSession.signInUrl('/me/account/'), text: 'Sign in' }))]));
        return;
      }
      return session.api('account', {}).then(function (acct) { render(frame, body, who, acct, session); });
    }).catch(function () {
      body.textContent = '';
      body.appendChild(R.el('div', { class: 'ld-wrap' }, [R.notice('Unavailable', 'Your account could not be read just now. Nothing is shown rather than an old value.', 'stop')]));
    });
  }

  window.LudumAccountPage = { stateLine: stateLine, refusalText: refusalText, mount: mount };
  function start() {
    var root = document.querySelector('[data-ludum-account]');
    if (root && window.LudumSession && R) mount(root, window.LudumSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
