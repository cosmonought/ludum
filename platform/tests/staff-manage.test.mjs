// v1.7 website staff on Ludum: Manage under another player's pass (staff-manage.js) and the renamed player's notice
// (account-menu.js), run for real in a small fake DOM. Pinned: Manage only for `staff.view` and never on your own
// profile; every control follows the server's `can` (a Moderator sees them aria-disabled, "Admins only for now"); a
// rename needs an available name and a reason, is approved in Keplr by the Admin's own Authorization Wallet for exactly
// that request (v1.7, owner 2026-10-23: never the password) and sent with the approval; a refused approval changes
// nothing and the change is approved again; the notice says only the names and the day. v1.7 (owner, 2026-10-24): an
// Admin appoints and removes the Moderation team and the Appeals team each on its own, each change its own approval.
// Run from the repository root: node --test platform/tests/staff-manage.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const JS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "js");
const eq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.parentNode = null; this.attributes = {}; this.listeners = {}; this.className = ""; this._text = null; this.hidden = false; this.disabled = false; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { if (c == null) return c; if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
  replaceChild(n, old) { const i = this.children.indexOf(old); if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.children[i] = n; old.parentNode = null; return old; }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === "hidden") this.hidden = true; }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  fire(t) { (this.listeners[t] || []).forEach((f) => f({ currentTarget: this, target: this, preventDefault() {} })); }
  click() { this.fire("click"); }
  focus() { Node.focused = this; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return (this._text ?? "") + this.children.map((c) => c.textContent).join(""); }
  set innerHTML(_) { this.children = []; }
  find(pred) { for (const c of this.children) { if (c instanceof Node) { if (pred(c)) return c; const f = c.find(pred); if (f) return f; } } return null; }
  findAll(pred, out = []) { for (const c of this.children) if (c instanceof Node) { if (pred(c)) out.push(c); c.findAll(pred, out); } return out; }
  /** Enough of querySelector for these scripts: "tag", "tag:not([disabled])", comma lists. */
  querySelector(sel) {
    const tags = sel.split(",").map((s) => s.trim().match(/^[a-z]+/i)[0]);
    return this.find((n) => tags.includes(n.tagName) && !n.disabled && n.getAttribute("aria-disabled") !== "true");
  }
}
class Text { constructor(t) { this.text = String(t); this.parentNode = null; } get textContent() { return this.text; } }

function load(files) {
  const body = new Node("body");
  const document = { createElement: (t) => new Node(t), createTextNode: (t) => new Text(t), querySelector: (s) => body.querySelector(s), getElementById: (id) => body.find((n) => n.getAttribute("id") === id), body };
  const ctx = { document, Date, JSON, Math, Number, String, Object, Array, Error, RegExp, Boolean, Promise, isNaN, isFinite, Intl, URLSearchParams, setTimeout: (f) => setTimeout(f, 0), clearTimeout,
    location: { pathname: "/players/", search: "" }, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(readFileSync(resolve(JS, f), "utf8"), ctx, { filename: f });
  return { ctx, body, document };
}
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
const text = (n) => n.textContent.replace(/\s+/g, " ");
const button = (root, re) => root.find((n) => n.tagName === "button" && re.test(n.textContent));

const ADMIN_WALLET = "juno1" + "a".repeat(38);
const ADMIN = { signedIn: true, account: { name: "Caspian", authorizationWallet: { address: ADMIN_WALLET } }, staff: { roles: ["admin", "moderator"], permissions: ["case.review", "staff.view", "moderator.manage", "appeals.manage", "player.rename", "name.reserve"] } };
const MOD = { signedIn: true, account: { name: "Ivo" }, staff: { roles: ["moderator"], permissions: ["case.review", "staff.view"] } };
function view(over = {}) {
  return { name: "Kestral", memberSince: "2026-10", active: true, roles: [], formerNames: [], audit: [], can: { rename: true, reserve: true, moderator: true, appeals: true }, you: false, ...over };
}

function world(who, answers) {
  const w = load(["records.js", "pass.js", "work.js", "auth.js", "staff-manage.js"]);
  const calls = [];
  const session = { api: (route, body) => { calls.push([route, JSON.parse(JSON.stringify(body))]); const a = answers[route]; return typeof a === "function" ? a(body, calls) : a === undefined ? Promise.reject({ status: 404, error: "not-found" }) : Promise.resolve(a); } };
  /* "Keplr": each approval is recorded (what the page asked to approve) and answers a proof. */
  const approvals = [];
  w.ctx.LudumAuth.approveStaffAction = (S, G, input, slot) => {
    approvals.push(JSON.parse(JSON.stringify(input)));
    slot.appendChild(w.document.createElement("div"));
    return Promise.resolve({ confirmOperation: "op" + approvals.length, confirmPubKey: "PK", confirmSignature: "SIG" + approvals.length });
  };
  const host = w.document.createElement("div");
  w.body.appendChild(host);
  const renamed = [];
  return { ...w, host, calls, session, approvals, renamed, M: w.ctx.LudumManage, mount: () => w.ctx.LudumManage.mount(host, session, who, "Kestral", (to) => renamed.push(to)) };
}

test("who sees Manage: staff.view, never on your own profile, never a player", () => {
  const { ctx } = load(["records.js", "pass.js", "work.js", "staff-manage.js"]);
  const M = ctx.LudumManage;
  assert.equal(M.seesManage(ADMIN, "Kestral"), true);
  assert.equal(M.seesManage(MOD, "Kestral"), true, "a Moderator reads Manage (and the audit history)");
  assert.equal(M.seesManage(ADMIN, "Caspian"), false, "never on your own profile");
  assert.equal(M.seesManage({ signedIn: true, account: { name: "Bo" } }, "Kestral"), false, "a player: no staff answer, no Manage");
  assert.equal(M.seesManage({ signedIn: true, account: { name: "Bo" }, staff: { roles: [], permissions: ["case.review"] } }, "Kestral"), false);
  assert.equal(M.seesManage({ signedIn: false }, "Kestral"), false);
});

test("the audit history in words: renames with the former name's fate, reserves, releases, roles; by name and role", () => {
  const { ctx } = load(["records.js", "pass.js", "work.js", "staff-manage.js"]);
  const M = ctx.LudumManage;
  const by = { name: "Caspian", role: "admin" };
  assert.equal(M.auditChange({ kind: "player-renamed", from: "Kestral", to: "Kestrel", former: "released", outcome: "committed", by }), "Player Name: Kestral → Kestrel · former name released");
  assert.equal(M.auditChange({ kind: "player-renamed", from: "Kestral", to: "Kestrel", former: "reserved", outcome: "refused", by }), "Player Name: Kestral → Kestrel · former name reserved · refused: nothing changed");
  assert.equal(M.auditChange({ kind: "name-reserved", name: "Kestral", by }), "Former name reserved: Kestral");
  assert.equal(M.auditChange({ kind: "role-granted", role: "moderator", by }), "Role given: Moderator");
  assert.equal(M.auditChange({ kind: "role-granted", role: "appeals", by }), "Role given: Appeals");
  assert.equal(M.auditChange({ kind: "role-revoked", role: "appeals", by }), "Role removed: Appeals");
  assert.equal(M.auditChange({ kind: "directory-hidden", by: { role: "operator" } }), "Left out of Find a Player");
  assert.equal(M.auditChange({ kind: "directory-shown", by: { role: "operator" } }), "Listed in Find a Player again");
  assert.equal(M.auditBy({ by }), "Caspian · Admin");
  assert.equal(M.auditBy({ by: { name: null, role: "operator", operator: "host" } }), "Server operator", "the operator's own label is not shown");
  eq(M.newestFormer([{ name: "A", until: "2026-10-01T00:00:00Z" }, { name: "B", until: "2026-10-20T00:00:00Z" }]), { name: "B", until: "2026-10-20T00:00:00Z" });
  assert.equal(M.newestFormer([]), null);
  assert.match(M.refusal({ error: "conflict", detail: "taken" }, "rename", "Kestrel"), /Another player took Kestrel a moment ago\. Nothing was changed/);
  assert.equal(M.refusal({ error: "forbidden" }, "rename"), "Changing it is for Admins only for now.");
  assert.match(M.refusal({ error: "unavailable", detail: "outcome-unknown" }, "rename"), /read the audit history before trying again/);
});

test("an Admin's Manage: the three rows, the empty audit history, live controls, Appoint Moderator and Appoint to Appeals", async () => {
  const w = world(ADMIN, { "staff-player": { player: view() } });
  await w.mount();
  const t = text(w.host);
  for (const want of ["Manage", "Only staff see this", "Player Name", "Kestral", "Former names", "None", "Staff roles", "Audit history", "No staff changes to this player yet.", "Admin, Moderator and Appeals are roles on one account"]) assert.ok(t.includes(want), want);
  const change = button(w.host, /^Change Player Name/);
  assert.equal(change.getAttribute("aria-disabled"), null);
  assert.ok(button(w.host, /^Appoint Moderator/), "an Admin appoints Moderators here");
  assert.ok(button(w.host, /^Appoint to Appeals/), "and, on its own, the Appeals team");
  assert.doesNotMatch(t, /Admins only for now/);
  eq(w.calls, [["staff-player", { name: "Kestral" }]]);
});

test("a Moderator's Manage: the same rows, the controls aria-disabled and tied to 'Admins only for now'; no role control", async () => {
  const w = world(MOD, { "staff-player": { player: view({ formerNames: [{ name: "Kestrall", until: "2026-10-20T10:00:00Z", state: "released" }], can: { rename: false, reserve: false, moderator: false, appeals: false } }) } });
  await w.mount();
  const change = button(w.host, /^Change Player Name/);
  const reserve = button(w.host, /^Reserve Kestrall/);
  for (const b of [change, reserve]) {
    assert.equal(b.getAttribute("aria-disabled"), "true");
    const why = w.body.find((n) => n.getAttribute("id") === b.getAttribute("aria-describedby"));
    assert.equal(why.textContent, "Changing it is for Admins only for now.");
  }
  change.click();
  assert.equal(change.getAttribute("aria-expanded"), "false", "a disabled control opens nothing");
  assert.equal(button(w.host, /Moderator$/), null, "no Appoint or Remove for a Moderator");
  assert.equal(button(w.host, /Appeals$/), null, "nor for the Appeals team");
  assert.match(text(w.host), /Released/);
});

test("Change Player Name: an available name and a reason; approved in Keplr for exactly that request, sent with the approval; a refused approval changes nothing", async () => {
  let renames = 0;
  const after = view({ name: "Kestrel", formerNames: [{ name: "Kestral", until: "2026-10-23T14:52:00Z", state: "reserved" }],
    audit: [{ at: "2026-10-23T14:52:00Z", kind: "player-renamed", from: "Kestral", to: "Kestrel", former: "reserved", outcome: "committed", by: { name: "Caspian", role: "admin" }, reason: "Impersonation report" }] });
  const w = world(ADMIN, {
    "staff-player": { player: view() },
    "name-check": (b) => Promise.resolve({ name: b.name, available: b.name === "Kestrel", problem: b.name === "Kestrel" ? null : "taken" }),
    "staff-rename": () => (++renames === 1 ? Promise.reject({ status: 403, error: "confirmation-required", detail: "expired" }) : Promise.resolve({ player: after })),
  });
  await w.mount();
  button(w.host, /^Change Player Name/).click();
  const input = w.host.find((n) => n.tagName === "input" && /ld-pinput--name/.test(n.className));
  assert.ok(input, "the new name's field");
  const go = button(w.host, /^Change (name|to )/);
  assert.equal(go.getAttribute("aria-disabled"), "true", "nothing to change yet");

  input.value = "Bo"; input.fire("blur"); await settle();
  assert.match(text(w.host), /Another player has that name\. Choose another\./);
  input.value = "Kestrel"; input.fire("blur"); await settle();
  assert.match(text(w.host), /Available/);
  const form = w.host.find((n) => n.tagName === "form");
  form.fire("submit");
  assert.match(text(w.host), /Give a reason\. It’s kept in the audit history\./, "no reason: nothing is sent");
  assert.equal(w.calls.filter(([r]) => r === "staff-rename").length, 0);

  w.host.find((n) => n.tagName === "input" && n.getAttribute("value") === "reserve").fire("change");
  const reason = w.host.find((n) => n.tagName === "textarea");
  reason.value = "Impersonation report"; reason.fire("input");
  assert.match(text(w.host), /Change to Kestrel/);
  assert.match(text(w.host), /Kestral is reserved:/);
  assert.equal(w.approvals.length, 0, "nothing approved before the press");
  form.fire("submit");
  await settle();
  const change = { name: "Kestral", to: "Kestrel", former: "reserve", reason: "Impersonation report" };
  eq(w.approvals, [{ route: "staff-rename", body: change, account: "Caspian", authorizationWallet: ADMIN_WALLET }], "Keplr is asked to approve exactly this change, with the Admin's own wallet");
  assert.match(text(w.host), /That approval didn’t check out .* Nothing was changed. Approve again./, "the server refused the approval: said in step 4");
  assert.equal(w.renamed.length, 0);
  form.fire("submit");
  await settle();
  const sent = w.calls.filter(([r]) => r === "staff-rename").map(([, b]) => b);
  eq(sent, [{ ...change, confirmOperation: "op1", confirmPubKey: "PK", confirmSignature: "SIG1" }, { ...change, confirmOperation: "op2", confirmPubKey: "PK", confirmSignature: "SIG2" }], "each request carries its own approval; nothing retyped");
  const t = text(w.host);
  for (const want of ["Player Name changed", "Kestral is reserved. Kestrel will be told on their next visit.", "Recorded in the audit history", "by Caspian", "Player Name: Kestral → Kestrel · former name reserved", "Caspian · Admin", "Impersonation report", "Release Kestral"]) assert.ok(t.includes(want), want);
  eq(w.renamed, ["Kestrel"], "the page's pass, title and address follow the new name");
});

test("the Appeals team: an Admin appoints and removes on its own, each approved in Keplr for exactly that change; the Moderator control is untouched", async () => {
  const granted = { at: "2026-10-24T09:00:00Z", kind: "role-granted", role: "appeals", by: { name: "Caspian", role: "admin" }, reason: "Prepares appeals" };
  const revoked = { at: "2026-10-24T10:00:00Z", kind: "role-revoked", role: "appeals", by: { name: "Caspian", role: "admin" }, reason: "Rotation" };
  const players = [view(), view({ roles: ["appeals"], audit: [granted] }), view({ roles: [], audit: [granted, revoked] })];
  const w = world(ADMIN, {
    "staff-player": () => Promise.resolve({ player: players.shift() }),
    "staff-role": () => Promise.resolve({ ok: true }),
  });
  await w.mount();
  async function change(re, reasonText) {
    const b = button(w.host, re);
    b.click();
    assert.equal(b.getAttribute("aria-expanded"), "true");
    const form = w.host.find((n) => n.tagName === "form");
    form.fire("submit");
    assert.match(text(w.host), /Give a reason. It’s kept in the audit history./, "no reason: nothing is approved or sent");
    const reason = form.find((n) => n.tagName === "textarea");
    reason.value = reasonText; reason.fire("input");
    form.fire("submit");
    await settle();
  }
  await change(/^Appoint to Appeals/, "Prepares appeals");
  eq(w.approvals, [{ route: "staff-role", body: { name: "Kestral", role: "appeals", action: "appoint", reason: "Prepares appeals" }, account: "Caspian", authorizationWallet: ADMIN_WALLET }]);
  let t = text(w.host);
  for (const want of ["Kestral is on the Appeals team now.", "Recorded in the audit history", "Role given: Appeals", "Prepares appeals"]) assert.ok(t.includes(want), want);
  assert.ok(button(w.host, /^Remove from Appeals/), "the control follows the role");
  assert.ok(button(w.host, /^Appoint Moderator/), "the Moderation team is a separate control");
  await change(/^Remove from Appeals/, "Rotation");
  eq(w.approvals[1].body, { name: "Kestral", role: "appeals", action: "remove", reason: "Rotation" });
  t = text(w.host);
  assert.ok(t.includes("Kestral is no longer on the Appeals team."));
  assert.ok(t.includes("Role removed: Appeals"));
  const sent = w.calls.filter(([r]) => r === "staff-role").map(([, b]) => b);
  eq(sent.map((b) => [b.role, b.action, b.confirmOperation]), [["appeals", "appoint", "op1"], ["appeals", "remove", "op2"]], "each change carries its own approval");
});

test("an Admin the server lets manage only the Appeals team sees only that control", async () => {
  const w = world(ADMIN, { "staff-player": { player: view({ can: { rename: true, reserve: true, moderator: false, appeals: true } }) } });
  await w.mount();
  assert.equal(button(w.host, /Moderator$/), null);
  assert.ok(button(w.host, /^Appoint to Appeals/));
});

test("a former name taken meanwhile: the refusal says nothing changed and the name step is refused", async () => {
  const w = world(ADMIN, {
    "staff-player": { player: view() },
    "name-check": () => Promise.resolve({ available: true, problem: null }),
    "staff-rename": () => Promise.reject({ status: 409, error: "conflict", detail: "taken" }),
  });
  await w.mount();
  button(w.host, /^Change Player Name/).click();
  const input = w.host.find((n) => n.tagName === "input" && /ld-pinput--name/.test(n.className));
  input.value = "Kestrel"; input.fire("blur"); await settle();
  const reason = w.host.find((n) => n.tagName === "textarea");
  reason.value = "Asked by the player"; reason.fire("input");
  w.host.find((n) => n.tagName === "form").fire("submit");
  await settle();
  assert.match(text(w.host), /Another player took Kestrel a moment ago\. Nothing was changed\. Choose another name\./);
  assert.equal(button(w.host, /^Change to Kestrel/).getAttribute("aria-disabled"), "true");
});

test("the renamed player's notice: the names and the day only; nothing for a player without one", () => {
  const { ctx } = load(["account-menu.js"]);
  const A = ctx.LudumAccountMenu;
  eq(A.noticeOf({ signedIn: true, notice: { kind: "player-name-changed", from: "Kestral", to: "Kestrel", at: "2026-10-23T14:52:00.000Z" } }), {
    title: "Your Player Name is now Kestrel",
    text: "Ludum staff changed your Player Name from Kestral to Kestrel on 23 Oct 2026. It’s shown on your profile, at tables and in your past standings. When you sign in with a password, use Kestrel; Keplr sign-in doesn’t change.",
  });
  assert.equal(A.noticeOf({ signedIn: true }), null);
  assert.equal(A.noticeOf({ signedIn: false, notice: { kind: "player-name-changed", from: "a", to: "b", at: "2026-10-23T00:00:00Z" } }), null);
  assert.equal(A.noticeOf({ signedIn: true, notice: { kind: "other", from: "a", to: "b", at: "2026-10-23T00:00:00Z" } }), null);
  const src = readFileSync(resolve(JS, "session.js"), "utf8");
  for (const route of ["staff-team", "staff-player", "staff-role", "staff-rename", "staff-former-name", "name-notice-dismiss"]) assert.ok(src.includes(`'${route}'`), route);
});
