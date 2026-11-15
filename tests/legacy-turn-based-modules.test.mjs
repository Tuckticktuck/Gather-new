import test from "node:test";
import assert from "node:assert/strict";
import { createLegacyTurnBasedModules } from "../games/modules/legacy-turn-based/index.mjs";

function fixture() {
  const calls = [];
  const snapshot = {
    match: {
      gameType: "chess", status: "active", hostId: "player-one",
      playerOneId: "player-one", playerTwoId: "player-two",
      startedAt: "2026-11-15T12:00:00Z", revision: 7, state: {}
    },
    players: [
      { userId: "player-one", status: "joined" },
      { userId: "player-two", status: "joined" }
    ]
  };
  const lobbyService = {
    async load(gameType, id) { calls.push(["load", gameType, id]); return { ...snapshot, match: { ...snapshot.match, gameType } }; },
    watch() { return { start() {}, stop() {} }; },
    create() {}, join() {}, decline() {}, cancel() {}, end() {}
  };
  const db = { functions: { async invoke(name, options) {
    calls.push(["invoke", name, options.body]);
    return { data: { id: options.body.gameId, revision: 8 }, error: null };
  } } };
  const modules = createLegacyTurnBasedModules({
    db, lobbyService, getViewerId: () => "player-one",
    renderLobby() {}, renderChess() {}, renderCheckers() {}
  });
  return { modules, calls };
}

test("Chess and Checkers register as independent shared lifecycle modules", () => {
  const { modules } = fixture();
  assert.deepEqual(modules.map(module => module.id), ["chess", "checkers"]);
  for (const module of modules) {
    assert.equal(module.apiVersion, 1);
    assert.equal(typeof module.watch, "function");
    assert.equal(typeof module.load, "function");
    assert.equal(typeof module.action, "function");
  }
});

test("Chess and Checkers submit typed move intents through the trusted Edge Function", async () => {
  const { modules, calls } = fixture();
  const chess = modules[0];
  const checkers = modules[1];
  const chessResult = await chess.action("11111111-1111-4111-8111-111111111111", {
    type: "move", from: "e2", to: "e4"
  });
  const checkersResult = await checkers.action("22222222-2222-4222-8222-222222222222", {
    type: "move", from: 40, to: 33
  });
  assert.equal(chessResult.revision, 8);
  assert.equal(checkersResult.revision, 8);
  const invokes = calls.filter(call => call[0] === "invoke");
  assert.equal(invokes.length, 2);
  assert.equal(invokes[0][1], "gather-board-game-action");
  assert.equal(invokes[0][2].expectedRevision, 7);
  assert.deepEqual(invokes[0][2].action, { type: "move", from: "e2", to: "e4" });
  assert.deepEqual(invokes[1][2].action, { type: "move", from: 40, to: 33 });
});

test("Chess and Checkers reject malformed move intents before network calls", async () => {
  const { modules, calls } = fixture();
  await assert.rejects(modules[0].action("11111111-1111-4111-8111-111111111111", {
    type: "move", from: "z9", to: "e4"
  }), /valid Chess squares/);
  await assert.rejects(modules[1].action("22222222-2222-4222-8222-222222222222", {
    type: "move", from: 64, to: 33
  }), /valid Checkers squares/);
  assert.equal(calls.length, 0);
});

test("Chess and Checkers client code and offline cache use the module boundary", async () => {
  const { readFile } = await import("node:fs/promises");
  const [client, worker, html] = await Promise.all([
    readFile(new URL("../games.js", import.meta.url), "utf8"),
    readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8")
  ]);
  assert.ok(client.includes('import("./games/modules/legacy-turn-based/index.mjs")'));
  assert.ok(client.includes("...turnBasedApi.createLegacyTurnBasedModules"));
  assert.ok(client.includes('["chess", "checkers"].includes(game.game_type)'));
  assert.equal(worker.split("./games/modules/legacy-turn-based/index.mjs").length - 1, 2);
  assert.ok(worker.includes("gather-shell-v125"));
  assert.ok(html.includes("games.js?v=20261115-chess-checkers-modules-1"));
});
