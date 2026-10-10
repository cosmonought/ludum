/* Ludum · LudumRecords — the shared pieces of the records pages (/me/, /me/account/, /me/game/, /moderation/), built
 * from the records layer's components (platform/css/records.css): the record head, the profile tabs, stamps, amounts,
 * shortened ids and hashes, notices and the docket.
 *
 * Everything from a server or the chain goes in as textContent: nothing here parses a string as HTML. Icons are the
 * design system's own paths (Ludum.icon), never data.
 *
 * The profile tabs follow the two-authorities rule (design handoff §3): Moderation is drawn only for a conduct reviewer
 * (the signed-in account, `session.roles.reviewer`, decided by the server), Appeals & Disputes only when the chain says
 * the SIGNED-IN ACCOUNT's Authorization Wallet -- or a Keplr wallet this account connected on the governance pages -- is a
 * Ludum DAO member. That answer is read automatically (no Keplr needed: the cw4 group's public `member` query), kept for
 * ten minutes in this browser UNDER THIS ACCOUNT'S USERNAME, and never used for another account: a different account
 * signing in on the same browser reads its own. It only draws a tab; every governance action re-reads the chain, and a
 * transaction still needs Keplr. The pages never merge the two authorities.
 */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAO_MEMBER_KEY = 'ludum.daoMembership.v2';
  /** v1's key: one wallet for whoever used the browser. Never read; removed on sight. */
  var LEGACY_DAO_MEMBER_KEY = 'ludum.daoMember';
  var DAO_MEMBER_TTL_MS = 10 * 60 * 1000;
  /* The chain read for the tab (the same pins as platform/js/gov.js; pinned equal by platform/tests/membership.test.mjs). */
  var CHAIN_REST = 'https://juno.api.t.stavr.tech';
  var CW4_GROUP = 'juno13dvggejlcz6nxn8kzzhr2m0e94r7adepr9crclum82uv7eyegftq2yz5up';
  var JUNO_ADDRESS = /^juno1[02-9ac-hj-np-z]{38}$/;

  /* ---------- pure formatting (pinned by platform/tests/records.test.mjs) ---------- */

  /** "9 Oct 2026" (UTC) of an ISO instant, or "—". */
  function day(iso) {
    var ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!isFinite(ms)) return '—';
    var d = new Date(ms);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  /** "18:05 UTC" of an ISO instant, or "". */
  function clock(iso) {
    var ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!isFinite(ms)) return '';
    var d = new Date(ms);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC';
  }
  /** "Aug 2026" of "2026-08". */
  function month(yyyyMm) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(yyyyMm || ''));
    return m ? MONTHS[Number(m[2]) - 1] + ' ' + m[1] : '—';
  }
  /** "g_xfqa37…dn2g": the first 8 and last 4 characters of a long id (the full one goes in `title`). */
  function shortId(id) {
    var s = String(id || '');
    return s.length > 14 ? s.slice(0, 8) + '…' + s.slice(-4) : s;
  }
  /** "51AD…07C3": a hash's first and last four. */
  function shortHash(hash) {
    var s = String(hash || '');
    return s.length > 10 ? s.slice(0, 4) + '…' + s.slice(-4) : s;
  }
  /** "juno1x7…m0qe": a bech32 address shortened. */
  function shortAddress(address) {
    var s = String(address || '');
    return s.length > 14 ? s.slice(0, 7) + '…' + s.slice(-4) : s;
  }
  /** Integer base units → "11.223333" (trailing zeros after two places dropped), with an optional sign. */
  function junox(amount, signed) {
    var s = String(amount);
    if (!/^-?\d+$/.test(s)) return '—';
    var neg = s.charAt(0) === '-';
    var digits = (neg ? s.slice(1) : s).replace(/^0+(?=\d)/, '');
    while (digits.length < 7) digits = '0' + digits;
    var whole = digits.slice(0, -6).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var frac = digits.slice(-6).replace(/0+$/, '');
    while (frac.length < 2) frac += '0';
    var zero = /^0+$/.test(digits);
    var text = whole + '.' + frac;
    if (zero) return text;
    if (neg) return '−' + text;
    return signed ? '+' + text : text;
  }
  /** The class of a signed amount: gain, loss or zero. */
  function amountClass(amount) {
    var s = String(amount);
    if (!/^-?\d+$/.test(s) || /^-?0+$/.test(s)) return 'ld-amt ld-amt--zero';
    return s.charAt(0) === '-' ? 'ld-amt ld-amt--loss' : 'ld-amt ld-amt--gain';
  }
  /** "1st", "2nd", "3rd", "4th"… */
  function ordinal(n) {
    var v = n % 100;
    return n + (v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
  }
  /** "$6,420" in-game dollars (never JUNOX). */
  function dollars(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return (n < 0 ? '−$' : '$') + String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  /** Whole days from now until an ISO instant (negative once past). */
  function daysUntil(iso, nowMs) {
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return null;
    return Math.ceil((ms - nowMs) / 86400000);
  }
  /** What a provenance means, in the house's words. */
  function provenanceText(fact) {
    var p = fact && fact.provenance;
    var text = p === 'chain-confirmed' ? 'Confirmed on Juno' : p === 'chain-observed' ? 'Read from Juno' : p === 'server-recorded' ? 'Play’s record' : p === 'pending' ? 'Pending' : 'Unavailable';
    if (fact && fact.height) text += ' at height ' + fact.height;
    if (fact && fact.reason) text += ': ' + fact.reason;
    return text;
  }

  /* ---------- the tabs' rule (pure) ---------- */

  /** The profile tabs this visitor sees, in order. `current` is one of "record" | "account" | "moderation" | "appeals". */
  function profileTabs(session, daoMember, current) {
    var tabs = [{ key: 'record', href: '/me/', text: 'Your record' }, { key: 'account', href: '/me/account/', text: 'Your account' }];
    if (session && session.signedIn === true && session.roles && session.roles.reviewer === true) tabs.push({ key: 'moderation', href: '/moderation/', text: 'Moderation' });
    if (daoMember) tabs.push({ key: 'appeals', href: '/disputes/', text: 'Appeals & Disputes' });
    return tabs.map(function (t) { return { key: t.key, href: t.href, text: t.text, current: t.key === current }; });
  }

  function accountOf(session) { return session && session.signedIn === true && session.account && typeof session.account.username === 'string' ? session.account.username : null; }

  /** This account's remembered membership entry, or null: {account, member, keplr, checkedAt}. Another account's entry,
   *  a malformed one or v1's key is never returned (v1's is removed). */
  function membershipEntry(storage, nowMs, account, anyAge) {
    try {
      if (storage && storage.getItem(LEGACY_DAO_MEMBER_KEY) !== null) storage.removeItem(LEGACY_DAO_MEMBER_KEY);
      if (typeof account !== 'string' || account === '') return null;
      var raw = storage && storage.getItem(DAO_MEMBER_KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || v.account !== account || typeof v.member !== 'boolean' || typeof v.checkedAt !== 'number') return null;
      if (v.keplr !== null && !(typeof v.keplr === 'string' && JUNO_ADDRESS.test(v.keplr))) return null;
      if (!anyAge && (nowMs - v.checkedAt > DAO_MEMBER_TTL_MS || v.checkedAt > nowMs)) return null;
      return { account: v.account, member: v.member, keplr: v.keplr, checkedAt: v.checkedAt };
    } catch (e) { return null; }
  }
  /** Whether to draw Appeals & Disputes for THIS account from what is remembered (fresh, this account's): {checkedAt} or
   *  null. `account` is the signed-in username; without it nothing is drawn. */
  function rememberedMember(storage, nowMs, account) {
    var v = membershipEntry(storage, nowMs, account, false);
    return v && v.member ? { checkedAt: v.checkedAt } : null;
  }
  function writeEntry(storage, entry) {
    try { storage.setItem(DAO_MEMBER_KEY, JSON.stringify(entry)); } catch (e) { /* storage off: the tab waits for the chain */ }
  }
  /** The governance pages: the chain just said the Keplr wallet `address` is (or, null, is not) a member -- remembered for
   *  the signed-in `account` only (signed out: nothing is remembered). */
  function rememberMember(storage, address, nowMs, account) {
    if (typeof account !== 'string' || account === '') return;
    if (address !== null && JUNO_ADDRESS.test(address)) { writeEntry(storage, { account: account, member: true, keplr: address, checkedAt: nowMs }); return; }
    /* Not a member with that wallet: the account's own Authorization Wallet may still be one -- re-read next time. */
    writeEntry(storage, { account: account, member: false, keplr: null, checkedAt: 0 });
  }
  /** Sign-out: the entry goes (and v1's key, if any). */
  function forgetMembership(storage) {
    try { storage.removeItem(DAO_MEMBER_KEY); storage.removeItem(LEGACY_DAO_MEMBER_KEY); } catch (e) { /* nothing kept */ }
  }

  function base64(text) {
    if (typeof root.btoa === 'function') return root.btoa(unescape(encodeURIComponent(text)));
    return Buffer.from(text, 'utf8').toString('base64');
  }
  /** The cw4 group's weight for `address` > 0 (the chain's public read; no wallet, no Keplr). */
  function chainMember(fetcher, address) {
    var url = CHAIN_REST + '/cosmwasm/wasm/v1/contract/' + CW4_GROUP + '/smart/' + encodeURIComponent(base64(JSON.stringify({ member: { addr: address } })));
    return fetcher(url, { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error' }).then(function (r) {
      if (!r || !r.ok) throw new Error('chain read ' + (r && r.status));
      return r.json();
    }).then(function (j) {
      var w = j && j.data ? j.data.weight : undefined;
      if (w === null) return false;
      var n = typeof w === 'number' ? w : typeof w === 'string' && /^\d+$/.test(w) ? Number(w) : NaN;
      if (!isFinite(n)) throw new Error('chain read: not a weight');
      return n > 0;
    });
  }
  /** v1.2: is the SIGNED-IN account a Ludum DAO member? Its Authorization Wallet (from the session) and any Keplr wallet
   *  it connected (remembered under it) are read on chain -- automatically, no Keplr. Resolves true / false, or null when
   *  it could not be read (nothing is drawn then). A fresh remembered answer for this account is used as is. */
  function checkMembership(session, options) {
    options = options || {};
    var storage = options.storage !== undefined ? options.storage : root.localStorage;
    var now = options.now !== undefined ? options.now : Date.now();
    var fetcher = options.fetch || (root.fetch ? root.fetch.bind(root) : null);
    var account = accountOf(session);
    if (account === null) return Promise.resolve(false);
    var fresh = membershipEntry(storage, now, account, false);
    if (fresh) return Promise.resolve(fresh.member);
    var known = membershipEntry(storage, now, account, true);
    var wallets = [];
    var auth = session.account.authorizationWallet;
    if (auth && typeof auth.address === 'string' && JUNO_ADDRESS.test(auth.address)) wallets.push(auth.address);
    if (known && known.keplr && wallets.indexOf(known.keplr) === -1) wallets.push(known.keplr);
    if (wallets.length === 0) { writeEntry(storage, { account: account, member: false, keplr: null, checkedAt: now }); return Promise.resolve(false); }
    if (!fetcher) return Promise.resolve(null);
    return Promise.all(wallets.map(function (w) { return chainMember(fetcher, w).then(function (m) { return m ? w : null; }); })).then(function (found) {
      var member = found.some(function (w) { return w !== null; });
      var keplr = known && known.keplr && found.indexOf(known.keplr) !== -1 ? known.keplr : null;
      writeEntry(storage, { account: account, member: member, keplr: keplr, checkedAt: now });
      return member;
    }, function () { return null; });
  }


  /* ---------- DOM ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (children || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  /** One of the design system's icons (its own markup, never data). */
  function icon(name, cls) {
    var span = document.createElement('span');
    span.innerHTML = root.Ludum && root.Ludum.icon ? root.Ludum.icon(name, cls) : '';
    return span.firstChild || document.createTextNode('');
  }
  /** A record stamp. `kind`: "" (live), "closed", "held" or "failed". */
  function stamp(text, kind, href) {
    var cls = 'ld-stamp ld-stamp--rec' + (kind ? ' ld-stamp--' + kind : '') + ' ld-stamp--s';
    return href ? el('a', { class: cls + ' ld-stamp--link', href: href, text: text }) : el('span', { class: cls, text: text });
  }
  function idSpan(id) { return el('span', { class: 'ld-id', title: String(id), text: shortId(id) }); }
  function hashSpan(hash) { return el('span', { class: 'ld-hash', title: String(hash), text: shortHash(hash) }); }
  /** A ledger cell: the value, and a quiet line under it. */
  function val(main, sub) { return el('span', { class: 'ld-ledger__val' }, [main, sub ? el('span', { class: 'ld-ledger__sub' }, [sub]) : null]); }
  function td(label, children, cls) { return el('td', { 'data-label': label, class: cls || null }, children); }
  /** A Notice: a sentence that changes what the reader can do here. `kind`: "", "due", "wait" or "stop". */
  function notice(label, text, kind, action) {
    return el('div', { class: 'ld-notice' + (kind ? ' ld-notice--' + kind : ''), role: kind === 'stop' ? 'alert' : 'status' }, [
      el('p', { class: 'ld-notice__label', text: label }),
      el('p', { class: 'ld-notice__text', text: text }),
      action ? el('div', { class: 'ld-notice__act' }, [action]) : null
    ]);
  }
  /** The record head: kicker, title, dek and the meta strip. */
  function rechead(opts) {
    var kicker = el('div', { class: 'ld-rechead__kicker' }, opts.back
      ? [el('a', { class: 'ld-link ld-link--back', href: opts.back.href }, [icon('arrow-left'), opts.back.text]), opts.muted ? el('span', { class: 'ld-label ld-muted', text: opts.muted }) : null]
      : [el('span', { class: 'ld-label', text: opts.kicker || 'Profile' }), opts.muted ? el('span', { class: 'ld-label ld-muted', text: opts.muted }) : null]);
    var meta = opts.meta && opts.meta.length ? el('dl', { class: 'ld-meta' }, opts.meta.map(function (m) { return el('div', null, [el('dt', { text: m[0] }), el('dd', null, [m[1]])]); })) : null;
    return el('header', { class: 'ld-wrap ld-rechead' }, [
      kicker,
      el('div', { class: 'ld-rechead__row' }, [
        el('h1', { class: 'ld-rechead__title' + (opts.titleClass ? ' ' + opts.titleClass : '') }, [opts.no ? el('span', { class: 'ld-rechead__no' }, [opts.no]) : null, opts.title]),
        el('div', null, [opts.dek ? el('p', { class: 'ld-rechead__dek', text: opts.dek }) : null, meta])
      ])
    ]);
  }
  function tabsNav(tabs) {
    return el('div', { class: 'ld-wrap ld-rectabs' }, [el('nav', { class: 'ld-tabs', 'aria-label': 'Profile' }, tabs.map(function (t) {
      return el('a', { href: t.href, 'aria-current': t.current ? 'page' : null, text: t.text });
    }))]);
  }
  /** A records section: number, title and dek, then the body. */
  function section(no, id, title, dek, body, extraClass) {
    return el('section', { class: 'ld-section ld-section--rec' + (extraClass ? ' ' + extraClass : ''), 'aria-labelledby': id }, [el('div', { class: 'ld-wrap' }, [
      el('header', { class: 'ld-sechead ld-sechead--s' }, [el('span', { class: 'ld-sechead__no', text: no }), el('h2', { class: 'ld-sechead__title', id: id, text: title }), dek ? el('p', { class: 'ld-sechead__dek', text: dek }) : null])
    ].concat(body))]);
  }
  /** A stacked ledger: caption, header row and body rows. `columns`: [label, numeric?, unit?]. */
  function ledger(opts) {
    var head = el('tr', null, opts.columns.map(function (c) {
      return el('th', { scope: 'col', class: c[1] ? 'is-num' : null }, [c[0], c[2] ? el('span', { class: 'ld-ledger__unit', text: c[2] }) : null]);
    }));
    var parts = [el('thead', null, [head]), el('tbody', null, opts.rows)];
    if (opts.foot) parts.push(el('tfoot', null, [opts.foot]));
    return el('figure', { class: 'ld-ledger ld-ledger--stack' }, [
      opts.title ? el('figcaption', { class: 'ld-ledger__cap' }, [el('span', { class: 'ld-ledger__title', text: opts.title }), opts.unit ? el('span', { class: 'ld-label-s ld-muted', text: opts.unit }) : null]) : null,
      /* A scroll region a keyboard can reach (WCAG 2.1.1: axe scrollable-region-focusable). */
      el('div', { class: 'ld-ledger__scroll', tabindex: '0', role: 'region', 'aria-label': opts.title || opts.label || 'Table' }, [el('table', null, parts)]),
      opts.note ? el('p', { class: 'ld-ledger__note', text: opts.note }) : null
    ]);
  }
  /** The row arrow ("Open"). */
  function go(href) { return el('td', { class: 'ld-ledger__go', 'data-label': '' }, [href ? el('a', { href: href, 'aria-label': 'Open' }, [icon('arrow-right')]) : null]); }
  /** A docket item. */
  function docketItem(d) {
    return el('li', { class: 'ld-docket__item' }, [
      el('p', { class: 'ld-docket__when', style: 'margin:0' }, [el('b', { text: day(d.at) }), clock(d.at)]),
      el('span', { class: 'ld-docket__mark', 'aria-hidden': 'true' }),
      el('div', { class: 'ld-docket__main' }, [el('p', { class: 'ld-docket__what', text: d.what }), d.line ? el('p', { class: 'ld-docket__line', text: d.line }) : null, d.by ? el('span', { class: 'ld-docket__by' }, d.by) : null]),
      el('div', { class: 'ld-docket__aside' }, d.aside ? [d.aside] : [])
    ]);
  }
  /** A Mintscan-free receipt link: the chain's own REST view of one transaction. */
  function txHref(hash) { return 'https://juno.api.t.stavr.tech/cosmos/tx/v1beta1/txs/' + encodeURIComponent(String(hash)); }

  /** Mount the page's record head and tabs in `slot` once the session is known; the Appeals tab follows the chain's
   *  answer for THIS account (drawn at once from a fresh remembered answer, then corrected when the chain answers). */
  function profileFrame(slot, session, current, head) {
    slot.textContent = '';
    slot.appendChild(rechead(head));
    var nav = tabsNav(profileTabs(session, rememberedMember(root.localStorage, Date.now(), accountOf(session)), current));
    slot.appendChild(nav);
    checkMembership(session).then(function (member) {
      if (member === null || !nav.parentNode) return;
      var drawn = !!nav.querySelector('a[href="/disputes/"]');
      if (drawn !== member) { var next = tabsNav(profileTabs(session, member, current)); nav.parentNode.replaceChild(next, nav); nav = next; }
    });
  }

  var api = {
    day: day, clock: clock, month: month, shortId: shortId, shortHash: shortHash, shortAddress: shortAddress, junox: junox, amountClass: amountClass,
    ordinal: ordinal, dollars: dollars, daysUntil: daysUntil, provenanceText: provenanceText, profileTabs: profileTabs,
    rememberedMember: rememberedMember, rememberMember: rememberMember, forgetMembership: forgetMembership, checkMembership: checkMembership,
    membershipEntry: membershipEntry, accountOf: accountOf, DAO_MEMBER_KEY: DAO_MEMBER_KEY, LEGACY_DAO_MEMBER_KEY: LEGACY_DAO_MEMBER_KEY,
    DAO_MEMBER_TTL_MS: DAO_MEMBER_TTL_MS, CHAIN_REST: CHAIN_REST, CW4_GROUP: CW4_GROUP,
    el: el, icon: icon, stamp: stamp, idSpan: idSpan, hashSpan: hashSpan, val: val, td: td, notice: notice, rechead: rechead, tabsNav: tabsNav,
    section: section, ledger: ledger, go: go, docketItem: docketItem, txHref: txHref, profileFrame: profileFrame
  };
  root.LudumRecords = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
