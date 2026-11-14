import test from "node:test";
import assert from "node:assert/strict";
import { authorizeMatchCommand, isSafePublicMatchState } from "../games/shared/match-contract.mjs";

const base = {
  actorId: "player-a",
  hostId: "player-a",
  memberStatus: "joined",
  matchStatus: "active",
  action: "action",
  expectedRevision: 4,
  currentRevision: 4
};

test("joined player can submit an action at the current revision", () => {
  assert.deepEqual(authorizeMatchCommand(base), { ok: true, nextRevision: 5 });
});

test("unauthenticated callers are rejected", () => {
  assert.equal(authorizeMatchCommand({ ...base, actorId: null }).reason, "unauthenticated");
});

test("invited but not joined players cannot mutate", () => {
  assert.equal(authorizeMatchCommand({ ...base, memberStatus: "invited" }).reason, "not-joined");
});

test("spectators cannot mutate", () => {
  assert.equal(authorizeMatchCommand({ ...base, memberStatus: "spectator" }).reason, "not-joined");
});

test("host-only actions reject ordinary joined players", () => {
  assert.equal(authorizeMatchCommand({ ...base, actorId: "player-b", action: "start" }).reason, "host-only");
});

test("stale revisions are rejected", () => {
  assert.equal(authorizeMatchCommand({ ...base, expectedRevision: 3 }).reason, "stale-revision");
});

test("finished matches reject mutations", () => {
  assert.equal(authorizeMatchCommand({ ...base, matchStatus: "completed" }).reason, "match-not-active");
});

test("invalid revision values are rejected", () => {
  assert.equal(authorizeMatchCommand({ ...base, expectedRevision: 1.5 }).reason, "invalid-revision");
});

test("public state must be a bounded JSON object", () => {
  assert.equal(isSafePublicMatchState({ phase: "active", score: 2 }), true);
  assert.equal(isSafePublicMatchState(["not", "an", "object"]), false);
  assert.equal(isSafePublicMatchState({ text: "x".repeat(100) }, 32), false);
});
