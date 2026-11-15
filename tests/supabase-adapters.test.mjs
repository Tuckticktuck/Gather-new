import test from "node:test";
import assert from "node:assert/strict";
import {
  createSupabaseGameDrivers,
  createSupabaseMatchRepository
} from "../games/core/supabase-adapters.mjs";

function fakeDb() {
  const calls = [];
  return {
    calls,
    async rpc(name, params) {
      calls.push({ name, params });
      return { data: { id: params.p_game_id || "created-match", game_type: params.p_game_type || name.split("_")[1] }, error: null };
    }
  };
}

test("legacy board-game driver uses the existing pending-invitation RPC family", async () => {
  const db = fakeDb();
  const drivers = createSupabaseGameDrivers(db);
  const driver = drivers.byGame.chess;

  await driver.create({ conversationId: "conversation-1", opponentId: "player-2" });
  await driver.join("match-1");
  await driver.setReady("match-1", true);
  await driver.start("match-1");
  await driver.decline("match-2");
  await driver.cancel("match-3");
  await driver.end("match-4");

  assert.deepEqual(db.calls.map(x => x.name), [
    "gather_game_create",
    "gather_game_accept",
    "gather_game_set_ready",
    "gather_game_start",
    "gather_game_decline",
    "gather_game_cancel",
    "gather_game_end"
  ]);
  assert.deepEqual(db.calls[0].params, {
    p_conversation_id: "conversation-1",
    p_game_type: "chess",
    p_player_two_id: "player-2"
  });
  assert.equal(driver.family, "legacy-two-player");
  assert.equal(driver.endPolicy, "any-joined-player");
});

test("UNO, Ludo, and Dominoes drivers use their dedicated lifecycle RPCs", async () => {
  const db = fakeDb();
  const drivers = createSupabaseGameDrivers(db);

  await drivers.byGame.uno.create({ invitedUserIds: ["p2"], playerLimit: 2 });
  await drivers.byGame.uno.join("uno-1", { color: "#40826D" });
  await drivers.byGame.uno.setReady("uno-1", true);
  await drivers.byGame.uno.start("uno-1");
  await drivers.byGame.uno.spectate("uno-1");
  await drivers.byGame.uno.stopSpectating("uno-1");

  await drivers.byGame.ludo.create({ invitedUserIds: ["p2"], playerLimit: 2, color: "#38BDF8" });
  await assert.rejects(drivers.byGame.ludo.join("ludo-1"), /Ludo player color/);
  await drivers.byGame.ludo.join("ludo-1", { color: "#39A96B" });
  await drivers.byGame.ludo.decline("ludo-1");
  await drivers.byGame.ludo.cancel("ludo-1");

  await drivers.byGame.dominoes.create({ invitedUserIds: ["p2"], mode: "free_for_all", preset: "classic" });
  await drivers.byGame.dominoes.setReady("dominoes-1", false);
  await drivers.byGame.dominoes.loadPrivateState("dominoes-1");

  assert.deepEqual(db.calls.map(x => x.name), [
    "gather_uno_create", "gather_uno_join", "gather_uno_ready", "gather_uno_start", "gather_uno_spectate", "gather_uno_stop_spectating",
    "gather_ludo_create", "gather_ludo_join", "gather_ludo_decline", "gather_ludo_cancel",
    "gather_dominoes_create", "gather_dominoes_ready", "gather_dominoes_get_state"
  ]);
  assert.deepEqual(db.calls[0].params, {
    p_conversation_id: null,
    p_join_mode: "invite",
    p_invited_user_ids: ["p2"],
    p_max_players: 2
  });
  assert.deepEqual(db.calls[6].params, {
    p_conversation_id: null,
    p_join_mode: "invite",
    p_invited_user_ids: ["p2"],
    p_max_players: 2,
    p_creator_color: "#38BDF8"
  });
  assert.deepEqual(db.calls[10].params, {
    p_join_mode: "invite",
    p_invited_user_ids: ["p2"],
    p_mode: "free_for_all",
    p_preset: "classic"
  });
});

test("Battleship adapter exposes dedicated private-state and typed-action RPCs", async () => {
  const db = fakeDb();
  const driver = createSupabaseGameDrivers(db).byGame.battleship;
  const matchId = "11111111-1111-4111-8111-111111111111";
  const fleet = [
    { cells: [0, 1, 2, 3, 4] }, { cells: [10, 11, 12, 13] },
    { cells: [20, 21, 22] }, { cells: [30, 31, 32] }, { cells: [40, 41] }
  ];
  await driver.loadPrivateState(matchId);
  await driver.action(matchId, "place_fleet", { ships: fleet });
  await driver.action(matchId, "fire", { cell: 54 });
  assert.deepEqual(db.calls.map(call => call.name), [
    "gather_game_battleship_private_state",
    "gather_game_battleship_action",
    "gather_game_battleship_action"
  ]);
  assert.deepEqual(db.calls[1].params, {
    p_game_id: matchId, p_action: "place_fleet", p_payload: { ships: fleet }
  });
  assert.deepEqual(db.calls[2].params, {
    p_game_id: matchId, p_action: "fire", p_payload: { cell: 54 }
  });
  await assert.rejects(driver.action(matchId, "replace_state", {}), /Unsupported Battleship action/);
  await assert.rejects(driver.action(matchId, "fire", { cell: 100 }), /valid Battleship square/);
  assert.equal(typeof createSupabaseGameDrivers(fakeDb()).byGame.chess.action, "undefined");
});

test("the compatibility drivers do not expose the unsafe generic full-state update RPC", () => {
  const drivers = createSupabaseGameDrivers(fakeDb());
  for (const driver of Object.values(drivers.byGame)) {
    assert.equal(typeof driver.updateState, "undefined");
    assert.equal(typeof driver.submitFullState, "undefined");
  }
});

function queryDb(rows) {
  const subscriptions = [];
  const db = {
    subscriptions,
    from(table) {
      const state = { table, filters: [] };
      const query = {
        select(columns) { state.columns = columns; return query; },
        eq(column, value) { state.filters.push([column, value]); return query; },
        maybeSingle() {
          const row = rows[state.table];
          return Promise.resolve({ data: row || null, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: rows[state.table] || [], error: null }).then(resolve, reject);
        }
      };
      return query;
    },
    channel(name) {
      const channel = {
        name,
        listeners: [],
        on(event, filter, callback) {
          this.listeners.push({ event, filter, callback });
          return this;
        },
        subscribe() { this.subscribed = true; return this; }
      };
      subscriptions.push(channel);
      return channel;
    },
    removeChannel(channel) { channel.removed = true; return Promise.resolve("ok"); }
  };
  return db;
}

test("repository normalizes the legacy two-player row into a shared match snapshot", async () => {
  const db = queryDb({
    gather_games: {
      id: "11111111-1111-4111-8111-111111111111", game_type: "chess", status: "pending", created_by: "host",
      conversation_id: "conversation-1", player_one_id: "host", player_two_id: "invitee",
      revision: 3, state: { fen: "start" }, created_at: "2026-11-14T00:00:00Z", updated_at: "2026-11-14T00:00:00Z"
    }
  });
  const repository = createSupabaseMatchRepository(db);
  const snapshot = await repository.getSnapshot("11111111-1111-4111-8111-111111111111", "legacy-two-player");

  assert.equal(snapshot.game.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(snapshot.game.status, "pending");
  assert.deepEqual(snapshot.players.map(player => [player.user_id, player.status]), [
    ["host", "joined"],
    ["invitee", "invited"]
  ]);
});

test("repository loads shared public state and roster separately", async () => {
  const db = queryDb({
    gather_multiplayer_games: {
      id: "22222222-2222-4222-8222-222222222222", game_type: "dominoes", status: "active", created_by: "host",
      join_mode: "invite", settings: { mode: "free_for_all" }, state: { phase: "lobby" },
      revision: 4, created_at: "2026-11-14T00:00:00Z", updated_at: "2026-11-14T00:00:00Z"
    },
    gather_multiplayer_players: [
      { game_id: "22222222-2222-4222-8222-222222222222", user_id: "host", status: "joined", ready: true },
      { game_id: "22222222-2222-4222-8222-222222222222", user_id: "invitee", status: "invited", ready: false }
    ]
  });
  const repository = createSupabaseMatchRepository(db);
  const snapshot = await repository.getSnapshot("22222222-2222-4222-8222-222222222222", "shared-multiplayer");

  assert.equal(snapshot.game.game_type, "dominoes");
  assert.equal(snapshot.players.length, 2);
  assert.equal(snapshot.players[1].status, "invited");
});

test("Realtime subscriptions are scoped to one match and disposed cleanly", () => {
  const db = queryDb({});
  const repository = createSupabaseMatchRepository(db);
  let invalidations = 0;
  const dispose = repository.subscribe("22222222-2222-4222-8222-222222222222", "shared-multiplayer", () => invalidations++);

  assert.equal(db.subscriptions.length, 1);
  assert.equal(db.subscriptions[0].listeners.length, 2);
  assert.equal(db.subscriptions[0].subscribed, true);
  db.subscriptions[0].listeners[0].callback({ new: { state: { untrusted: true } } });
  assert.equal(invalidations, 1);

  dispose();
  assert.equal(db.subscriptions[0].removed, true);
});
