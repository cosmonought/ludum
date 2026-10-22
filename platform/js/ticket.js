/* Ludum · LudumTicket -- the pieces the account pages are printed with (Ludum Profile, owner 2026-10-22): numbered steps
 * whose mark is a punch (an open ring to do, inked when done, red when it needs attention; the status beside it says the
 * same in words), the black KEY FIELD where everything that happens in Keplr sits, buttons that wait ("Waiting for
 * Keplr", three holes punching in turn, `aria-busy`), Show/Hide on a password, and the list of what Keplr's message must
 * name before it is approved. Plain DOM; everything from a server is set as text. Needs pass.js (LudumPass.el, svg).
 *
 *   LudumTicket.step(n, {label, labelFor, area})        {node, body, set(state, status), error(text), focusTarget}
 *   LudumTicket.input(id, {type, autocomplete, ...})    an input at the profile's size (ld-pinput)
 *   LudumTicket.reveal(input)                           its Show/Hide button
 *   LudumTicket.busy(button, text) / LudumTicket.idle(button)
 *   LudumTicket.blocked(button, why, onPress)           aria-disabled (still focusable) with its reason
 *   LudumTicket.check(rows)                             "Keplr shows a message to sign. Check that it names:" ...
 *   LudumTicket.wallet(address, extra)                  the wallet Keplr is on
 *   LudumTicket.msg(title, text)                        a problem in the key field (role="alert")
 *   LudumTicket.KEPLR_URL
 */
(function (root) {
  'use strict';
  var P = root.LudumPass;
  var el = P.el;
  var KEPLR_URL = 'https://www.keplr.app/';

  /** A numbered step. `state`: "todo" | "active" | "done" | "error"; `status`: {text, kind: "" | "ok" | "bad"} or null. */
  function step(n, opts) {
    var label = opts.labelFor ? el('label', { class: 'ld-step__label', for: opts.labelFor, text: opts.label }) : el('span', { class: 'ld-step__label', text: opts.label });
    var status = el('span', { class: 'ld-step__status' });
    var errorLine = el('p', { class: 'ld-step__error', hidden: true, id: opts.errorId || null, role: opts.errorRole || null });
    var body = el('div', { class: 'ld-step__body' }, [el('div', { class: 'ld-step__top' }, [label, status])]);
    var node = el('div', { class: 'ld-step is-todo' }, [el('span', { class: 'ld-step__mark', 'aria-hidden': 'true', text: String(n) }), body]);
    var api = {
      node: node, body: body, errorLine: errorLine,
      set: function (state, st) {
        node.className = 'ld-step is-' + state;
        status.textContent = st && st.text ? st.text : '';
        status.className = 'ld-step__status' + (st && st.kind ? ' is-' + st.kind : '');
        return api;
      },
      error: function (text) {
        errorLine.textContent = text || '';
        errorLine.hidden = !text;
        /* The design: the problem sits under the field, before the step's note. */
        if (text && !errorLine.parentNode) body.insertBefore(errorLine, body.querySelector(':scope > .ld-step__note'));
        return api;
      }
    };
    return api;
  }

  function input(id, opts) {
    var attrs = { class: 'ld-pinput' + (opts.name ? ' ld-pinput--name' : ''), id: id, name: opts.field || id, type: opts.type || 'text', autocomplete: opts.autocomplete || 'off', spellcheck: 'false', autocapitalize: 'none' };
    for (var k in opts.attrs || {}) attrs[k] = opts.attrs[k];
    return el('input', attrs);
  }

  function reveal(field) {
    var button = el('button', { class: 'ld-btn ld-btn--secondary ld-btn--s', type: 'button', 'aria-controls': field.id, 'aria-pressed': 'false', text: 'Show' });
    button.addEventListener('click', function () {
      var show = field.type === 'password';
      field.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', show ? 'true' : 'false');
      button.textContent = show ? 'Hide' : 'Show';
    });
    return button;
  }

  /** A button waits: its label is kept to be put back; it stays focusable and says so to assistive tech. */
  function busy(button, text) {
    if (button.getAttribute('data-label') === null) button.setAttribute('data-label', button.textContent);
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-disabled', 'true');
    button.textContent = text;
    button.appendChild(el('span', { class: 'ld-wait', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]));
  }
  function idle(button, text) {
    button.removeAttribute('aria-busy');
    button.removeAttribute('aria-disabled');
    var label = text || button.getAttribute('data-label');
    button.removeAttribute('data-label');
    if (label !== null) button.textContent = label;
  }
  function isWaiting(button) { return button.getAttribute('aria-busy') === 'true' || button.getAttribute('aria-disabled') === 'true'; }

  function check(rows) {
    return el('div', { class: 'ld-key__check' }, [
      el('p', { text: 'Keplr shows a message to sign. Check that it names:' }),
      el('ul', null, rows.map(function (r) { return el('li', null, [el('span', { text: r[0] }), r[1]]); })),
      el('p', { text: 'Approving it is a signature, not a transaction: nothing moves and there is no fee.' })
    ]);
  }

  function wallet(address, extra, label) {
    return el('dl', { class: 'ld-key__wallet' }, [el('dt', { text: label || 'Keplr wallet' }), el('dd', { title: address, text: root.LudumAuth ? root.LudumAuth.short(address) : address }), extra ? el('dd', { text: extra }) : null]);
  }

  function msg(title, text) { return el('div', { class: 'ld-key__msg', role: 'alert' }, [el('b', { text: title }), el('p', { text: text })]); }

  function getKeplr() { return el('a', { class: 'ld-btn ld-btn--secondary', href: KEPLR_URL, rel: 'noopener', target: '_blank' }, ['Get Keplr ', P.svg('<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 18 18 6M8 6h10v10"/></svg>')]); }

  /** The site a Keplr message names, as people read it ("ludum.netadao.org"). */
  function siteName() { return root.location ? root.location.host : 'ludum.netadao.org'; }

  root.LudumTicket = { step: step, input: input, reveal: reveal, busy: busy, idle: idle, isWaiting: isWaiting, check: check, wallet: wallet, msg: msg, getKeplr: getKeplr, siteName: siteName, KEPLR_URL: KEPLR_URL };
})(typeof window !== 'undefined' ? window : globalThis);
