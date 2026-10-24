// Ludum's own sign-in, account creation, "Forgot password?", "Confirm it's you" and sign-out (platform/js/auth.js), the
// per-account DAO membership read (platform/js/records.js), LudumSession.auth (platform/js/session.js) and the three
// account pages. 1830Juno docs/ludum/LUDUM_PLATFORM_ARCHITECTURE.md §15.
// Run from the repository root: node --test platform/tests/auth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createHash } from "node:crypto";

const eq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
const JS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "js");
const ROOT = resolve(JS, "..", "..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

const WALLET = "juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const OTHER = "juno1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
const SITE = "https://ludum.netadao.org";
/* Produced by Play's own `profileAuthorizationText` (1830Juno frontend/src/utils/profileAuthorizationV1.ts) -- the text the
   server mints, byte for byte. */
const CREATE_TEXT = "18COSMOS/PROFILE-AUTHORIZATION/v1\nProject 18XX: make this wallet the Authorization Wallet of a new account.\nThis is not a transaction: it moves no funds and grants no permission to spend.\nPurpose: CREATE\nSite: https://ludum.netadao.org\nAccount: Ann.Player\nAuthorization wallet: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nReplaces: none\nSigner: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nOperation: 0123456789abcdef0123456789abcdef\nNonce: 0123456789abcdef0123456789abcdef\nExpires: 2026-10-10T12:00:00.000Z";
const RECOVER_TEXT = "18COSMOS/PROFILE-AUTHORIZATION/v1\nProject 18XX: recover this account and set a new password.\nThis is not a transaction: it moves no funds and grants no permission to spend.\nPurpose: RECOVER\nSite: https://ludum.netadao.org\nAccount: Ann.Player\nAuthorization wallet: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nReplaces: none\nSigner: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nOperation: fedcba9876543210fedcba9876543210\nNonce: fedcba9876543210fedcba9876543210\nExpires: 2026-10-10T12:00:00.000Z";
const BEFORE = Date.UTC(2026, 9, 10, 11, 58);
/* ---------------- LUDUM v1.6 (1830Juno §19): texts the server mints for the new account actions ---------------- */
/* Produced by Play's own `profileAuthorizationText` (1830Juno frontend/src/utils/profileAuthorizationV1.ts), byte for byte. */
/* 1830Juno section 19 (owner review 2026-10-22): a SIGN-IN and a signed-out RECOVER are minted for the wallet alone and
   name no account -- never a Player Name before the wallet has signed. */
const SIGN_IN_TEXT = "18COSMOS/PROFILE-AUTHORIZATION/v1\nProject 18XX: sign in to this account.\nThis is not a transaction: it moves no funds and grants no permission to spend.\nPurpose: SIGN-IN\nSite: https://ludum.netadao.org\nAccount: the account this wallet authorizes\nAuthorization wallet: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nReplaces: none\nSigner: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nOperation: 11111111111111111111111111111111\nNonce: 11111111111111111111111111111111\nExpires: 2026-10-10T12:00:00.000Z";
const RELEASE_TEXT = "18COSMOS/PROFILE-AUTHORIZATION/v1\nProject 18XX: approve replacing this account's Authorization Wallet with the wallet that accepts next.\nThis is not a transaction: it moves no funds and grants no permission to spend.\nPurpose: REPLACE-RELEASE\nSite: https://ludum.netadao.org\nAccount: Ann Player\nAuthorization wallet: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nReplaces: none\nSigner: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nOperation: 22222222222222222222222222222222\nNonce: 33333333333333333333333333333333\nExpires: 2026-10-10T12:00:00.000Z";
const ACCEPT_TEXT = "18COSMOS/PROFILE-AUTHORIZATION/v1\nProject 18XX: make this wallet this account's new Authorization Wallet.\nThis is not a transaction: it moves no funds and grants no permission to spend.\nPurpose: REPLACE-ACCEPT\nSite: https://ludum.netadao.org\nAccount: Ann Player\nAuthorization wallet: juno1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz\nReplaces: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nSigner: juno1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz\nOperation: 22222222222222222222222222222222\nNonce: 44444444444444444444444444444444\nExpires: 2026-10-10T12:00:00.000Z";
const RECOVER_NAME_TEXT = "18COSMOS/PROFILE-AUTHORIZATION/v1\nProject 18XX: recover this account and set a new password.\nThis is not a transaction: it moves no funds and grants no permission to spend.\nPurpose: RECOVER\nSite: https://ludum.netadao.org\nAccount: Ann Player\nAuthorization wallet: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nReplaces: none\nSigner: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nOperation: 55555555555555555555555555555555\nNonce: 55555555555555555555555555555555\nExpires: 2026-10-10T12:00:00.000Z";
const RECOVER_WALLET_TEXT = RECOVER_NAME_TEXT.replace("Account: Ann Player", "Account: the account this wallet authorizes");
const CREATE_NAME_TEXT = "18COSMOS/PROFILE-AUTHORIZATION/v1\nProject 18XX: make this wallet the Authorization Wallet of a new account.\nThis is not a transaction: it moves no funds and grants no permission to spend.\nPurpose: CREATE\nSite: https://ludum.netadao.org\nAccount: Ann Player\nAuthorization wallet: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nReplaces: none\nSigner: juno1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nOperation: 66666666666666666666666666666666\nNonce: 66666666666666666666666666666666\nExpires: 2026-10-10T12:00:00.000Z";
const at = (fn) => async () => { const realNow = Date.now; Date.now = () => BEFORE; try { await fn(); } finally { Date.now = realNow; } };
const EXPECT = { purpose: "CREATE", site: SITE, account: "ann.player", signer: WALLET, authorizationWallet: WALLET, now: BEFORE };

function load(files, extra = {}) {
  const storage = new Map();
  const window = {
    location: { origin: SITE, pathname: "/me/sign-in/", search: "", assign() {}, replace() {} },
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    ...extra,
  };
  const document = { readyState: "complete", querySelector: () => null, addEventListener() {} };
  const context = vm.createContext({ window, document, Date, JSON, Object, Array, String, Number, Math, Promise, Error, encodeURIComponent, decodeURIComponent, unescape, isFinite, Buffer, globalThis: undefined });
  context.globalThis = context;
  for (const f of files) vm.runInContext(readFileSync(resolve(JS, f), "utf8"), context, { filename: f });
  return { window, storage };
}

/* ---------------- the Authorization Wallet text check ---------------- */

test("Play's own CREATE / RECOVER texts parse exactly; the expected action passes", () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const f = A.parseAuthorization(CREATE_TEXT);
  eq({ purpose: f.purpose, site: f.site, account: f.account, wallet: f.authorizationWallet, replaces: f.replaces }, { purpose: "CREATE", site: SITE, account: "Ann.Player", wallet: WALLET, replaces: null });
  assert.equal(A.checkAuthorization(CREATE_TEXT, EXPECT), null, "the account is compared case-insensitively, as typed");
  assert.equal(A.checkAuthorization(RECOVER_TEXT, { ...EXPECT, purpose: "RECOVER" }), null);
});

test("nothing is signed for another action, site, account, signer or wallet, an expired text, or any tampering", () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const refused = (text, expect) => assert.notEqual(A.checkAuthorization(text, expect), null, JSON.stringify(expect));
  refused(RECOVER_TEXT, EXPECT); // a RECOVER offered where CREATE was asked
  refused(CREATE_TEXT, { ...EXPECT, site: "https://play.netadao.org" });
  refused(CREATE_TEXT, { ...EXPECT, account: "bob" });
  refused(CREATE_TEXT, { ...EXPECT, signer: OTHER });
  refused(CREATE_TEXT, { ...EXPECT, authorizationWallet: OTHER });
  refused(CREATE_TEXT, { ...EXPECT, now: Date.UTC(2026, 9, 10, 12, 0, 1) });
  for (const bad of [
    CREATE_TEXT + "\n",
    CREATE_TEXT.replace("\n", "\r\n"),
    CREATE_TEXT.replace("This is not a transaction", "This is a transaction"),
    CREATE_TEXT.replace("Purpose: CREATE", "Purpose: REPLACE-ACCEPT"),
    CREATE_TEXT.replace("Expires: 2026-10-10T12:00:00.000Z", "Expires: 2026-10-10T12:00:00Z"),
    CREATE_TEXT.replace("Signer: " + WALLET, "Signer: " + OTHER),
    "",
    "x".repeat(5000),
  ]) assert.equal(A.parseAuthorization(bad), null, JSON.stringify(bad.slice(0, 80)));
  assert.match(A.checkAuthorization(CREATE_TEXT, { ...EXPECT, site: "https://play.netadao.org" }), /another site/);
  assert.match(A.checkAuthorization(CREATE_TEXT.replace("Site: https://ludum.netadao.org", "Site: https://evil.example"), EXPECT), /another site/, "well-formed, but for another site");
});

test("refusals in the account's words; one answer for a wrong Player Name or password; Keplr's problems told apart", () => {
  const A = load(["auth.js"]).window.LudumAuth;
  assert.equal(A.sentence({ error: "invalid-credential" }, "sign-in"), "That Player Name and password don’t match an account.", "it never says which half was wrong");
  assert.match(A.sentence({ error: "invalid-credential" }, "confirm"), /That password isn.t right/);
  assert.match(A.sentence({ error: "rate-limited", retryAfterMs: 61000 }, "sign-in"), /Wait 61 seconds/);
  assert.match(A.sentence({ error: "bad-password", problem: "too-short" }, "create"), /at least 12/);
  assert.match(A.sentence({ error: "name-taken" }, "create"), /Another player already has that name/);
  assert.match(A.sentence({ error: "display-name-taken" }, "create"), /Another player already has that name/);
  assert.match(A.sentence({ error: "name-not-allowed" }, "create"), /isn.t allowed/);
  assert.match(A.sentence({ error: "bad-name" }, "create"), /1 to 24 characters/);
  assert.match(A.sentence({ error: "wallet-not-authorized" }, "sign-in"), /No Ludum account signs in with this wallet/);
  assert.match(A.sentence({ error: "wallet-unavailable" }, "create"), /released it less than 24 hours ago/);
  assert.match(A.sentence({ error: "bad-request" }, "sign-in"), /don.t match an account/, "a malformed sign-in reads as a wrong one");
  assert.match(A.sentence(null, "sign-in"), /could not be reached/);
  const keplr = { keplr: () => ({}) };
  assert.equal(A.keplrProblem(new Error("x"), { keplr: () => null }), "no-keplr");
  assert.equal(A.keplrProblem(new Error("You declined the signature in Keplr. Nothing was changed."), keplr), "declined");
  assert.equal(A.keplrProblem(new Error("Keplr didn’t connect. Nothing was shared."), keplr), "declined");
  assert.equal(A.keplrProblem({ error: "invalid-credential" }, keplr), null, "the server's answer is not a Keplr problem");
  /* A Player Name the page can refuse before asking anyone; the server decides availability and what is allowed. */
  assert.equal(A.nameProblem("Ann Player"), null);
  for (const bad of ["", "   ", "x".repeat(25), "!!!"]) assert.equal(A.nameProblem(bad)?.error, "bad-name", JSON.stringify(bad));
});

/* ---------------- the flows, against a recorded LudumSession and Keplr ---------------- */

function fakeSession(answers) {
  const calls = [];
  const S = {
    calls,
    auth(action, body) {
      calls.push([action, JSON.parse(JSON.stringify(body))]);
      const a = answers[action];
      const next = Array.isArray(a) ? a.shift() : a;
      if (typeof next === "function") return next(body);
      return next && next.reject ? Promise.reject(next.reject) : Promise.resolve(next || {});
    },
    whoami: () => Promise.resolve(answers.who || { signedIn: false }),
  };
  return S;
}
const fakeKeplr = (address = WALLET) => {
  const k = { signed: [], connect: () => Promise.resolve({ address }), signArbitrary: (addr, text) => { k.signed.push([addr, text]); return Promise.resolve({ pubKey: "PK", signature: "SIG" }); } };
  return k;
};

test("sign-in with the password: a reset (ended) session is replaced only on the press, then the Player Name and password are sent once", async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const S = fakeSession({ start: [{ reject: { status: 401, error: "session-ended" } }, {}], "sign-in": { ok: true, profile: { name: "Ann" } } });
  await A.signIn(S, { name: "Ann Player", password: "correct horse battery" });
  eq(S.calls, [["start", {}], ["start", { fresh: true }], ["sign-in", { name: "Ann Player", password: "correct horse battery" }]]);
  const refused = fakeSession({ start: {}, "sign-in": { reject: { status: 403, error: "invalid-credential" } } });
  await assert.rejects(A.signIn(refused, { name: "Ann Player", password: "x" }), (e) => e.error === "invalid-credential");
});

test("v1.6 Sign in with Keplr: the wallet identifies the account, but only once it has signed; the SIGN-IN text is checked (this site, this wallet, no account named) BEFORE Keplr signs; one signature signs in", at(async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const S = fakeSession({ start: {}, authorization: { operation: "11111111111111111111111111111111", texts: [{ text: SIGN_IN_TEXT }] }, "keplr-sign-in": { ok: true, profile: { name: "Ann Player" } } });
  const keplr = fakeKeplr();
  const steps = [];
  const r = await A.signInWithKeplr(S, keplr, (s, info) => steps.push([s, info && info.account]));
  assert.equal(r.account, "Ann Player", "the name comes from the answer, once the wallet has signed");
  eq(steps.map((x) => x[1]).filter(Boolean), [], "no name is shown before the signature");
  eq(S.calls, [["start", {}], ["authorization", { purpose: "sign-in", wallet: WALLET }], ["keplr-sign-in", { operation: "11111111111111111111111111111111", pubKey: "PK", signature: "SIG" }]]);
  eq(keplr.signed, [[WALLET, SIGN_IN_TEXT]]);
  eq(steps.map((x) => x[0]), ["keplr", "wallet", "sign", "session"]);
  /* A wallet that authorizes no account: told so once it has signed (never to someone who only names it). */
  const none = fakeSession({ start: {}, authorization: { operation: "11111111111111111111111111111111", texts: [{ text: SIGN_IN_TEXT }] }, "keplr-sign-in": { reject: { status: 409, error: "wallet-not-authorized" } } });
  const k1 = fakeKeplr();
  await assert.rejects(A.signInWithKeplr(none, k1), (e) => e.error === "wallet-not-authorized");
  eq(k1.signed, [[WALLET, SIGN_IN_TEXT]]);
  /* Another site, another signer, another action, or a text naming a Player Name: never signed. */
  for (const [label, text, wallet] of [["another site", SIGN_IN_TEXT.replace("https://ludum.netadao.org", "https://evil.example"), WALLET], ["another wallet", SIGN_IN_TEXT, OTHER], ["another action", RECOVER_WALLET_TEXT, WALLET], ["a named account", SIGN_IN_TEXT.replace("Account: the account this wallet authorizes", "Account: Ann Player"), WALLET]]) {
    const bad = fakeSession({ start: {}, authorization: { operation: "x", texts: [{ text }] } });
    const k = fakeKeplr(wallet);
    await assert.rejects(A.signInWithKeplr(bad, k), (e) => e.local === true, label);
    eq(k.signed, [], `${label}: nothing signed`);
    assert.ok(!bad.calls.some(([a]) => a === "keplr-sign-in"), label);
  }
}));

test("v1.6 Create account: the CREATE text for the PLAYER NAME is checked BEFORE Keplr signs; signing and creating are separate acts; an expired signature is never sent", at(async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const ok = fakeSession({ start: {}, authorization: { operation: "66666666666666666666666666666666", texts: [{ text: CREATE_NAME_TEXT }] }, create: { ok: true } });
  const keplr = fakeKeplr();
  const proof = await A.authorizeCreate(ok, keplr, { name: "Ann Player" });
  eq(keplr.signed, [[WALLET, CREATE_NAME_TEXT]]);
  eq(ok.calls, [["start", {}], ["authorization", { purpose: "create", name: "Ann Player", wallet: WALLET }]], "nothing is created by signing");
  eq([proof.account, proof.wallet, proof.operation], ["Ann Player", WALLET, "66666666666666666666666666666666"]);
  await A.finishCreate(ok, { name: "Ann Player", password: "correct horse battery", proof });
  eq(ok.calls.at(-1), ["create", { name: "Ann Player", password: "correct horse battery", operation: "66666666666666666666666666666666", pubKey: "PK", signature: "SIG" }], "no username: one Player Name");
  /* The text for another site, or another name than the one typed: never signed. */
  for (const [label, text, name] of [["another site", CREATE_NAME_TEXT.replace("https://ludum.netadao.org", "https://evil.example"), "Ann Player"], ["another name", CREATE_NAME_TEXT, "Bo"]]) {
    const evil = fakeSession({ start: {}, authorization: { operation: "x", texts: [{ text }] } });
    const k = fakeKeplr();
    await assert.rejects(A.authorizeCreate(evil, k, { name }), (e) => e.local === true, label);
    eq(k.signed, [], `${label}: Keplr was never asked`);
  }
  /* Form problems are said before any request or Keplr; a signature past its expiry is never sent. */
  const none = fakeSession({});
  await assert.rejects(A.authorizeCreate(none, fakeKeplr(), { name: "  " }), (e) => e.error === "bad-name");
  await assert.rejects(A.finishCreate(none, { name: "Ann Player", password: "short", proof }), (e) => e.error === "bad-password");
  await assert.rejects(A.finishCreate(none, { name: "Ann Player", password: "correct horse battery", proof: { ...proof, expiresAt: BEFORE - 1 } }), (e) => e.local === true && e.why === "expired");
  eq(none.calls, []);
}));

test("v1.6 Reset password: no name typed or told -- the wallet decides once it has signed; the RECOVER text names no account, signed by the wallet Keplr is on; a CREATE text, or one naming a Player Name, is refused", at(async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const S = fakeSession({ start: {}, authorization: { operation: "55555555555555555555555555555555", texts: [{ text: RECOVER_WALLET_TEXT }] }, recover: { ok: true, profile: { name: "Ann Player" }, signedOut: 2 } });
  const keplr = fakeKeplr();
  const proof = await A.authorizeReset(S, keplr);
  assert.equal(proof.account, null, "nothing names the account before the reset");
  eq(S.calls[1], ["authorization", { purpose: "recover", wallet: WALLET }], "no username, no name");
  await assert.rejects(A.finishReset(S, { proof, newPassword: "short" }), (e) => e.error === "bad-password");
  const r = await A.finishReset(S, { proof, newPassword: "a brand new passphrase" });
  assert.equal(r.signedOut, 2);
  assert.equal(r.profile.name, "Ann Player", "the name, from the answer");
  eq(S.calls.at(-1), ["recover", { operation: "55555555555555555555555555555555", pubKey: "PK", signature: "SIG", newPassword: "a brand new passphrase" }]);
  const swapped = fakeSession({ start: {}, authorization: { operation: "x", texts: [{ text: CREATE_NAME_TEXT }] } });
  const k2 = fakeKeplr();
  await assert.rejects(A.authorizeReset(swapped, k2), (e) => /different account action/.test(e.message));
  eq(k2.signed, []);
  const otherWallet = fakeSession({ start: {}, authorization: { operation: "x", texts: [{ text: RECOVER_WALLET_TEXT }] } });
  const k3 = fakeKeplr(OTHER);
  await assert.rejects(A.authorizeReset(otherWallet, k3), (e) => /another wallet/.test(e.message));
  eq(k3.signed, []);
  const named = fakeSession({ start: {}, authorization: { operation: "x", texts: [{ text: RECOVER_NAME_TEXT }] } });
  const k5 = fakeKeplr();
  await assert.rejects(A.authorizeReset(named, k5), (e) => /another account/.test(e.message));
  eq(k5.signed, [], "a text naming a Player Name before the signature is never signed");
  /* A wallet that authorizes no account: told so once it has signed, when the new password is sent. */
  const none = fakeSession({ start: {}, authorization: { operation: "55555555555555555555555555555555", texts: [{ text: RECOVER_WALLET_TEXT }] }, recover: { reject: { status: 409, error: "wallet-not-authorized" } } });
  const k4 = fakeKeplr();
  const lost = await A.authorizeReset(none, k4);
  await assert.rejects(A.finishReset(none, { proof: lost, newPassword: "a brand new passphrase" }), (e) => e.error === "wallet-not-authorized");
}));

test("Change password with the current password: the current and the new in ONE auth/password request; a short new one is refused before anything is sent", async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const S = fakeSession({ password: { ok: true, signedOut: 1 } });
  await assert.rejects(A.changePassword(S, { currentPassword: "the old passphrase", newPassword: "short" }), (e) => e.error === "bad-password");
  await assert.rejects(A.changePassword(S, { currentPassword: "", newPassword: "a brand new passphrase" }), (e) => e.error === "invalid-credential");
  eq(S.calls, []);
  const r = await A.changePassword(S, { currentPassword: "the old passphrase", newPassword: "a brand new passphrase" });
  assert.equal(r.signedOut, 1);
  eq(S.calls, [["password", { currentPassword: "the old passphrase", newPassword: "a brand new passphrase" }]]);
  assert.equal(A.sentence({ error: "invalid-credential" }, "change"), "That password isn’t right. Try again, or approve with Keplr.");
  /* Step 1 checks the current password at once ("Confirm it's you"). */
  const C = fakeSession({ confirm: { ok: true } });
  await A.confirm(C, "the old passphrase");
  eq(C.calls, [["confirm", { password: "the old passphrase" }]]);
});

test("v1.6 Change password with Keplr (signed in): no start(); Keplr must be on THIS account's Authorization Wallet; its RECOVER text for this account checked, signed, held; the save sends it with the new password", at(async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const S = fakeSession({ authorization: { operation: "55555555555555555555555555555555", texts: [{ text: RECOVER_NAME_TEXT }] }, recover: { ok: true, signedOut: 3 } });
  const keplr = fakeKeplr();
  const proof = await A.authorizeChange(S, keplr, { account: "Ann Player", authorizationWallet: WALLET });
  eq(S.calls, [["authorization", { purpose: "recover", wallet: WALLET }]], "no start(): the signed-in session is the one used");
  eq(keplr.signed, [[WALLET, RECOVER_NAME_TEXT]]);
  const r = await A.finishChange(S, { proof, newPassword: "a brand new passphrase" });
  assert.equal(r.signedOut, 3);
  eq(S.calls[1], ["recover", { operation: "55555555555555555555555555555555", pubKey: "PK", signature: "SIG", newPassword: "a brand new passphrase" }]);
  const wrong = fakeSession({});
  const k2 = fakeKeplr(OTHER);
  await assert.rejects(A.authorizeChange(wrong, k2, { account: "Ann Player", authorizationWallet: WALLET }), (e) => e.local === true && /Switch Keplr to your Authorization Wallet/.test(e.message));
  eq(wrong.calls, []);
  eq(k2.signed, []);
  const another = fakeSession({ authorization: { operation: "x", texts: [{ text: RECOVER_NAME_TEXT }] } });
  const k3 = fakeKeplr();
  await assert.rejects(A.authorizeChange(another, k3, { account: "Bo", authorizationWallet: WALLET }), (e) => /another account/.test(e.message));
  eq(k3.signed, [], "a text for another account is never signed");
}));

test("sign-out ends the shared session and forgets the remembered membership; an already-ended session is fine", async () => {
  const { window, storage } = load(["records.js", "auth.js"]);
  const A = window.LudumAuth;
  const R = window.LudumRecords;
  R.rememberMember(window.localStorage, WALLET, Date.now(), "ann");
  const S = fakeSession({ who: { signedIn: true, account: { username: "ann" } }, "sign-out": {} });
  await A.signOut(S);
  eq(S.calls, [["sign-out", {}]]);
  assert.equal(storage.has(R.DAO_MEMBER_KEY), false);
  const ended = fakeSession({ "sign-out": { reject: { status: 401, error: "not-authenticated" } } });
  await A.signOut(ended);
  const down = fakeSession({ "sign-out": { reject: { status: 0, error: "unavailable" } } });
  await assert.rejects(A.signOut(down));
});

/* ---------------- the automatic, per-account membership read ---------------- */

function chain(members) {
  const calls = [];
  const fetch = (url, init) => {
    calls.push({ url, init });
    const m = /\/smart\/(.+)$/.exec(url);
    const query = JSON.parse(Buffer.from(decodeURIComponent(m[1]), "base64").toString("utf8"));
    if (members === "down") return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: { weight: members.includes(query.member.addr) ? 4 : null } }) });
  };
  return { fetch, calls };
}
const signedIn = (username, wallet) => ({ signedIn: true, account: { name: username, username, memberSince: "2026-10", authorizationWallet: wallet ? { address: wallet, since: "2026-10-01T00:00:00.000Z" } : null } });

test("membership is read from the chain for the SIGNED-IN account's Authorization Wallet -- no Keplr; the exact public query", async () => {
  const { window } = load(["records.js"]);
  const R = window.LudumRecords;
  const c = chain([WALLET]);
  const now = Date.UTC(2026, 9, 10);
  assert.equal(await R.checkMembership(signedIn("ann", WALLET), { fetch: c.fetch, now }), true);
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0].url, `https://juno.api.t.stavr.tech/cosmwasm/wasm/v1/contract/${R.CW4_GROUP}/smart/${encodeURIComponent(Buffer.from(JSON.stringify({ member: { addr: WALLET } })).toString("base64"))}`);
  assert.equal(c.calls[0].init.credentials, "omit", "no cookie goes to the chain endpoint");
  assert.equal(await R.checkMembership(signedIn("ann", WALLET), { fetch: c.fetch, now: now + 60000 }), true);
  assert.equal(c.calls.length, 1, "remembered for ten minutes, for this account");
  assert.equal(await R.checkMembership(signedIn("ann", WALLET), { fetch: c.fetch, now: now + 11 * 60000 }), true);
  assert.equal(c.calls.length, 2, "then read again");
  assert.equal(await R.checkMembership({ signedIn: false }, { fetch: c.fetch, now }), false, "signed out: no tab, no read");
  assert.equal(c.calls.length, 2);
});

test("another account on the same browser never inherits membership: it is read for that account", async () => {
  const { window } = load(["records.js"]);
  const R = window.LudumRecords;
  const c = chain([WALLET]);
  const now = Date.UTC(2026, 9, 10);
  assert.equal(await R.checkMembership(signedIn("ann", WALLET), { fetch: c.fetch, now }), true);
  assert.equal(await R.checkMembership(signedIn("bob", OTHER), { fetch: c.fetch, now: now + 1000 }), false, "Bob's own wallet is read, and is not a member");
  assert.equal(c.calls.length, 2);
  assert.equal(R.rememberedMember(window.localStorage, now + 2000, "ann"), null, "Ann's answer is gone, not reused for Bob");
  assert.equal(await R.checkMembership(signedIn("cat", null), { fetch: c.fetch, now: now + 3000 }), false, "no Authorization Wallet (a legacy account): no tab");
  assert.equal(c.calls.length, 2);
});

test("a Keplr member wallet this account connected is read too; an unreachable chain draws nothing (null)", async () => {
  const { window } = load(["records.js"]);
  const R = window.LudumRecords;
  const now = Date.UTC(2026, 9, 10);
  R.rememberMember(window.localStorage, OTHER, now - 20 * 60000, "ann"); // stale: re-read
  const c = chain([OTHER]);
  assert.equal(await R.checkMembership(signedIn("ann", WALLET), { fetch: c.fetch, now }), true);
  eq(c.calls.map((x) => JSON.parse(Buffer.from(decodeURIComponent(/\/smart\/(.+)$/.exec(x.url)[1]), "base64").toString()).member.addr), [WALLET, OTHER]);
  const { window: w2 } = load(["records.js"]);
  assert.equal(await w2.LudumRecords.checkMembership(signedIn("ann", WALLET), { fetch: chain("down").fetch, now }), null);
});

test("the tab's chain pins are gov.js's own", () => {
  const { window } = load(["records.js", "gov.js"]);
  assert.equal(window.LudumRecords.CW4_GROUP, window.LudumGov.PINS.cw4Group);
  assert.equal(window.LudumRecords.CHAIN_REST, window.LudumGov.PINS.rest);
});

/* ---------------- LudumSession.auth: the request ---------------- */

test("LudumSession.auth posts to auth/<action> with the §2.1 credentialed fetch; only the listed actions (v1.6: + keplr-sign-in, wallet-approve, sign-out-others); 204 is {}", async () => {
  const calls = [];
  const window = { location: { pathname: "/me/sign-in/", assign() {} }, fetch: (url, init) => { calls.push({ url, init }); return Promise.resolve({ status: url.endsWith("sign-out") ? 204 : 200, json: () => (url.endsWith("sign-out") ? Promise.reject(new Error("empty")) : Promise.resolve({ ok: true })) }); } };
  vm.runInNewContext(readFileSync(resolve(JS, "session.js"), "utf8"), { window, Promise, JSON, Object, Error, encodeURIComponent, decodeURIComponent, String, isFinite });
  const S = window.LudumSession;
  await S.auth("sign-in", { name: "Ann Player", password: "pw" });
  assert.equal(calls[0].url, "https://play.netadao.org/gs/api/ludum/v1/auth/sign-in");
  eq(calls[0].init, { method: "POST", mode: "cors", credentials: "include", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: '{"name":"Ann Player","password":"pw"}' });
  eq(await S.auth("sign-out", {}), {});
  for (const bad of ["me", "../account/login", "session", "authorization-wallet/replace", "wallet-login", "profile/sign-out-others"]) await assert.rejects(S.auth(bad, {}), (e) => e.error === "bad-request");
  for (const action of ["password", "keplr-sign-in", "wallet-approve", "sign-out-others"]) await S.auth(action, {});
  eq(calls.slice(2).map((c) => c.url.replace("https://play.netadao.org/gs/api/ludum/v1/", "")), ["auth/password", "auth/keplr-sign-in", "auth/wallet-approve", "auth/sign-out-others"]);
  await assert.rejects(S.api("auth/sign-in", {}), (e) => e.error === "bad-request", "api() alone never reaches auth/*");
  assert.equal(calls.length, 6);
});

/* ---------------- the pages ---------------- */

test("the account pages: the §2.4 CSP first, no third-party script, the forms' autocomplete, and nothing stored", () => {
  for (const [dir, kind] of [["sign-in", "sign-in"], ["sign-up", "sign-up"], ["recover", "recover"]]) {
    /* Read as the site serves it, line ends normalised (a Windows checkout writes CRLF; the published file is LF). */
    const html = read(`me/${dir}/index.html`).replace(/\r\n/g, "\n");
    assert.match(html, /<head>\n<meta http-equiv="Content-Security-Policy"/, dir);
    assert.match(html, new RegExp(`data-ludum-auth="${kind}"`), dir);
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    /* v1.6: every account page signs with Keplr (Sign in with Keplr is primary), so each loads gov.js; none loads radio. */
    eq(order, ["/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", "/platform/js/pass.js", "/platform/js/ticket.js", "/platform/js/gov.js", "/platform/js/auth.js", "/platform/js/account-menu.js", "/platform/js/auth-page.js", "/platform/js/page-init.js"], dir);
    assert.ok(html.indexOf("/platform/css/records.css") < html.indexOf("/platform/css/pass.css"), dir);
    assert.doesNotMatch(html, /<script>|\son[a-z]+=|javascript:|<script src="https?:/i, dir);
    assert.match(html, /<meta name="robots" content="noindex">/, dir);
  }
  const page = readFileSync(resolve(JS, "auth-page.js"), "utf8");
  for (const ac of ["'username'", "'current-password'", "'new-password'"]) assert.ok(page.includes(ac), ac);
  for (const src of [page, readFileSync(resolve(JS, "auth.js"), "utf8"), readFileSync(resolve(JS, "ticket.js"), "utf8"), readFileSync(resolve(JS, "account-page.js"), "utf8")]) {
    assert.doesNotMatch(src, /localStorage\.setItem|sessionStorage|document\.cookie/, "no credential is ever stored");
    assert.doesNotMatch(src.replace(/s\.innerHTML = markup/g, ""), /innerHTML/, "nothing from a server is parsed as HTML");
  }
  /* The approved copy (Ludum Profile, owner 2026-10-22). */
  assert.ok(page.includes("This is the name displayed on your profile, at game tables, and to other players. "), "Player Name note");
  assert.ok(page.includes("Your Player Name cannot be changed by you after registration.") && page.includes(" Ludum staff may change it when necessary."), "v1.7: players can't change it; staff may");
  assert.ok(page.includes("That name isn’t available. Choose another."), "v1.7: a reserved former name, never whose it was");
  assert.ok(page.includes("Used to authorize a new wallet or as an alternative way to sign in."));
  assert.ok(page.includes("Future sign-ins only require your authorized Keplr wallet and a verification signature."));
  assert.ok(page.includes("Your account isn’t created yet: finish with step 4."), "signing is not creating");
  /* `autocomplete: 'username'` is the approved markup for the Player Name field (password managers key on it). */
  assert.doesNotMatch(page.replace(/autocomplete: 'username'/g, ""), /[Uu]sername|change it once|recover it if you forget/, "no separate username, no one change, no recovery promise");
});

/* ---------------- v1.3 (1830Juno §16): Change Authorization Wallet, here on Ludum ---------------- */

const NEW = "juno1x" + "q".repeat(37);
const OP = "0011223344556677889900aabbccddee";
const replaceText = (purpose, signer, over = {}) => [
  "18COSMOS/PROFILE-AUTHORIZATION/v1",
  `Project 18XX: ${purpose === "REPLACE-APPROVE" ? "approve replacing this account's Authorization Wallet." : "make this wallet this account's new Authorization Wallet."}`,
  "This is not a transaction: it moves no funds and grants no permission to spend.",
  `Purpose: ${purpose}`,
  `Site: ${over.site ?? SITE}`,
  "Account: Ann.Player",
  `Authorization wallet: ${NEW}`,
  `Replaces: ${over.replaces ?? WALLET}`,
  `Signer: ${signer}`,
  `Operation: ${over.operation ?? OP}`,
  "Nonce: 99887766554433221100ffeeddccbbaa",
  "Expires: 2026-10-10T12:00:00.000Z",
].join("\n");
const switchable = (start) => {
  const k = { address: start, signed: [], connect: () => Promise.resolve({ address: k.address }), signArbitrary: (addr, text) => { k.signed.push([addr, text]); return Promise.resolve({ pubKey: "PK-" + addr.slice(-4), signature: "SIG-" + addr.slice(-4) }); } };
  return k;
};

test("v1.6 Change wallet in the approved order: the CURRENT wallet approves first (REPLACE-RELEASE, sent at once), then the NEW wallet accepts (REPLACE-ACCEPT, same operation); each text checked before Keplr signs", at(async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const OPN = "22222222222222222222222222222222";
  const S = fakeSession({ "wallet-challenge": [{ operation: OPN, texts: [{ purpose: "REPLACE-RELEASE", text: RELEASE_TEXT }] }, { operation: OPN, texts: [{ purpose: "REPLACE-ACCEPT", text: ACCEPT_TEXT }] }], "wallet-approve": { ok: true }, "wallet-replace": { ok: true, authorizationWallet: { address: OTHER } } });
  const keplr = switchable(OTHER);
  const input = { account: "Ann Player", current: WALLET };
  await assert.rejects(A.approveRelease(S, keplr, input), (e) => e.local === true && /Switch Keplr to your current Authorization Wallet/.test(e.message));
  eq([S.calls, keplr.signed], [[], []], "Keplr on another wallet: nothing minted, nothing signed");
  keplr.address = WALLET;
  const approved = await A.approveRelease(S, keplr, input);
  eq(approved, { operation: OPN });
  eq(S.calls, [["wallet-challenge", {}], ["wallet-approve", { operation: OPN, pubKey: "PK-" + WALLET.slice(-4), signature: "SIG-" + WALLET.slice(-4) }]]);
  eq(keplr.signed, [[WALLET, RELEASE_TEXT]]);
  await assert.rejects(A.acceptWallet(S, keplr, { ...input, operation: OPN }), (e) => e.local === true && /still on your current Authorization Wallet/.test(e.message));
  eq(S.calls.length, 2, "Keplr still on the current wallet: nothing asked");
  keplr.address = OTHER;
  const done = await A.acceptWallet(S, keplr, { ...input, operation: OPN });
  assert.equal(done.wallet, OTHER);
  eq(S.calls.slice(2), [["wallet-challenge", { operation: OPN, newWallet: OTHER }], ["wallet-replace", { operation: OPN, acceptPubKey: "PK-" + OTHER.slice(-4), acceptSignature: "SIG-" + OTHER.slice(-4) }]]);
  eq(keplr.signed[1], [OTHER, ACCEPT_TEXT]);
}));

test("v1.6 Change wallet: nothing is signed for another site, another wallet replaced or another request; the refusals in words", at(async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const OPN = "22222222222222222222222222222222";
  const input = { account: "Ann Player", current: WALLET, operation: OPN };
  for (const [label, text] of [["another site", ACCEPT_TEXT.replace("https://ludum.netadao.org", "https://evil.example")], ["another wallet replaced", ACCEPT_TEXT.replace("Replaces: " + WALLET, "Replaces: " + NEW)], ["another request", ACCEPT_TEXT.replaceAll(OPN, "f".repeat(32))]]) {
    const S = fakeSession({ "wallet-challenge": { operation: OPN, texts: [{ text }] } });
    const k = switchable(OTHER);
    await assert.rejects(A.acceptWallet(S, k, input), (e) => e.local === true, label);
    eq(k.signed, [], `${label}: nothing signed`);
  }
  const release = fakeSession({ "wallet-challenge": { operation: OPN, texts: [{ text: ACCEPT_TEXT }] } });
  const k2 = switchable(WALLET);
  await assert.rejects(A.approveRelease(release, k2, { account: "Ann Player", current: WALLET }), (e) => /different account action/.test(e.message));
  eq(k2.signed, [], "a text of another kind is never signed as the current wallet's approval");
  const reauth = fakeSession({ "wallet-challenge": { reject: { status: 403, error: "reauth-required" } } });
  await assert.rejects(A.approveRelease(reauth, switchable(WALLET), { account: "Ann Player", current: WALLET }), (e) => e.error === "reauth-required", "the page asks for the password again");
  assert.match(A.sentence({ error: "wallet-unavailable" }, "wallet"), /24 hours/);
  assert.match(A.sentence({ error: "reauth-required" }, "wallet"), /five minutes/);
  assert.match(A.sentence({ error: "stale" }, "wallet"), /Nothing was changed/);
}));

test("v1.3/v1.6: LudumSession reaches the profile and directory routes and the wallet actions -- and still nothing else of Play's account surface", async () => {
  const calls = [];
  const window = { location: { pathname: "/me/account/", assign() {} }, fetch: (url, init) => { calls.push({ url, init }); return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) }); } };
  vm.runInNewContext(readFileSync(resolve(JS, "session.js"), "utf8"), { window, Promise, JSON, Object, Error, encodeURIComponent, decodeURIComponent, String, isFinite });
  const S = window.LudumSession;
  await S.api("profile", {});
  await S.api("player", { name: "Marlowe" });
  await S.api("name-check", { name: "Marlowe" });
  await S.api("players", { query: "mar" });
  await S.auth("wallet-challenge", {});
  await S.auth("wallet-replace", { operation: OP });
  eq(calls.map((c) => c.url.replace("https://play.netadao.org/gs/api/ludum/v1/", "")), ["profile", "player", "name-check", "players", "auth/wallet-challenge", "auth/wallet-replace"]);
  for (const bad of ["authorization-wallet/challenge", "me", "account/me"]) await assert.rejects(S.auth(bad, {}), (e) => e.error === "bad-request");
  await assert.rejects(S.api("display-names", {}), (e) => e.error === "bad-request");
  assert.equal(calls.length, 6);
});

/* ---------------- v1.7 (owner, 2026-10-23): a staff change, approved with the staff member's Authorization Wallet ---------------- */


/** A STAFF-CONFIRM text exactly as Play's `profileAuthorizationText` makes it (two more lines after Purpose). */
function staffText(action, digest, over = {}) {
  const f = { site: SITE, account: "Caspian", wallet: WALLET, operation: "77777777777777777777777777777777", ...over };
  return ["18COSMOS/PROFILE-AUTHORIZATION/v1", "Project 18XX: confirm this staff action with this account's Authorization Wallet.", "This is not a transaction: it moves no funds and grants no permission to spend.",
    "Purpose: STAFF-CONFIRM", `Action: ${action}`, `Action digest: ${digest}`, `Site: ${f.site}`, `Account: ${f.account}`, `Authorization wallet: ${f.wallet}`, "Replaces: none", `Signer: ${f.wallet}`,
    `Operation: ${f.operation}`, `Nonce: ${f.operation}`, "Expires: 2026-10-10T12:00:00.000Z"].join("\n");
}
const RENAME = { name: "Kestral", to: "Kestrel", former: "reserve", reason: "Impersonating another player" };
const RENAME_CANONICAL = '["staff-rename","Kestral","Kestrel","reserve","Impersonating another player"]';
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

test("v1.7 staff approval: the canonical form and digest are the server's; the text parses with its Action lines", async () => {
  const A = load(["auth.js"], { crypto: globalThis.crypto, TextEncoder }).window.LudumAuth;
  assert.equal(A.canonicalAction("staff-rename", RENAME), RENAME_CANONICAL, "server/src/ludum/staffConfirm.ts canonicalAction, byte for byte");
  assert.equal(A.canonicalAction("moderation-decide", { caseId: "cc_1", revision: 2, status: "no-violation" }), '["moderation-decide","cc_1",2,"no-violation",null]');
  assert.equal(A.canonicalAction("staff-grant-admin", {}), null, "no other action");
  assert.equal(await A.actionDigest("staff-rename", RENAME), sha(RENAME_CANONICAL));
  const text = staffText("Change the Player Name Kestral to Kestrel; the former name is reserved", sha(RENAME_CANONICAL));
  const f = A.parseAuthorization(text);
  eq([f.purpose, f.action, f.actionDigest, f.account, f.signer], ["STAFF-CONFIRM", "Change the Player Name Kestral to Kestrel; the former name is reserved", sha(RENAME_CANONICAL), "Caspian", WALLET]);
  assert.equal(A.parseAuthorization(text.replace("Purpose: STAFF-CONFIRM", "Purpose: SIGN-IN")), null, "action lines on another purpose: no text");
  assert.equal(A.checkAuthorization(text, { purpose: "STAFF-CONFIRM", site: SITE, account: "Caspian", signer: WALLET, authorizationWallet: WALLET, now: BEFORE }) !== null, true, "no digest expected: nothing is signed");
});

test("v1.7 staff approval: Keplr on the account's Authorization Wallet; the text for EXACTLY this change checked before Keplr signs; the three fields the request carries", at(async () => {
  const A = load(["auth.js"], { crypto: globalThis.crypto, TextEncoder }).window.LudumAuth;
  const k = { address: WALLET, signed: [], connect: () => Promise.resolve({ address: k.address }), signArbitrary: (addr, text) => { k.signed.push([addr, text]); return Promise.resolve({ pubKey: "PK", signature: "SIG" }); }, keplr: () => ({}) };
  const asked = [];
  const S = (text) => ({ api: (route, body) => { asked.push([route, body]); return Promise.resolve({ operation: "77777777777777777777777777777777", text }); } });
  const input = { route: "staff-rename", body: RENAME, account: "Caspian", authorizationWallet: WALLET };
  const good = staffText("Change the Player Name Kestral to Kestrel; the former name is reserved", sha(RENAME_CANONICAL));
  const proof = await A.confirmStaffAction(S(good), k, input);
  eq(proof, { confirmOperation: "77777777777777777777777777777777", confirmPubKey: "PK", confirmSignature: "SIG" });
  eq(asked, [["staff-confirm", { route: "staff-rename", ...RENAME }]]);
  eq(k.signed, [[WALLET, good]]);

  /* A text minted for another reason: refused before Keplr is asked. */
  k.signed = [];
  const other = staffText("Change the Player Name Kestral to Kestrel; the former name is reserved", sha(RENAME_CANONICAL.replace("Impersonating", "Another")));
  await assert.rejects(A.confirmStaffAction(S(other), k, input), /different change than the one on this page/);
  /* Another site, another account: refused. */
  await assert.rejects(A.confirmStaffAction(S(staffText("x", sha(RENAME_CANONICAL), { site: "https://evil.example" })), k, input), /another site/);
  await assert.rejects(A.confirmStaffAction(S(staffText("x", sha(RENAME_CANONICAL), { account: "Mallory" })), k, input), /another account/);
  /* Keplr on another wallet: refused before anything is minted. */
  k.address = OTHER;
  asked.length = 0;
  await assert.rejects(A.confirmStaffAction(S(good), k, input), /Switch Keplr to your Authorization Wallet/);
  eq(asked, [], "nothing minted for another wallet");
  eq(k.signed, [], "nothing was ever signed for a refused text");
  assert.match(A.staffApprovalSentence({ error: "confirmation-required", detail: "used" }, k), /didn’t check out .* Nothing was changed\. Approve again\./);
  assert.match(A.staffApprovalSentence({ message: "x" }, {}), /Keplr isn’t in this browser/);
}));
