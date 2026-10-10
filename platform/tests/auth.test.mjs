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

test("refusals in the account's words; one answer for a wrong username or password", () => {
  const A = load(["auth.js"]).window.LudumAuth;
  assert.match(A.sentence({ error: "invalid-credential" }, "sign-in"), /don.t match an account/);
  assert.match(A.sentence({ error: "invalid-credential" }, "confirm"), /doesn.t match this account/);
  assert.match(A.sentence({ error: "rate-limited", retryAfterMs: 61000 }, "sign-in"), /Wait 61 seconds/);
  assert.match(A.sentence({ error: "bad-password", problem: "too-short" }, "create"), /at least 12/);
  assert.match(A.sentence({ error: "username-taken" }, "create"), /taken/);
  assert.match(A.sentence({ error: "bad-request" }, "sign-in"), /don.t match an account/, "a malformed sign-in reads as a wrong one");
  assert.match(A.sentence(null, "sign-in"), /could not be reached/);
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

test("sign-in: a reset (ended) session is replaced only on the press, then the username and password are sent once", async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const S = fakeSession({ start: [{ reject: { status: 401, error: "session-ended" } }, {}], "sign-in": { ok: true, profile: { name: "Ann" } } });
  await A.signIn(S, { username: "ann", password: "correct horse battery" });
  eq(S.calls, [["start", {}], ["start", { fresh: true }], ["sign-in", { username: "ann", password: "correct horse battery" }]]);
  const refused = fakeSession({ start: {}, "sign-in": { reject: { status: 403, error: "invalid-credential" } } });
  await assert.rejects(A.signIn(refused, { username: "ann", password: "x" }), (e) => e.error === "invalid-credential");
});

test("create: the CREATE text is checked BEFORE Keplr signs; a text for another site is never signed", async () => {
  const A = load(["auth.js"], {}).window.LudumAuth;
  const ok = fakeSession({ start: {}, authorization: { operation: "0123456789abcdef0123456789abcdef", texts: [{ text: CREATE_TEXT }] }, create: { ok: true } });
  const keplr = fakeKeplr();
  const steps = [];
  /* The text expires at 12:00 on 10 Oct 2026; the check reads the clock, so run it "before" then. */
  const realNow = Date.now;
  Date.now = () => BEFORE;
  try {
    await A.createAccount(ok, keplr, { username: "Ann.Player", name: "Ann", password: "correct horse battery" }, (s) => steps.push(s));
  } finally { Date.now = realNow; }
  eq(keplr.signed, [[WALLET, CREATE_TEXT]]);
  eq(steps, ["keplr", "sign", "create"]);
  eq(ok.calls.at(-1), ["create", { username: "Ann.Player", password: "correct horse battery", name: "Ann", operation: "0123456789abcdef0123456789abcdef", pubKey: "PK", signature: "SIG" }]);

  const evil = fakeSession({ start: {}, authorization: { operation: "0123456789abcdef0123456789abcdef", texts: [{ text: CREATE_TEXT.replace("https://ludum.netadao.org", "https://evil.example") }] } });
  const keplr2 = fakeKeplr();
  await assert.rejects(A.createAccount(evil, keplr2, { username: "Ann.Player", name: "Ann", password: "correct horse battery" }), (e) => e.local === true && /another site/.test(e.message));
  eq(keplr2.signed, [], "Keplr was never asked");
  assert.ok(!evil.calls.some(([a]) => a === "create"));

  /* Form problems are said before any request or Keplr. */
  const none = fakeSession({});
  await assert.rejects(A.createAccount(none, fakeKeplr(), { username: "has space", name: "Ann", password: "correct horse battery" }), (e) => e.error === "bad-username");
  await assert.rejects(A.createAccount(none, fakeKeplr(), { username: "ann", name: "Ann", password: "short" }), (e) => e.error === "bad-password");
  await assert.rejects(A.createAccount(none, fakeKeplr(), { username: "ann", name: "  ", password: "correct horse battery" }), (e) => e.error === "bad-name");
  eq(none.calls, []);
});

test("recover: the RECOVER text, signed by the wallet Keplr is on; a CREATE text offered instead is refused", async () => {
  const A = load(["auth.js"]).window.LudumAuth;
  const realNow = Date.now;
  Date.now = () => BEFORE;
  try {
    const S = fakeSession({ start: {}, authorization: { operation: "fedcba9876543210fedcba9876543210", texts: [{ text: RECOVER_TEXT }] }, recover: { ok: true, signedOut: 2 } });
    const keplr = fakeKeplr();
    const r = await A.recover(S, keplr, { username: "ann.player", newPassword: "a brand new passphrase" });
    assert.equal(r.signedOut, 2);
    eq(S.calls[1], ["authorization", { purpose: "recover", username: "ann.player", wallet: WALLET }]);
    eq(S.calls.at(-1), ["recover", { operation: "fedcba9876543210fedcba9876543210", pubKey: "PK", signature: "SIG", newPassword: "a brand new passphrase" }]);
    const swapped = fakeSession({ start: {}, authorization: { operation: "x", texts: [{ text: CREATE_TEXT }] } });
    const k2 = fakeKeplr();
    await assert.rejects(A.recover(swapped, k2, { username: "ann.player", newPassword: "a brand new passphrase" }), (e) => /different account action/.test(e.message));
    eq(k2.signed, []);
    const otherWallet = fakeSession({ start: {}, authorization: { operation: "x", texts: [{ text: RECOVER_TEXT }] } });
    const k3 = fakeKeplr(OTHER);
    await assert.rejects(A.recover(otherWallet, k3, { username: "ann.player", newPassword: "a brand new passphrase" }), (e) => /another wallet/.test(e.message));
    eq(k3.signed, []);
  } finally { Date.now = realNow; }
});

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

test("LudumSession.auth posts to auth/<action> with the §2.1 credentialed fetch; only the seven actions; 204 is {}", async () => {
  const calls = [];
  const window = { location: { pathname: "/me/sign-in/", assign() {} }, fetch: (url, init) => { calls.push({ url, init }); return Promise.resolve({ status: url.endsWith("sign-out") ? 204 : 200, json: () => (url.endsWith("sign-out") ? Promise.reject(new Error("empty")) : Promise.resolve({ ok: true })) }); } };
  vm.runInNewContext(readFileSync(resolve(JS, "session.js"), "utf8"), { window, Promise, JSON, Object, Error, encodeURIComponent, decodeURIComponent, String, isFinite });
  const S = window.LudumSession;
  await S.auth("sign-in", { username: "ann", password: "pw" });
  assert.equal(calls[0].url, "https://play.netadao.org/gs/api/ludum/v1/auth/sign-in");
  eq(calls[0].init, { method: "POST", mode: "cors", credentials: "include", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: '{"username":"ann","password":"pw"}' });
  eq(await S.auth("sign-out", {}), {});
  for (const bad of ["password", "me", "../account/login", "session", "authorization-wallet/replace"]) await assert.rejects(S.auth(bad, {}), (e) => e.error === "bad-request");
  await assert.rejects(S.api("auth/sign-in", {}), (e) => e.error === "bad-request", "api() alone never reaches auth/*");
  assert.equal(calls.length, 2);
});

/* ---------------- the pages ---------------- */

test("the account pages: the §2.4 CSP first, no third-party script, the forms' autocomplete, and nothing stored", () => {
  for (const [dir, kind, gov] of [["sign-in", "sign-in", false], ["sign-up", "sign-up", true], ["recover", "recover", true]]) {
    const html = read(`me/${dir}/index.html`);
    assert.match(html, /<head>\n<meta http-equiv="Content-Security-Policy"/, dir);
    assert.match(html, new RegExp(`data-ludum-auth="${kind}"`), dir);
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    eq(order, ["/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", ...(gov ? ["/platform/js/gov.js"] : []), "/platform/js/auth.js", "/platform/js/account-menu.js", "/platform/js/auth-page.js", "/platform/js/page-init.js"], dir);
    assert.doesNotMatch(html, /<script>|\son[a-z]+=|javascript:/i, dir);
    assert.match(html, /<meta name="robots" content="noindex">/, dir);
  }
  const page = readFileSync(resolve(JS, "auth-page.js"), "utf8");
  for (const ac of ["'username'", "'current-password'", "'new-password'"]) assert.ok(page.includes(ac), ac);
  for (const src of [page, readFileSync(resolve(JS, "auth.js"), "utf8")]) {
    assert.doesNotMatch(src, /localStorage\.setItem|sessionStorage|document\.cookie|innerHTML/, "no credential is ever stored or parsed as HTML");
  }
});
