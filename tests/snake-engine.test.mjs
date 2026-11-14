import test from "node:test";
import assert from "node:assert/strict";
import { advanceSnakeState, canQueueSnakeDirection } from "../supabase/functions/gather-snake-action/snake-engine.mjs";

function makeState(overrides = {}) {
  return {
    version: 1,
    phase: "active",
    width: 14,
    height: 10,
    tick: 0,
    tickIntervalMs: 250,
    startedAt: "2026-11-14T12:00:00.000Z",
    lastTickAt: "2026-11-14T12:00:00.000Z",
    endsAt: "2026-11-14T12:02:00.000Z",
    obstacles: [],
    food: { x: 10, y: 8 },
    snakes: [
      { user_id: "a", direction: "right", alive: true, score: 0, segments: [{x:3,y:4},{x:2,y:4},{x:1,y:4}] },
      { user_id: "b", direction: "left", alive: true, score: 0, segments: [{x:10,y:5},{x:11,y:5},{x:12,y:5}] }
    ],
    ...overrides
  };
}

const tickAt = "2026-11-14T12:00:00.250Z";
const tickMs = Date.parse(tickAt);

test("movement does not advance before the server tick interval elapses", () => {
  const source = makeState();
  const result = advanceSnakeState(source, {}, Date.parse("2026-11-14T12:00:00.249Z"));
  assert.equal(result.advanced, false);
  assert.equal(result.reason, "not-due");
  assert.equal(result.state.tick, 0);
});

test("each alive snake moves one cell using its last accepted direction", () => {
  const result = advanceSnakeState(makeState(), {}, tickMs);
  assert.equal(result.advanced, true);
  assert.deepEqual(result.state.snakes[0].segments[0], {x:4,y:4});
  assert.deepEqual(result.state.snakes[1].segments[0], {x:9,y:5});
  assert.equal(result.state.tick, 1);
});

test("a queued direction can turn but cannot reverse into the body", () => {
  const result = advanceSnakeState(makeState(), { a: "up" }, tickMs);
  assert.deepEqual(result.state.snakes[0].segments[0], {x:3,y:3});
  assert.equal(canQueueSnakeDirection("right", "left"), false);
  assert.equal(canQueueSnakeDirection("right", "up"), true);
});

test("eating food grows the snake and increments the server-calculated score", () => {
  const source = makeState({ food: {x:4,y:4} });
  const result = advanceSnakeState(source, {}, tickMs, 11);
  assert.equal(result.state.snakes[0].segments.length, 4);
  assert.equal(result.state.snakes[0].score, 1);
  assert.notDeepEqual(result.state.food, source.food);
});

test("wall and obstacle collisions eliminate a snake", () => {
  const wallState = makeState({
    width: 14,
    snakes: [
      { user_id: "a", direction: "right", alive: true, score: 0, segments: [{x:13,y:4},{x:12,y:4}] },
      { user_id: "b", direction: "left", alive: true, score: 0, segments: [{x:10,y:5},{x:11,y:5}] }
    ]
  });
  const wall = advanceSnakeState(wallState, {}, tickMs);
  assert.equal(wall.state.snakes[0].alive, false);

  const obstacleState = makeState({ obstacles: [{x:4,y:4}] });
  const obstacle = advanceSnakeState(obstacleState, {}, tickMs);
  assert.equal(obstacle.state.snakes[0].alive, false);
});

test("head-on collisions eliminate both snakes and finish a match without a winner", () => {
  const source = makeState({
    snakes: [
      { user_id: "a", direction: "right", alive: true, score: 2, segments: [{x:5,y:4},{x:4,y:4}] },
      { user_id: "b", direction: "left", alive: true, score: 1, segments: [{x:7,y:4},{x:8,y:4}] }
    ]
  });
  const result = advanceSnakeState(source, {}, tickMs);
  assert.equal(result.state.snakes[0].alive, false);
  assert.equal(result.state.snakes[1].alive, false);
  assert.equal(result.state.phase, "finished");
  assert.equal(result.state.winnerId, null);
});

test("the server timer ends a round and picks the highest score", () => {
  const source = makeState({
    endsAt: "2026-11-14T12:00:00.200Z",
    snakes: [
      { user_id: "a", direction: "right", alive: true, score: 3, segments: [{x:3,y:4}] },
      { user_id: "b", direction: "left", alive: true, score: 1, segments: [{x:10,y:5}] }
    ]
  });
  const result = advanceSnakeState(source, {}, tickMs);
  assert.equal(result.state.phase, "finished");
  assert.equal(result.state.winnerId, "a");
  assert.equal(result.state.finishReason, "time");
  assert.equal(result.state.tick, 1);
});


test("a snake colliding with its own body is eliminated", () => {
  const source = makeState({
    snakes: [
      { user_id: "a", direction: "up", alive: true, score: 0, segments: [{x:4,y:4},{x:4,y:3},{x:3,y:3},{x:3,y:4}] },
      { user_id: "b", direction: "left", alive: true, score: 0, segments: [{x:10,y:5},{x:11,y:5}] }
    ]
  });
  const result = advanceSnakeState(source, {}, tickMs);
  assert.equal(result.state.snakes[0].alive, false);
});

test("two snakes cannot exchange head positions in one tick", () => {
  const source = makeState({
    snakes: [
      { user_id: "a", direction: "right", alive: true, score: 0, segments: [{x:5,y:4},{x:4,y:4}] },
      { user_id: "b", direction: "left", alive: true, score: 0, segments: [{x:6,y:4},{x:7,y:4}] }
    ]
  });
  const result = advanceSnakeState(source, {}, tickMs);
  assert.equal(result.state.snakes[0].alive, false);
  assert.equal(result.state.snakes[1].alive, false);
});

test("a completed round is immutable to subsequent ticks", () => {
  const source = makeState({ phase: "finished" });
  const result = advanceSnakeState(source, {}, tickMs);
  assert.equal(result.advanced, false);
  assert.equal(result.state.tick, 0);
});


test("a tail is not treated as vacated when its snake is eliminated on the same tick", () => {
  const source = makeState({
    snakes: [
      { user_id: "a", direction: "right", alive: true, score: 0, segments: [{x:10,y:5},{x:9,y:5},{x:8,y:5}] },
      { user_id: "b", direction: "right", alive: true, score: 0, segments: [{x:13,y:5},{x:12,y:5},{x:11,y:5}] }
    ]
  });
  const result = advanceSnakeState(source, {}, tickMs);
  assert.equal(result.state.snakes.find(snake => snake.user_id === "a").alive, false);
  assert.equal(result.state.snakes.find(snake => snake.user_id === "b").alive, false);
  assert.equal(result.state.finishReason, "collision-draw");
});

test("a surviving snake can enter another surviving snake's vacating tail square", () => {
  const source = makeState({
    snakes: [
      { user_id: "a", direction: "right", alive: true, score: 0, segments: [{x:5,y:5},{x:4,y:5}] },
      { user_id: "b", direction: "right", alive: true, score: 0, segments: [{x:8,y:5},{x:7,y:5},{x:6,y:5}] }
    ]
  });
  const result = advanceSnakeState(source, {}, tickMs);
  assert.equal(result.state.snakes.find(snake => snake.user_id === "a").alive, true);
  assert.deepEqual(result.state.snakes.find(snake => snake.user_id === "a").segments[0], {x:6,y:5});
  assert.equal(result.state.snakes.find(snake => snake.user_id === "b").alive, true);
  assert.deepEqual(result.state.snakes.find(snake => snake.user_id === "b").segments.at(-1), {x:7,y:5});
});
