# Ludum platform

The signed-in parts of ludum.netadao.org — **/me/** (your games and money), **/disputes/** and **/governance/** — and
the shared pieces they stand on. The contract they follow is the 1830Juno repository's
`docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md` (§2.1 sign-in, §2.4 scripts and CSP, §5 the API).

The marketing pages (`index.html`, `projects/`, `about/`, `404.html`) and `design-system/` are not part of the platform
and are never edited by it.

## Shared pieces

| Path | What |
|---|---|
| `platform/js/session.js` | `LudumSession`: `whoami()`, `api(route, body, {redirectOnSignedOut})`, `signInUrl(path)`, `PLAY_ORIGIN`. The one client for Play's Ludum API |
| `platform/js/page-init.js` | Calls `Ludum.enhance()`, so the API pages need no inline script |
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
- Signing out happens on Play. It ends Ludum access at once, because it is the same session.

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
node --test platform/tools/tests/*.test.mjs
```

Run both before publishing. To look at the pages locally, serve the repository root (`python -m http.server 8000`). The
API answers only `https://ludum.netadao.org` and Play's own origins, and `LudumSession` always calls
`https://play.netadao.org`. So a local copy shows the signed-out state, and signed-in data shows only on the live
origin. Page tests stub `LudumSession` or `window.fetch` instead.
