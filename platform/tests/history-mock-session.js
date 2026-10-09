/* Ludum · a LOCAL MOCK of LudumSession for /me/ (Lane C), used until Lane A's platform/js/session.js lands.
   Test-only: loaded by platform/tests/history-harness.html and platform/tests/history.test.mjs, never by a real page.
   The fixtures have the exact §5 shapes the server's history routes answer (server/src/ludum/history), including
   every provenance, a withdrawn seat, a dispute and a no-money table. */
(function (root) {
  'use strict';
  var H = '2026-10-09T12:00:00.000Z';
  var product = { key: 'project-18xx', name: 'Project 18XX' };
  function j(amount) { return { amount: amount, denom: 'ujunox' }; }
  function chain(value) { return { value: value, provenance: 'chain-confirmed', height: '4821337', observedAt: H }; }
  function server(value) { return { value: value, provenance: 'server-recorded' }; }
  function none(reason) { return { value: null, provenance: 'unavailable', reason: reason }; }

  var settled = {
    gameId: 'g_0000000000000000000000001', joinCode: null, product: product, variant: 'standard · live · delayed auction',
    table: server('completed'), createdAt: '2026-10-08T18:00:00.000Z', startedAt: '2026-10-08T18:05:00.000Z', endedAt: '2026-10-08T21:40:00.000Z',
    seat: { displayName: 'Alice', chainSeatIndex: 0 }, playerCount: 3,
    money: { chainGameId: '7', contract: 'juno19vd5hphghprl2m8agchctyav8pmeh6p4x3vud6cfhd2y6ulwtf0s0jrk7x', chainId: 'uni-7', escrow: chain('settled'), anteGross: j('2000000'), net: chain(j('1336628')) },
    inGame: { rank: server(1), finalNetWorth: server({ dollars: 7400 }) }, disputed: chain(false)
  };
  var disputed = {
    gameId: 'g_0000000000000000000000002', joinCode: null, product: product, variant: 'short · async',
    table: server('completed'), createdAt: '2026-10-07T09:00:00.000Z', startedAt: '2026-10-07T09:10:00.000Z', endedAt: '2026-10-07T13:00:00.000Z',
    seat: { displayName: 'Alice', chainSeatIndex: 1 }, playerCount: 3,
    money: { chainGameId: '5', contract: settled.money.contract, chainId: 'uni-7', escrow: chain('disputed'), anteGross: j('2000000'), net: { value: j('-3000000'), provenance: 'pending', reason: 'no chain outcome yet (escrow disputed): the payout or refund is pending' } },
    inGame: { rank: server(2), finalNetWorth: server({ dollars: 6100 }) }, disputed: chain(true)
  };
  var withdrawn = {
    gameId: 'g_0000000000000000000000003', joinCode: 'JUNO-ABCD-EFGH', product: product, variant: 'standard · live',
    table: server('waiting'), createdAt: '2026-10-06T09:00:00.000Z', startedAt: null, endedAt: null,
    seat: { displayName: 'Alice', chainSeatIndex: null }, playerCount: 2,
    money: { chainGameId: '4', contract: settled.money.contract, chainId: 'uni-7', escrow: chain('funding'), anteGross: j('2000000'), net: none('ante_gross: this seat withdrew before Start: the escrow removed it from the game and refunded its net deposit in that transaction, so neither amount is recorded on the game') },
    inGame: { rank: none('no terminal result is recorded for this game'), finalNetWorth: none('no terminal result is recorded for this game') }, disputed: chain(false)
  };
  var free = {
    gameId: 'g_0000000000000000000000004', joinCode: null, product: product, variant: 'standard · live',
    table: server('archived'), createdAt: '2026-10-01T09:00:00.000Z', startedAt: '2026-10-01T09:05:00.000Z', endedAt: '2026-10-01T12:00:00.000Z',
    seat: { displayName: 'Alice', chainSeatIndex: null }, playerCount: 4, money: null,
    inGame: { rank: none('not recorded; replay required'), finalNetWorth: none('not recorded; replay required') }, disputed: server(false)
  };
  var GAMES = [settled, disputed, withdrawn, free];

  function seats(g, you) {
    var names = ['Alice', 'Bob', 'Carol', 'Dan'].slice(0, g.playerCount);
    return names.map(function (n, i) { return { displayName: n, chainSeatIndex: g.money ? i : null, you: n === you, finalNetWorth: g.money ? server({ dollars: [7400, 6100, 5200, 3000][i] }) : none('not recorded; replay required'), rank: g.money ? server(i + 1) : none('not recorded; replay required') }; });
  }
  var DETAILS = {};
  DETAILS[settled.gameId] = Object.assign({}, settled, {
    seats: seats(settled, 'Alice'), terminal: server({ reason: 'BankBroken', logLen: 412, logHash: 'ab'.repeat(32) }),
    ledger: { entries: [{ kind: 'ante_gross', amount: j('2000000'), fact: chain(true) }, { kind: 'subsidy', amount: j('50000'), fact: chain(true) }, { kind: 'payout', amount: j('3336628'), fact: chain(true) }], net: settled.money.net, networkFeesIncluded: false },
    dispute: null, caseUrl: null
  });
  DETAILS[disputed.gameId] = Object.assign({}, disputed, {
    seats: seats(disputed, 'Bob').map(function (s, i) { return Object.assign({}, s, { you: i === 1 }); }), terminal: server({ reason: 'Bankruptcy', logLen: 230, logHash: 'cd'.repeat(32) }),
    ledger: { entries: [{ kind: 'ante_gross', amount: j('2000000'), fact: chain(true) }, { kind: 'subsidy', amount: j('50000'), fact: chain(true) }, { kind: 'bond_posted', amount: j('1000000'), fact: chain(true) }], net: disputed.money.net, networkFeesIncluded: false },
    dispute: chain({ challengerIsYou: true, bond: j('1000000'), evidenceHash: 'ee'.repeat(32), disputedAt: '2026-10-07T13:30:00.000Z', resolverTimeoutAt: '2026-11-06T13:30:00.000Z', resolution: null, resolvedAt: null }),
    caseUrl: 'https://ludum.netadao.org/disputes/case/?id=5'
  });
  DETAILS[withdrawn.gameId] = Object.assign({}, withdrawn, {
    seats: seats(withdrawn, 'Alice'), terminal: none('no terminal result is recorded for this game'),
    ledger: { entries: [{ kind: 'ante_gross', amount: j('0'), fact: none('this seat withdrew before Start') }, { kind: 'refund', amount: j('0'), fact: none('this seat withdrew before Start') }], net: withdrawn.money.net, networkFeesIncluded: false },
    dispute: null, caseUrl: null
  });
  DETAILS[free.gameId] = Object.assign({}, free, { seats: seats(free, 'Alice'), terminal: none('not recorded; replay required'), ledger: null, dispute: null, caseUrl: null });

  var PAGE = 2;
  var signedIn = true;
  var mock = {
    PLAY_ORIGIN: 'https://play.netadao.org',
    signInUrl: function (path) { return 'https://play.netadao.org/?ludum=signin&return=' + encodeURIComponent(path || '/me/'); },
    whoami: function () {
      return Promise.resolve(signedIn
        ? { signedIn: true, account: { name: 'Alice Example', username: 'alice', memberSince: '2026-09', authorizationWallet: { address: 'juno1kkerfymlqzjd45xlvvle6yyjh849m7xvpf9jaq', since: '2026-09-14' } }, manageUrl: 'https://play.netadao.org/account' }
        : { signedIn: false, signInUrl: mock.signInUrl('/me/') });
    },
    api: function (path, body) {
      if (!signedIn) return Promise.resolve({ error: 'signed-out' });
      if (path === 'games') {
        var start = body && body.cursor ? Number(body.cursor) : 0;
        var page = GAMES.slice(start, start + PAGE);
        return Promise.resolve({ games: page, nextCursor: start + PAGE < GAMES.length ? String(start + PAGE) : null, asOf: H });
      }
      if (path === 'game') return Promise.resolve(DETAILS[body && body.gameId] || { error: 'not-found' });
      return Promise.resolve({ error: 'bad-request' });
    },
    /* test controls */
    _setSignedIn: function (value) { signedIn = value; },
    _fixtures: { games: GAMES, details: DETAILS }
  };
  root.LudumSession = mock;
})(typeof window !== 'undefined' ? window : globalThis);
