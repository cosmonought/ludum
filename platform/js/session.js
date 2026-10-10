/* Ludum · LudumSession — who is signed in (one account and one session for Ludum and Play), and the one client for
 * Play's Ludum API.
 *
 * The contract: 1830Juno docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md §2.1 and §5.
 *
 * ludum.netadao.org and play.netadao.org are the same site, so a credentialed fetch carries Play's own session cookie
 * (host-only, HttpOnly, SameSite=Strict). Nothing here ever sees, stores or sends a token: there is no cookie on this
 * origin and nothing in localStorage. v1.2 (1830Juno §15): Ludum signs in, signs up, signs out and confirms natively,
 * through `auth/*` -- Play's own account handlers, which set or clear that same cookie on play.netadao.org. A password
 * goes only into one request body and is never kept.
 *
 *   LudumSession.PLAY_ORIGIN          "https://play.netadao.org"
 *   LudumSession.whoami()             Promise<SessionResponse>  ({signedIn:false, signInUrl} | {signedIn:true, account, manageUrl})
 *   LudumSession.api(route, body, {redirectOnSignedOut})
 *                                     Promise<json> for one of the v1 routes ("session", "games", "game", "case").
 *                                     Rejects with a LudumSession.ApiError {status, error, detail}: `error` is the
 *                                     server's ("bad-request" | "signed-out" | "not-found" | "rate-limited" |
 *                                     "unavailable"), or "unavailable" when Play could not be reached or answered
 *                                     something unreadable. On 401 with {redirectOnSignedOut: true}, goes to sign in.
 *   LudumSession.signInUrl(path)      v1.2: /me/sign-in/?return=<path> -- Ludum's own sign-in (path: this page's, by
 *                                     default; one that is not ^/[a-z0-9/_-]{0,128}$ returns to "/")
 *   LudumSession.signUpUrl(path)      v1.2: /me/sign-up/?return=<path>
 *   LudumSession.playSignInUrl(path)  https://play.netadao.org/?ludum=signin&return=<path>  (Play's, kept as a fallback)
 *   LudumSession.auth(action, body)   v1.2: Promise<json> for one of "start", "sign-in", "authorization", "create",
 *                                     "recover", "confirm", "sign-out". Rejects with an ApiError whose `error` is the
 *                                     account routes' own ("invalid-credential", "rate-limited" with retryAfterMs,
 *                                     "bad-password" with `problem`, "username-taken", ...). Forgets the memoized whoami.
 *   LudumSession.returnPath(search)   the safe ?return= path of a query string, or "/"
 *   LudumSession.signOutUrl(path)     v1.1: Play's sign-out link, kept as a fallback (v1.2 signs out with auth("sign-out"))
 *   LudumSession.confirmUrl(path)     v1.1: Play's "Confirm it's you" link, kept as a fallback (v1.2 confirms natively:
 *                                     auth("confirm", {password}))
 *
 * v1.1 routes (1830Juno §5.1): "account", "display-name", "moderation-queue", "moderation-case", "moderation-decide".
 * Their extra error codes: "conflict" (409, with `detail`) and "reauth-required" (403, with `confirmUrl`).
 *
 * Every call is exactly the §2.1 fetch: POST, mode "cors", credentials "include", cache "no-store", redirect "error",
 * Content-Type application/json, a JSON body.
 */
(function () {
  'use strict';

  var PLAY_ORIGIN = 'https://play.netadao.org';
  var API_BASE = PLAY_ORIGIN + '/gs/api/ludum/v1/';
  var ROUTES = ['session', 'games', 'game', 'case', 'account', 'display-name', 'moderation-queue', 'moderation-case', 'moderation-decide'];
  var RETURN_PATH = /^\/[a-z0-9\/_-]{0,128}$/;
  var AUTH_ACTIONS = ['start', 'sign-in', 'authorization', 'create', 'recover', 'confirm', 'sign-out'];

  function ApiError(status, error, detail, extra) {
    this.name = 'LudumApiError';
    this.status = status;
    this.error = error;
    this.detail = detail === undefined ? null : detail;
    this.confirmUrl = extra && typeof extra.confirmUrl === 'string' && extra.confirmUrl.indexOf(PLAY_ORIGIN + '/?ludum=confirm&return=') === 0 ? extra.confirmUrl : null;
    this.reason = extra && typeof extra.reason === 'string' ? extra.reason : null;
    this.problem = extra && typeof extra.problem === 'string' ? extra.problem : null;
    this.retryAfterMs = extra && typeof extra.retryAfterMs === 'number' && isFinite(extra.retryAfterMs) ? extra.retryAfterMs : null;
    this.message = 'Ludum API: ' + error + (status ? ' (' + status + ')' : '');
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function playUrl(mode, returnPath) {
    var path = returnPath === undefined ? (window.location && window.location.pathname) || '/' : String(returnPath);
    if (!RETURN_PATH.test(path)) path = '/';
    return PLAY_ORIGIN + '/?ludum=' + mode + '&return=' + encodeURIComponent(path);
  }
  function safePath(returnPath) {
    var path = returnPath === undefined ? (window.location && window.location.pathname) || '/' : String(returnPath);
    return RETURN_PATH.test(path) ? path : '/';
  }
  function ludumUrl(page, returnPath) { return page + '?return=' + encodeURIComponent(safePath(returnPath)); }
  function signInUrl(returnPath) { return ludumUrl('/me/sign-in/', returnPath); }
  function signUpUrl(returnPath) { return ludumUrl('/me/sign-up/', returnPath); }
  function playSignInUrl(returnPath) { return playUrl('signin', returnPath); }
  /** The ?return= path of a query string, if it is a safe one; otherwise "/". Never another origin. */
  function returnPath(search) {
    var m = /[?&]return=([^&#]*)/.exec(String(search || ''));
    if (!m) return '/';
    var path;
    try { path = decodeURIComponent(m[1]); } catch (e) { return '/'; }
    return RETURN_PATH.test(path) ? path : '/';
  }
  function signOutUrl(returnPath) { return playUrl('signout', returnPath); }
  function confirmUrl(returnPath) { return playUrl('confirm', returnPath); }

  function api(route, body, options) {
    options = options || {};
    if (ROUTES.indexOf(route) === -1 && !(options.auth === true && AUTH_ACTIONS.indexOf(route.slice(5)) !== -1 && route.indexOf('auth/') === 0)) return Promise.reject(new ApiError(0, 'bad-request', 'unknown route'));
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
      if (status === 204 && options.auth === true) return {};
      var error = json && typeof json.error === 'string' ? json.error : 'unavailable';
      var detail = json && typeof json.detail === 'string' ? json.detail : undefined;
      if (status === 401 && options.redirectOnSignedOut === true) window.location.assign(signInUrl());
      throw new ApiError(status, error, detail, json);
    });
  }

  /** v1.2: one of Ludum's own account actions. The answer may set or clear the shared session cookie (on Play's host). */
  function auth(action, body) {
    if (AUTH_ACTIONS.indexOf(action) === -1) return Promise.reject(new ApiError(0, 'bad-request', 'unknown action'));
    who = null;
    return api('auth/' + action, body, { auth: true }).then(function (json) { who = null; return json; }, function (e) { who = null; throw e; });
  }

  /* One answer per page load: the account menu and the page share it (a failure is not remembered). */
  var who = null;
  function whoami() {
    if (who === null) who = api('session', {}).catch(function (e) { who = null; throw e; });
    return who;
  }

  window.LudumSession = Object.freeze({
    PLAY_ORIGIN: PLAY_ORIGIN,
    whoami: whoami,
    api: api,
    signInUrl: signInUrl,
    signUpUrl: signUpUrl,
    playSignInUrl: playSignInUrl,
    returnPath: returnPath,
    auth: auth,
    signOutUrl: signOutUrl,
    confirmUrl: confirmUrl,
    ApiError: ApiError
  });
})();
