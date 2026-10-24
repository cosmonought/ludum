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

/* ================= /disputes/: a neutral tab ================= */

async function disputes(who, answers = {}) {
  const requests = [], apiCalls = [];
  const c = context(F.world(), requests);
  const main = new Node("main");
  main.setAttribute("data-ludum-disputes", "");
  const slot = new Node("div");
  slot.setAttribute("data-pass-slot", "");
  main.appendChild(slot);
  c.body.appendChild(main);
  c.ctx.LudumSession = {
    whoami: () => (who instanceof Error ? Promise.reject(who) : Promise.resolve(who)),
    signInUrl: (p) => "/me/sign-in/?return=" + encodeURIComponent(p),
    api: (route, b) => { apiCalls.push(route); const a = answers[route]; return typeof a === "function" ? a(b) : a === undefined ? Promise.reject({ status: 404, error: "not-found" }) : Promise.resolve(a); },
  };
  vm.createContext(c.ctx);
  for (const f of ["platform/js/records.js", "platform/js/pass.js", "platform/js/work.js", "platform/js/disputes-page.js"]) vm.runInContext(src(f), c.ctx, { filename: f });
  await settleFor(60)();
  return { ...c, requests, apiCalls, text: () => c.body.textContent.replace(/\s+/g, " ") };
}
const PROFILE = { standing: { completedGames: 3, uniqueOpponents: 2, memberSince: "2026-10" }, publicCredits: { value: 1200, provenance: "server-recorded" }, ratings: [] };
const PLAYER = { signedIn: true, account: { name: "Marlowe", username: "m" }, roles: { reviewer: false } };
const TEAM = { members: [
  { name: "Caspian", roles: ["admin", "moderator"], can: ["staff.view", "moderator.manage", "appeals.manage"], since: null, configured: true, you: false },
  { name: "Quinn", roles: ["appeals"], can: ["appeal.review", "staff.view"], since: "2026-10-24T09:00:00Z", you: true },
  { name: "Mia", roles: ["moderator"], can: ["case.review", "staff.view"], since: "2026-10-23T09:00:00Z", you: false },
] };

test("disputes: a signed-in player -- the pass and tabs with Disputes current, a neutral 'not open yet', no chain read, no count, no wallet", async () => {
  const p = await disputes(PLAYER, { profile: PROFILE });
  const t = p.text();
  for (const want of ["Games", "Account", "Disputes", "Appeals aren’t open yet", "nothing is waiting", "stand as they were recorded", "About appeals", "Ludum DAO proposals"]) assert.ok(t.includes(want), want);
  const current = p.body.findAll((n) => n.tagName === "a" && n.getAttribute("aria-current") === "page");
  assert.deepEqual(current.map((a) => a.getAttribute("href")), ["/disputes/"], "Disputes is the current tab");
  assert.equal(p.body.findAll((n) => n.className === "ld-ptabs__count").length, 0, "no count beside any tab");
  assert.ok(p.body.find((n) => n.tagName === "a" && n.getAttribute("href") === "/governance/"), "the Ludum DAO is one link away");
  assert.doesNotMatch(t, /escrow|JUNOX|Disputed tables|Voting wallet|Voting power|juno1|bond|resolver|Appeals team/i);
  assert.deepEqual(p.requests, [], "the page reads no chain");
  assert.deepEqual(p.apiCalls, ["profile"], "only your own profile, for the pass");
  assert.equal(p.keplr.calls, 0);
});

test("disputes: the Appeals team and the Admins who appoint it see the team's roster from staff-team; Moderators and players do not", async () => {
  const quinn = { ...PLAYER, account: { name: "Quinn", username: "q" }, staff: { roles: ["appeals"], permissions: ["appeal.review", "staff.view"] } };
  const p = await disputes(quinn, { profile: PROFILE, "staff-team": TEAM });
  const t = p.text();
  for (const want of ["Appeals team", "Quinn", "(you)", "24 Oct 2026", "they decide none", "no Ludum DAO membership or vote"]) assert.ok(t.includes(want), want);
  assert.doesNotMatch(t, /Mia/, "only the Appeals role is on this roster");
  assert.deepEqual(p.apiCalls.sort(), ["profile", "staff-team"]);
  const admin = { ...PLAYER, account: { name: "Caspian", username: "c" }, staff: { roles: ["admin"], permissions: ["staff.view", "moderator.manage", "appeals.manage", "player.rename", "name.reserve"] } };
  const a = await disputes(admin, { profile: PROFILE, "staff-team": TEAM });
  assert.match(a.text(), /Appeals team.*Quinn/);
  const mod = { ...PLAYER, roles: { reviewer: true }, staff: { roles: ["moderator"], permissions: ["case.review", "staff.view"] } };
  const m = await disputes(mod, { profile: PROFILE, "staff-team": TEAM });
  assert.doesNotMatch(m.text(), /Appeals team/);
  assert.deepEqual(m.apiCalls, ["profile"]);
  const failing = await disputes(quinn, { profile: PROFILE, "staff-team": () => Promise.reject({ status: 503, error: "unavailable" }) });
  assert.match(failing.text(), /The team couldn’t be read/);
  assert.match(failing.text(), /Appeals aren’t open yet/, "the rest of the page stands");
});

test("disputes: signed out -- the same neutral notice and a way to sign in; a profile that can't be read says so", async () => {
  const out = await disputes({ signedIn: false });
  assert.match(out.text(), /Appeals aren’t open yet/);
  const signIn = out.body.find((n) => n.tagName === "a" && /Sign in/.test(n.textContent));
  assert.equal(signIn.getAttribute("href"), "/me/sign-in/?return=%2Fdisputes%2F");
  assert.ok(out.body.find((n) => n.tagName === "h1" && n.textContent === "Disputes"), "the page has its heading");
  assert.deepEqual(out.apiCalls, []);
  const down = await disputes(new Error("offline"));
  assert.match(down.text(), /Unavailable.*could not be read just now/);
});

test("v1.7: what the governance and Disputes pages say, and the Disputes tab's rule, carry nothing of the retired escrow", () => {
  for (const rel of ["platform/js/gov-page.js", "platform/js/disputes-page.js", "platform/js/gov.js"]) {
    assert.doesNotMatch(said(rel), /escrow|disputed table|Create appeal|New appeal|case file|resolver deadline|deadline guard|bond\b|Uphold|Annul/i, rel);
  }
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
  for (const [rel, kind, scripts] of [["disputes/index.html", null, DISPUTES], ["governance/index.html", "governance", GOV], ["governance/proposal/index.html", "proposal", GOV]]) {
    const html = src(rel).replace(/\r\n/g, "\n");
    assert.match(html, /<head>\n<meta http-equiv="Content-Security-Policy"/, rel);
    if (kind) assert.match(html, new RegExp(`data-gov-page="${kind}"`), rel);
    else { assert.doesNotMatch(html, /data-gov-page/, rel); assert.match(html, /<main id="main" class="ld-profile" data-ludum-disputes>/, rel); }
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, scripts, rel);
    assert.ok(html.indexOf("/platform/css/records.css") > html.indexOf("/design-system/css/ludum.css"), rel);
    assert.ok(html.indexOf("/platform/css/pass.css") > html.indexOf("/platform/css/records.css"), rel);
    assert.match(html, /<main id="main" class="ld-profile"[ >]/, `${rel}: the profile's container`);
    assert.doesNotMatch(html, /<script>|\son[a-z]+=|javascript:|ld-specimen|escrow/i, rel);
  }
  assert.match(src("404.html"), /<script src="\/platform\/js\/route-map\.js"><\/script>\r?\n<script src="\/design-system\/js\/ludum\.js">/);
});
