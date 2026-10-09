# platform/vendor — pinned, self-hosted cosmjs

The governance pages (`/disputes/`, `/governance/`) sign with Keplr through this one file. No CDN: the §2.4 CSP allows
scripts from this origin and the radio only.

| | |
|---|---|
| File | `cosmjs-0.32.4.min.js` (1,670,372 bytes) |
| sha256 | `94665e4054682478f7ad009b8c2e159e8eb11c14e4c0ff27987780b77cbb6ca6` |
| Global | `LudumCosmJS` |
| Version | `@cosmjs/*` **0.32.4** exactly, `cosmjs-types` **0.9.0**: the version family of 1830Juno `frontend/package.json` (`^0.32.4`, locked at 0.32.4) |
| Bundler | esbuild **0.23.1** |
| Built | 2026-10-09, Node 24.19.0, Windows x64 |

`platform/js/gov.js` loads it only when an action is prepared (it is not on the read path), from
`/platform/vendor/cosmjs-0.32.4.min.js`.

## What it exposes

`SigningCosmWasmClient` (used only as `SigningCosmWasmClient.offline(keplrSigner)`), `GasPrice`, `calculateFee`,
`encodePubkey`, `encodeSecp256k1Pubkey`, `toUtf8`, `fromUtf8`, `toBase64`, `fromBase64`, `MsgExecuteContract`, `Tx`,
`TxRaw`, `TxBody`, `AuthInfo`, `Fee`, `SignMode`, `VERSION`. See `build/entry.js`.

No RPC client is used. The project RPC proxy answers CORS only for `https://play.netadao.org`, so the pages simulate
(`/cosmos/tx/v1beta1/simulate`) and broadcast (`/cosmos/tx/v1beta1/txs`, sync) through the pinned REST endpoint
`https://juno.api.t.stavr.tech`, which allows any origin.

## Build method (reproducible)

`build/` holds every input: `package.json` and `package-lock.json` (exact versions), `entry.js`, and two aliases.

- `empty.js` replaces Node's `crypto`, which `@cosmjs/crypto` tries inside a `try` and falls back from.
- `sodium-stub.js` replaces `libsodium-wrappers-sumo`. Keplr holds the keys and signs; the page never uses
  ed25519, argon2 or xchacha. libsodium's start-up compiles WebAssembly, which the §2.4 CSP refuses (no
  `'wasm-unsafe-eval'`) and would report as a violation. The stub throws if anything ever calls it.

From a copy of `build/` in an empty directory:

```
npm ci
./node_modules/.bin/esbuild entry.js --bundle --format=iife --global-name=LudumCosmJS --platform=browser \
  --target=es2020 --minify --legal-comments=eof --define:global=globalThis \
  --alias:crypto=./empty.js --alias:libsodium-wrappers-sumo=./sodium-stub.js \
  --outfile=out/cosmjs-0.32.4.min.js
sha256sum out/cosmjs-0.32.4.min.js
```

A clean `npm ci` and rebuild on 2026-10-09 reproduced the sha256 above. The bundle contains no `eval`, no
`new Function` and no `WebAssembly`; its one `Function("return this")` is a global-object fallback reached only when
neither `self` nor `window` exists.

## Licences

cosmjs and cosmjs-types are Apache-2.0. The bundled third-party licence notices esbuild found are at the end of the
file (`--legal-comments=eof`).

## Updating

Change the versions in `build/package.json`, regenerate the lockfile, rebuild, rename the file to the new version,
update `VENDOR_SRC` in `platform/js/gov.js`, and record the new size and sha256 here.
