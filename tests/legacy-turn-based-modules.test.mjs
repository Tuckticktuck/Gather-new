import test from "node:test";
import assert from "node:assert/strict";
import { createLegacyTurnBasedModules } from "../games/modules/legacy-turn-based/index.mjs";

function fixture(overrides = {}) {
  const calls = [];
  const baseSnapshot = {
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
    async load(gameType, id) {
      calls.push(["load", gameType, id]);
      const snapshot = overrides.snapshot || baseSnapshot;
      return { ...snapshot, match: { ...snapshot.match, gameType } };
    },
    watch() { return { start() {}, stop() {} }; },
    create() {}, join() {}, decline() {}, cancel() {}, end() {}
  };
  const db = { functions: { async invoke(name, options) {
    calls.push(["invoke", name, options.body]);
    if (overrides.invokeError) return { data: null, error: { message: overrides.invokeError } };
    return { data: overrides.invokeData || { game: { id: options.body.gameId, revision: 8 } }, error: null };
  } } };
  const modules = createLegacyTurnBasedModules({
    db, lobbyService, getViewerId: () => overrides.viewerId ?? "player-one",
    renderLobby() {}, renderChess() {}, renderCheckers() {}
  });
  return { modules, calls };
}

const CHESS_ID = "11111111-1111-4111-8111-111111111111";
const CHECKERS_ID = "22222222-2222-4222-8222-222222222222";

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
  const chessResult = await modules[0].action(CHESS_ID, {
    type: "move", from: "e2", to: "e4"
  });
  const checkersResult = await modules[1].action(CHECKERS_ID, {
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
  await assert.rejects(modules[0].action(CHESS_ID, {
    type: "move", from: "z9", to: "e4"
  }), /valid Chess squares/);
  await assert.rejects(modules[0].action(CHESS_ID, {
    type: "move", from: "e7", to: "e8", promotion: "king"
  }), /valid Chess promotion/);
  await assert.rejects(modules[1].action(CHECKERS_ID, {
    type: "move", from: 64, to: 33
  }), /valid Checkers squares/);
  await assert.rejects(modules[0].action("not-a-uuid", {
    type: "move", from: "e2", to: "e4"
  }), /valid match UUID/);
  assert.equal(calls.length, 0);
});

test("Only joined players may submit moves; visitors and spectators are rejected locally", async () => {
  const visitor = fixture({ viewerId: "outsider" });
  await assert.rejects(visitor.modules[0].action(CHESS_ID, {
    type: "move", from: "e2", to: "e4"
  }), /cannot make this move: not-joined/);
  assert.equal(visitor.calls.filter(call => call[0] === "invoke").length, 0);

  const spectatorSnapshot = {
    match: {
      gameType: "chess", status: "active", hostId: "player-one",
      playerOneId: "player-one", playerTwoId: "player-two",
      startedAt: "2026-11-15T12:00:00Z", revision: 7, state: {}
    },
    players: [
      { userId: "player-one", status: "spectating" },
      { userId: "player-two", status: "joined" }
    ]
  };
  const spectator = fixture({ snapshot: spectatorSnapshot });
  await assert.rejects(spectator.modules[0].action(CHESS_ID, {
    type: "move", from: "e2", to: "e4"
  }), /cannot make this move: not-joined/);
  assert.equal(spectator.calls.filter(call => call[0] === "invoke").length, 0);
});

test("Completed matches and lobby-phase matches cannot submit gameplay actions", async () => {
  const completed = fixture({
    snapshot: {
      match: {
        gameType: "chess", status: "completed", hostId: "player-one",
        playerOneId: "player-one", playerTwoId: "player-two",
        startedAt: "2026-11-15T12:00:00Z", revision: 8, state: { phase: "completed" }
      },
      players: [
        { userId: "player-one", status: "joined" },
        { userId: "player-two", status: "joined" }
      ]
    }
  });
  await assert.rejects(completed.modules[0].action(CHESS_ID, {
    type: "move", from: "e2", to: "e4"
  }), /cannot make this move: action-not-allowed/);
  assert.equal(completed.calls.filter(call => call[0] === "invoke").length, 0);

  const lobby = fixture({
    snapshot: {
      match: {
        gameType: "checkers", status: "active", hostId: "player-one",
        playerOneId: "player-one", playerTwoId: "player-two",
        startedAt: null, revision: 2, state: { phase: "lobby" }
      },
      players: [
        { userId: "player-one", status: "joined" },
        { userId: "player-two", status: "joined" }
      ]
    }
  });
  await assert.rejects(lobby.modules[1].action(CHECKERS_ID, {
    type: "move", from: 40, to: 33
  }), /cannot make this move: action-not-allowed/);
  assert.equal(lobby.calls.filter(call => call[0] === "invoke").length, 0);
});

test("Module surfaces Edge Function errors and rejects malformed server responses", async () => {
  const failed = fixture({ invokeError: "The board changed. Refresh the game and try again." });
  await assert.rejects(failed.modules[0].action(CHESS_ID, {
    type: "move", from: "e2", to: "e4"
  }), /board changed/);

  const malformed = fixture({ invokeData: { ok: true } });
  await assert.rejects(malformed.modules[0].action(CHESS_ID, {
    type: "move", from: "e2", to: "e4"
  }), /did not return the updated match/);
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
