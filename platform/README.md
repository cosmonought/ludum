# Ludum platform

The signed-in parts of ludum.netadao.org — **/me/** (Your record), **/me/account/** (Your account), **/me/game/?id=**
(Game record), **/moderation/** and **/moderation/case/?id=** (conduct review, Play's reviewers only), **/disputes/**,
**/disputes/case/?id=** and **/governance/** — the account slot in every page's nav, and the shared pieces they stand on. The contract they follow is the 1830Juno repository's
`docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md` (§2.1 sign-in, §2.4 scripts and CSP, §5 the API).

The marketing pages (`index.html`, `projects/`, `about/`, `404.html`) and `design-system/` are not part of the platform.
The platform adds only the account slot to the marketing pages (`records.css`, `session.js`, `records.js` and
`account-menu.js`, after `ludum.js`) and never edits their content or `design-system/`.

The designed addresses map onto fixed paths (Claude Design handoff §8.4): `/account/` → `/me/`, Your account →
`/me/account/`, `/account/games/‹no›/` → `/me/game/?id=‹gameId›`, `/account/moderation/` (and `cases/‹id›/`) →
`/moderation/` (and `/moderation/case/?id=‹caseId›`), `/account/appeals/` → `/disputes/`, `/cases/‹no›/` →
`/disputes/case/?id=‹chainGameId›`; New appeal is the Case file's proposal section and a proposal is
`/governance/#proposal-‹no›`.

## Shared pieces

| Path | What |
|---|---|
| `platform/js/session.js` | `LudumSession`: `whoami()`, `api(route, body, {redirectOnSignedOut})`, `signInUrl(path)`, `PLAY_ORIGIN`. The one client for Play's Ludum API |
| `platform/js/page-init.js` | Calls `Ludum.enhance()`, so the API pages need no inline script |
| `platform/css/records.css` | The Design System's records layer (sections 40–50), which the live `ludum.css` export leaves out |
| `platform/js/records.js` | `LudumRecords`: the records pages' shared components (record head, profile tabs, stamps, amounts, ledgers, docket, notices) |
| `platform/js/account-menu.js` | The nav's account slot: SIGN IN, or the name and its menu (Profile; Moderation for Play's reviewers; Appeals & Disputes for a Ludum DAO wallet; Sign out on Play) |
| `platform/js/me-record.js`, `account-page.js`, `game-record.js`, `moderation-page.js` | The records pages |
| `platform/tools/build-site.mjs` | The published site, by allow-list (`.github/workflows/pages.yml`) |
| `platform/tools/check-scripts.mjs` | The §2.4 script rule, checked over every `*.html` |
| `platform/tools/tests/` | Tests for the two above (`node --test platform/tools/tests/*.test.mjs`) |

## How sign-in works

There is no sign-in on Ludum. Play (play.netadao.org) keeps its own session cookie, which is host-only, `HttpOnly` and
`SameSite=Strict`. Because the two hosts are the same site, the browser sends that cookie on Ludum's credentialed
`fetch` to `https://play.netadao.org/gs/api/ludum/v1/*`. Only that prefix answers Ludum's origin, it is read-only, and it
never sets a cookie. Nothing on Ludum ever holds a token.

- Signed out: `LudumSession.whoami()` answers `{signedIn: false, signInUrl}`. Link to `LudumSession.signInUrl()`. Play
  opens its sign-in and then returns to `https://ludum.netadao.org<path>`, but only for a path matching
  `^/[a-z0-9/_-]{0,128}$`.
- Signing out happens on Play (`LudumSession.signOutUrl()`: Play asks once, then returns). It ends Ludum access at once,
  because it is the same session.
- A conduct reviewer's decision needs Play's "Confirm it's you" (`LudumSession.confirmUrl()`): the password is only ever
  typed on Play.

## Two authorities, never merged

Moderation is Play's: the signed-in account must be one of Play's listed conduct reviewers (`session.roles.reviewer`),
and the server answers everyone else 404. Appeals are the Ludum DAO's: membership is read from the chain for the wallet
connected in Keplr; the menu's Appeals & Disputes entry only remembers (for 30 days, in this browser) that a wallet was
a member, and every governance action re-reads the chain.

## An API page

```html
<head>
<meta http-equiv="Content-Security-Policy" content="…§2.4, exactly…">
…
<script src="https://netadao.org/radio/radio.js" defer></script>
</head>
<body class="ld-page">
…
<script src="/design-system/js/ludum.js"></script>
<script src="/platform/js/session.js"></script>
<script src="/platform/js/your-page.js"></script>
<script src="/platform/js/page-init.js"></script>
</body>
```

- The meta CSP is the **first** element in `<head>`. Copy it from §2.4; `check-scripts.mjs` holds the same text.
  `/me/` may leave the two chain read endpoints out of `connect-src`.
- No inline `<script>`, no `on…=` attributes and no `javascript:` URLs anywhere under `me/`, `disputes/` or
  `governance/`.
- Scripts come only from this repository, plus the exact `https://netadao.org/radio/radio.js`. There are no CDNs, no
  analytics and no embeds that run script. Vendor and pin anything else here.

## Checks

```
node platform/tools/check-scripts.mjs
node --test platform/tests/*.test.mjs platform/tools/tests/*.test.mjs
node platform/tools/build-site.mjs _site
```

Run them before publishing. Publication is by allow-list: `.github/workflows/pages.yml` runs the three and deploys only
`_site`, so `platform/tests/`, `platform/tools/`, `platform/vendor/build/`, harnesses, mocks and Markdown never reach
the site. It needs Pages' source set to "GitHub Actions" (owner, once); deployed from the branch, Pages publishes every
file. To look at the pages locally, serve the repository root (`python -m http.server 8000`). The
API answers only `https://ludum.netadao.org` and Play's own origins, and `LudumSession` always calls
`https://play.netadao.org`. So a local copy shows the signed-out state, and signed-in data shows only on the live
origin. Page tests stub `LudumSession` or `window.fetch` instead.
