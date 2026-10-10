// The governance pages as Claude Design drew them (Appeals & Disputes, Case file, New appeal, Proposal, the list), run
// for real (gov.js + gov-case.js + records.js + gov-page.js) in a small fake DOM against the fixture world.
// Pinned: the governance trust path is unchanged -- chain reads only on load (GET, the pinned REST endpoint), Keplr never
// touched on load, the server record never enables an action, the deadline guard and the membership checks gate every
// transaction, link-by-decoding only; and nothing is invented when a read fails.
// Run from the repository root: node --test platform/tests/gov-pages-design.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as F from "./gov-fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.parentNode = null; this.attributes = {}; this.listeners = {}; this.className = ""; this.style = {}; this._text = null; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { if (c == null) return c; if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  fire(t) { (this.listeners[t] || []).forEach((f) => f({ currentTarget: this, target: this, preventDefault() {} })); }
  click() { this.fire("click"); }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return (this._text ?? "") + this.children.map((c) => c.textContent).join(""); }
  set innerHTML(_) { this.children = []; }
  get id() { return this.getAttribute("id"); }
  find(pred) { if (pred(this)) return this; for (const c of this.children) { const f = c.find?.(pred); if (f) return f; } return null; }
  findAll(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.findAll?.(pred, out); return out; }
}
class Text { constructor(t) { this.text = String(t); this.parentNode = null; } get textContent() { return this.text; } }

async function load(page, search = "", { world = F.world(), sessionApi, withSession = true, who = null, wait = 60, hash = "" } = {}) {
  const body = new Node("body");
  body.setAttribute("data-gov-page", page);
  for (const id of ["gv-frame", "gv-body"]) { const n = new Node("div"); n.setAttribute("id", id); body.appendChild(n); }
  const head = new Node("head");
  const document = {
    readyState: "complete", title: "", body, head,
    createElement: (t) => new Node(t), createTextNode: (t) => new Text(t),
    getElementById: (id) => body.find((n) => n.getAttribute && n.getAttribute("id") === id),
    addEventListener() {},
  };
  const keplr = { calls: 0, experimentalSuggestChain() { this.calls += 1; return Promise.resolve(); }, enable() { this.calls += 1; return Promise.resolve(); }, getKey() { this.calls += 1; return Promise.resolve({ bech32Address: F.MEMBER, name: "m", pubKey: new Uint8Array(33) }); } };
  const requests = [], apiCalls = [], replaced = [], assigned = [];
  const storage = new Map();
  const ctx = {
    document, URLSearchParams, TextEncoder, TextDecoder, atob, btoa, Promise, AbortController, setTimeout: (f) => setTimeout(f, 0), clearTimeout,
    setInterval: () => 0, Date, JSON, Math, Number, String, Object, Array, Error, RegExp, Boolean, BigInt, isFinite,
    location: { search, hash, href: "https://ludum.netadao.org/x/" + search, pathname: "/x/", reload() {}, replace: (u) => replaced.push(u), assign: (u) => assigned.push(u), ancestorOrigins: [] },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    fetch: F.restFetch(world, (u, init) => requests.push([u, init && init.method])), keplr,
  };
  ctx.window = ctx; ctx.top = ctx; ctx.self = ctx;
  if (withSession) ctx.LudumSession = { api: (route, b, options) => { apiCalls.push([route, b, options]); return sessionApi ? sessionApi(route, b) : Promise.resolve(F.caseRecord(Number(b.chainGameId))); }, ...(who ? { whoami: () => Promise.resolve(who) } : {}) };
  vm.createContext(ctx);
  for (const f of ["platform/js/records.js", "platform/js/gov.js", "platform/js/gov-case.js", "platform/js/gov-page.js"]) vm.runInContext(src(f), ctx, { filename: f });
  const settle = async () => { for (let i = 0; i < wait; i++) await new Promise((r) => setImmediate(r)); };
  await settle();
  const text = () => body.textContent.replace(/\s+/g, " ");
  const buttons = (re) => body.findAll((n) => n.tagName === "button" && re.test(n.textContent));
  const links = (re) => body.findAll((n) => n.tagName === "a" && re.test(n.textContent));
  async function connect() { const b = buttons(/^Connect Keplr$/)[0]; assert.ok(b, "a Connect Keplr control"); b.click(); await settle(); }
  return { ctx, body, head, keplr, requests, apiCalls, replaced, assigned, text, buttons, links, connect, settle, storage };
}
const disabled = (b) => b.getAttribute("aria-disabled") === "true";
const caseOf = (rec) => () => Promise.resolve(rec);

/* ================= Appeals & Disputes (/disputes/) ================= */

test("register: the pending-review table, from the chain, with Play's names only when its wallets match", async () => {
  const p = await load("register", "", { who: { signedIn: true, account: { name: "Marlowe", username: "m" }, roles: { reviewer: false } } });
  const t = p.text();
  for (const want of ["Your record", "Appeals & Disputes", "Pending review", "Escrow game 7", "Escrow game 6", "seat 2", "Marlowe", "5.00", "Proposal 13", "Under appeal", "Proposal 11"]) assert.ok(t.includes(want), want);
  assert.equal(p.keplr.calls, 0, "Keplr is never touched on load");
  assert.equal(p.head.children.length, 0, "the signing bundle is never loaded on load");
  for (const [u, method] of p.requests) { assert.ok(u.startsWith(F.PIN.rest), u); assert.equal(method, "GET", "page load never POSTs to the chain"); }
  assert.ok(p.apiCalls.every(([route]) => route === "case"), "only Play's public case route");
});

test("register: proposals with the design's filters and counts; percentages are the proposal's own", async () => {
  const p = await load("register");
  const t = p.text();
  for (const want of ["All 4", "Voting 1", "Passed 1", "Executed 1", "Failed 1", "41 · 12 · 6", "Execution failed", "Appeal 7: uphold"]) assert.ok(t.includes(want), want);
  const failedTab = p.buttons(/^Failed/)[0];
  failedTab.click();
  const rows = p.body.findAll((n) => n.tagName === "tr" && n.getAttribute("data-ld-status"));
  assert.deepEqual(rows.map((r) => r.getAttribute("data-ld-status")), ["failed"]);
  assert.equal(failedTab.getAttribute("aria-pressed"), "true");
});

test("register: a member's cues appear only for a connected member wallet", async () => {
  const p = await load("register");
  assert.ok(!p.text().includes("Ready to execute"), "no cue before a wallet is connected");
  await p.connect();
  assert.ok(p.text().includes("Member"));
  assert.ok(p.text().includes("4.0%"), "voting power: the cw4 weight over the group's total weight");
  assert.ok(p.text().includes("Ready to execute"));
  assert.ok(p.text().includes("Your vote is open"));
  assert.ok(p.storage.size === 1, "the member wallet is remembered for the account menu");
});

test("register: nothing disputed and no proposals -> empty states; an unreadable chain -> unavailable, nothing invented", async () => {
  const empty = F.world({ games: () => ({ data: { games: [] } }), reverse_proposals: () => ({ data: { proposals: [] } }) });
  const p = await load("register", "", { world: empty });
  assert.match(p.text(), /Nothing pending/);
  assert.match(p.text(), /No proposals yet/);
  const down = await load("register", "", { world: F.world({ games: () => ({ status: 502, message: "bad gateway" }) }) });
  assert.match(down.text(), /Unavailable.*could not be read from the chain/);
  assert.doesNotMatch(down.text(), /Escrow game 7/);
});

/* ================= Case file (/disputes/case/?id=) ================= */

test("case: docket, parties, the disputed result, evidence, the four outcomes and the appeal -- from the chain and Play's agreeing record", async () => {
  const p = await load("case", "?id=7", { who: { signedIn: true, account: { name: "Marlowe", username: "m" } } });
  const t = p.text();
  for (const want of ["Docket", "Result recorded", "Challenged", "Appeal proposed", "Voting closes", "Resolver deadline", "Parties", "Teodora", "11.940882", "Challenger · bond 5.00",
    "The disputed result", "$6,940", "Recorded settlement", "29.25", "Settlement key 2 · trusted", "Evidence", "1,486 entries", "matches neither", "agree with the chain facts",
    "What each resolution would do", "13.982058", "by the corrected weights", "9.75", "Timeout", "5.00 back", "The appeal", "41.0%", "Quorum 20%", "You are a party", "34.25 JUNOX", "Chain facts from escrow"]) {
    assert.ok(t.includes(want), want);
  }
  assert.equal(p.apiCalls.length, 1, "exactly one `case` call");
  assert.deepEqual(JSON.parse(JSON.stringify(p.apiCalls[0][1])), { chainGameId: "7" });
  assert.equal(p.apiCalls[0][2], undefined, "never a sign-in redirect");
  assert.equal(p.keplr.calls, 0);
  assert.equal(p.buttons(/Uphold|Annul|Sign/).length, 0, "the case file signs nothing itself: proposing is New appeal's");
});

test("case: every server failure says what happened and shows nothing of Play's record; the chain facts stand", async () => {
  const fail = (status, detail) => () => Promise.reject({ status, error: "x", detail });
  const cases = [
    [fail(404, "the escrow has no such game"), /No such game.*this browser read one from the chain.*disagree/],
    [fail(503, "the chain could not be read"), /could not produce this record \(the chain could not be read\)/],
    [fail(400, "bad"), /Refused/],
    [fail(429), /Busy/],
    [fail(0, "Play could not be reached"), /could not be reached from this browser/],
    [fail(500), /answered unexpectedly \(HTTP 500\)/],
    [caseOf(F.caseRecord(8)), /Rejected.*not #7/],
    [caseOf({ ...F.caseRecord(7), seats: F.caseRecord(7).seats.map((s, i) => (i === 1 ? { ...s, wallet: "juno1" + "y".repeat(38) } : s)) }), /Disagrees with the chain.*seat 1 differs/],
  ];
  for (const [answer, want] of cases) {
    const p = await load("case", "?id=7", { sessionApi: answer });
    assert.match(p.text(), want);
    assert.doesNotMatch(p.text(), /\$6,940|Teodora|matches neither/, "nothing from the record is shown");
    assert.match(p.text(), /Chain facts from escrow/, "the chain facts still stand on their own");
    assert.match(p.text(), /13\.982058/, "the escrow's arithmetic needs no server");
  }
});

test("case: a game the chain does not have; a chain that cannot be read; no session at all", async () => {
  const missing = await load("case", "?id=9", { sessionApi: () => Promise.reject({ status: 404, error: "not-found" }) });
  assert.match(missing.text(), /No such game.*has no game #9/);
  assert.match(missing.text(), /The server also reports that escrow .* has no game #9/);
  const down = await load("case", "?id=7", { world: F.world({ game: () => ({ status: 502, message: "bad gateway" }) }) });
  assert.match(down.text(), /could not be read from this browser/);
  assert.doesNotMatch(down.text(), /Create appeal/, "no action without this browser's chain facts");
  const alone = await load("case", "?id=7", { withSession: false });
  assert.match(alone.text(), /no connection to play\.netadao\.org/);
  assert.match(alone.text(), /Seat 0/, "chain seats without names");
});

test("case: the server record never enables an action -- a settled chain game offers no appeal; the deadline guard holds", async () => {
  const settled = F.world({ game: (c, a) => ({ data: F.chainGame(a.chain_game_id, { state: "settled", dispute: { ...F.chainGame(7).game.dispute, resolution: "upheld", resolved_at: F.ns(F.NOW) } }) }), reverse_proposals: () => ({ data: { proposals: [] } }) });
  const s = await load("case", "?id=7", { world: settled });
  assert.match(s.text(), /Resolved · upheld/);
  assert.match(s.text(), /the server read the escrow as disputed; this browser read settled/);
  assert.equal(s.links(/Create appeal/).length, 0);
  const late = F.world({ reverse_proposals: () => ({ data: { proposals: [] } }), game: (c, a) => { const g = F.chainGame(a.chain_game_id); g.deadlines.resolver_timeout_at = F.ns(F.NOW + 3 * 86400); return { data: g }; } });
  const l = await load("case", "?id=7", { world: late });
  assert.match(l.text(), /Deadline guard/);
  assert.equal(l.links(/Create appeal/).length, 0);
  const open = await load("case", "?id=7", { world: F.world({ reverse_proposals: () => ({ data: { proposals: [] } }) }) });
  assert.equal(open.links(/Create appeal/).length, 1, "a disputed game with time left links to New appeal");
  assert.equal(open.links(/Create appeal/)[0].getAttribute("href"), "/governance/new/?case=7");
});

test("case: only proposals that decode to THIS game's Resolve on the pinned escrow are linked", async () => {
  const props = [F.proposal(5, 8, "open"), { ...F.proposal(6, 7, "open"), proposal: { ...F.proposal(6, 7, "open").proposal, msgs: [{ wasm: { execute: { contract_addr: "juno1" + "x".repeat(58), msg: F.proposal(6, 7, "open").proposal.msgs[0].wasm.execute.msg, funds: [] } } }] } }, F.proposal(4, 7, "open")];
  const p = await load("case", "?id=7", { world: F.world({ reverse_proposals: () => ({ data: { proposals: props } }) }) });
  assert.match(p.text(), /Proposal 4/);
  assert.doesNotMatch(p.text(), /Proposal 5|Proposal 6/);
});

test("case: an untrusted (compromised) settlement key changes the Timeout outcome, never invents payouts", async () => {
  const p = await load("case", "?id=7", { world: F.world({ signer_key: () => ({ data: { key: { key_id: 2, compromised: true } } }) }) });
  assert.match(p.text(), /Settlement key 2 · compromised/);
  assert.match(p.text(), /Its signer key is compromised: the escrow refunds or settles on a trusted checkpoint/);
});

/* ================= New appeal (/governance/new/?case=) ================= */

test("new appeal: the six steps; submit stays disabled until a member wallet, an outcome and the read check -- then the exact message is simulated", async () => {
  const p = await load("new", "?case=7");
  const t = p.text();
  for (const want of ["The case", "Still disputed", "has Proposal 13", "The outcome", "Title and rationale", "The message", "Timing", "Voting period", "Enough", "Deposit", "None", "Submit", "Your wallet, your proposal"]) assert.ok(t.includes(want), want);
  let submit = p.buttons(/Sign and submit with Keplr/)[0];
  assert.ok(disabled(submit));
  assert.match(p.text(), /Not yet: .*choose an outcome.*connect a Keplr wallet.*confirm you have read the case file/);
  await p.connect();
  const annul = p.body.find((n) => n.tagName === "input" && n.getAttribute("value") === "annul");
  annul.fire("change");
  const title = p.body.find((n) => n.getAttribute && n.getAttribute("id") === "nw-t");
  assert.equal(title.getAttribute("value"), "Appeal 7: annul", "the title follows the outcome until edited");
  const read = p.body.find((n) => n.getAttribute && n.getAttribute("id") === "nw-read");
  read.checked = true; read.fire("change");
  submit = p.buttons(/Sign and submit with Keplr/)[0];
  assert.ok(!disabled(submit), p.text().match(/Not yet: [^.]*/)?.[0]);
  let captured = null;
  p.ctx.LudumGov.prepare = (_r, spec) => { captured = spec; return new Promise(() => {}); };
  submit.click();
  assert.equal(captured.contract, F.PIN.preProposeSingle);
  const inner = captured.msg.propose.msg.propose;
  assert.equal(inner.title, "Appeal 7: annul");
  assert.equal(JSON.parse(Buffer.from(inner.msgs[0].wasm.execute.msg, "base64").toString()).resolve.outcome.annul !== undefined, true);
  assert.equal(inner.msgs[0].wasm.execute.contract_addr, F.PIN.escrow);
  assert.equal(JSON.stringify(captured.funds), "[]");
  assert.match(inner.description, /Case: https:\/\/ludum\.netadao\.org\/disputes\/case\/\?id=7/);
});

test("new appeal: a proposer's title and rationale go on chain; the case facts follow the rationale", async () => {
  const p = await load("new", "?case=7");
  await p.connect();
  p.body.find((n) => n.getAttribute && n.getAttribute("value") === "uphold").fire("change");
  const title = p.body.find((n) => n.getAttribute && n.getAttribute("id") === "nw-t");
  title.value = "Appeal 0007: uphold the record"; title.fire("input"); title.fire("change");
  const rat = p.body.find((n) => n.getAttribute && n.getAttribute("id") === "nw-r");
  rat.value = "The settlement matches the log."; rat.fire("input"); rat.fire("change");
  const read = p.body.find((n) => n.getAttribute && n.getAttribute("id") === "nw-read"); read.checked = true; read.fire("change");
  let captured = null;
  p.ctx.LudumGov.prepare = (_r, spec) => { captured = spec; return new Promise(() => {}); };
  p.buttons(/Sign and submit with Keplr/)[0].click();
  const inner = captured.msg.propose.msg.propose;
  assert.equal(inner.title, "Appeal 0007: uphold the record");
  assert.match(inner.description, /^The settlement matches the log\.\n\n— Case facts, read from the chain —\nEscrow 2\.1\.0 game #7/);
});

test("new appeal: a non-member, a settled game and the deadline guard each keep submit disabled; Replace needs Play's agreeing record", async () => {
  const outsider = await load("new", "?case=7");
  outsider.ctx.keplr.getKey = () => Promise.resolve({ bech32Address: "juno1" + "n".repeat(38), name: "n", pubKey: new Uint8Array(33) });
  await outsider.connect();
  outsider.body.find((n) => n.getAttribute && n.getAttribute("value") === "annul").fire("change");
  const r1 = outsider.body.find((n) => n.getAttribute && n.getAttribute("id") === "nw-read"); r1.checked = true; r1.fire("change");
  assert.ok(disabled(outsider.buttons(/Sign and submit/)[0]));
  assert.match(outsider.text(), /not a Ludum DAO member the pre-propose module allows/);
  const late = F.world({ game: (c, a) => { const g = F.chainGame(a.chain_game_id); g.deadlines.resolver_timeout_at = F.ns(F.NOW + 3 * 86400); return { data: g }; } });
  const l = await load("new", "?case=7", { world: late });
  assert.match(l.text(), /Not enough/);
  assert.match(l.text(), /Deadline guard/);
  const noServer = await load("new", "?case=7", { withSession: false });
  const replace = noServer.body.find((n) => n.tagName === "input" && n.getAttribute("value") === "replace");
  assert.equal(replace.getAttribute("disabled"), "", "Replace is disabled without Play's terminal record");
  assert.match(noServer.text(), /it needs Play’s terminal record/);
  const withServer = await load("new", "?case=7");
  const r2 = withServer.body.find((n) => n.tagName === "input" && n.getAttribute("value") === "replace");
  assert.equal(r2.getAttribute("disabled"), null);
  r2.fire("change");
  assert.ok(withServer.body.find((n) => n.getAttribute && n.getAttribute("id") === "nw-w2"), "one weight field per seat");
  assert.match(withServer.text(), /"replace"/, "the message shows the corrected payload");
});

/* ================= Proposal (/governance/proposal/?id=) ================= */

test("proposal (open): the tally, a member's vote form, what it does and its record", async () => {
  const p = await load("proposal", "?id=13");
  assert.match(p.text(), /Appeal 7: uphold/);
  assert.match(p.text(), /41\.0%/);
  assert.equal(p.buttons(/Vote with Keplr/).length, 0, "no vote form before a member wallet");
  await p.connect();
  assert.match(p.text(), /Your vote is open/);
  const vote = p.buttons(/Vote with Keplr/)[0];
  assert.ok(vote && !disabled(vote));
  let captured = null;
  p.ctx.LudumGov.prepare = (_r, spec) => { captured = spec; return new Promise(() => {}); };
  p.body.find((n) => n.tagName === "input" && n.getAttribute("value") === "no").fire("change");
  vote.click();
  assert.deepEqual(JSON.parse(JSON.stringify(captured.msg)), { vote: { proposal_id: 13, vote: "no", rationale: null } });
  assert.equal(captured.contract, F.PIN.proposalSingle);
  for (const want of ["What it does", "\"resolve\"", "Not yet", "Submitted", "tx 2A77…D013", "Resolver deadline for game 7"]) assert.ok(p.text().includes(want), want);
});

test("proposal (passed): execution checks read now; Execute only for a member (the module lets only members execute)", async () => {
  const p = await load("proposal", "?id=11");
  assert.ok(disabled(p.buttons(/Execute with Keplr/)[0]), "disabled before a member wallet");
  await p.connect();
  const exec = p.buttons(/Execute with Keplr/)[0];
  assert.ok(!disabled(exec));
  assert.match(p.text(), /Ready to execute/);
  let captured = null;
  p.ctx.LudumGov.prepare = (_r, spec) => { captured = spec; return new Promise(() => {}); };
  exec.click();
  assert.deepEqual(JSON.parse(JSON.stringify(captured.msg)), { execute: { proposal_id: 11 } });
  const resolved = F.world({ game: (c, a) => ({ data: F.chainGame(a.chain_game_id, { state: "annulled" }) }) });
  const r = await load("proposal", "?id=11", { world: resolved });
  await r.connect();
  assert.ok(disabled(r.buttons(/Execute with Keplr/)[0]), "a game no longer disputed: execution would fail, so it is not offered");
});

test("proposal (execution failed): the stop notice and the chain's own receipt; nothing retried", async () => {
  const p = await load("proposal", "?id=12");
  for (const want of ["Execution failed", "does not retry", "B90E…14F7", "201,334 used of 520,000", "0.039 JUNOX", "wrong state"]) assert.ok(p.text().includes(want), want);
  assert.equal(p.buttons(/Execute|Vote|Close/).length, 0);
});

test("proposal: an unreadable tx index leaves the record to the module's own facts; a missing proposal says so", async () => {
  const p = await load("proposal", "?id=13", { world: F.world({ txs: () => { throw new Error("index off"); } }) });
  assert.match(p.text(), /transaction index could not be read/);
  const none = await load("proposal", "?id=99");
  assert.match(none.text(), /No such proposal/);
});

/* ================= /governance/ and the design's addresses ================= */

test("governance list: the proposals; an old #proposal-N link is forwarded to the proposal page", async () => {
  const p = await load("governance");
  assert.match(p.text(), /Appeal 7: uphold/);
  const old = await load("governance", "", { hash: "#proposal-13" });
  assert.deepEqual(old.replaced, ["/governance/proposal/?id=13"]);
  const junk = await load("governance", "", { hash: "#proposal-13x" });
  assert.deepEqual(junk.replaced, [], "only an exact old anchor is forwarded");
});

test("route map: the design's /account/ and /cases/ addresses go to the engineering routes, and nothing else", () => {
  const require = createRequire(import.meta.url);
  const M = require("../js/route-map.js");
  const cases = {
    "/account/": "/me/", "/account": "/me/", "/account/details/": "/me/account/", "/account/games/g_xfqa37t6wt6ajvnbx5j3f5dn2g/": "/me/game/?id=g_xfqa37t6wt6ajvnbx5j3f5dn2g",
    "/account/moderation/": "/moderation/", ["/account/moderation/cases/cc_" + "a".repeat(32) + "/"]: "/moderation/case/?id=cc_" + "a".repeat(32),
    "/account/appeals/": "/disputes/", "/account/appeals/new/": "/governance/new/", "/account/appeals/proposals/13/": "/governance/proposal/?id=13", "/cases/52/": "/disputes/case/?id=52",
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(M.mapDesignPath(from), to, from);
  for (const bad of ["/cases/x/", "/cases//evil.example/", "/account/games/../x", "/accountx/", "/cases/052/", "//evil.example/cases/1/", "/account/appeals/proposals/0/"]) assert.equal(M.mapDesignPath(bad), null, bad);
});

test("every governance page: the §2.4 CSP first, the records layer, no inline script, the scripts in order", () => {
  for (const [rel, kind] of [["disputes/index.html", "register"], ["disputes/case/index.html", "case"], ["governance/index.html", "governance"], ["governance/new/index.html", "new"], ["governance/proposal/index.html", "proposal"]]) {
    const html = src(rel);
    assert.match(html, /<head>\n<meta http-equiv="Content-Security-Policy"/, rel);
    assert.match(html, new RegExp(`data-gov-page="${kind}"`), rel);
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, ["https://netadao.org/radio/radio.js", "/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", "/platform/js/account-menu.js", "/platform/js/gov.js", "/platform/js/gov-case.js", "/platform/js/gov-page.js"], rel);
    assert.ok(html.indexOf("/platform/css/records.css") > html.indexOf("/design-system/css/ludum.css"), rel);
    assert.doesNotMatch(html, /<script>|\son[a-z]+=|javascript:|ld-specimen/i, rel);
  }
  assert.match(src("404.html"), /<script src="\/platform\/js\/route-map\.js"><\/script>\n<script src="\/design-system\/js\/ludum\.js">/);
});
