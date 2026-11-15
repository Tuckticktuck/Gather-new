import test from "node:test";
import assert from "node:assert/strict";
import { createLobbyService } from "../games/core/lobby-service.mjs";
import { GatherGameRegistry } from "../games/core/game-registry.mjs";

const snapshotFor = (gameType, options = {}) => ({
  game: {
    id: options.id || "match-1",
    game_type: gameType,
    status: options.status || "active",
    created_by: options.hostId || "host",
    join_mode: options.joinMode || "invite",
    settings: {},
    revision: 1,
    state: options.state || { phase: "lobby", started: false, finished: false }
  },
  players: options.players || [
    { user_id: "host", status: "joined", ready: true },
    { user_id: "player", status: "joined", ready: true }
  ]
});

function setup({ gameType = "dominoes", viewerId = "host", snapshot = snapshotFor(gameType), driverOverrides = {} } = {}) {
  const calls = [];
  const driver = {
    id: gameType,
    family: "shared-multiplayer",
    endPolicy: "host-only",
    async create(options) { calls.push(["create", options]); return { id: "new-match" }; },
    async join(id, extra) { calls.push(["join", id, extra]); return true; },
    async decline(id) { calls.push(["decline", id]); return true; },
    async setReady(id, ready) { calls.push(["setReady", id, ready]); return true; },
    async start(id) { calls.push(["start", id]); return true; },
    async leave(id) { calls.push(["leave", id]); return true; },
    async cancel(id) { calls.push(["cancel", id]); return true; },
    async end(id) { calls.push(["end", id]); return true; },
    async spectate(id) { calls.push(["spectate", id]); return true; },
    ...driverOverrides
  };
  const repository = {
    async getSnapshot() { return snapshot; },
    subscribe(_id, _family, callback) { calls.push(["subscribe"]); return () => calls.push(["unsubscribe"]); }
  };
  const service = createLobbyService({
    registry: GatherGameRegistry,
    drivers: { [gameType]: driver },
    repository,
    getViewerId: () => viewerId
  });
  return { service, calls };
}

test("service validates create options against the game registry", async () => {
  const { service, calls } = setup();
  const created = await service.create("dominoes", {
    invitedUserIds: ["player"],
    playerLimit: 4,
    mode: "free_for_all",
    preset: "classic"
  });
  assert.equal(created.matchId, "new-match");
  assert.equal(calls[0][0], "create");

  await assert.rejects(service.create("dominoes", {
    invitedUserIds: ["player", "player"], playerLimit: 4
  }), /Duplicate invitees/);

  await assert.rejects(service.create("dominoes", {
    invitedUserIds: ["player", "third", "fourth", "fifth"], playerLimit: 4
  }), /exceed the selected player limit/);

  await assert.rejects(service.create("unknown_game", {}), /not registered/);
});

test("team Dominoes requires exactly four participants", async () => {
  const { service } = setup();
  await assert.rejects(service.create("dominoes", {
    invitedUserIds: ["player"], playerLimit: 4, mode: "teams", preset: "classic"
  }), /exactly four players/);
});

test("the legacy two-player driver can create with a single opponent", async () => {
  const calls = [];
  const service = createLobbyService({
    registry: GatherGameRegistry,
    drivers: {
      chess: {
        id: "chess", family: "legacy-two-player", endPolicy: "any-joined-player",
        async create(options) { calls.push(options); return { id: "legacy-new" }; }
      }
    },
    getViewerId: () => "host"
  });

  const created = await service.create("chess", {
    conversationId: "conversation-1", opponentId: "player"
  });
  assert.equal(created.matchId, "legacy-new");
  assert.equal(calls[0].opponentId, "player");
});

test("an invited member can join a live multiplayer lobby", async () => {
  const snapshot = snapshotFor("dominoes", {
    players: [
      { user_id: "host", status: "joined" },
      { user_id: "invitee", status: "invited" }
    ]
  });
  const { service, calls } = setup({ viewerId: "invitee", snapshot });
  await service.join("dominoes", "match-1", { color: "#22D3EE" });
  assert.equal(calls[0][0], "join");
});

test("a spectator or invitee cannot change readiness", async () => {
  const snapshot = snapshotFor("dominoes", {
    players: [
      { user_id: "host", status: "joined" },
      { user_id: "spectator", status: "spectating" }
    ]
  });
  const { service, calls } = setup({ viewerId: "spectator", snapshot });
  await assert.rejects(service.setReady("dominoes", "match-1", true), error => error.code === "permission-denied");
  assert.equal(calls.length, 0);
});

test("only the host can start or cancel a lobby", async () => {
  const snapshot = snapshotFor("dominoes");
  const { service } = setup({ viewerId: "player", snapshot });
  await assert.rejects(service.start("dominoes", "match-1"), error => error.code === "permission-denied");
  await assert.rejects(service.cancel("dominoes", "match-1"), error => error.code === "permission-denied");
});

test("host-only end policy is enforced before calling a game driver", async () => {
  const { service, calls } = setup({ viewerId: "player" });
  await assert.rejects(service.end("dominoes", "match-1"), error => error.code === "permission-denied");
  assert.equal(calls.length, 0);
});

test("an any-player legacy game end policy permits either joined player", async () => {
  const snapshot = snapshotFor("chess");
  const { service, calls } = setup({
    gameType: "chess",
    viewerId: "player",
    snapshot,
    driverOverrides: { id: "chess", family: "legacy-two-player", endPolicy: "any-joined-player" }
  });
  await service.end("chess", "match-1");
  assert.equal(calls[0][0], "end");
});

test("watch uses canonical snapshots and disposes the realtime subscription", async () => {
  const { service, calls } = setup();
  const received = [];
  const sync = service.watch("dominoes", "match-1", snapshot => received.push(snapshot.match.id), { debounceMs: 1 });
  sync.start();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(received, ["match-1"]);
  sync.stop();
  assert.deepEqual(calls.map(call => call[0]), ["subscribe", "unsubscribe"]);
});
