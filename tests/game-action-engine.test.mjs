import test from "node:test";
import assert from "node:assert/strict";
import {
  createGameEngineRegistry,
  GameRuleError,
  resolveGameAction,
  validateGameActionRequest,
} from "../supabase/functions/gather-game-action/engine.mjs";

const actor = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const match = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  game_key: "test-grid",
  status: "active",
  state: { board: [null, null, null] },
  version: 3,
  current_turn_user_id: actor,
};
const players = [
  { user_id: actor, response: "accepted", player_order: 0 },
  { user_id: other, response: "accepted", player_order: 1 },
];

test("validates action request envelope", () => {
  const request = validateGameActionRequest({
    matchId: match.id,
    expectedVersion: 3,
    action: { type: "place", index: 1 },
  });
  assert.equal(request.expectedVersion, 3);
  assert.deepEqual(request.action, { type: "place", index: 1 });
});

test("rejects malformed and oversized action requests", () => {
  assert.throws(() => validateGameActionRequest(null), /JSON object/);
  assert.throws(() => validateGameActionRequest({
    matchId: "not-a-uuid", expectedVersion: 1, action: {},
  }), /matchId/);
  assert.throws(() => validateGameActionRequest({
    matchId: match.id, expectedVersion: 0, action: {},
  }), /expectedVersion/);
  assert.throws(() => validateGameActionRequest({
    matchId: match.id, expectedVersion: 1, action: { data: "x".repeat(9000) },
  }), /too large/);
});

test("registry rejects malformed and duplicate adapters", () => {
  assert.throws(() => createGameEngineRegistry([{ key: "bad key", applyAction() {} }]));
  assert.throws(() => createGameEngineRegistry([
    { key: "grid", applyAction() {} },
    { key: "grid", applyAction() {} },
  ]), /Duplicate/);
});

test("applies a valid server adapter transition", async () => {
  const registry = createGameEngineRegistry([{
    key: "test-grid",
    applyAction({ state, action }) {
      if (action.type !== "place" || !Number.isInteger(action.index) ||
          action.index < 0 || action.index >= state.board.length ||
          state.board[action.index] !== null) {
        throw new GameRuleError("Illegal placement.");
      }
      state.board[action.index] = "X";
      return {
        nextState: state,
        eventType: "piece_placed",
        eventPayload: { index: action.index },
        nextTurnUserId: other,
      };
    },
  }]);
  const result = await resolveGameAction({
    engine: registry.get("test-grid"),
    match,
    actorId: actor,
    players,
    action: { type: "place", index: 1 },
  });
  assert.equal(result.nextState.board[1], "X");
  assert.equal(result.nextTurnUserId, other);
  assert.equal(result.eventType, "piece_placed");
  assert.equal(result.nextStatus, "active");
  assert.equal(match.state.board[1], null, "input snapshot must not be mutated");
});

test("rejects non-player and out-of-turn actions before engine execution", async () => {
  const engine = { applyAction() { throw new Error("should not run"); } };
  await assert.rejects(resolveGameAction({
    engine, match, actorId: "33333333-3333-4333-8333-333333333333", players, action: {},
  }), /accepted players/);
  await assert.rejects(resolveGameAction({
    engine, match, actorId: other, players, action: {},
  }), /turn/);
});

test("supports completed matches and rejects invalid completion turn", async () => {
  const completed = await resolveGameAction({
    engine: { applyAction: () => ({
      nextState: { winner: actor }, eventPayload: { winner: actor },
      eventType: "match_completed", nextTurnUserId: null, nextStatus: "completed",
    }) },
    match, actorId: actor, players, action: {},
  });
  assert.equal(completed.nextStatus, "completed");
  assert.equal(completed.nextTurnUserId, null);
  await assert.rejects(resolveGameAction({
    engine: { applyAction: () => ({
      nextState: {}, eventPayload: {}, eventType: "match_completed",
      nextTurnUserId: other, nextStatus: "completed",
    }) },
    match, actorId: actor, players, action: {},
  }), /completed match cannot have a current turn/);
  await assert.rejects(resolveGameAction({
    engine: { applyAction: () => ({
      nextState: {}, eventPayload: {}, eventType: "bad_status", nextStatus: "cancelled",
    }) },
    match, actorId: actor, players, action: {},
  }), /only keep a match active or complete it/);
});

test("rejects illegal adapter output and unaccepted next player", async () => {
  await assert.rejects(resolveGameAction({
    engine: { applyAction: () => ({ nextState: [], eventPayload: {}, eventType: "move" }) },
    match, actorId: actor, players, action: {},
  }), /invalid transition/);
  await assert.rejects(resolveGameAction({
    engine: { applyAction: () => ({
      nextState: {}, eventPayload: {}, eventType: "move",
      nextTurnUserId: "33333333-3333-4333-8333-333333333333",
    }) },
    match, actorId: actor, players, action: {},
  }), /accepted player/);
});

test("rejects inactive matches and missing engines", async () => {
  await assert.rejects(resolveGameAction({
    engine: null, match, actorId: actor, players, action: {},
  }), /No server-side engine/);
  await assert.rejects(resolveGameAction({
    engine: { applyAction() {} }, match: { ...match, status: "completed" },
    actorId: actor, players, action: {},
  }), /not active/);
});
