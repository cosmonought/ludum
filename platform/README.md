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
| `platform/js/session.js` | `LudumSession`: `whoami()`, `api(route, body, {redirectOnSignedOut})`, `auth(action, body)`, `signInUrl(path)`, `returnPath(search)`, `PLAY_ORIGIN`. The one client for Play's Ludum API |
| `platform/js/auth.js`, `auth-page.js`, `platform/css/auth.css` | `LudumAuth`: sign-in, account creation, "Forgot password?", "Confirm it's you", sign-out; and the three account pages |
| `platform/js/page-init.js` | Calls `Ludum.enhance()`, so the API pages need no inline script |
| `platform/css/records.css` | The Design System's records layer (sections 40–50), which the live `ludum.css` export leaves out |
| `platform/js/records.js` | `LudumRecords`: the records pages' shared components (record head, profile tabs, stamps, amounts, ledgers, docket, notices) |
| `platform/js/account-menu.js` | The nav's account slot: SIGN IN (Ludum's own), or the name and its menu (Profile; Moderation for reviewers; Appeals & Disputes for this account's Ludum DAO membership; Sign out, here) |
| `platform/js/me-record.js`, `account-page.js`, `game-record.js`, `moderation-page.js` | The records pages |
| `platform/tools/build-site.mjs` | The published site, by allow-list (`.github/workflows/pages.yml`) |
| `platform/tools/check-scripts.mjs` | The §2.4 script rule, checked over every `*.html` |
| `platform/tools/tests/` | Tests for the two above (`node --test platform/tools/tests/*.test.mjs`) |

## How sign-in works

One account, one session, for Ludum and play.netadao.org (1830Juno `docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md` §15).
Play keeps its session cookie (`__Host-gs_session`), which is host-only, `HttpOnly` and `SameSite=Strict`. Because the
two hosts are the same site, the browser sends it on Ludum's credentialed `fetch` to
`https://play.netadao.org/gs/api/ludum/v1/*`. Nothing on Ludum ever holds a token or a password.

- **Signing in, creating an account and "Forgot password?" happen here:** `/me/sign-in/`, `/me/sign-up/` and
  `/me/recover/` (`platform/js/auth.js`, `auth-page.js`). They call the seven `auth/*` actions, which are Play's own
  account handlers (the same database, budgets, password rules and Authorization Wallet proofs). Those answers set or
  clear the same cookie, so signing in here signs Play in, and signing out here (the account menu) signs Play out.
- **The Authorization Wallet:** account creation and recovery need its signature in Keplr. The page parses the
  server's text and refuses to ask Keplr unless it names this site, this account, this purpose and the wallet Keplr is
  on. It is never a transaction.
- **"Confirm it's you":** a reviewer's decision asks for the password inline (`LudumAuth.confirmPanel`), then sends the
  same decision again.
- **The return path:** `?return=` is followed only for a path matching `^/[a-z0-9/_-]{0,128}$`; anything else goes to `/`.
- **Fallback:** Play's own `?ludum=signin|confirm|signout` links (`LudumSession.playSignInUrl()`, `confirmUrl()`,
  `signOutUrl()`). The pages offer them when the game server has no `auth/*` (an older release answers 404).
- **Kept on play.netadao.org:** changing the password, replacing the Authorization Wallet, and signing out other
  devices.

## Two authorities, never merged

**Moderation** is the server's decision. The signed-in account must be a conduct reviewer bound at the game server's
startup (`session.roles.reviewer`), and the server answers everyone else 404. Nothing on Ludum grants or requests the
role. Who may appoint reviewers at runtime is an open owner decision (§15.4).

**Appeals** are the Ludum DAO's. Appeals & Disputes is drawn when the chain says the signed-in account's Authorization
Wallet, or a Keplr wallet that account connected, is a cw4 member. The page reads this itself, with no Keplr needed
(`LudumRecords.checkMembership`).
- The answer is kept for ten minutes under that account's username only, and is forgotten on sign-out.
- Another account on the same browser never inherits it.
- Every governance action re-reads the chain, and a transaction still needs Keplr.

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
