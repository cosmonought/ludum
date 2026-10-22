/* Ludum · the account slot in SiteNav (Ludum Profile "the pass", owner 2026-10-22) -- on every page, just before PLAY.
 *
 * Signed out: SIGN IN (Ludum's own sign-in, /me/sign-in/, returning to this page). Signed in: the player's NAME is a link
 * to their profile (/me/), and a separate ARROW button opens a menu whose one item is Sign out (here, natively: it ends
 * the one shared session, so Play is signed out too). Games, Account, Moderation and Disputes are reached from the
 * profile's own tabs, never repeated here. Two tab stops; the menu opens on a press or a tap and from the keyboard (Enter
 * or Space opens it and moves focus to Sign out; Escape, a press outside or a second press closes it; Escape returns
 * focus to the arrow); nothing opens on hover. On phones the name and Sign out sit at the foot of the Menu sheet.
 *
 * It asks `LudumSession.whoami()` once. Until the answer the slot is empty (no flash of SIGN IN for a signed-in player);
 * if Play cannot be reached the slot offers SIGN IN. Everything from the server is set as text. Needs
 * /platform/js/session.js before it.
 */
(function () {
  'use strict';

  var ARROW_DOWN = '<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v17M6 14l6 6 6-6"/></svg>';
  var ARROW_RIGHT = '<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12h17M14 6l6 6-6 6"/></svg>';
  /** A name of more than 18 characters takes the sheet's smaller size (the design's long-name step). */
  var LONG_NAME = 18;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
      if (k === 'text') node.textContent = attrs[k]; else if (k === 'class') node.className = attrs[k]; else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function svg(markup) { var s = document.createElement('span'); s.innerHTML = markup; return s.firstChild; }

  /** The menu's entries (pure: pinned by platform/tests/records.test.mjs): Sign out, and nothing else. */
  function entries() { return [{ action: 'sign-out', text: 'Sign out' }]; }

  /** Whether `path` is the signed-in player's own profile (the name carries the current bar there). */
  function isOwnProfile(path) { return typeof path === 'string' && (path === '/me/' || path.indexOf('/me/account/') === 0); }

  /** Sign out here: the shared session ends for Ludum and Play; then this page reloads, signed out (a private page goes
   *  home). If the request fails, Play's own sign-out link is offered instead (nothing is left half-done). */
  function signOut(button, note) {
    button.disabled = true;
    var A = window.LudumAuth;
    var done = A ? A.signOut(window.LudumSession) : Promise.reject(new Error('no LudumAuth'));
    done.then(function () {
      var path = window.location.pathname;
      var priv = path.indexOf('/me/') === 0 || path.indexOf('/moderation/') === 0 || path.indexOf('/disputes/') === 0;
      window.location.assign(priv ? '/' : path + window.location.search);
    }, function () {
      button.disabled = false;
      note.textContent = 'Sign-out didn’t reach the game server. ';
      note.appendChild(el('a', { href: window.LudumSession.signOutUrl('/'), text: 'Sign out on play.netadao.org' }));
      note.hidden = false;
    });
  }

  /** The arrow's menu: open on a press (the keyboard's Enter or Space too: focus moves to Sign out); close on Escape (focus
   *  back to the arrow), a press outside, or a second press. Touch is a press: no hover anywhere. */
  function bindMenu(arrow, panel) {
    function set(open) { arrow.setAttribute('aria-expanded', open ? 'true' : 'false'); panel.hidden = !open; }
    arrow.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = arrow.getAttribute('aria-expanded') !== 'true';
      set(open);
      /* Opened from the keyboard (a click with no pointer position): Sign out takes the focus. */
      if (open && e.detail === 0) { var first = panel.querySelector('button, a'); if (first) first.focus(); }
    });
    document.addEventListener('click', function (e) { if (arrow.getAttribute('aria-expanded') === 'true' && !panel.contains(e.target) && e.target !== arrow) set(false); });
    arrow.parentNode.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && arrow.getAttribute('aria-expanded') === 'true') { set(false); arrow.focus(); }
    });
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
      var here = path === '/me/sign-in/' ? 'page' : null;
      slot.appendChild(el('a', { class: 'ld-nav__signin', href: href, 'aria-current': here, text: 'Sign in' }));
      if (sheetSlot) sheetSlot.appendChild(el('a', { class: 'ld-nav__signin', href: href, 'aria-current': here }, ['Sign in', svg(ARROW_RIGHT)]));
    } else {
      var name = String(session.account.name);
      var own = isOwnProfile(path) ? 'page' : null;
      var who = el('a', { class: 'ld-nav__who', href: '/me/', 'aria-label': name + ', your profile', 'aria-current': own }, [
        el('span', { class: 'ld-nav__who-mark', 'aria-hidden': 'true' }), el('span', { class: 'ld-nav__who-name', text: name })
      ]);
      var arrow = el('button', { class: 'ld-nav__more', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'ld-out', 'aria-label': 'Account menu' }, [svg(ARROW_DOWN)]);
      var note = el('p', { class: 'ld-acct__note', role: 'alert', hidden: '' });
      var out = el('button', { type: 'button', text: entries()[0].text });
      out.addEventListener('click', function () { signOut(out, note); });
      var panel = el('div', { class: 'ld-nav__out', id: 'ld-out', hidden: '' }, [out, note]);
      slot.appendChild(who);
      slot.appendChild(arrow);
      slot.appendChild(panel);
      bindMenu(arrow, panel);
      if (sheetSlot) {
        var sheetNote = el('p', { class: 'ld-acct__note', role: 'alert', hidden: '' });
        var sheetOut = el('button', { class: 'ld-sheet__out', type: 'button', text: 'Sign out' });
        sheetOut.addEventListener('click', function () { signOut(sheetOut, sheetNote); });
        sheetSlot.appendChild(el('a', { class: 'ld-sheet__who' + (Array.from(name).length > LONG_NAME ? ' ld-sheet__who--long' : ''), href: '/me/', 'aria-label': name + ', your profile', 'aria-current': own }, [
          el('span', { class: 'ld-nav__who-mark', 'aria-hidden': 'true' }), el('span', { text: name }), svg(ARROW_RIGHT)
        ]));
        sheetSlot.appendChild(sheetOut);
        sheetSlot.appendChild(sheetNote);
      }
      var menuBtn = bar.querySelector('.ld-nav__menu');
      if (menuBtn && !menuBtn.querySelector('.ld-nav__who-mark')) menuBtn.insertBefore(el('span', { class: 'ld-nav__who-mark', 'aria-hidden': 'true' }), menuBtn.firstChild);
    }
    if (!slot.parentNode) bar.insertBefore(slot, play);
    if (sheetSlot && !sheetSlot.parentNode) sheet.insertBefore(sheetSlot, foot || null);
  }

  function start() {
    var nav = document.querySelector('header.ld-nav');
    if (!nav || !window.LudumSession) return;
    window.LudumSession.whoami().then(function (session) { render(nav, session); }, function () { render(nav, null); });
  }

  window.LudumAccountMenu = Object.freeze({ entries: entries, isOwnProfile: isOwnProfile, render: render });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
