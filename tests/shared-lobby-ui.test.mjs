import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../games/shared/lobby-ui.js", import.meta.url), "utf8");

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.disabled = false;
    this.listeners = {};
  }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  get childElementCount() { return this.children.length; }
}

function renderer() {
  const window = {};
  const document = { createElement: tag => new FakeElement(tag) };
  vm.runInNewContext(source, { window, document, Object });
  return window.GatherSharedLobby;
}

function flatten(node) {
  return [node, ...(node.children || []).flatMap(flatten)];
}

test("shared lobby renders each participant and computes variable-capacity readiness", () => {
  const api = renderer();
  const root = new FakeElement("main");
  const result = api.render({
    root,
    gameName: "Ludo",
    game: { created_by: "host", join_mode: "invite", settings: { max_players: 4 }, state: { started: false } },
    players: [
      { user_id: "host", status: "joined", ready: true },
      { user_id: "p2", status: "joined", ready: true },
      { user_id: "p3", status: "invited", ready: false }
    ],
    viewerId: "host",
    getName: id => id
  });

  assert.equal(result.joinedCount, 2);
  assert.equal(result.invitedCount, 1);
  assert.equal(result.openSeats, 1);
  assert.equal(result.maxPlayers, 4);
  assert.equal(result.everyoneReady, true);
  const nodes = flatten(root);
  assert.ok(nodes.some(node => node.textContent === "p2"));
  assert.ok(nodes.some(node => node.textContent === "p3"));
  assert.ok(nodes.some(node => node.textContent.includes("2/4 player seats filled")));
  assert.ok(nodes.some(node => node.textContent === "Start match" && node.disabled === false));
});

test("team lobby readiness waits for all four players", () => {
  const api = renderer();
  const root = new FakeElement("main");
  const game = { created_by: "host", join_mode: "invite", settings: { max_players: 4 }, state: { started: false } };
  const players = [
    { user_id: "host", status: "joined", ready: true },
    { user_id: "p2", status: "joined", ready: true },
    { user_id: "p3", status: "joined", ready: true }
  ];
  const waiting = api.render({ root, gameName: "Dominoes", game, players, viewerId: "host", minPlayers: 4, getName: id => id });
  assert.equal(waiting.everyoneReady, false);
  assert.equal(waiting.joinedCount, 3);
  assert.ok(flatten(root).some(node => node.textContent.includes("Waiting for 1 more player")));

  players.push({ user_id: "p4", status: "joined", ready: true });
  const ready = api.render({ root, gameName: "Dominoes", game, players, viewerId: "host", minPlayers: 4, getName: id => id });
  assert.equal(ready.everyoneReady, true);
  assert.equal(ready.joinedCount, 4);
});

test("invited players receive accept and decline actions", () => {
  const api = renderer();
  const root = new FakeElement("main");
  api.render({
    root,
    gameName: "UNO",
    game: { created_by: "host", join_mode: "invite", settings: { max_players: 10 }, state: { started: false } },
    players: [
      { user_id: "host", status: "joined", ready: false },
      { user_id: "invitee", status: "invited", ready: false }
    ],
    viewerId: "invitee",
    getName: id => id,
    onJoin() {},
    onDecline() {}
  });
  const labels = flatten(root).map(node => node.textContent);
  assert.ok(labels.includes("Accept invitation"));
  assert.ok(labels.includes("Decline"));
});
