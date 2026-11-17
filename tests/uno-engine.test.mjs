import test from "node:test";
import assert from "node:assert/strict";
import { GameRuleError, resolveGameAction } from "../supabase/functions/gather-game-action/engine.mjs";
import { unoEngine, unoInternals, UNO_COLORS, UNO_MAX_PLAYERS } from "../supabase/functions/gather-game-action/uno.mjs";

const UNO_COLORS_FOR_TEST = UNO_COLORS;

const actor = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const seed = "0123456789abcdef".repeat(4);
const players = [
  { user_id: actor, response: "accepted", player_order: 0 },
  { user_id: other, response: "accepted", player_order: 1 },
];

function card(id, color, value) {
  return { id, color, value };
}

function fixture(actorHand, otherHand, overrides = {}) {
  const publicState = {
    schemaVersion: 1,
    started: true,
    playerOrder: [actor, other],
    currentPlayerId: actor,
    handCounts: { [actor]: actorHand.length, [other]: otherHand.length },
    discardTop: card("discard:top", "red", "5"),
    currentColor: "red",
    direction: 1,
    pendingDraw: null,
    pendingUnoPlayerId: null,
    winnerId: null,
    ...overrides.publicState,
  };
  const privateState = {
    hands: { [actor]: structuredClone(actorHand), [other]: structuredClone(otherHand) },
    drawPile: Array.from({ length: 20 }, (_, index) => card(`draw:${index}`, UNO_COLORS_FOR_TEST[index % 4], String((index % 9) + 1))),
    discardPile: [publicState.discardTop],
    drawnCardId: null,
    challengeWasIllegal: null,
    rngState: [0x12345678, 0x9abcdef0, 0x13579bdf, 0x2468ace0],
    ...overrides.privateState,
  };
  return { state: publicState, privateState };
}

async function apply(f, actorId, action) {
  return unoEngine.applyAction({
    state: f.state,
    privateState: f.privateState,
    action,
    actorId,
    players,
    serverSeed: seed,
  });
}

test("builds a classic 108-card deck with unique identities", () => {
  const deck = unoInternals.makeDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map((item) => item.id)).size, 108);
  assert.equal(unoInternals.makeDeck(2).length, 216);
  assert.equal(deck.filter((item) => item.value === "wild").length, 4);
  assert.equal(deck.filter((item) => item.value === "wild4").length, 4);
});

test("initializes a private 7-card hand for each accepted player", async () => {
  const result = await unoEngine.applyAction({
    state: {}, privateState: null, action: { type: "initialize" },
    actorId: actor, players, serverSeed: seed,
  });
  assert.equal(result.nextState.started, true);
  assert.deepEqual(result.nextState.playerOrder, [actor, other]);
  assert.equal(result.nextState.handCounts[actor], 7);
  assert.equal(result.nextState.handCounts[other], 7);
  assert.equal(result.nextPrivateState.hands[actor].length, 7);
  assert.equal(result.nextPrivateState.hands[other].length, 7);
  assert.equal(result.nextPrivateState.drawPile.length, 93);
  assert.equal(result.nextTurnUserId, actor);
  assert.equal(result.nextStatus, "active");
  assert.equal("hands" in result.nextState, false);
  assert.equal("drawPile" in result.nextState, false);
});

test("resolves UNO initialization through the shared engine contract", async () => {
  const result = await resolveGameAction({
    engine: unoEngine,
    match: {
      status: "active",
      state: {},
      private_state: null,
      version: 1,
      current_turn_user_id: actor,
    },
    actorId: actor,
    players,
    action: { type: "initialize" },
    serverSeed: seed,
  });
  assert.equal(result.eventType, "uno_started");
  assert.equal(result.nextState.handCounts[actor], 7);
  assert.equal(result.nextPrivateState.hands[actor].length, 7);
  assert.equal(result.nextTurnUserId, actor);
});

test("supports 20 players with a second deck and rejects 21", async () => {
  const manyPlayers = Array.from({ length: UNO_MAX_PLAYERS + 1 }, (_, index) => ({
    user_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    response: "accepted",
    player_order: index,
  }));
  const twenty = await unoEngine.applyAction({
    state: {}, privateState: null, action: { type: "initialize" },
    actorId: manyPlayers[0].user_id, players: manyPlayers.slice(0, 20), serverSeed: seed,
  });
  assert.equal(twenty.nextState.playerOrder.length, 20);
  assert.equal(twenty.nextPrivateState.drawPile.length, 75);
  assert.throws(() => unoEngine.applyAction({
    state: {}, privateState: null, action: { type: "initialize" },
    actorId: manyPlayers[0].user_id, players: manyPlayers, serverSeed: seed,
  }), /maximum of 20/);
});

test("plays a matching card and records UNO when one card remains", async () => {
  const f = fixture([card("red:7", "red", "7"), card("blue:2", "blue", "2")],
    [card("yellow:1", "yellow", "1")]);
  const result = await apply(f, actor, { type: "play", cardId: "red:7" });
  assert.equal(result.nextState.currentPlayerId, other);
  assert.equal(result.nextState.handCounts[actor], 1);
  assert.equal(result.nextState.pendingUnoPlayerId, actor);
  assert.equal(result.eventPayload.calledUno, false);
  assert.equal(result.nextPrivateState.hands[actor][0].id, "blue:2");
});

test("an uncalled UNO can be caught by the next player for a two-card penalty", async () => {
  const f = fixture([card("red:7", "red", "7"), card("blue:2", "blue", "2")],
    [card("yellow:1", "yellow", "1")]);
  const played = await apply(f, actor, { type: "play", cardId: "red:7" });
  assert.equal(played.nextState.pendingUnoPlayerId, actor);
  const catchFixture = { state: played.nextState, privateState: played.nextPrivateState };
  const caught = await apply(catchFixture, other, { type: "catch_uno" });
  assert.equal(caught.nextState.handCounts[actor], 3);
  assert.equal(caught.nextState.pendingUnoPlayerId, null);
  assert.equal(caught.nextTurnUserId, other);
});

test("UNO can be called after the card is played, even though the next player owns the turn", async () => {
  const f = fixture([card("red:7", "red", "7"), card("blue:2", "blue", "2")],
    [card("yellow:1", "yellow", "1")]);
  const played = await apply(f, actor, { type: "play", cardId: "red:7" });
  const callFixture = { state: played.nextState, privateState: played.nextPrivateState };
  const called = await resolveGameAction({
    engine: unoEngine,
    match: {
      status: "active",
      state: callFixture.state,
      private_state: callFixture.privateState,
      version: 2,
      current_turn_user_id: other,
    },
    actorId: actor,
    players,
    action: { type: "call_uno" },
  });
  assert.equal(called.eventType, "uno_called");
  assert.equal(called.nextState.pendingUnoPlayerId, null);
  assert.equal(called.nextTurnUserId, other);
  assert.equal(called.nextPrivateState.hands[actor].length, 1);
});

test("calling UNO is rejected after the catch window has closed", async () => {
  const f = fixture([card("red:7", "red", "7"), card("blue:2", "blue", "2")],
    [card("yellow:1", "yellow", "1")]);
  const played = await apply(f, actor, { type: "play", cardId: "red:7" });
  const opponentDraws = await apply({ state: played.nextState, privateState: played.nextPrivateState },
    other, { type: "draw" });
  await assert.rejects(apply({ state: opponentDraws.nextState, privateState: opponentDraws.nextPrivateState },
    actor, { type: "call_uno" }), /exactly one uncalled card/);
});

test("Wild Draw Four can be challenged when the player held the current color", async () => {
  const f = fixture([card("wild4:0", null, "wild4"), card("red:2", "red", "2")],
    [card("yellow:1", "yellow", "1")]);
  const played = await apply(f, actor, {
    type: "play", cardId: "wild4:0", chosenColor: "blue",
  });
  assert.equal(played.nextState.pendingDraw.kind, "wild4");
  assert.equal(played.nextPrivateState.challengeWasIllegal, true);
  const challenge = await apply({ state: played.nextState, privateState: played.nextPrivateState },
    other, { type: "challenge" });
  assert.equal(challenge.nextState.handCounts[actor], 5);
  assert.equal(challenge.nextState.pendingDraw, null);
  assert.equal(challenge.nextTurnUserId, other);
  assert.equal(challenge.eventType, "wild4_challenge_success");
});

test("a failed Wild Draw Four challenge makes the challenger draw six and lose the turn", async () => {
  const f = fixture([card("wild4:0", null, "wild4"), card("green:2", "green", "2")],
    [card("yellow:1", "yellow", "1")]);
  const played = await apply(f, actor, {
    type: "play", cardId: "wild4:0", chosenColor: "blue",
  });
  const challenge = await apply({ state: played.nextState, privateState: played.nextPrivateState },
    other, { type: "challenge" });
  assert.equal(challenge.nextState.handCounts[other], 7);
  assert.equal(challenge.nextTurnUserId, actor);
  assert.equal(challenge.eventType, "wild4_challenge_failed");
});

test("Draw Two forces two cards and skips the affected player's turn", async () => {
  const f = fixture([card("red:draw2", "red", "draw2"), card("blue:2", "blue", "2")],
    [card("yellow:1", "yellow", "1")]);
  const played = await apply(f, actor, { type: "play", cardId: "red:draw2" });
  const drawn = await apply({ state: played.nextState, privateState: played.nextPrivateState },
    other, { type: "draw" });
  assert.equal(drawn.nextState.handCounts[other], 3);
  assert.equal(drawn.nextTurnUserId, actor);
  assert.equal(drawn.nextState.pendingDraw, null);
});

test("a normal draw can be played, but no other card may be played that turn", async () => {
  const f = fixture([card("blue:2", "blue", "2")], [card("yellow:1", "yellow", "1")]);
  f.privateState.drawPile = [card("red:drawn", "red", "8")];
  const drawn = await apply(f, actor, { type: "draw" });
  assert.equal(drawn.nextState.currentPlayerId, actor);
  assert.equal(drawn.nextPrivateState.drawnCardId, "red:drawn");
  const drawnFixture = { state: drawn.nextState, privateState: drawn.nextPrivateState };
  await assert.rejects(apply(drawnFixture, actor, { type: "play", cardId: "blue:2" }), /just drew/);
  const played = await apply(drawnFixture, actor, { type: "play", cardId: "red:drawn" });
  assert.equal(played.nextTurnUserId, other);
  assert.equal(played.nextState.handCounts[actor], 1);
});

test("passing after drawing ends the turn", async () => {
  const f = fixture([card("blue:2", "blue", "2")], [card("yellow:1", "yellow", "1")]);
  const drawn = await apply(f, actor, { type: "draw" });
  const passed = await apply({ state: drawn.nextState, privateState: drawn.nextPrivateState },
    actor, { type: "pass" });
  assert.equal(passed.nextTurnUserId, other);
  assert.equal(passed.nextState.currentPlayerId, other);
});

test("Reverse acts as a skip in a two-player match", async () => {
  const f = fixture([card("red:reverse", "red", "reverse"), card("blue:2", "blue", "2")],
    [card("yellow:1", "yellow", "1")]);
  const result = await apply(f, actor, { type: "play", cardId: "red:reverse" });
  assert.equal(result.nextState.direction, -1);
  assert.equal(result.nextTurnUserId, actor);
});

test("rejects illegal card colors, invalid wild colors, and actions out of turn", async () => {
  const f = fixture([card("blue:7", "blue", "7"), card("green:2", "green", "2")],
    [card("yellow:1", "yellow", "1")]);
  await assert.rejects(apply(f, actor, { type: "play", cardId: "green:2" }), /does not match/);
  const wild = fixture([card("wild:0", null, "wild"), card("blue:2", "blue", "2")],
    [card("yellow:1", "yellow", "1")]);
  await assert.rejects(apply(wild, actor, { type: "play", cardId: "wild:0", chosenColor: "purple" }), /Choose a color/);
  await assert.rejects(resolveGameAction({
    engine: unoEngine,
    match: { status: "active", state: f.state, private_state: f.privateState, version: 1, current_turn_user_id: actor },
    actorId: other, players, action: { type: "draw" },
  }), /turn/);
});

test("completes the match when a player plays their final card", async () => {
  const f = fixture([card("red:win", "red", "7")], [card("yellow:1", "yellow", "1")]);
  const result = await apply(f, actor, { type: "play", cardId: "red:win" });
  assert.equal(result.nextStatus, "completed");
  assert.equal(result.nextState.winnerId, actor);
  assert.equal(result.nextTurnUserId, null);
});
