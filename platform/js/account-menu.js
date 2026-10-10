/* Ludum · the account slot in SiteNav (AccountMenu, with its phone card) — on every page, just before PLAY.
 *
 * Signed out: SIGN IN (Ludum's own sign-in, /me/sign-in/, returning to this page). Signed in: the player's display name,
 * opening a short menu — Profile, then Moderation (conduct reviewers only: `session.roles.reviewer`), then Appeals &
 * Disputes (when the chain says THIS account's Authorization Wallet, or a Keplr wallet it connected, is a Ludum DAO
 * member: `LudumRecords.checkMembership`, no Keplr needed), then Sign out (here, natively: it ends the one shared session,
 * so Play is signed out too). On phones the same entries sit at the foot of the menu sheet, above PLAY.
 *
 * It asks `LudumSession.whoami()` once. Until the answer the slot is empty (no flash of SIGN IN for a signed-in player);
 * if Play cannot be reached the slot offers SIGN IN. Everything from the server is set as text. Needs
 * /platform/js/session.js before it; /platform/js/records.js is optional (without it the DAO tab is never drawn).
 */
(function () {
  'use strict';

  var ARROW_DOWN = '<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v17M6 14l6 6 6-6"/></svg>';
  var ARROW_RIGHT = '<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12h17M14 6l6 6-6 6"/></svg>';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
      if (k === 'text') node.textContent = attrs[k]; else if (k === 'class') node.className = attrs[k]; else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function svg(markup) { var s = document.createElement('span'); s.innerHTML = markup; return s.firstChild; }

  /** The menu's entries for this visitor (pure: pinned by platform/tests/account-menu.test.mjs). */
  function entries(session, daoMember, path) {
    var list = [{ href: '/me/', text: 'Profile' }];
    if (session && session.roles && session.roles.reviewer === true) list.push({ href: '/moderation/', text: 'Moderation' });
    if (daoMember) list.push({ href: '/disputes/', text: 'Appeals & Disputes' });
    return list.map(function (e) {
      var here = typeof path === 'string' && (path === e.href || (e.href !== '/me/' && path.indexOf(e.href) === 0) || (e.href === '/me/' && path.indexOf('/me/') === 0));
      return { href: e.href, text: e.text, current: here };
    });
  }

  function whoBlock(account) {
    return el('p', { class: 'ld-acct__who' }, [el('span', { class: 'ld-acct__name', text: account.name }), el('span', { class: 'ld-acct__user', text: 'Signed in as ' + account.username })]);
  }
  function listBlock(items) {
    return el('ul', { class: 'ld-acct__list' }, items.map(function (e) { return el('li', null, [el('a', { href: e.href, 'aria-current': e.current ? 'page' : null, text: e.text })]); }));
  }
  /** Sign out here (v1.2): the shared session ends for Ludum and Play; then this page reloads, signed out. If the
   *  request fails, Play's own sign-out link is offered instead (nothing is left half-done). */
  function outBlock(fallback) {
    var button = el('button', { type: 'button', text: 'Sign out' });
    var note = el('p', { class: 'ld-acct__note', role: 'alert', hidden: true });
    button.addEventListener('click', function () {
      button.disabled = true;
      var A = window.LudumAuth;
      var done = A ? A.signOut(window.LudumSession) : Promise.reject(new Error('no LudumAuth'));
      done.then(function () { window.location.assign(window.location.pathname.indexOf('/me/') === 0 || window.location.pathname.indexOf('/moderation/') === 0 ? '/' : window.location.pathname + window.location.search); }, function () {
        button.disabled = false;
        note.textContent = 'Sign-out didn’t reach the game server. ';
        note.appendChild(el('a', { href: fallback, text: 'Sign out on play.netadao.org' }));
        note.hidden = false;
      });
    });
    return el('div', { class: 'ld-acct__out' }, [button, note]);
  }

  function bindToggle(btn, panel) {
    function set(open) { btn.setAttribute('aria-expanded', open ? 'true' : 'false'); panel.hidden = !open; }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(btn.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('click', function (e) { if (btn.getAttribute('aria-expanded') === 'true' && !panel.contains(e.target)) set(false); });
    btn.parentNode.addEventListener('keydown', function (e) { if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); } });
  }

  function render(nav, session) {
    var bar = nav.querySelector('.ld-nav__bar');
    var play = bar && bar.querySelector(':scope > .ld-play');
    var sheet = nav.querySelector('#ld-menu');
    var foot = sheet && sheet.querySelector('.ld-nav__panel-foot');
    if (!bar || !play) return;
    var path = window.location.pathname;
    var slot = bar.querySelector(':scope > .ld-nav__acct') || el('div', { class: 'ld-nav__acct' });
    var sheetSlot = sheet ? sheet.querySelector('.ld-nav__sheet-acct') || el('div', { class: 'ld-nav__sheet-acct' }) : null;
    slot.textContent = '';
    if (sheetSlot) sheetSlot.textContent = '';
    if (!session || session.signedIn !== true) {
      var href = window.LudumSession.signInUrl(path);
      slot.appendChild(el('a', { class: 'ld-nav__signin', href: href, text: 'Sign in' }));
      if (sheetSlot) sheetSlot.appendChild(el('a', { class: 'ld-nav__signin', href: href }, ['Sign in', svg(ARROW_RIGHT)]));
    } else {
      var records = window.LudumRecords;
      var member = records ? records.rememberedMember(window.localStorage, Date.now(), records.accountOf(session)) : null;
      var items = entries(session, member, path);
      var signOut = window.LudumSession.signOutUrl('/');
      var btn = el('button', { class: 'ld-nav__who', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'ld-acct' }, [el('span', { class: 'ld-nav__who-mark', 'aria-hidden': 'true' }), el('span', { text: session.account.name }), svg(ARROW_DOWN)]);
      var panel = el('div', { class: 'ld-acct', id: 'ld-acct' }, [whoBlock(session.account), listBlock(items), outBlock(signOut)]);
      panel.hidden = true;
      slot.appendChild(btn);
      slot.appendChild(panel);
      if (sheetSlot) {
        sheetSlot.appendChild(whoBlock(session.account));
        sheetSlot.appendChild(listBlock(items));
        sheetSlot.appendChild(outBlock(signOut));
      }
      var menuBtn = bar.querySelector('.ld-nav__menu');
      if (menuBtn && !menuBtn.querySelector('.ld-nav__who-mark')) menuBtn.insertBefore(el('span', { class: 'ld-nav__who-mark', 'aria-hidden': 'true' }), menuBtn.firstChild);
      bindToggle(btn, panel);
    }
    if (!slot.parentNode) bar.insertBefore(slot, play);
    if (sheetSlot && !sheetSlot.parentNode) sheet.insertBefore(sheetSlot, foot || null);
  }

  function start() {
    var nav = document.querySelector('header.ld-nav');
    if (!nav || !window.LudumSession) return;
    window.LudumSession.whoami().then(function (session) {
      render(nav, session);
      /* The chain's answer for THIS account: redraw only when it differs from what was drawn. */
      var records = window.LudumRecords;
      if (!records || !records.checkMembership || !session || session.signedIn !== true) return;
      records.checkMembership(session).then(function (member) {
        if (member === null) return;
        var drawn = !!nav.querySelector('.ld-nav__acct a[href="/disputes/"]');
        if (drawn === member) return;
        render(nav, session);
      });
    }, function () { render(nav, null); });
  }

  window.LudumAccountMenu = Object.freeze({ entries: entries, render: render });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
