import test from "node:test";
import assert from "node:assert/strict";
import {
  canPerformMatchCommand,
  getViewerMembership,
  isSafePublicMatchState,
  normalizeMatchSnapshot
} from "../games/core/match-contract.mjs";

const sample = () => ({
  game: {
    id: "match-1", game_type: "dominoes", status: "active", created_by: "host",
    revision: 7, join_mode: "invite", settings: { mode: "free_for_all" },
    state: { phase: "lobby", started: false }
  },
  players: [
    { user_id: "host", status: "joined", ready: true },
    { user_id: "player", status: "joined", ready: false },
    { user_id: "invitee", status: "invited", ready: false },
    { user_id: "spectator", status: "spectating", ready: false }
  ]
});

test("normalizes existing Gather match and roster fields", () => {
  const snapshot = normalizeMatchSnapshot(sample());
  assert.equal(snapshot.match.id, "match-1");
  assert.equal(snapshot.match.gameType, "dominoes");
  assert.equal(snapshot.match.revision, 7);
  assert.equal(snapshot.players.length, 4);
  assert.equal(Object.isFrozen(snapshot.match.state), true);
});

test("viewer role correctly distinguishes host, player, invitee and spectator", () => {
  const snapshot = normalizeMatchSnapshot(sample());
  assert.equal(getViewerMembership(snapshot, "host").role, "host");
  assert.equal(getViewerMembership(snapshot, "player").role, "player");
  assert.equal(getViewerMembership(snapshot, "invitee").role, "invited");
  assert.equal(getViewerMembership(snapshot, "spectator").role, "spectator");
  assert.equal(getViewerMembership(snapshot, "other").role, "visitor");
});

test("only the host can start or change lobby settings", () => {
  const snapshot = normalizeMatchSnapshot(sample());
  assert.equal(canPerformMatchCommand(snapshot, "host", "start").ok, true);
  assert.equal(canPerformMatchCommand(snapshot, "player", "start").reason, "host-only");
  assert.equal(canPerformMatchCommand(snapshot, "host", "change-settings").ok, true);
});

test("invited players cannot ready up or read private state", () => {
  const snapshot = normalizeMatchSnapshot(sample());
  assert.equal(canPerformMatchCommand(snapshot, "invitee", "ready").reason, "not-ready-eligible");
  assert.equal(canPerformMatchCommand(snapshot, "invitee", "read-private-state").reason, "private-state-not-available");
});

test("spectators can leave but cannot submit actions or read private state", () => {
  const snapshot = normalizeMatchSnapshot(sample());
  assert.equal(canPerformMatchCommand(snapshot, "spectator", "leave").ok, true);
  assert.equal(canPerformMatchCommand(snapshot, "spectator", "action").reason, "action-not-allowed");
  assert.equal(canPerformMatchCommand(snapshot, "spectator", "read-private-state").reason, "private-state-not-available");
});

test("ready is only available to joined lobby players", () => {
  const snapshot = normalizeMatchSnapshot(sample());
  assert.equal(canPerformMatchCommand(snapshot, "host", "ready").ok, true);
  assert.equal(canPerformMatchCommand(snapshot, "player", "ready").ok, true);
});

test("duplicate roster identities and malformed snapshots are rejected", () => {
  const duplicate = sample();
  duplicate.players.push({ user_id: "host", status: "joined" });
  assert.throws(() => normalizeMatchSnapshot(duplicate), /Duplicate player/);
  assert.throws(() => normalizeMatchSnapshot({ game: { id: "missing" } }), /game_type/);
});

test("public state is a bounded plain JSON object", () => {
  assert.equal(isSafePublicMatchState({ phase: "playing", score: 4 }), true);
  assert.equal(isSafePublicMatchState(["not", "an", "object"]), false);
  assert.equal(isSafePublicMatchState({ value: "x".repeat(64) }, 32), false);
});
