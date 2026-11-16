import test from "node:test";
import assert from "node:assert/strict";
import { validateGameInvitation, validateMatchSnapshot, validateGameEvent } from "../games-v2/contracts.mjs";
import { canTransitionMatch, transitionMatch, respondToInvitation } from "../games-v2/lifecycle.mjs";

const base = {
  id: "match-1", conversationId: "conversation-1", messageId: "message-1",
  gameType: "sample", createdBy: "user-a", status: "invited", version: 1,
  players: [{ userId: "user-a", status: "accepted" }, { userId: "user-b", status: "pending" }],
  state: {}, createdAt: "2026-11-16T12:00:00.000Z"
};

test("invitation requires creator and unique conversation participants", () => {
  assert.equal(validateGameInvitation({ conversationId:"c", messageId:"m", createdBy:"a", gameType:"x", playerIds:["a","b"] }).valid, true);
  assert.equal(validateGameInvitation({ conversationId:"c", messageId:"m", createdBy:"a", gameType:"x", playerIds:["a","a"] }).valid, false);
  assert.equal(validateGameInvitation({ conversationId:"c", messageId:"m", createdBy:"a", gameType:"x", playerIds:["b","c"] }).valid, false);
});

test("match snapshots enforce stable identities, statuses, and versions", () => {
  assert.equal(validateMatchSnapshot(base).valid, true);
  assert.equal(validateMatchSnapshot({ ...base, version: 0 }).valid, false);
  assert.equal(validateMatchSnapshot({ ...base, players: [...base.players, base.players[0]] }).valid, false);
});

test("game events require sequence, expected version, and object payload", () => {
  const event = { id:"event-1", matchId:"match-1", actorId:"user-a", type:"move", sequence:1, expectedVersion:1, payload:{ move:"x" }, createdAt:base.createdAt };
  assert.equal(validateGameEvent(event).valid, true);
  assert.equal(validateGameEvent({ ...event, sequence:0 }).valid, false);
});

test("lifecycle allows invitation to activate and active match to finish only", () => {
  assert.equal(canTransitionMatch("invited", "active"), true);
  assert.equal(canTransitionMatch("active", "completed"), true);
  assert.equal(canTransitionMatch("completed", "active"), false);
  assert.equal(canTransitionMatch("cancelled", "active"), false);
});

test("only accepted players can activate a match", () => {
  assert.equal(transitionMatch(base, "active", "user-a").reason, "not_enough_accepted_players");
  const accepted = { ...base, players: base.players.map((p) => ({ ...p, status:"accepted" })) };
  const result = transitionMatch(accepted, "active", "user-a");
  assert.equal(result.ok, true);
  assert.equal(result.match.version, 2);
});

test("invitation response checks version and pending membership", () => {
  assert.equal(respondToInvitation(base, "user-b", "accepted", 0).reason, "version_conflict");
  const result = respondToInvitation(base, "user-b", "accepted", 1);
  assert.equal(result.ok, true);
  assert.equal(result.match.players[1].status, "accepted");
  assert.equal(result.match.version, 2);
  assert.equal(respondToInvitation(base, "user-c", "accepted", 1).reason, "player_not_pending");
});
