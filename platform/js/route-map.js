/* Ludum · route-map — the Design's addresses (handoff §8.4) to the engineering routes, for links made to the designed
 * paths. GitHub Pages serves /404.html at any missing path; this maps a missing designed path to its fixed route and
 * replaces the location. Only these exact shapes are mapped, to paths on this origin (never an open redirect):
 *   /account/                          -> /me/
 *   /account/details/ | /account/account/ -> /me/account/
 *   /account/games/<gameId>/           -> /me/?game=<gameId>  (that game's result, opened in Your record)
 *   /account/moderation/               -> /moderation/
 *   /account/moderation/cases/<id>/    -> /moderation/case/?id=<id>
 *   /account/appeals/                  -> /disputes/
 *   /account/appeals/proposals/<no>/   -> /governance/proposal/?id=<no>
 * LUDUM v1.7 (owner, 2026-10-24): the retired escrow's case file and new-appeal pages are gone, and so are their
 * addresses (/cases/<chainGameId>/, /account/appeals/new/): they now find the site's 404 like any other missing path.
 */
(function (root) {
  'use strict';
  var RULES = [
    [/^\/account\/?$/, function () { return '/me/'; }],
    [/^\/account\/(?:details|account)\/?$/, function () { return '/me/account/'; }],
    [/^\/account\/games\/(g_[0-9a-z]{6,40})\/?$/, function (m) { return '/me/?game=' + m[1]; }],
    [/^\/account\/moderation\/?$/, function () { return '/moderation/'; }],
    [/^\/account\/moderation\/cases\/(cc_[0-9a-f]{32})\/?$/, function (m) { return '/moderation/case/?id=' + m[1]; }],
    [/^\/account\/appeals\/?$/, function () { return '/disputes/'; }],
    [/^\/account\/appeals\/proposals\/([1-9]\d{0,15})\/?$/, function (m) { return '/governance/proposal/?id=' + m[1]; }]
  ];
  function mapDesignPath(pathname) {
    var p = String(pathname || '');
    for (var i = 0; i < RULES.length; i++) { var m = RULES[i][0].exec(p); if (m) return RULES[i][1](m); }
    return null;
  }
  root.LudumRouteMap = { mapDesignPath: mapDesignPath };
  if (typeof module === 'object' && module.exports) module.exports = root.LudumRouteMap;
  if (typeof window !== 'undefined' && window.location) {
    var target = mapDesignPath(window.location.pathname);
    if (target) window.location.replace(target);
  }
})(typeof window !== 'undefined' ? window : globalThis);
