// node --test platform/tools/tests/*.test.mjs  — LudumSession (platform/js/session.js), in a sandbox window with a recorded fetch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "js", "session.js"), "utf8");

function load(answer, pathname = "/me/") {
  const calls = [];
  const assigned = [];
  const window = {
    location: { pathname, assign: (url) => assigned.push(url) },
    fetch: (url, init) => {
      calls.push({ url, init });
      return answer(url, init);
    },
  };
  vm.runInNewContext(SOURCE, { window, Promise, JSON, Object, Error, encodeURIComponent, String });
  return { LudumSession: window.LudumSession, calls, assigned };
}
const respond = (status, json) => () => Promise.resolve({ status, json: () => (json === undefined ? Promise.reject(new Error("no json")) : Promise.resolve(json)) });

test("api sends exactly the §2.1 client fetch", async () => {
  const { LudumSession, calls } = load(respond(200, { games: [], nextCursor: null, asOf: "x" }));
  const json = await LudumSession.api("games", { limit: 5 });
  assert.deepEqual(json, { games: [], nextCursor: null, asOf: "x" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://play.netadao.org/gs/api/ludum/v1/games");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].init)), {
    method: "POST",
    mode: "cors",
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: '{"limit":5}',
  });
  assert.equal(LudumSession.PLAY_ORIGIN, "https://play.netadao.org");
  assert.ok(Object.isFrozen(LudumSession));
});

test("whoami is the session route with an empty body", async () => {
  const { LudumSession, calls } = load(respond(200, { signedIn: false, signInUrl: "u" }));
  assert.deepEqual(await LudumSession.whoami(), { signedIn: false, signInUrl: "u" });
  assert.equal(calls[0].url, "https://play.netadao.org/gs/api/ludum/v1/session");
  assert.equal(calls[0].init.body, "{}");
});

test("errors map to {status, error, detail}; unreachable or unreadable is `unavailable`; unknown routes never fetch", async () => {
  const notFound = load(respond(404, { error: "not-found" }));
  await assert.rejects(notFound.LudumSession.api("game", { gameId: "g" }), (e) => e.status === 404 && e.error === "not-found" && e.name === "LudumApiError");
  const down = load(() => Promise.reject(new TypeError("Failed to fetch")));
  await assert.rejects(down.LudumSession.api("session"), (e) => e.status === 0 && e.error === "unavailable");
  const garbled = load(respond(502));
  await assert.rejects(garbled.LudumSession.api("session"), (e) => e.status === 502 && e.error === "unavailable");
  const unknown = load(respond(200, {}));
  await assert.rejects(unknown.LudumSession.api("account/me"), (e) => e.error === "bad-request");
  assert.equal(unknown.calls.length, 0);
});

test("401 goes to sign in only when asked", async () => {
  const quiet = load(respond(401, { error: "signed-out" }), "/me/");
  await assert.rejects(quiet.LudumSession.api("games"), (e) => e.status === 401 && e.error === "signed-out");
  assert.deepEqual(quiet.assigned, []);
  const asked = load(respond(401, { error: "signed-out" }), "/me/");
  await assert.rejects(asked.LudumSession.api("games", {}, { redirectOnSignedOut: true }));
  assert.deepEqual(asked.assigned, ["https://play.netadao.org/?ludum=signin&return=%2Fme%2F"]);
});

test("signInUrl returns only to a safe path", () => {
  const { LudumSession } = load(respond(200, {}), "/disputes/case/");
  assert.equal(LudumSession.signInUrl(), "https://play.netadao.org/?ludum=signin&return=%2Fdisputes%2Fcase%2F");
  assert.equal(LudumSession.signInUrl("/governance/"), "https://play.netadao.org/?ludum=signin&return=%2Fgovernance%2F");
  for (const bad of ["//evil.example", "https://evil.example/", "/me/?x=1", "/Me/", "/a/../b", "me/"]) {
    assert.equal(LudumSession.signInUrl(bad), "https://play.netadao.org/?ludum=signin&return=%2F", bad);
  }
});
