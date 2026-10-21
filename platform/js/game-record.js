/* Ludum · /me/game/?id=<gameId> — RETIRED as a page (owner review 2026-10-21, 1830Juno §17): a game's result opens in
 * place in Your record, so this address -- old links, bookmarks, the /account/games/<id>/ redirect -- leads to
 * /me/?game=<gameId>, where that game's row is opened and brought into view. Nothing about the game is read here, and no
 * record is touched: the result, its players and its credit settlement are Your record's to show (an internal id, the
 * retired escrow's ledger and its evidence stay in the server's records, never on a player's page). */
(function () {
  'use strict';
  var GAME_ID = /^g_[0-9a-z]{6,40}$/;

  /** Where an old game-record address leads (pure): that game in Your record, or Your record itself. */
  function targetOf(search) {
    var id = new URLSearchParams(String(search || '')).get('id');
    return id && GAME_ID.test(id) ? '/me/?game=' + encodeURIComponent(id) : '/me/';
  }

  window.LudumGameRecord = { targetOf: targetOf };
  if (document.querySelector('[data-ludum-game]')) window.location.replace(targetOf(window.location.search));
})();
