import test from "node:test";
import assert from "node:assert/strict";
import { createUnoModule } from "../games/modules/uno/index.mjs";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";

function fakeDb({ inviteeStatus = "joined", started = true } = {}) {
  const calls = [];
  const game = {
    id: MATCH_ID,
    game_type: "uno",
    status: "active",
    created_by: "host",
    join_mode: "invite",
    conversation_id: null,
    settings: { max_players: 2, house_rules: { starting_hand_size: 7 } },
    state: {
      version: 1,
      started,
      top_card: { id: "top", color: "green", value: 5, kind: "number" },
      current_color: "green",
      turn_user_id: "host",
      deck_count: 20
    },
    revision: 7,
    created_at: "2026-11-14T00:00:00Z",
    updated_at: "2026-11-14T00:00:00Z"
  };
  const roster = [
    { game_id: MATCH_ID, user_id: "host", status: "joined", ready: true },
    { game_id: MATCH_ID, user_id: "player", status: inviteeStatus, ready: true }
  ];
  const privateResponse = () => ({
    game: { ...game },
    public_state: { ...game.state },
    players: [
      { user_id: "host", status: "joined", ready: true, card_count: 2 },
      { user_id: "player", status: inviteeStatus, ready: true, card_count: 5 }
    ],
    hand: [{ id: "my-card", color: "green", value: 5, kind: "number" }],
    drawn_card_id: null,
    started,
    spectating: false,
    rematch_pending: false
  });

  return {
    calls,
    async rpc(name, params) {
      calls.push({ type: "rpc", name, params });
      if (["gather_uno_get_state", "gather_uno_action", "gather_uno_start", "gather_uno_host_rematch"].includes(name)) {
        return { data: privateResponse(), error: null };
      }
      if (name === "gather_uno_create") return { data: { id: MATCH_ID }, error: null };
      if (name === "gather_uno_respond_rematch") return { data: { status: "accepted_waiting" }, error: null };
      return { data: true, error: null };
    },
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle() {
          return Promise.resolve({ data: table === "gather_multiplayer_games" ? game : null, error: null });
        },
        then(resolve, reject) {
          const rows = table === "gather_multiplayer_players" ? roster : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
      };
      return query;
    },
    channel(name) {
      const channel = {
        name,
        listeners: [],
        on(event, filter, callback) { this.listeners.push({ event, filter, callback }); return this; },
        subscribe() { this.subscribed = true; return this; }
      };
      calls.push({ type: "channel", channel });
      return channel;
    },
    removeChannel(channel) { channel.removed = true; return Promise.resolve("ok"); }
  };
}

test("UNO module composes the shared canonical match with only the viewer's private hand", async () => {
  const db = fakeDb();
  const { module } = createUnoModule({ db, getViewerId: () => "host" });
  const snapshot = await module.load(MATCH_ID);
  assert.equal(snapshot.game.game_type, "uno");
  assert.equal(snapshot.game.revision, 7);
  assert.equal(snapshot.public_state.turn_user_id, "host");
  assert.deepEqual(snapshot.hand.map(card => card.id), ["my-card"]);
  assert.equal(snapshot.players.find(player => player.user_id === "player").card_count, 5);
  assert.equal(Object.hasOwn(snapshot, "deck"), false);
  assert.equal(Object.hasOwn(snapshot.game.state, "hands"), false);
});

test("UNO lobby creation uses shared registry validation and the dedicated create RPC", async () => {
  const db = fakeDb();
  const { module } = createUnoModule({ db, getViewerId: () => "host" });
  const result = await module.create({ invitedUserIds: ["player"], playerLimit: 2, joinMode: "invite" });
  assert.equal(result.matchId, MATCH_ID);
  assert.deepEqual(db.calls.find(call => call.name === "gather_uno_create").params, {
    p_conversation_id: null,
    p_join_mode: "invite",
    p_invited_user_ids: ["player"],
    p_max_players: 2
  });
});

test("UNO host readiness and start operations use the shared lobby service", async () => {
  const db = fakeDb({ started: false });
  const { module } = createUnoModule({ db, getViewerId: () => "host" });
  await module.setReady(MATCH_ID, true);
  await module.start(MATCH_ID);
  assert.deepEqual(db.calls.filter(call => call.type === "rpc").map(call => call.name), [
    "gather_uno_ready",
    "gather_uno_start",
    "gather_uno_get_state"
  ]);
});

test("UNO invitation, spectating, stop-spectating, and decline paths preserve their dedicated rules", async () => {
  const db = fakeDb({ inviteeStatus: "invited" });
  const { module } = createUnoModule({ db, getViewerId: () => "player" });
  await module.join(MATCH_ID);
  await module.spectate(MATCH_ID);
  await module.stopSpectating(MATCH_ID);
  await module.decline(MATCH_ID);
  assert.deepEqual(db.calls.filter(call => call.type === "rpc").map(call => call.name), [
    "gather_uno_join",
    "gather_uno_spectate",
    "gather_uno_stop_spectating",
    "gather_uno_decline"
  ]);
});

test("UNO action intents and specialized host/result operations keep their dedicated RPC boundaries", async () => {
  const db = fakeDb();
  const { module } = createUnoModule({ db, getViewerId: () => "host" });
  await module.action(MATCH_ID, "play", "card-1", "red");
  await module.setHouseRules(MATCH_ID, { starting_hand_size: 7, draw_until_playable: false, wild4_anytime: false });
  await module.confirmDone(MATCH_ID);
  await module.requestRematch(MATCH_ID);
  await module.hostRematch(MATCH_ID);
  const response = await module.respondToRematch("22222222-2222-4222-8222-222222222222", true);
  assert.equal(response.status, "accepted_waiting");
  assert.deepEqual(db.calls.filter(call => call.type === "rpc").map(call => call.name), [
    "gather_uno_action",
    "gather_uno_get_state",
    "gather_uno_set_house_rules",
    "gather_uno_done",
    "gather_uno_request_rematch",
    "gather_uno_host_rematch",
    "gather_uno_get_state",
    "gather_uno_respond_rematch"
  ]);
  await assert.rejects(module.action(MATCH_ID, "replace_state", "bad"), /Unsupported UNO action/);
});

test("UNO module disposes match-scoped realtime watching when unmounted", async () => {
  const db = fakeDb();
  const { module } = createUnoModule({ db, getViewerId: () => "host" });
  const dispose = await module.mount({ matchId: MATCH_ID });
  assert.equal(typeof dispose, "function");
  const channel = db.calls.find(call => call.type === "channel").channel;
  assert.equal(channel.subscribed, true);
  module.unmount();
  assert.equal(channel.removed, true);
});
