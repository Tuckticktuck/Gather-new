import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [client, moduleSource, html, worker] = await Promise.all([
  readFile(new URL("../uno.js", import.meta.url), "utf8"),
  readFile(new URL("../games/modules/uno/index.mjs", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../service-worker.js", import.meta.url), "utf8")
]);

test("UNO client routes shared lifecycle and view loading through its game module", () => {
  assert.match(client, /import\("\.\/games\/modules\/uno\/index\.mjs"\)/);
  assert.match(client, /module\.create\(/);
  assert.match(client, /module\.join\(/);
  assert.match(client, /module\.setReady\(/);
  assert.match(client, /module\.start\(/);
  assert.match(client, /module\.load\(/);
  assert.match(client, /module\.mount\(/);
  assert.match(client, /engineModule\?\.unmount\?\.\(/);
  assert.match(client, /case "gather_uno_action": return module\.action/);
  assert.doesNotMatch(client, /ctx\.db\.rpc\("gather_uno_(?:get_state|action|create|join|ready|start|leave|end|spectate)"/);
});

test("UNO module composes public match state with the authenticated viewer's private hand", () => {
  assert.match(moduleSource, /createLobbyService/);
  assert.match(moduleSource, /lobby\.watch\(/);
  assert.match(moduleSource, /loadPrivateState\(matchId\)/);
  assert.match(moduleSource, /hand: Object\.freeze/);
  assert.match(moduleSource, /public_state: match\.state/);
  assert.doesNotMatch(moduleSource, /updateState|submitFullState|gather_multiplayer_update_state/);
});

test("UNO module and current client version are available from the service-worker cache", () => {
  assert.match(html, /uno\.js\?v=20261114-shared-engine-1/);
  assert.match(worker, /uno\.js\?v=20261114-shared-engine-1/);
  assert.equal(worker.split('"./games/modules/uno/index.mjs"').length - 1, 2);
  assert.match(worker, /gather-shell-v117/);
});
