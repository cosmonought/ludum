/* Ludum · LudumSession — who is signed in on Play, and the one client for Play's Ludum API.
 *
 * The contract: 1830Juno docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md §2.1 and §5.
 *
 * ludum.netadao.org and play.netadao.org are the same site, so a credentialed fetch carries Play's own session cookie
 * (host-only, HttpOnly, SameSite=Strict). Nothing here ever sees, stores or sends a token: there is no cookie on this
 * origin, nothing in localStorage, and sign-in / sign-out happen on Play.
 *
 *   LudumSession.PLAY_ORIGIN          "https://play.netadao.org"
 *   LudumSession.whoami()             Promise<SessionResponse>  ({signedIn:false, signInUrl} | {signedIn:true, account, manageUrl})
 *   LudumSession.api(route, body, {redirectOnSignedOut})
 *                                     Promise<json> for one of the v1 routes ("session", "games", "game", "case").
 *                                     Rejects with a LudumSession.ApiError {status, error, detail}: `error` is the
 *                                     server's ("bad-request" | "signed-out" | "not-found" | "rate-limited" |
 *                                     "unavailable"), or "unavailable" when Play could not be reached or answered
 *                                     something unreadable. On 401 with {redirectOnSignedOut: true}, goes to sign in.
 *   LudumSession.signInUrl(path)      https://play.netadao.org/?ludum=signin&return=<path>  (path: this page's, by default;
 *                                     one that is not ^/[a-z0-9/_-]{0,128}$ returns to "/")
 *
 * Every call is exactly the §2.1 fetch: POST, mode "cors", credentials "include", cache "no-store", redirect "error",
 * Content-Type application/json, a JSON body.
 */
(function () {
  'use strict';

  var PLAY_ORIGIN = 'https://play.netadao.org';
  var API_BASE = PLAY_ORIGIN + '/gs/api/ludum/v1/';
  var ROUTES = ['session', 'games', 'game', 'case'];
  var RETURN_PATH = /^\/[a-z0-9\/_-]{0,128}$/;

  function ApiError(status, error, detail) {
    this.name = 'LudumApiError';
    this.status = status;
    this.error = error;
    this.detail = detail === undefined ? null : detail;
    this.message = 'Ludum API: ' + error + (status ? ' (' + status + ')' : '');
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function signInUrl(returnPath) {
    var path = returnPath === undefined ? (window.location && window.location.pathname) || '/' : String(returnPath);
    if (!RETURN_PATH.test(path)) path = '/';
    return PLAY_ORIGIN + '/?ludum=signin&return=' + encodeURIComponent(path);
  }

  function api(route, body, options) {
    options = options || {};
    if (ROUTES.indexOf(route) === -1) return Promise.reject(new ApiError(0, 'bad-request', 'unknown route'));
    var request;
    try {
      request = window.fetch(API_BASE + route, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body === undefined ? {} : body)
      });
    } catch (e) {
      return Promise.reject(new ApiError(0, 'unavailable', 'Play could not be reached'));
    }
    return request.then(
      function (response) {
        return response.json().then(
          function (json) { return { response: response, json: json }; },
          function () { return { response: response, json: null }; }
        );
      },
      function () {
        throw new ApiError(0, 'unavailable', 'Play could not be reached');
      }
    ).then(function (answer) {
      var status = answer.response.status;
      var json = answer.json;
      if (status >= 200 && status < 300 && json !== null && typeof json === 'object') return json;
      var error = json && typeof json.error === 'string' ? json.error : 'unavailable';
      var detail = json && typeof json.detail === 'string' ? json.detail : undefined;
      if (status === 401 && options.redirectOnSignedOut === true) window.location.assign(signInUrl());
      throw new ApiError(status, error, detail);
    });
  }

  function whoami() {
    return api('session', {});
  }

  window.LudumSession = Object.freeze({
    PLAY_ORIGIN: PLAY_ORIGIN,
    whoami: whoami,
    api: api,
    signInUrl: signInUrl,
    ApiError: ApiError
  });
})();
