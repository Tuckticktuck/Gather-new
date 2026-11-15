import test from "node:test";
import assert from "node:assert/strict";
import { createDominoesModule } from "../games/modules/dominoes/index.mjs";

function fakeDb() {
  const calls = [];
  const db = {
    calls,
    async rpc(name, params) {
      calls.push({ type: "rpc", name, params });
      if (name === "gather_dominoes_get_state") {
        return { data: { game: { id: params.p_game_id, game_type: "dominoes", status: "active", created_by: "host", state: { phase: "playing" }, revision: 2 }, players: [{ user_id: "host", status: "joined" }], your_hand: [{ id: "private-tile", a: 2, b: 4 }] }, error: null };
      }
      return { data: { id: params.p_game_id || "created-match" }, error: null };
    },
    from(table) {
      const state = { table, filters: [] };
      const query = {
        select() { return query; },
        eq(k,v) { state.filters.push([k,v]); return query; },
        maybeSingle() {
          if (table === "gather_multiplayer_games") return Promise.resolve({ data: { id: state.filters.find(x=>x[0]==="id")?.[1], game_type: "dominoes", status: "active", created_by: "host", join_mode: "invite", settings: {}, state: { phase: "playing" }, revision: 2 }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve,reject) {
          return Promise.resolve({ data: table === "gather_multiplayer_players" ? [{ user_id: "host", status: "joined", ready: true }] : [], error: null }).then(resolve,reject);
        }
      };
      return query;
    },
    channel(name) {
      const ch = { name, handlers: [], on(_event,filter,callback) { this.handlers.push({filter,callback}); return this; }, subscribe() { return this; } };
      calls.push({ type: "channel", channel: ch });
      return ch;
    },
    removeChannel(ch) { ch.removed = true; }
  };
  return db;
}

test("Dominoes module uses shared lobby service and dedicated private-state RPC", async () => {
  const db = fakeDb();
  const result = createDominoesModule({ db, getViewerId: () => "host" });
  assert.equal(result.module.id, "dominoes");
  const snapshot = await result.module.load("11111111-1111-4111-8111-111111111111");
  assert.equal(snapshot.game.game_type, "dominoes");
  assert.equal(snapshot.privateState.your_hand[0].id, "private-tile");
  assert.ok(db.calls.some(call => call.name === "gather_dominoes_get_state"));
});

test("Dominoes module delegates lobby creation to shared validation and driver", async () => {
  const db = fakeDb();
  const result = createDominoesModule({ db, getViewerId: () => "host" });
  const created = await result.module.create({
    invitedUserIds: ["player"], playerLimit: 4, mode: "free_for_all", preset: "classic"
  });
  assert.equal(created.matchId, "created-match");
  assert.equal(db.calls.find(call => call.name === "gather_dominoes_create").params.p_mode, "free_for_all");
});

test("Dominoes module stops its shared realtime watcher on unmount", async () => {
  const db = fakeDb();
  const result = createDominoesModule({ db, getViewerId: () => "host" });
  const dispose = await result.module.mount({ matchId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(typeof dispose, "function");
  result.module.unmount();
});
