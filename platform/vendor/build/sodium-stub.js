// Ludum vendor stub for libsodium-wrappers-sumo. Keplr holds every key and signs; the page never derives, encrypts or
// signs with ed25519/argon2/xchacha, and libsodium's WebAssembly start-up would break the page CSP (no 'wasm-unsafe-eval').
function refused() { throw new Error("libsodium is not bundled in the Ludum cosmjs build"); }
module.exports = new Proxy({ ready: Promise.resolve() }, { get: (t, k) => (k in t ? t[k] : k === "__esModule" || k === "default" ? undefined : refused) });
