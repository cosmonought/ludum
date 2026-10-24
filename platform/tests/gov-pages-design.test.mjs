// The governance pages as Claude Design drew them (the proposals, a proposal) and the Disputes tab, run for real
// (records.js + pass.js + work.js + gov.js + gov-page.js; disputes-page.js) in a small fake DOM against the fixture world.
// LUDUM v1.7 (owner, 2026-10-24): the retired JUNOX escrow is no Ludum feature -- no disputed tables, case file, new
// appeal, Case column, game checks or resolver deadline, and the world answers no escrow query. Pinned: the governance
// trust path is unchanged -- chain reads only on load (GET, the pinned REST endpoint), Keplr never touched on load, the
// pins, the framing guard and the membership checks gate every transaction; nothing is invented when a read fails; and
// Disputes is a neutral page that reads no chain of its own and counts nothing.
// Run from the repository root: node --test platform/tests/gov-pages-design.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as F from "./gov-fixtures.mjs";
import { createHash } from "node:crypto";
const requireCjs = createRequire(import.meta.url);

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
  /** Enough of querySelector for disputes-page.js: "[attr]". */
  querySelector(sel) { const m = /^\[([a-z-]+)\]$/.exec(sel); return m ? this.find((n) => n !== this && n.getAttribute && n.getAttribute(m[1]) !== null) : null; }
}
class Text { constructor(t) { this.text = String(t); this.parentNode = null; } get textContent() { return this.text; } }

function context(world, requests, extra = {}) {
  const body = new Node("body");
  const head = new Node("head");
  const document = {
    readyState: "complete", title: "", body, head,
    createElement: (t) => new Node(t), createTextNode: (t) => new Text(t),
    getElementById: (id) => body.find((n) => n.getAttribute && n.getAttribute("id") === id),
    querySelector: (sel) => body.querySelector(sel),
    addEventListener() {},
  };
  const keplr = { calls: 0, experimentalSuggestChain() { this.calls += 1; return Promise.resolve(); }, enable() { this.calls += 1; return Promise.resolve(); }, getKey() { this.calls += 1; return Promise.resolve({ bech32Address: F.MEMBER, name: "m", pubKey: new Uint8Array(33) }); } };
  const replaced = [], assigned = [];
  const storage = new Map();
  const ctx = {
    document, URLSearchParams, TextEncoder, TextDecoder, atob, btoa, Promise, AbortController, setTimeout: (f) => setTimeout(f, 0), clearTimeout,
    setInterval: () => 0, Date, JSON, Math, Number, String, Object, Array, Error, RegExp, Boolean, BigInt, isFinite, Intl, encodeURIComponent, unescape,
    location: { search: extra.search || "", hash: extra.hash || "", href: "https://ludum.netadao.org/x/" + (extra.search || ""), pathname: "/x/", reload() {}, replace: (u) => replaced.push(u), assign: (u) => assigned.push(u), ancestorOrigins: extra.ancestors || [] },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    fetch: F.restFetch(world, (u, init) => requests.push([u, init && init.method])), keplr,
  };
  ctx.window = ctx; ctx.self = ctx;
  ctx.top = extra.framed ? {} : ctx;
  return { ctx, body, head, keplr, replaced, assigned, storage };
}
const settleFor = (wait) => async () => { for (let i = 0; i < wait; i++) await new Promise((r) => setImmediate(r)); };

async function load(page, search = "", { world = F.world(), who = null, wait = 60, hash = "", framed = false, ancestors } = {}) {
  const requests = [], apiCalls = [];
  const c = context(world, requests, { search, hash, framed, ancestors });
  c.body.setAttribute("data-gov-page", page);
  for (const id of ["gv-frame", "gv-body"]) { const n = new Node("div"); n.setAttribute("id", id); c.body.appendChild(n); }
  c.ctx.LudumSession = { api: (route, b, options) => { apiCalls.push([route, b, options]); return Promise.reject({ status: 404, error: "not-found" }); }, ...(who ? { whoami: () => Promise.resolve(who) } : {}) };
  vm.createContext(c.ctx);
  for (const f of ["platform/js/records.js", "platform/js/pass.js", "platform/js/work.js", "platform/js/gov.js", "platform/js/gov-page.js"]) vm.runInContext(src(f), c.ctx, { filename: f });
  const settle = settleFor(wait);
  await settle();
  const { body } = c;
  const text = () => body.textContent.replace(/\s+/g, " ");
  const buttons = (re) => body.findAll((n) => n.tagName === "button" && re.test(n.textContent));
  const links = (re) => body.findAll((n) => n.tagName === "a" && re.test(n.textContent));
  async function connect() { const b = buttons(/^Connect Keplr$/)[0]; assert.ok(b, "a Connect Keplr control"); b.click(); await settle(); }
  return { ...c, requests, apiCalls, text, buttons, links, connect, settle };
}
const disabled = (b) => b.getAttribute("aria-disabled") === "true";
const escrowRead = (requests) => requests.some(([u]) => u.includes(F.RETIRED_ESCROW));
/** Strings a player can be shown: comments stripped. */
const said = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ================= /governance/: every proposal ================= */

test("governance list: every proposal with the design's filters and counts; percentages are the proposal's own; no Case column", async () => {
  const p = await load("governance");
  const t = p.text();
  for (const want of ["Proposals", "All 4", "Voting 1", "Passed 1", "Executed 1", "Failed 1", "41 · 12 · 6", "Execution failed", "Appeal 7: uphold"]) assert.ok(t.includes(want), want);
  assert.doesNotMatch(t, /Not an appeal|Escrow game|escrow|Disputed tables|resolver/i, "the escrow's labels are gone");
  const heads = p.body.findAll((n) => n.tagName === "th").map((n) => n.textContent.trim());
  assert.ok(!heads.includes("Case"), heads.join(","));
  const failedTab = p.buttons(/^Failed/)[0];
  failedTab.click();
  const rows = p.body.findAll((n) => n.tagName === "tr" && n.getAttribute("data-ld-status"));
  assert.deepEqual(rows.map((r) => r.getAttribute("data-ld-status")), ["failed"]);
  assert.equal(failedTab.getAttribute("aria-pressed"), "true");
  assert.equal(p.keplr.calls, 0, "Keplr is never touched on load");
  assert.equal(p.head.children.length, 0, "the signing bundle is never loaded on load");
  for (const [u, method] of p.requests) { assert.ok(u.startsWith(F.PIN.rest), u); assert.equal(method, "GET", "page load never POSTs to the chain"); }
  assert.equal(escrowRead(p.requests), false, "the retired escrow is never read");
  assert.equal(p.apiCalls.length, 0, "the governance pages ask Play for nothing");
});

test("governance list: an old #proposal-N link is forwarded to the proposal page; a member's cues follow a connected member wallet", async () => {
  const old = await load("governance", "", { hash: "#proposal-13" });
  assert.deepEqual(old.replaced, ["/governance/proposal/?id=13"]);
  const junk = await load("governance", "", { hash: "#proposal-13x" });
  assert.deepEqual(junk.replaced, [], "only an exact old anchor is forwarded");
  const p = await load("governance");
  assert.doesNotMatch(p.text(), /Your vote is open|Ready to execute/, "no cue before a member wallet");
  await p.connect();
  assert.match(p.text(), /Ready to execute/);
  assert.match(p.text(), /Your vote is open/);
});

test("governance list: no proposals -> the empty state; an unreadable chain -> unavailable, nothing invented", async () => {
  const empty = await load("governance", "", { world: F.world({ reverse_proposals: () => ({ data: { proposals: [] } }) }) });
  assert.match(empty.text(), /No proposals yet/);
  const down = await load("governance", "", { world: F.world({ reverse_proposals: () => ({ status: 502, message: "bad gateway" }) }) });
  assert.match(down.text(), /Unavailable.*could not be read from the chain/);
  assert.doesNotMatch(down.text(), /Appeal 7/);
});

/* ================= /governance/proposal/?id= ================= */

test("proposal (open): the tally, a member's vote form, what it does and its record -- no case, no resolver deadline", async () => {
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
  for (const want of ["What it does", "\"resolve\"", "Proposer", "Description", "Not yet", "Submitted", "tx 2A77…D013"]) assert.ok(p.text().includes(want), want);
  assert.doesNotMatch(p.text(), /Resolver deadline|Case file|Appeal ·|the case stays Disputed/, "the escrow's labels are gone");
  assert.equal(escrowRead(p.requests), false, "the retired escrow is never read, even for a proposal that once addressed it");
});

test("proposal (open): a wallet that is not a member gets no vote form", async () => {
  const p = await load("proposal", "?id=13");
  p.ctx.keplr.getKey = () => Promise.resolve({ bech32Address: "juno1" + "n".repeat(38), name: "n", pubKey: new Uint8Array(33) });
  await p.connect();
  assert.match(p.text(), /The connected wallet is not a Ludum DAO member/);
  assert.equal(p.buttons(/Vote with Keplr/).length, 0);
});

test("proposal (passed): Execute only for a member when the module lets only members execute", async () => {
  const p = await load("proposal", "?id=11");
  assert.ok(disabled(p.buttons(/Execute with Keplr/)[0]), "disabled before a member wallet");
  await p.connect();
  const exec = p.buttons(/Execute with Keplr/)[0];
  assert.ok(!disabled(exec));
  assert.match(p.text(), /Ready to execute/);
  assert.doesNotMatch(p.text(), /Live checks|Resolver for game/, "no escrow game checks");
  let captured = null;
  p.ctx.LudumGov.prepare = (_r, spec) => { captured = spec; return new Promise(() => {}); };
  exec.click();
  assert.deepEqual(JSON.parse(JSON.stringify(captured.msg)), { execute: { proposal_id: 11 } });
  const outsider = await load("proposal", "?id=11");
  outsider.ctx.keplr.getKey = () => Promise.resolve({ bech32Address: "juno1" + "n".repeat(38), name: "n", pubKey: new Uint8Array(33) });
  await outsider.connect();
  const refused = outsider.buttons(/Execute with Keplr/)[0];
  assert.ok(disabled(refused));
  assert.equal(refused.getAttribute("title"), "the proposal module lets only members execute");
  const open = await load("proposal", "?id=11", { world: F.world({ config: (c) => (c === F.PIN.proposalSingle ? { data: { dao: F.PIN.daoCore, max_voting_period: { time: 604800 }, only_members_execute: false } } : undefined) }) });
  open.ctx.keplr.getKey = outsider.ctx.keplr.getKey;
  await open.connect();
  assert.ok(!disabled(open.buttons(/Execute with Keplr/)[0]), "a module that lets anyone execute: the chain's rule, not Ludum's");
});

test("v1.7: removing the escrow removed no independent check -- DAO pins that differ, or a foreign frame, turn every action off", async () => {
  const mismatch = F.world({ voting_module: () => ({ data: "juno1impostor" }) });
  for (const [id, re] of [["13", /Vote with Keplr/], ["11", /Execute with Keplr/]]) {
    const p = await load("proposal", "?id=" + id, { world: mismatch });
    assert.match(p.text(), /differs from the addresses this site pins.*voting_module/);
    assert.ok(disabled(p.buttons(/^Connect Keplr$/)[0]), "connecting is off too");
    assert.equal(p.buttons(re).filter((b) => !disabled(b)).length, 0, id);
  }
  const unreadable = await load("proposal", "?id=11", { world: F.world({ proposal_modules: () => ({ status: 502, message: "bad gateway" }) }) });
  assert.match(unreadable.text(), /The Ludum DAO could not be read/);
  assert.ok(disabled(unreadable.buttons(/Execute with Keplr/)[0]));
  const framed = await load("proposal", "?id=11", { framed: true, ancestors: ["https://evil.example"] });
  assert.match(framed.text(), /framed by another site/);
  assert.ok(disabled(framed.buttons(/Execute with Keplr/)[0]));
  const shell = await load("proposal", "?id=11", { framed: true, ancestors: ["https://netadao.org"] });
  assert.doesNotMatch(shell.text(), /framed by another site/, "the radio shell on netadao.org may frame it");
});

test("proposal (execution failed): the stop notice and the chain's own receipt; nothing retried", async () => {
  const p = await load("proposal", "?id=12");
  for (const want of ["Execution failed", "does not retry", "The message was refused.", "B90E…14F7", "201,334 used of 520,000", "0.039 JUNOX", "wrong state"]) assert.ok(p.text().includes(want), want);
  assert.doesNotMatch(p.text(), /The escrow refused/);
  assert.equal(p.buttons(/Execute|Vote|Close/).length, 0);
});

test("proposal: an unreadable tx index leaves the record to the module's own facts; a missing proposal says so", async () => {
  const p = await load("proposal", "?id=13", { world: F.world({ txs: () => { throw new Error("index off"); } }) });
  assert.match(p.text(), /transaction index could not be read/);
  const none = await load("proposal", "?id=99");
  assert.match(none.text(), /No such proposal/);
  const nothing = await load("proposal", "");
  assert.match(nothing.text(), /No proposal chosen/);
  assert.equal(nothing.links(/^Proposals$/)[0].getAttribute("href"), "/governance/");
});

test("a missing proposal is recognised from the chain's whole error text (uni-7's real message is long)", async () => {
  const LONG = "type: dao_proposal_single::proposal::SingleChoiceProposal; key: [00, 0C, 70, 72, 6F, 70, 6F, 73, 61, 6C, 73, 5F, 76, 32, 00, 00, 00, 00, 00, 00, 00, 01] not found: query wasm contract failed";
  const p = await load("proposal", "?id=1", { world: F.world({ proposal: () => ({ status: 500, message: LONG }) }) });
  assert.match(p.text(), /No such proposal/);
});

/* ================= /disputes/: your appeals, the Appeals staff's queue; /disputes/case/: one appeal ================= */

async function disputes(who, answers = {}, { mode = "", search = "", files = [] } = {}) {
  const requests = [], apiCalls = [];
  const c = context(F.world(), requests, { search });
  const main = new Node("main");
  main.setAttribute("data-ludum-disputes", mode);
  const slot = new Node("div");
  slot.setAttribute("data-pass-slot", "");
  main.appendChild(slot);
  c.body.appendChild(main);
  c.ctx.LudumSession = {
    whoami: () => (who instanceof Error ? Promise.reject(who) : Promise.resolve(who)),
    signInUrl: (p) => "/me/sign-in/?return=" + encodeURIComponent(p),
    api: (route, b) => { apiCalls.push(route); bodies.push([route, b]); const a = answers[route]; return typeof a === "function" ? a(b) : a === undefined ? Promise.reject({ status: 404, error: "not-found" }) : Promise.resolve(a); },
  };
  const bodies = [];
  vm.createContext(c.ctx);
  for (const f of ["platform/js/records.js", "platform/js/pass.js", "platform/js/work.js", ...files, "platform/js/disputes-page.js"]) vm.runInContext(src(f), c.ctx, { filename: f });
  await settleFor(60)();
  const buttons = (re) => c.body.findAll((n) => n.tagName === "button" && re.test(n.textContent));
  return { ...c, requests, apiCalls, bodies, buttons, settle: settleFor(60), text: () => c.body.textContent.replace(/\s+/g, " ") };
}
const PROFILE = { standing: { completedGames: 3, uniqueOpponents: 2, memberSince: "2026-10" }, publicCredits: { value: 1200, provenance: "server-recorded" }, ratings: [] };
const PLAYER = { signedIn: true, account: { name: "Marlowe", username: "m" }, roles: { reviewer: false } };
const TEAM = { members: [
  { name: "Caspian", roles: ["admin", "moderator"], can: ["staff.view", "moderator.manage", "appeals.manage"], since: null, configured: true, you: false },
  { name: "Quinn", roles: ["appeals"], can: ["appeal.review", "staff.view"], since: "2026-10-24T09:00:00Z", you: true },
  { name: "Mia", roles: ["moderator"], can: ["case.review", "staff.view"], since: "2026-10-23T09:00:00Z", you: false },
] };

/** Objects made inside the page's context, compared as plain data. */
const plain = (x) => JSON.parse(JSON.stringify(x));
const CASE = "ap_" + "3f9c1a0b".repeat(3);
const SUMMARY = { caseId: CASE, gameId: "g_xfqa37t6wt6ajvnbx5j3f5dn2g", filedAt: "2026-10-25T18:40:00.000Z", status: "investigating", appellants: 1, grounds: ["engine-failure"], proposal: null, outcome: null, lastAt: "2026-10-25T18:40:00.000Z" };

test("disputes: a signed-in player -- the pass and tabs with Disputes current, their own appeals (appeals-mine), no chain read, no count, no wallet", async () => {
  const p = await disputes(PLAYER, { profile: PROFILE, "appeals-mine": { cases: [SUMMARY] } });
  const t = p.text();
  for (const want of ["Games", "Account", "Disputes", "Your appeals", "Appeal 3F9C-1A0B", "Engine failure or bug", "Being investigated", "How appeals work", "30 minutes", "There is no fee and no wallet signature", "Ludum DAO proposals"]) assert.ok(t.includes(want), want);
  const link = p.body.find((n) => n.tagName === "a" && n.getAttribute("href") === "/disputes/case/?id=" + CASE);
  assert.ok(link, "each appeal opens its page");
  const current = p.body.findAll((n) => n.tagName === "a" && n.getAttribute("aria-current") === "page");
  assert.deepEqual(current.map((a) => a.getAttribute("href")), ["/disputes/"], "Disputes is the current tab");
  assert.equal(p.body.findAll((n) => n.className === "ld-ptabs__count").length, 0, "no count beside any tab");
  assert.doesNotMatch(t, /escrow|JUNOX|Disputed tables|Voting wallet|Voting power|juno1|bond|resolver|Appeals team|Appeals queue/i);
  assert.deepEqual(p.requests, [], "the page reads no chain");
  assert.deepEqual(p.apiCalls.sort(), ["appeals-mine", "profile"], "your own profile and your own appeals");
  assert.equal(p.keplr.calls, 0);
  const none = await disputes(PLAYER, { profile: PROFILE, "appeals-mine": { cases: [] } });
  assert.match(none.text(), /No appeals.*filed on Play, from the Game Over screen/);
});

test("disputes: the Appeals team and the Admins who appoint it see the queue and the team's roster; Moderators and players do not", async () => {
  const quinn = { ...PLAYER, account: { name: "Quinn", username: "q" }, staff: { roles: ["appeals"], permissions: ["appeal.review", "staff.view"] } };
  const queue = { cases: [SUMMARY, { ...SUMMARY, caseId: "ap_" + "a".repeat(24), status: "settled", outcome: "annul" }] };
  const p = await disputes(quinn, { profile: PROFILE, "staff-team": TEAM, "appeals-mine": { cases: [] }, "appeals-queue": queue });
  const t = p.text();
  for (const want of ["Appeals queue", "1 open", "Staff only", "Settled", "Annul the game", "Appeals team", "Quinn", "(you)", "24 Oct 2026", "they decide none", "no Ludum DAO membership or vote"]) assert.ok(t.includes(want), want);
  assert.doesNotMatch(t, /Mia/, "only the Appeals role is on this roster");
  assert.deepEqual(p.apiCalls.sort(), ["appeals-mine", "appeals-queue", "profile", "staff-team"]);
  const admin = { ...PLAYER, account: { name: "Caspian", username: "c" }, staff: { roles: ["admin"], permissions: ["staff.view", "moderator.manage", "appeals.manage", "player.rename", "name.reserve"] } };
  const a = await disputes(admin, { profile: PROFILE, "staff-team": TEAM, "appeals-mine": { cases: [] }, "appeals-queue": queue });
  assert.match(a.text(), /Appeals queue.*Appeals team.*Quinn/);
  const mod = { ...PLAYER, roles: { reviewer: true }, staff: { roles: ["moderator"], permissions: ["case.review", "staff.view"] } };
  const m = await disputes(mod, { profile: PROFILE, "staff-team": TEAM, "appeals-mine": { cases: [] } });
  assert.doesNotMatch(m.text(), /Appeals team|Appeals queue/);
  assert.deepEqual(m.apiCalls.sort(), ["appeals-mine", "profile"]);
  const failing = await disputes(quinn, { profile: PROFILE, "staff-team": () => Promise.reject({ status: 503, error: "unavailable" }), "appeals-mine": { cases: [] }, "appeals-queue": queue });
  assert.match(failing.text(), /Appeals team couldn’t be read/);
  assert.match(failing.text(), /Appeals queue/, "the rest of the page stands");
});

test("disputes: signed out -- a way to sign in and how appeals work; a profile that can't be read says so", async () => {
  const out = await disputes({ signedIn: false });
  assert.match(out.text(), /Sign in to see your appeals.*How appeals work/);
  const signIn = out.body.find((n) => n.tagName === "a" && /Sign in/.test(n.textContent));
  assert.equal(signIn.getAttribute("href"), "/me/sign-in/?return=%2Fdisputes%2F");
  assert.ok(out.body.find((n) => n.tagName === "h1" && n.textContent === "Disputes"), "the page has its heading");
  assert.deepEqual(out.apiCalls, []);
  const down = await disputes(new Error("offline"));
  assert.match(down.text(), /Unavailable.*could not be read just now/);
});

test("v1.7: what the governance and Disputes pages say carry nothing of the retired escrow (LUDUM RESULT REVIEW: an appeal's outcomes are named again, never its money)", () => {
  for (const rel of ["platform/js/gov-page.js", "platform/js/disputes-page.js", "platform/js/gov.js"]) {
    assert.doesNotMatch(said(rel), /escrow|disputed table|Create appeal|New appeal|case file|resolver deadline|deadline guard|bond\b|wager pool|payout splits?/i, rel);
  }
  assert.doesNotMatch(said("platform/js/disputes-page.js"), /JUNOX|junox\(/i, "an appeal names Credits, never a token");
  for (const rel of ["platform/js/gov-page.js", "platform/js/gov.js"]) assert.doesNotMatch(said(rel), /Uphold|Annul/i, rel);
});

/* ---------------- one appeal ---------------- */

const RECORD = { format: "ludum-resolution/1", case_id: CASE, game_id: SUMMARY.gameId, revision: 1, result_id: "b".repeat(32), evidence: { log_len: 412, log_hash: "c".repeat(64) },
  outcome: "annul", responsible: [], standings: null, consequences: { payouts: [100, 100], deltas: null, wagers_returned: true }, rationale: "An engine failure in OR 4.\nLudum appeal " + CASE + " resolution " + "f".repeat(64), prepared_at_seq: 3 };
const SEATS = [{ playerId: "p-0000000000000001", name: "Marlowe", place: 1, netWorth: 4919, payout: 139, ratingChange: 4.1234 }, { playerId: "p-0000000000000002", name: "Bea", place: 2, netWorth: 4732, payout: 61, ratingChange: -4.1234 }];
function caseView(over = {}, you = { party: true, staff: false }) {
  return { ...SUMMARY, you,
    result: { outcome: "scored", endedAt: "2026-10-25T18:00:00.000Z", reviewDeadline: "2026-10-25T18:31:00.000Z", resultId: "b".repeat(32), foreclosure: null, seats: SEATS },
    evidence: { logLen: 412, logHash: "c".repeat(64), boardDigest: "d".repeat(64) },
    filings: [{ at: "2026-10-25T18:10:00.000Z", playerId: SEATS[0].playerId, name: "Marlowe", grounds: ["engine-failure"], statement: "The game froze in OR 4." }],
    notes: [], proposals: [], settlement: "pending", trail: [], ...over };
}
const proposalOf = (digest, decision = null) => ({ revision: 1, digest, daoLine: "Ludum appeal " + CASE + " resolution " + digest, outcome: "annul", rationale: RECORD.rationale, preparedAt: "2026-10-25T19:00:00.000Z", preparedBy: "Quinn (Appeals)",
  consequences: [{ playerId: SEATS[0].playerId, name: "Marlowe", payout: 100, ratingChange: null }, { playerId: SEATS[1].playerId, name: "Bea", payout: 100, ratingChange: null }], wagersReturned: true, standings: null, responsible: [], decision, record: RECORD });

test("an appeal, as a player of its game sees it: the provisional result, the filings, no staff notes, no staff controls; a stranger is told it is not theirs", async () => {
  const p = await disputes(PLAYER, { "appeal-case": { case: caseView() } }, { mode: "case", search: "?id=" + CASE });
  const t = p.text();
  for (const want of ["Appeal · 3F9C-1A0B", "Appeal of a game’s result", "On hold", "Provisional: nothing in this table has been paid or rated", "Marlowe", "139", "+4.1234", "−4.1234", "The game froze in OR 4.", "No resolution yet", "kept for this appeal, beyond the usual seven days"]) assert.ok(t.includes(want), want);
  assert.doesNotMatch(t, /Investigation|Audit trail|Prepare a resolution|Record the Ludum DAO’s decision/, "staff blocks are staff's");
  assert.deepEqual(plain(p.bodies.filter(([r]) => r === "appeal-case").map(([, b]) => b)), [{ caseId: CASE }]);
  const stranger = await disputes(PLAYER, {}, { mode: "case", search: "?id=" + CASE });
  assert.match(stranger.text(), /not available to you: it does not exist, or you did not play its game/);
  const bad = await disputes(PLAYER, {}, { mode: "case", search: "?id=cc_" + "a".repeat(32) });
  assert.match(bad.text(), /No appeal chosen/);
  assert.deepEqual(bad.apiCalls, [], "a malformed id asks nothing");
});

test("an appeal's resolution: the text proposal carries exactly one resolution line (the rationale quoted), the record and what it pays; the digest is the record's", async () => {
  const D = await disputes(PLAYER, {});
  const L = D.ctx.LudumDisputes;
  const digest = createHash("sha256").update(L.canonical(RECORD), "utf8").digest("hex");
  const text = L.proposalText(caseView(), proposalOf(digest));
  assert.equal(text.title, "Ludum appeal " + CASE);
  const lines = (text.title + "\n" + text.description).split("\n").map((l) => l.trim()).filter((l) => /^Ludum appeal (ap_[0-9a-f]{24}) resolution ([0-9a-f]{64})$/.test(l));
  assert.deepEqual(lines, ["Ludum appeal " + CASE + " resolution " + digest], "the rationale's own look-alike line is quoted out");
  assert.ok(text.description.includes("- Marlowe: 100 Credits; no rating change"));
  assert.ok(text.description.includes(L.canonical(RECORD)));
  assert.equal(L.canonical({ b: 1, a: [true, null, { d: "x", c: undefined }] }), '{"a":[true,null,{"d":"x"}],"b":1}');
  assert.equal(L.standingsParam([{ playerId: "p-1", netWorth: "10", place: "2" }, { playerId: "p-2", netWorth: "9", place: "1" }]), "p-1:10:2,p-2:9:1");
  assert.equal(L.caseRef(CASE), "3F9C-1A0B");
  /* The builder (gov.js) makes a TEXT proposal on the pinned pre-propose module: no message, no funds. */
  const G = requireCjs("../js/gov.js");
  const spec = G.buildTextProposal(text.title, text.description);
  assert.deepEqual([spec.contract, spec.funds, spec.msg.propose.msg.propose.msgs, spec.msg.propose.msg.propose.vote], [G.PINS.preProposeSingle, [], [], null]);
  assert.throws(() => G.buildTextProposal(" padded", "x"), /title/);
});

test("an appeal, as the Appeals staff see it: notes (no Keplr), a resolution prepared and approved in Keplr, the DAO's decision recorded by its number, the trail", async () => {
  const quinn = { ...PLAYER, account: { name: "Quinn", username: "q", authorizationWallet: { address: F.MEMBER } }, staff: { roles: ["appeals"], permissions: ["appeal.review", "staff.view"] } };
  const staffView = caseView({ notes: [{ at: "2026-10-25T18:50:00.000Z", by: "Quinn (Appeals)", category: "finding", text: "The log shows a stall at entry 300." }], trail: [{ seq: 1, at: "2026-10-25T18:00:00.000Z", kind: "opened", by: "the server" }] }, { party: false, staff: true });
  const approvals = [];
  const answers = { "appeal-case": { case: staffView }, "appeal-note": (b) => Promise.resolve({ case: staffView }), "appeal-propose": (b) => Promise.resolve({ case: { ...staffView, status: "proposed", proposals: [proposalOf("e".repeat(64))] } }) };
  const p = await disputes(quinn, answers, { mode: "case", search: "?id=" + CASE });
  p.ctx.LudumAuth = { approveStaffAction: (S, G, input) => { approvals.push(input); return Promise.resolve({ confirmOperation: "op", confirmPubKey: "pk", confirmSignature: "sig" }); }, staffApprovalSentence: () => "refused" };
  const t = p.text();
  for (const want of ["Investigation", "Finding", "The log shows a stall at entry 300.", "Prepare a resolution", "Uphold the result", "Annul the game", "Correct the standings", "awaits the owner’s approval", "Audit trail", "the server"]) assert.ok(t.includes(want), want);
  /* A note: no Keplr. */
  const textarea = p.body.find((n) => n.tagName === "textarea" && n.getAttribute("id") === "ap-note");
  textarea.value = "  Asked both players for screenshots.  ";
  p.buttons(/^Add to the case$/)[0].click();
  await p.settle();
  assert.deepEqual(plain(p.bodies.filter(([r]) => r === "appeal-note").map(([, b]) => b)), [{ caseId: CASE, category: "note", text: "Asked both players for screenshots." }]);
  assert.equal(approvals.length, 0);
  /* A resolution: the outcome, the rationale, approved in Keplr with exactly the body sent. */
  const annul = p.body.find((n) => n.tagName === "input" && n.getAttribute("value") === "annul");
  annul.fire("change");
  p.body.find((n) => n.tagName === "textarea" && n.getAttribute("id") === "ap-why").value = "The engine failure decided the game.";
  p.buttons(/Prepare the resolution/)[0].click();
  await p.settle();
  assert.deepEqual(plain(approvals.map((a) => [a.route, a.body, a.account, a.authorizationWallet])), [["appeal-propose", { caseId: CASE, outcome: "annul", rationale: "The engine failure decided the game." }, "Quinn", F.MEMBER]]);
  assert.deepEqual(plain(p.bodies.filter(([r]) => r === "appeal-propose").map(([, b]) => b)), [{ caseId: CASE, outcome: "annul", rationale: "The engine failure decided the game.", confirmOperation: "op", confirmPubKey: "pk", confirmSignature: "sig" }]);
  assert.match(p.text(), /Prepared: revision 1 \(Annul the game\)\. It now waits for the Ludum DAO\./);
  assert.match(p.text(), /Revision 1 waits for the Ludum DAO/);
  assert.match(p.text(), /Checked here.*(DOES NOT MATCH|not checked)/, "a digest that is not the record's is said, never hidden");
});

test("recording the Ludum DAO's decision: the number checked here, approved in Keplr, the server's verdict said; forfeiture is never offered", async () => {
  const quinn = { ...PLAYER, account: { name: "Quinn", username: "q", authorizationWallet: { address: F.MEMBER } }, staff: { roles: ["appeals"], permissions: ["appeal.review", "staff.view"] } };
  const pending = caseView({ status: "proposed", proposals: [proposalOf("e".repeat(64))] }, { party: false, staff: true });
  const decided = { ...pending, status: "decided", outcome: "annul", proposals: [proposalOf("e".repeat(64), { verdict: "approved", proposalId: 7, status: "passed", at: "2026-10-26T10:00:00.000Z" })] };
  const p = await disputes(quinn, { "appeal-case": { case: pending }, "appeal-dao": () => Promise.resolve({ verdict: "approved", case: decided }) }, { mode: "case", search: "?id=" + CASE });
  const approvals = [];
  p.ctx.LudumAuth = { approveStaffAction: (S, G, input) => { approvals.push(input); return Promise.resolve({ confirmOperation: "op", confirmPubKey: "pk", confirmSignature: "sig" }); }, staffApprovalSentence: () => "refused" };
  const input = p.body.find((n) => n.tagName === "input" && n.getAttribute("id") === "ap-pid");
  input.value = "seven";
  p.buttons(/^Record the decision/)[0].click();
  await p.settle();
  assert.match(p.text(), /A proposal number is a whole number/);
  assert.equal(approvals.length, 0);
  input.value = "7";
  p.buttons(/^Record the decision/)[0].click();
  await p.settle();
  assert.deepEqual(plain(approvals.map((a) => [a.route, a.body])), [["appeal-dao", { caseId: CASE, proposalId: 7 }]]);
  assert.match(p.text(), /Proposal 7: The Ludum DAO approved it: the resolution is applied once\./);
  assert.match(p.text(), /Approved by the Ludum DAO — proposal 7 \(passed\)/);
  const forfeit = p.body.findAll((n) => n.tagName === "input" && n.getAttribute("value") === "forfeit");
  assert.ok(forfeit.every((n) => n.getAttribute("disabled") !== null), "forfeiture is shown, never offered");
});

/* ================= the design's addresses and the pages themselves ================= */

test("route map: the design's /account/ addresses go to the engineering routes, and nothing else (v1.7: no /cases/, no new appeal)", () => {
  const require = createRequire(import.meta.url);
  const M = require("../js/route-map.js");
  const cases = {
    "/account/": "/me/", "/account": "/me/", "/account/details/": "/me/account/", "/account/games/g_xfqa37t6wt6ajvnbx5j3f5dn2g/": "/me/?game=g_xfqa37t6wt6ajvnbx5j3f5dn2g",
    "/account/moderation/": "/moderation/", ["/account/moderation/cases/cc_" + "a".repeat(32) + "/"]: "/moderation/case/?id=cc_" + "a".repeat(32),
    "/account/appeals/": "/disputes/", "/account/appeals/proposals/13/": "/governance/proposal/?id=13",
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(M.mapDesignPath(from), to, from);
  for (const bad of ["/cases/52/", "/account/appeals/new/", "/disputes/case/", "/cases/x/", "/cases//evil.example/", "/account/games/../x", "/accountx/", "//evil.example/cases/1/", "/account/appeals/proposals/0/"]) assert.equal(M.mapDesignPath(bad), null, bad);
});

test("every governance page and Disputes: the §2.4 CSP first, the records layer and the pass's, no inline script, the scripts in order", () => {
  const GOV = ["https://netadao.org/radio/radio.js", "/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", "/platform/js/pass.js", "/platform/js/work.js", "/platform/js/auth.js", "/platform/js/account-menu.js", "/platform/js/gov.js", "/platform/js/gov-page.js"];
  const DISPUTES = ["https://netadao.org/radio/radio.js", "/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", "/platform/js/pass.js", "/platform/js/work.js", "/platform/js/auth.js", "/platform/js/account-menu.js", "/platform/js/disputes-page.js", "/platform/js/page-init.js"];
  /* LUDUM RESULT REVIEW: an appeal's page also loads gov.js (Keplr for the staff's approvals and a DAO member's proposal). */
  const APPEAL = ["https://netadao.org/radio/radio.js", "/design-system/js/ludum.js", "/platform/js/session.js", "/platform/js/records.js", "/platform/js/pass.js", "/platform/js/work.js", "/platform/js/gov.js", "/platform/js/auth.js", "/platform/js/account-menu.js", "/platform/js/disputes-page.js", "/platform/js/page-init.js"];
  for (const [rel, kind, scripts] of [["disputes/index.html", null, DISPUTES], ["disputes/case/index.html", null, APPEAL], ["governance/index.html", "governance", GOV], ["governance/proposal/index.html", "proposal", GOV]]) {
    const html = src(rel).replace(/\r\n/g, "\n");
    assert.match(html, /<head>\n<meta http-equiv="Content-Security-Policy"/, rel);
    if (kind) assert.match(html, new RegExp(`data-gov-page="${kind}"`), rel);
    else { assert.doesNotMatch(html, /data-gov-page/, rel); assert.match(html, rel === "disputes/case/index.html" ? /<main id="main" class="ld-profile" data-ludum-disputes="case">/ : /<main id="main" class="ld-profile" data-ludum-disputes>/, rel); }
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, scripts, rel);
    assert.ok(html.indexOf("/platform/css/records.css") > html.indexOf("/design-system/css/ludum.css"), rel);
    assert.ok(html.indexOf("/platform/css/pass.css") > html.indexOf("/platform/css/records.css"), rel);
    assert.match(html, /<main id="main" class="ld-profile"[ >]/, `${rel}: the profile's container`);
    assert.doesNotMatch(html, /<script>|\son[a-z]+=|javascript:|ld-specimen|escrow/i, rel);
  }
  assert.match(src("404.html"), /<script src="\/platform\/js\/route-map\.js"><\/script>\r?\n<script src="\/design-system\/js\/ludum\.js">/);
});
