/* Ludum · page-init — calls Ludum.enhance() for pages that may not run an inline script.
 *
 * The API pages (/me/, /disputes/, /governance/) carry the §2.4 meta CSP, whose script-src has no 'unsafe-inline'. They
 * load this file last, after /design-system/js/ludum.js, instead of the marketing pages' inline
 * <script>Ludum.enhance();</script>:
 *
 *   <script src="/design-system/js/ludum.js"></script>
 *   <script src="/platform/js/page-init.js"></script>
 */
(function () {
  'use strict';
  function start() {
    if (window.Ludum && typeof window.Ludum.enhance === 'function') window.Ludum.enhance();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
