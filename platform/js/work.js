/* Ludum · LudumWork -- the pieces of the work tabs (Moderation, Disputes), staff's Manage and the record pages (the case
 * file, the conduct case, an appeal, a new appeal), as the Ludum Profile design draws them (sections 16-18 of its
 * bundle.css, ported to platform/css/pass.css). Owner, 2026-10-23: Moderation and Disputes are tabs of your profile;
 * the record pages open on a record head printed on the pass's stock and use the work tabs' blocks.
 *
 * Every string from a server or the chain goes in as textContent; nothing here parses HTML except this file's own icons.
 *
 *   LudumWork.workhead(lede, standing)          one sentence of scope, and your standing as label / value pairs
 *   LudumWork.worknote(text)                    the one red-edged line, only when actions are off
 *   LudumWork.block(opts, children)             a block: Anton heading with its count and read time, then one note
 *   LudumWork.none(title, text, opts)           an empty or failed state, said in the block
 *   LudumWork.reading(text)                     three holes and what is being read
 *   LudumWork.state(text, kind)                 a row's state with its shape: "" ring, "due" square, "done" disc, "bad"
 *   LudumWork.yours(text)                       something that is yours to do (the yellow square)
 *   LudumWork.roles(roles)                      the role chips of one account (Admin inked, Moderator outlined)
 *   LudumWork.chips(label, filters, onPick)     pressed toggles with their counts, and the live count beside them
 *   LudumWork.ledger(opts)                      the work ledger (a table; each row a card of labelled facts on phones)
 *   LudumWork.cell(label, children, cls)        one ledger cell with its phone label
 *   LudumWork.workfoot(title, rows, links)      "how it works" (closed) and the way out
 *   LudumWork.recordHead(opts)                  the record head: a ticket on the pass's stock (main | perforation | stub)
 *   LudumWork.recsource(children), partynote(children), docket(items), facts(rows), twocol(a, b), stack(children),
 *   LudumWork.choices(opts), code(text, label), details(summary, children), sub(text)
 */
(function (root) {
  'use strict';

  var P = root.LudumPass;
  var el = P.el;
  var svg = P.svg;
  var ARROW_LEFT = '<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12H4M10 6l-6 6 6 6"/></svg>';
  var serial = 0;
  /** Replace a node's children (works in every DOM this site runs in, and in the tests' small one). */
  function fill(node, children) {
    while (node.firstChild) node.removeChild(node.firstChild);
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function nextId(prefix) { serial += 1; return prefix + '-' + serial; }

  function workhead(lede, standing) {
    return el('div', { class: 'ld-workhead' }, [
      el('p', { class: 'ld-workhead__lede', text: lede }),
      standing && standing.length ? el('dl', { class: 'ld-standing' }, standing.map(function (s) { return el('div', null, [el('dt', { text: s[0] }), el('dd', null, [s[1]])]); })) : null
    ]);
  }

  function worknote(text) { return el('p', { class: 'ld-worknote', role: 'alert' }, [el('span', null, [text])]); }

  /** opts: {id, title, count (string|number|null), read (string|null), note (string|null), head (extra node)} */
  function block(opts, children) {
    var id = opts.id || nextId('blk');
    var count = opts.count === null || opts.count === undefined || opts.count === '' ? null : el('span', { class: 'ld-block__count', text: String(opts.count) });
    return el('section', { class: 'ld-block', 'aria-labelledby': id }, [
      el('header', { class: 'ld-block__head' }, [el('h3', { id: id }, [opts.title, count]), opts.read ? el('p', { class: 'ld-block__read', text: opts.read }) : null, opts.head || null])
    ].concat(children || []).concat([opts.note ? el('p', { class: 'ld-block__note', text: opts.note }) : null]));
  }

  /** opts: {bad: boolean, action: node, role} */
  function none(title, text, opts) {
    opts = opts || {};
    return el('div', { class: 'ld-none' + (opts.bad ? ' is-bad' : ''), role: opts.role || (opts.bad ? 'alert' : null) }, [el('b', { text: title }), text ? el('p', { text: text }) : null, opts.action || null]);
  }

  function reading(text) {
    return el('p', { class: 'ld-reading', role: 'status' }, [el('span', { class: 'ld-wait', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]), text]);
  }

  function state(text, kind) { return el('span', { class: 'ld-state' + (kind ? ' is-' + kind : ''), text: text }); }
  function yours(text) { return el('span', { class: 'ld-yours', text: text }); }

  var ROLE_WORD = { admin: 'Admin', moderator: 'Moderator' };
  function roles(list) {
    var held = (list || []).filter(function (r) { return Object.prototype.hasOwnProperty.call(ROLE_WORD, r); });
    if (!held.length) return document.createTextNode('None');
    return el('span', { class: 'ld-roles' }, held.map(function (r) { return el('span', { class: 'ld-role' + (r === 'admin' ? ' ld-role--admin' : ''), text: ROLE_WORD[r] }); }));
  }

  /** filters: [{key, text, count}]; onPick(key). Returns {node, setCount(n, noun)}. The first filter starts pressed. */
  function chips(label, filters, onPick, noun) {
    var count = el('p', { class: 'ld-wfilters__count', 'aria-live': 'polite' });
    var group = el('div', { class: 'ld-chips', role: 'group', 'aria-label': label }, filters.map(function (f, i) {
      var b = el('button', { type: 'button', 'aria-pressed': i === 0 ? 'true' : 'false' }, [f.text + ' ', el('span', { text: String(f.count) })]);
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(group.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        onPick(f.key);
      });
      return b;
    }));
    return {
      node: el('div', { class: 'ld-wfilters' }, [group, count]),
      setCount: function (n) { count.textContent = n + ' ' + (n === 1 ? noun[0] : noun[1]); }
    };
  }

  function cell(label, children, cls) {
    return el('td', { class: cls || null }, [label ? el('span', { class: 'ld-cellk', 'aria-hidden': 'true', text: label }) : null].concat(children || []));
  }

  /** opts: {cls ("cases" | "team" | ...), wide, caption, columns: [{text, num, small, sr}], rows: [tr], empty: text} */
  function ledger(opts) {
    var head = el('tr', null, opts.columns.map(function (c) {
      return el('th', { scope: 'col', class: c.num ? 'is-num' : null }, c.sr ? [el('span', { class: 'ld-sr', text: c.text })] : [c.text, c.small ? el('small', { text: c.small }) : null]);
    }));
    var rows = opts.rows.length ? opts.rows : [el('tr', { class: 'ld-wl__empty' }, [el('td', { colspan: String(opts.columns.length), text: opts.empty || 'Nothing to show.' })])];
    return el('table', { class: 'ld-wl ' + (opts.wide ? 'ld-wl--wide' : 'ld-wl--stack') + (opts.cls ? ' ld-wl--' + opts.cls : '') }, [
      opts.caption ? el('caption', { class: 'ld-sr', text: opts.caption }) : null,
      el('thead', null, [head]),
      el('tbody', null, rows)
    ]);
  }

  /** "How it works" (closed), and the links out. rows: [[term, text]]; links: [node]. */
  function workfoot(title, rows, links) {
    return el('div', { class: 'ld-passfoot ld-workfoot' }, [
      el('details', { class: 'ld-how' }, [
        el('summary', null, [svg(P.PLUS), el('span', { text: title })]),
        el('dl', null, rows.map(function (r) { return el('div', null, [el('dt', { text: r[0] }), el('dd', null, [r[1]])]); }))
      ]),
      el('div', { class: 'ld-workfoot__links' }, links || [])
    ]);
  }

  function backLink(href, text) { return el('a', { class: 'ld-link ld-back', href: href }, [svg(ARROW_LEFT), text]); }

  /** The record head. opts: {back: {href, text}, staff, kicker, title, titleSize ("" | "m"), dek, facts: [[dt, dd node|string, small]], form, id} */
  function recordHead(opts) {
    var id = opts.id || nextId('rh');
    var top = el('div', { class: 'ld-rec__top' }, [opts.back ? backLink(opts.back.href, opts.back.text) : el('span'), opts.staff ? el('span', { class: 'ld-private ld-private--staff', style: 'padding:0', text: 'Only staff see this' }) : null]);
    var facts = el('dl', { class: 'ld-recfacts' }, (opts.facts || []).map(function (f) {
      return el('div', null, [el('dt', { text: f[0] }), el('dd', { class: f[3] ? 'is-fig' : null }, [f[1], f[2] ? el('small', { text: f[2] }) : null])]);
    }));
    return el('section', { class: 'ld-pass ld-ticket ld-rec' + (opts.form ? ' ld-rec--form' : ''), 'aria-labelledby': id }, [
      el('div', { class: 'ld-ticket__main' }, [el('div', { class: 'ld-rec__head' }, [
        top,
        opts.kicker ? el('p', { class: 'ld-rec__kicker', text: opts.kicker }) : null,
        el('h1', { class: 'ld-rec__title' + (opts.titleSize ? ' ld-rec__title--' + opts.titleSize : ''), id: id, tabindex: '-1' }, [opts.title]),
        opts.dek ? el('p', { class: 'ld-rec__dek' }, [opts.dek]) : null
      ])]),
      el('div', { class: 'ld-pass__perf', 'aria-hidden': 'true' }, [el('i')]),
      el('div', { class: 'ld-ticket__stub' }, [facts])
    ]);
  }

  function recsource(children) { return el('p', { class: 'ld-recsource' }, children); }
  function partynote(children) { return el('p', { class: 'ld-partynote' }, children); }

  /** items: [{when: [bold, rest], what (string|node), line, by, aside (node), kind: "" | "now" | "due"}] */
  function docket(items) {
    return el('ol', { class: 'ld-rdocket' }, items.map(function (d) {
      return el('li', { class: d.kind ? 'is-' + d.kind : null }, [
        el('p', { class: 'ld-rdocket__when' }, [el('b', { text: d.when[0] }), d.when[1] || null]),
        el('span', { class: 'ld-rdocket__mark', 'aria-hidden': 'true' }),
        el('div', { class: 'ld-rdocket__main' }, [el('p', { class: 'ld-rdocket__what' }, [d.what]), d.line ? el('p', { class: 'ld-rdocket__line', text: d.line }) : null, d.by ? el('span', { class: 'ld-rdocket__by', text: d.by }) : null]),
        el('div', { class: 'ld-rdocket__aside' }, d.aside ? [d.aside] : [])
      ]);
    }));
  }

  /** rows: [[term, value node|string]] */
  function facts(rows) { return el('dl', { class: 'ld-rfacts' }, rows.filter(Boolean).map(function (r) { return el('div', null, [el('dt', { text: r[0] }), el('dd', null, [r[1]])]); })); }
  function twocol(a, b) { return el('div', { class: 'ld-ptwocol' }, [a, b]); }
  function stack(children) { return el('div', { class: 'ld-pstack' }, children); }
  function sub(text) { return el('p', { class: 'ld-sub', text: text }); }

  /** opts: {legend, legendSr, name, row, options: [{value, name, line, disabled, why, checked}], onChange(value)} */
  function choices(opts) {
    return el('fieldset', { class: 'ld-pchoices' + (opts.row ? ' ld-pchoices--row' : ''), style: opts.row ? '--n:' + opts.options.length : null }, [
      el('legend', { class: opts.legendSr ? 'ld-sr' : null, text: opts.legend })
    ].concat(opts.options.map(function (o) {
      var input = el('input', { type: 'radio', name: opts.name, value: o.value, checked: o.checked ? true : null, disabled: o.disabled ? true : null });
      if (o.checked) input.checked = true;
      input.addEventListener('change', function () { if (opts.onChange) opts.onChange(o.value); });
      return el('label', { class: 'ld-pchoice' + (o.disabled ? ' is-disabled' : '') }, [input, el('span', { class: 'ld-pchoice__box', 'aria-hidden': 'true' }), el('span', { class: 'ld-pchoice__name', text: o.name }), el('span', { class: 'ld-pchoice__line', text: o.disabled && o.why ? o.why : o.line || '' })]);
    })));
  }

  function code(text, label) { return el('pre', { class: 'ld-pcode', tabindex: '0', role: 'region', 'aria-label': label || 'Message', text: text }); }

  function details(summary, children, open) {
    return el('details', { class: 'ld-details', open: open ? true : null }, [el('summary', null, [svg(P.PLUS), el('span', { text: summary })])].concat(children));
  }

  /**
   * A work tab's top, exactly as /me/ draws its own: YOUR pass (its shell at once, the figures when `profile` answers),
   * the line under it, and the tab row with this tab current. The Disputes tab is drawn from this account's remembered
   * DAO membership at once and corrected when the chain answers (records.js `checkMembership`: no Keplr). Returns
   * {setCounts({moderation, disputes})} so the panel can put its counts beside the work tabs once it has read them.
   */
  function profileTop(slot, session, who, current) {
    var R = root.LudumRecords;
    var passSlot = el('div', null, [P.pass(null, { name: who.account.name })]);
    var counts = {};
    var dao = R.rememberedMember(root.localStorage, Date.now(), R.accountOf(who));
    var tabsSlot = el('div');
    function drawTabs() { fill(tabsSlot, [P.tabsRow(who, current, { daoMember: dao, moderation: counts.moderation, disputes: counts.disputes })]); }
    drawTabs();
    fill(slot, [passSlot, P.passFoot(), tabsSlot]);
    session.api('profile', {}).then(function (profile) { fill(passSlot, [P.pass(P.figuresOfProfile(profile, who))]); }, function () { /* the shell stays */ });
    R.checkMembership(who).then(function (member) { if (member !== null && !!member !== !!dao) { dao = member; drawTabs(); } });
    return {
      setCounts: function (next) {
        Object.keys(next || {}).forEach(function (k) { counts[k] = next[k]; });
        drawTabs();
      }
    };
  }

  var api = {
    fill: fill,
    profileTop: profileTop,
    workhead: workhead, worknote: worknote, block: block, none: none, reading: reading, state: state, yours: yours, roles: roles,
    chips: chips, ledger: ledger, cell: cell, workfoot: workfoot, recordHead: recordHead, recsource: recsource, partynote: partynote,
    docket: docket, facts: facts, twocol: twocol, stack: stack, sub: sub, choices: choices, code: code, details: details, backLink: backLink
  };
  root.LudumWork = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
