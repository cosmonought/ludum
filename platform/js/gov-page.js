/* Ludum governance pages: the dispute register, the case page and the proposals page. No inline script (§2.4 CSP):
   each page loads ludum.js, gov.js and this file, and this file calls Ludum.enhance().
   Every value shown is a chain fact with its read time. A failed read shows "unavailable" and clears what was there,
   so nothing stale is ever shown as current. Chain text is set with textContent, never parsed as HTML. */
(function () {
  'use strict';
  var G = window.LudumGov;
  var P = G.PINS;
  var reader = G.makeReader();
  var state = { pins: null, wallet: null, governor: null, framed: !G.framingAllowed(window) };

  /* ---- DOM ---- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(id) { return document.getElementById(id); }
  function icon(name) { var s = document.createElement('span'); s.innerHTML = window.Ludum && Ludum.icon ? Ludum.icon(name) : ''; return s.firstChild; }
  function readTime(iso) { return h('span', { class: 'gv-read', text: iso ? 'read ' + iso.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : 'unavailable' }); }
  function unavailable(el, why) {
    clear(el).appendChild(h('div', { class: 'ld-empty', role: 'status' }, [h('p', null, [h('strong', { text: 'Unavailable' }),
      'The chain could not be read from this browser just now' + (why ? ' (' + why + ')' : '') + '. Nothing is shown rather than an old value. ',
      h('button', { class: 'gv-linkbtn', type: 'button', onclick: function () { location.reload(); }, text: 'Read again' })])]));
  }
  function why(e) { return (e && e.message ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 140); }
  function meta(rows) {
    return h('dl', { class: 'ld-meta gv-meta' }, rows.map(function (r) { return h('div', null, [h('dt', { text: r[0] }), h('dd', null, [r[1] == null ? 'unavailable' : r[1]])]); }));
  }
  function mono(text) { return h('span', { class: 'gv-mono', text: text == null ? 'unavailable' : String(text) }); }
  function ledger(title, label, heads, rows, note) {
    return h('figure', { class: 'ld-ledger ld-ledger--stack' }, [
      h('figcaption', { class: 'ld-ledger__cap' }, [h('span', { class: 'ld-ledger__title', text: title }), label ? h('span', { class: 'ld-label' }, [label]) : null]),
      h('div', { class: 'ld-ledger__scroll' }, [h('table', null, [
        h('thead', null, [h('tr', null, heads.map(function (x) { return h('th', { scope: 'col', class: x.num ? 'is-num' : null, text: x.t }); }))]),
        h('tbody', null, rows.map(function (cells) {
          return h('tr', null, cells.map(function (c, i) { return h('td', { 'data-label': heads[i].t, class: heads[i].num ? 'is-num' : i === 0 ? 'is-key' : null }, [c == null ? 'unavailable' : c]); }));
        }))
      ])]),
      note ? h('p', { class: 'ld-ledger__note', text: note }) : null
    ]);
  }
  function btn(label, onClick, opts) {
    opts = opts || {};
    var b = h('button', { type: 'button', class: 'ld-btn' + (opts.secondary ? ' ld-btn--secondary' : ''), onclick: function (e) { if (b.getAttribute('aria-disabled') !== 'true') onClick(e); } }, [label, icon('arrow-right')]);
    if (opts.disabled) { b.setAttribute('aria-disabled', 'true'); if (opts.title) b.title = opts.title; }
    return b;
  }
  function stateWord(s) { return typeof s === 'string' ? s.replace(/_/g, ' ') : 'unavailable'; }
  /* The case's status, from this browser's chain read and the proposals linked to it by decoding (gov-case.js). */
  function caseStatusText(st) {
    if (!st) return 'unavailable';
    var ids = function (list) { return list.map(function (x) { return '#' + x.id + ' ' + stateWord(x.status); }).join(', '); };
    if (st.kind === 'no-dispute') return 'No dispute: the game is ' + stateWord(st.state);
    if (st.kind === 'disputed') return 'Disputed · no live appeal proposal' + (st.proposals.length ? ' (earlier: ' + ids(st.proposals) + ')' : '');
    if (st.kind === 'appeal-pending') return 'Disputed · appeal pending: ' + ids(st.proposals);
    if (st.kind === 'resolved') return 'Resolved · ' + stateWord(st.resolution);
    if (st.kind === 'dispute-ended') return 'The dispute ended without a resolution record (the game is ' + stateWord(st.state) + ')';
    return 'unavailable';
  }
  function tsFacts(ns) { var s = G.nanosToSecs(ns); return { secs: s, iso: G.isoFromSecs(s) }; }

  /* ---- Countdowns: derived from a chain deadline and this browser's clock, ticking once a second. ---- */
  var ticking = [];
  function countdown(deadlineSecs) {
    var el = h('span', { class: 'gv-count' });
    function tick() {
      if (deadlineSecs == null) { el.textContent = 'unavailable'; return; }
      var left = deadlineSecs - Math.floor(Date.now() / 1000);
      el.textContent = left > 0 ? G.fmtDuration(left) + ' left' : 'passed';
    }
    tick(); ticking.push(tick);
    return el;
  }
  setInterval(function () { ticking.forEach(function (t) { t(); }); }, 1000);

  /* ---- Pins + wallet panel, shared by every page ---- */
  function renderPins() {
    var el = $('gv-pins'); if (!el) return;
    clear(el);
    if (!state.pins) { el.appendChild(h('p', { class: 'gv-status', text: 'Checking the Ludum DAO pins on ' + P.chainId + '…' })); return; }
    if (state.pins.error) { el.appendChild(h('p', { class: 'gv-status gv-status--bad' }, [h('strong', { text: 'Unavailable. ' }), 'The DAO could not be read (' + state.pins.error + '), so no action is offered.'])); return; }
    if (!state.pins.check.ok) {
      el.appendChild(h('div', { class: 'gv-status gv-status--bad', role: 'alert' }, [h('strong', { text: 'Configuration mismatch. ' }),
        'What the DAO reports on chain differs from the addresses this site pins, so this page stops and offers no action: ' + state.pins.check.problems.join('; ') + '.']));
      return;
    }
    el.appendChild(h('p', { class: 'gv-status' }, ['Ludum DAO on ' + P.chainId + ': modules match the pins. ', readTime(state.pins.observedAt)]));
  }
  function actionsAllowed() { return !!(state.pins && state.pins.check && state.pins.check.ok) && !state.framed; }

  function renderWallet() {
    var el = $('gv-wallet'); if (!el) return;
    clear(el);
    if (state.framed) {
      el.appendChild(h('p', { class: 'gv-status gv-status--bad' }, ['Actions are off while this page is framed by another site. ',
        h('a', { class: 'ld-link', href: location.href, target: '_blank', rel: 'noopener', text: 'Open in its own tab' })]));
      return;
    }
    if (!state.wallet) {
      el.appendChild(h('div', { class: 'gv-wallet-row' }, [
        btn('Connect Keplr', onConnect, { secondary: true, disabled: !actionsAllowed(), title: 'Available once the DAO pins are verified' }),
        h('p', { class: 'gv-hint', text: 'Governance powers come only from the wallet you connect: a member of the Ludum DAO’s cw4 group that the pre-propose module allows to propose. Site moderators get nothing here.' })
      ]));
      return;
    }
    var g = state.governor;
    var role = !g ? 'checking…' : g.error ? 'unavailable (' + g.error + ')' : g.governor ? 'Ludum DAO governor (weight ' + g.weight + ')' : g.member ? 'member, but the pre-propose module refuses proposals from it' : 'not a Ludum DAO member';
    el.appendChild(meta([['Keplr wallet', mono(state.wallet.address)], ['Governance', h('span', null, [role, ' ', g && !g.error ? readTime(g.observedAt) : null])]]));
  }
  function onConnect() {
    G.connect().then(function (w) {
      state.wallet = w; state.governor = null; renderWallet();
      return G.readGovernor(reader, w.address).then(function (g) { state.governor = g; }, function (e) { state.governor = { error: why(e) }; });
    }, function (e) { flash($('gv-wallet'), why(e)); }).then(function () { renderWallet(); rerender(); });
  }
  function flash(el, text) { if (el) el.appendChild(h('p', { class: 'gv-status gv-status--bad', role: 'alert', text: text })); }

  var rerender = function () {};

  /* ---- Transactions: show exactly what will be signed, simulate, then ask Keplr. ---- */
  function txPanel(host, spec, label, done) {
    clear(host);
    var out = h('div', { class: 'gv-tx' });
    host.appendChild(out);
    out.appendChild(h('p', { class: 'ld-label', text: label + ' · the message Keplr will be asked to sign' }));
    out.appendChild(h('pre', { class: 'gv-json', text: 'contract: ' + spec.contract + '\nfunds: []\nmsg: ' + JSON.stringify(spec.msg, null, 2) }));
    var status = h('p', { class: 'gv-status', role: 'status', text: 'Simulating on ' + P.chainId + '… (nothing is signed yet)' });
    out.appendChild(status);
    G.prepare(reader, spec, state.wallet).then(function (prep) {
      status.textContent = 'Simulation passed (gas used ' + prep.gasUsed + '). Keplr will show the same message and the network fee.';
      out.appendChild(btn('Sign in Keplr', function (ev) {
        ev.currentTarget.setAttribute('aria-disabled', 'true');
        status.textContent = 'Waiting for Keplr…';
        G.signAndBroadcast(reader, spec, state.wallet, prep).then(function (r) {
          status.textContent = r.pending ? 'Broadcast as ' + r.txhash + '; not yet seen in a block. Reload in a minute.' : 'Included at height ' + r.height + ' (' + r.txhash + ').';
          if (done) done(r);
        }, function (e) { status.textContent = why(e); status.className = 'gv-status gv-status--bad'; });
      }));
    }, function (e) {
      status.textContent = 'The simulation was refused, so Keplr was not asked: ' + why(e);
      status.className = 'gv-status gv-status--bad';
    });
  }

  /* ---- Linking proposals to games (link-by-decoding, §6) ---- */
  function linkIndex(proposals) {
    var byGame = {};
    proposals.forEach(function (p) {
      var d = G.decodeResolve(p.proposal);
      if (d) (byGame[d.chainGameId] = byGame[d.chainGameId] || []).push({ id: p.id, status: p.proposal.status, outcome: d.outcome });
    });
    return byGame;
  }
  function proposalLinks(list) {
    if (!list || !list.length) return 'none';
    return h('span', null, list.map(function (x, i) {
      return h('span', null, [i ? ', ' : '', h('a', { class: 'ld-link', href: '/governance/#proposal-' + x.id, text: '#' + x.id }), ' ' + x.outcome + ' · ' + stateWord(x.status)]);
    }));
  }

  /* ================= Register: /disputes/ ================= */
  function register() {
    var host = $('gv-register'), resolvedHost = $('gv-resolved');
    Promise.all([G.readAllGames(reader), G.readAllProposals(reader)]).then(function (r) {
      var games = r[0].games, links = linkIndex(r[1].proposals);
      var candidates = games.filter(function (g) { return g.state === 'disputed' || g.state === 'settled' || g.state === 'annulled'; });
      return Promise.all(candidates.map(function (g) { return reader.smart(P.escrow, { game: { chain_game_id: g.chain_game_id } }); })).then(function (full) {
        var open = [], resolved = [];
        full.forEach(function (f) {
          var game = f.data.game, d = game.dispute;
          if (!d) return;
          var row = { game: game, deadlines: f.data.deadlines, observedAt: f.observedAt };
          if (game.state === 'disputed') open.push(row); else if (d.resolution != null) resolved.push(row);
        });
        clear(host);
        host.appendChild(h('p', { class: 'gv-status' }, [games.length + ' escrow game' + (games.length === 1 ? '' : 's') + ' scanned, ' + open.length + ' disputed. ', readTime(r[0].observedAt)]));
        if (!open.length) host.appendChild(h('div', { class: 'ld-empty' }, [h('p', null, [h('strong', { text: 'No open disputes' }), 'No escrow game on ' + P.chainId + ' is disputed right now.'])]));
        else host.appendChild(ledger('Open disputes', 'escrow ' + P.escrowVersion, [{ t: 'Game' }, { t: 'State' }, { t: 'Resolver timeout' }, { t: 'Countdown' }, { t: 'Linked proposal' }, { t: 'Read' }],
          open.map(function (x) {
            var t = tsFacts(x.deadlines && x.deadlines.resolver_timeout_at);
            return [h('a', { class: 'ld-link', href: '/disputes/case/?id=' + x.game.chain_game_id, text: '#' + x.game.chain_game_id }), stateWord(x.game.state), mono(t.iso), countdown(t.secs), proposalLinks(links[String(x.game.chain_game_id)]), readTime(x.observedAt)];
          })));
        clear(resolvedHost);
        if (!resolved.length) resolvedHost.appendChild(h('div', { class: 'ld-empty' }, [h('p', null, [h('strong', { text: 'None resolved yet' }), 'No escrow dispute on ' + P.chainId + ' has been resolved.'])]));
        else resolvedHost.appendChild(ledger('Resolved disputes', null, [{ t: 'Game' }, { t: 'State' }, { t: 'Resolution' }, { t: 'Resolved at' }, { t: 'Linked proposal' }, { t: 'Read' }],
          resolved.map(function (x) {
            return [h('a', { class: 'ld-link', href: '/disputes/case/?id=' + x.game.chain_game_id, text: '#' + x.game.chain_game_id }), stateWord(x.game.state), stateWord(x.game.dispute.resolution), mono(tsFacts(x.game.dispute.resolved_at).iso), proposalLinks(links[String(x.game.chain_game_id)]), readTime(x.observedAt)];
          })));
      });
    }).catch(function (e) { unavailable(host, why(e)); unavailable(resolvedHost, why(e)); });
  }

  /* ================= Case: /disputes/case/?id= ================= */
  function casePage() {
    var host = $('gv-case'), actHost = $('gv-propose');
    var id = new URLSearchParams(location.search).get('id');
    if (!id || !/^(0|[1-9]\d{0,15})$/.test(id)) { clear(host).appendChild(h('div', { class: 'ld-empty' }, [h('p', null, [h('strong', { text: 'No game chosen' }), 'Open a case from the ', h('a', { class: 'ld-link', href: '/disputes/', text: 'dispute register' }), '.'])])); return; }
    var title = $('gv-case-title'); if (title) title.textContent = 'Escrow game #' + id;
    document.title = 'Escrow game #' + id + ' — Disputes — Ludum';
    var cid = Number(id);
    var facts = null, notFound = false;
    /* B2 (§5 `case`): the server record is fetched alongside the chain read and shown only once both have answered,
       checked against this browser's chain facts (gov-case.js). It never feeds renderPropose. */
    var chainRead = null, serverSeq = 0;
    var expect = { chainGameId: id, contract: P.escrow, chainId: P.chainId };
    var serverFirst = fetchServer();
    var chainDone = Promise.all([reader.smart(P.escrow, { game: { chain_game_id: cid } }), reader.smart(P.escrow, { seats: { chain_game_id: cid } }), G.readAllProposals(reader)]).then(function (r) {
      var gr = r[0].data, game = gr.game, d = game.dispute, at = r[0].observedAt;
      var seats = (r[1].data && r[1].data.seats) || [];
      var links = linkIndex(r[2].proposals)[id] || [];
      var rt = tsFacts(gr.deadlines && gr.deadlines.resolver_timeout_at);
      facts = { game: game, deadlines: gr.deadlines, resolverTimeoutSecs: rt.secs, observedAt: at };
      chainRead = { game: game, seats: seats, observedAt: at };
      clear(host);
      host.appendChild(h('p', { class: 'gv-status' }, ['Chain facts from escrow ' + P.escrow + ' on ' + P.chainId + '. ', readTime(at)]));
      host.appendChild(meta([['Case', caseStatusText(window.LudumCase ? LudumCase.caseStatus(game, links) : null)], ['State', stateWord(game.state)], ['Resolver', mono(game.resolver)], ['Pool', mono(G.fmtJunox(game.pool))], ['Ante (gross)', mono(G.fmtJunox(game.ante_gross))], ['Linked proposal', proposalLinks(links)]]));
      host.appendChild(h('h3', { class: 'gv-h3', text: 'Dispute' }));
      host.appendChild(d ? meta([['Challenger', mono(d.challenger)], ['Bond', mono(G.fmtJunox(d.bond))], ['Evidence hash', mono(d.evidence_hash)], ['Disputed at', mono(tsFacts(d.disputed_at).iso)], ['Resolution', d.resolution ? stateWord(d.resolution) + ' · ' + tsFacts(d.resolved_at).iso : 'none yet']])
        : h('p', { class: 'gv-hint', text: 'This game has no dispute record.' }));
      var dl = gr.deadlines || {};
      host.appendChild(h('h3', { class: 'gv-h3', text: 'Deadlines' }));
      host.appendChild(meta([['Resolver timeout', h('span', null, [mono(rt.iso), ' ', countdown(rt.secs)])], ['Funding deadline', mono(tsFacts(dl.funding_deadline).iso)], ['Challenge window end', mono(tsFacts(dl.challenge_window_end).iso)], ['Liveness from', mono(tsFacts(dl.liveness_available_at).iso)]]));
      host.appendChild(ledger('Seats', readTime(r[1].observedAt), [{ t: 'Seat' }, { t: 'Wallet' }, { t: 'Net deposit', num: true }, { t: 'Challenger' }],
        seats.map(function (s) { return [String(s.chain_seat_index), mono(s.seat.wallet), mono(G.fmtJunox(s.seat.net_deposit)), d && d.challenger === s.seat.wallet ? 'yes' : '']; })));
      host.appendChild(h('h3', { class: 'gv-h3', text: 'Stored settlement' }));
      host.appendChild(game.settlement ? payloadMeta(game.settlement.payload, [['Source', stateWord(game.settlement.source)], ['Accepted at', mono(tsFacts(game.settlement.accepted_at).iso)]]) : h('p', { class: 'gv-hint', text: 'No settlement is stored.' }));
      host.appendChild(h('h3', { class: 'gv-h3', text: 'Latest checkpoint' }));
      host.appendChild(gr.latest_checkpoint ? payloadMeta(gr.latest_checkpoint.payload, [['Accepted at', mono(tsFacts(gr.latest_checkpoint.accepted_at).iso)]]) : h('p', { class: 'gv-hint', text: 'No checkpoint was accepted.' }));
      renderPropose();
    }).catch(function (e) {
      facts = null; chainRead = null;
      notFound = /not found/i.test(why(e));
      if (notFound) clear(host).appendChild(h('div', { class: 'ld-empty' }, [h('p', null, [h('strong', { text: 'No such game' }), 'Escrow ' + P.escrow + ' has no game #' + id + '.'])]));
      else unavailable(host, why(e));
      renderPropose();
    });
    Promise.all([chainDone, serverFirst.promise]).then(function (r) { if (r[1].seq === serverSeq) renderServer(r[1].outcome); });

    /* ---- B2: the server record ---- */
    function fetchServer() {
      var seq = ++serverSeq;
      var promise = window.LudumCase ? LudumCase.fetchCase(window.LudumSession, id, expect) : Promise.resolve({ kind: 'no-client' });
      return { seq: seq, promise: promise.then(function (outcome) { return { seq: seq, outcome: outcome }; }) };
    }
    function rereadServer() {
      var el = $('gv-server'); if (!el) return;
      clear(el).appendChild(h('p', { class: 'gv-status', role: 'status', text: 'Reading the server record…' }));
      fetchServer().promise.then(function (r) { if (r.seq === serverSeq) renderServer(r.outcome); });
    }
    function serverNote(el, strong, text, retry) {
      clear(el).appendChild(h('div', { class: 'ld-empty', role: 'status', 'data-server-state': strong.replace(/[^A-Za-z]+/g, '-').replace(/-$/, '').toLowerCase() }, [h('p', null, [h('strong', { text: strong }), text + ' ',
        retry ? h('button', { class: 'gv-linkbtn', type: 'button', onclick: rereadServer, text: 'Read the server record again' }) : null])]));
    }
    function factText(f, fmt) {
      if (!f || f.provenance === 'unavailable') return h('span', null, ['unavailable', f && f.reason ? ' — ' + f.reason : '']);
      var src = f.provenance === 'server-recorded' ? 'server record' : f.provenance === 'chain-confirmed' ? 'server’s chain read (quorum)' : f.provenance === 'chain-observed' ? 'server’s chain read' : f.provenance;
      return h('span', null, [fmt ? fmt(f.value) : '', ' ', h('span', { class: 'gv-read gv-read--src', text: src + (f.observedAt ? ', read ' + f.observedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '') })]);
    }
    function renderServer(outcome) {
      var el = $('gv-server'); if (!el) return;
      var k = outcome && outcome.kind, detail = outcome && outcome.detail ? ' (' + outcome.detail + ')' : '';
      if (k === 'no-client') return serverNote(el, 'Not available here. ', 'This page has no connection to play.netadao.org, so only the chain facts are shown.', false);
      if (k === 'unreachable') return serverNote(el, 'Unavailable. ', 'play.netadao.org could not be reached from this browser. Nothing from the server is shown.', true);
      if (k === 'rate-limited') return serverNote(el, 'Busy. ', 'play.netadao.org asked this browser to slow down. Nothing from the server is shown.', true);
      if (k === 'unavailable') return serverNote(el, 'Unavailable. ', 'The server could not produce this record' + detail + '. Nothing from the server is shown.', true);
      if (k === 'bad-request') return serverNote(el, 'Refused. ', 'The server refused the request for game #' + id + detail + '.', false);
      if (k === 'unexpected') return serverNote(el, 'Unavailable. ', 'The server answered unexpectedly (HTTP ' + outcome.status + '). Nothing from it is shown.', true);
      if (k === 'not-found') return serverNote(el, 'No such game. ', chainRead ? 'The server reports no escrow game #' + id + ', but this browser read one from the chain. The two disagree, so nothing from the server is shown.' : 'The server also reports that escrow ' + P.escrow + ' has no game #' + id + '.', !!chainRead);
      if (k === 'invalid') return serverNote(el, 'Rejected. ', 'The server’s answer is not a valid case record for game #' + id + ', so none of it is shown: ' + outcome.problems.join('; ') + '.', true);
      if (k !== 'ok') return serverNote(el, 'Unavailable. ', 'The server record could not be read.', true);
      var rec = outcome.record, cross = LudumCase.crossCheck(rec, chainRead);
      if (cross.agree === false) return serverNote(el, 'Disagrees with the chain. ', 'The server’s record for game #' + id + ' does not match this browser’s chain read, so none of it is shown: ' + cross.problems.join('; ') + '.', true);
      clear(el);
      el.appendChild(h('p', { class: 'gv-status', 'data-server-state': cross.agree === null ? 'unchecked' : 'agrees' }, [cross.agree === null ? 'Not cross-checked: this browser could not read the chain, so the server’s record is shown as the server’s alone.' : 'Seats, challenger, bond and evidence hash agree with the chain facts above.'].concat(cross.notes.map(function (n) { return ' Note: ' + n + '.'; }))));
      var verdict = { 'server-log': 'the challenger’s evidence hash equals the server’s log hash', 'server-board': 'the challenger’s evidence hash equals the server’s terminal board hash', 'neither': 'the challenger’s evidence hash matches neither of the server’s hashes' };
      el.appendChild(meta([['Escrow state', factText(rec.escrow, stateWord)], ['Evidence', factText(rec.evidenceMatches, function (v) { return verdict[v]; })]]));
      el.appendChild(h('h3', { class: 'gv-h3', text: 'Server’s terminal record' }));
      var t = rec.serverTerminal;
      if (!t.value) el.appendChild(h('p', { class: 'gv-hint' }, [factText(t)]));
      else {
        el.appendChild(meta([['Ended by', mono(t.value.reason)], ['Log length', mono(t.value.logLen)], ['Log hash', mono(t.value.logHash)], ['Board hash', mono(t.value.appraisalStateHash)], ['Source', factText(t)]]));
        el.appendChild(ledger('Final net worth by seat', 'in-game dollars · not JUNOX', [{ t: 'Seat' }, { t: 'Wallet' }, { t: 'In-game $', num: true }],
          t.value.totalsBySeat.map(function (x) { return [String(x.chainSeatIndex), mono(rec.seats[x.chainSeatIndex].wallet), mono('$' + x.dollars)]; })));
      }
      el.appendChild(h('p', { class: 'gv-hint' }, [h('button', { class: 'gv-linkbtn', type: 'button', onclick: rereadServer, text: 'Read the server record again' })]));
    }

    function payloadMeta(p, extra) {
      return meta(extra.concat([['Seq', mono(p.seq)], ['Log hash', mono(p.log_hash)], ['Appraisal state hash', mono(p.appraisal_state_hash)], ['Weights', mono((p.settlement_weights || []).join(' · '))]]));
    }

    var choice = { outcome: null, voteYes: false };
    function renderPropose() {
      clear(actHost);
      var g = state.governor;
      var reasons = [];
      if (!state.pins || state.pins.error) reasons.push('the DAO pins are not verified');
      else if (!state.pins.check.ok) reasons.push('configuration mismatch');
      if (state.framed) reasons.push('this page is framed (open it in its own tab)');
      if (!facts) reasons.push(notFound ? 'the escrow has no game #' + id : 'the game’s chain facts are unavailable');
      else if (facts.game.state !== 'disputed') reasons.push('game #' + id + ' is not disputed (it is ' + stateWord(facts.game.state) + ')');
      if (!state.wallet) reasons.push('connect a Keplr wallet');
      else if (!g || g.error) reasons.push('the wallet’s membership is not yet read');
      else if (!g.governor) reasons.push('the connected wallet is not a Ludum DAO governor');
      var guard = facts ? G.deadlineGuard(facts.resolverTimeoutSecs, Math.floor(Date.now() / 1000), state.pins && state.pins.singleConfig && state.pins.singleConfig.max_voting_period ? state.pins.singleConfig.max_voting_period.time : P.maxVotingPeriodSecs) : null;
      if (guard && !guard.ok && facts.game.state === 'disputed') {
        actHost.appendChild(h('div', { class: 'gv-status gv-status--bad', role: 'alert' }, [h('strong', { text: 'Deadline guard. ' }), guard.reason]));
        reasons.push('the deadline guard refuses');
      }
      var ok = reasons.length === 0;
      actHost.appendChild(h('p', { class: 'gv-hint', text: ok ? 'Choose the resolution the DAO will vote on. The proposal goes to the pre-propose module with no funds; the escrow acts only if the vote passes and a member executes it.' : 'Not available: ' + reasons.join('; ') + '.' }));
      var pick = h('div', { class: 'gv-choices', role: 'group', 'aria-label': 'Resolution' });
      ['uphold', 'annul'].forEach(function (o) {
        var b = btn(G.OUTCOMES[o], function () { choice.outcome = o; renderPropose(); }, { secondary: true, disabled: !ok });
        b.setAttribute('aria-pressed', choice.outcome === o ? 'true' : 'false');
        pick.appendChild(b);
      });
      pick.appendChild(btn('Replace', function () {}, { secondary: true, disabled: true, title: 'Needs a SettlementPayloadV1 builder and owner sign-off' }));
      actHost.appendChild(pick);
      actHost.appendChild(h('p', { class: 'gv-hint', text: 'Replace is not offered: it needs a reviewed SettlementPayloadV1 builder and owner sign-off.' }));
      var cb = h('input', { type: 'checkbox', id: 'gv-voteyes', onchange: function () { choice.voteYes = cb.checked; } });
      cb.checked = choice.voteYes; cb.disabled = !ok;
      actHost.appendChild(h('label', { class: 'gv-check', for: 'gv-voteyes' }, [cb, ' Also vote yes in the same transaction (with today’s single member, the proposal then passes at once)']));
      var txHost = h('div');
      actHost.appendChild(btn('Prepare proposal', function () {
        if (!choice.outcome) { flash(txHost, 'Choose Uphold or Annul first.'); return; }
        var d = facts.game.dispute;
        var spec = G.buildPropose({ chainGameId: id, outcome: choice.outcome, voteYes: choice.voteYes, description: G.proposalDescription({
          chainGameId: id, outcome: choice.outcome, challenger: d && d.challenger, bond: d && d.bond, evidenceHash: d && d.evidence_hash,
          disputedAt: d && tsFacts(d.disputed_at).iso, resolverTimeoutAt: G.isoFromSecs(facts.resolverTimeoutSecs) }) });
        txPanel(txHost, spec, 'Create appeal proposal', function () { setTimeout(function () { location.reload(); }, 4000); });
      }, { disabled: !ok || !choice.outcome }));
      actHost.appendChild(txHost);
    }
    rerender = renderPropose;
  }

  /* ================= Proposals: /governance/ ================= */
  function governancePage() {
    var host = $('gv-proposals');
    G.readAllProposals(reader).then(function (r) {
      clear(host);
      host.appendChild(h('p', { class: 'gv-status' }, [r.proposals.length + ' proposal' + (r.proposals.length === 1 ? '' : 's') + ' on the single-choice module ' + P.proposalSingle + '. ', readTime(r.observedAt)]));
      if (!r.proposals.length) { host.appendChild(h('div', { class: 'ld-empty' }, [h('p', null, [h('strong', { text: 'No proposals yet' }), 'The Ludum DAO has no proposals on ' + P.chainId + '.'])])); return; }
      r.proposals.forEach(function (p) { host.appendChild(proposalCard(p, r.observedAt)); });
    }).catch(function (e) { unavailable(host, why(e)); });

    function proposalCard(item, observedAt) {
      var p = item.proposal, d = G.decodeResolve(p);
      var card = h('article', { class: 'gv-card', id: 'proposal-' + item.id });
      card.appendChild(h('header', { class: 'gv-card__head' }, [h('span', { class: 'ld-label', text: 'Proposal #' + item.id + ' · ' + stateWord(p.status) }), h('h3', { class: 'gv-h3', text: p.title })]));
      var v = p.votes || {};
      card.appendChild(meta([['Status', stateWord(p.status)], ['Yes / No / Abstain', mono([v.yes, v.no, v.abstain].join(' / '))], ['Total power', mono(p.total_power)], ['Proposer', mono(p.proposer)],
        ['Linked game', d ? h('a', { class: 'ld-link', href: '/disputes/case/?id=' + d.chainGameId, text: '#' + d.chainGameId + ' · ' + d.outcome }) : 'other proposal']]));
      card.appendChild(h('details', { class: 'gv-details' }, [h('summary', { text: 'Description and decoded messages' }), h('pre', { class: 'gv-json', text: p.description }), h('pre', { class: 'gv-json', text: decodedMsgs(p.msgs) })]));
      var votesHost = h('div', null, [h('p', { class: 'gv-hint', text: 'Reading votes…' })]);
      card.appendChild(votesHost);
      var actHost = h('div', { class: 'gv-actions' }), txHost = h('div');
      card.appendChild(actHost); card.appendChild(txHost);
      G.readVotes(reader, item.id).then(function (vr) {
        clear(votesHost).appendChild(vr.votes.length ? ledger('Votes', readTime(vr.observedAt), [{ t: 'Voter' }, { t: 'Vote' }, { t: 'Power', num: true }, { t: 'Rationale' }],
          vr.votes.map(function (x) { return [mono(x.voter), x.vote, mono(x.power), x.rationale || '']; })) : h('p', { class: 'gv-hint' }, ['No votes yet. ', readTime(vr.observedAt)]));
        function renderActions() {
          clear(actHost);
          var g = state.governor, member = g && !g.error && g.member && actionsAllowed();
          var voted = state.wallet && vr.votes.some(function (x) { return x.voter === state.wallet.address; });
          var note = !actionsAllowed() ? (state.framed ? 'Actions are off while framed.' : 'Actions are off until the DAO pins are verified.') : !state.wallet ? 'Connect a Keplr wallet that is a Ludum DAO member to act.' : !member ? 'The connected wallet is not a Ludum DAO member.' : null;
          if (note) { actHost.appendChild(h('p', { class: 'gv-hint', text: note })); return; }
          if (p.status === 'open') {
            if (voted) actHost.appendChild(h('p', { class: 'gv-hint', text: 'This wallet has voted; the DAO does not allow revoting.' }));
            else ['yes', 'no', 'abstain'].forEach(function (choice) { actHost.appendChild(btn('Vote ' + choice, function () { txPanel(txHost, G.buildVote(item.id, choice, null), 'Vote ' + choice + ' on #' + item.id, reloadSoon); }, { secondary: choice !== 'yes' })); });
          } else if (p.status === 'passed') actHost.appendChild(btn('Execute', function () { txPanel(txHost, G.buildExecute(item.id), 'Execute #' + item.id, reloadSoon); }));
          else if (p.status === 'rejected') actHost.appendChild(btn('Close', function () { txPanel(txHost, G.buildClose(item.id), 'Close #' + item.id, reloadSoon); }, { secondary: true }));
          else actHost.appendChild(h('p', { class: 'gv-hint', text: 'No action: the proposal is ' + stateWord(p.status) + '.' }));
        }
        renderActions();
        cardRenderers.push(renderActions);
      }, function (e) { unavailable(votesHost, why(e)); });
      return card;
    }
    var cardRenderers = [];
    rerender = function () { cardRenderers.forEach(function (f) { f(); }); };
  }
  function reloadSoon() { setTimeout(function () { location.reload(); }, 4000); }
  function decodedMsgs(msgs) {
    return (msgs || []).map(function (m, i) {
      var ex = m && m.wasm && m.wasm.execute, body = null;
      if (ex && typeof ex.msg === 'string') { try { body = JSON.parse(G.b64ToUtf8(ex.msg)); } catch (e) { body = '(undecodable)'; } }
      return '#' + (i + 1) + ' ' + JSON.stringify(ex ? { contract_addr: ex.contract_addr, funds: ex.funds, msg: body } : m, null, 2);
    }).join('\n') || '(no messages)';
  }

  /* ---- Start ---- */
  function start() {
    if (window.Ludum && typeof Ludum.enhance === 'function') Ludum.enhance();
    var page = document.body.getAttribute('data-gov-page');
    renderPins(); renderWallet();
    G.readLivePins(reader).then(function (live) { state.pins = live; }, function (e) { state.pins = { error: why(e) }; })
      .then(function () { renderPins(); renderWallet(); rerender(); });
    if (page === 'register') register();
    else if (page === 'case') casePage();
    else if (page === 'governance') governancePage();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
