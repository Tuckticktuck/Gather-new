import test from "node:test";
import assert from "node:assert/strict";
import {
  createGameRegistry,
  GatherGameRegistry,
  validateGameDefinition
} from "../games/core/game-registry.mjs";

test("Gather registry exposes every current playable game", () => {
  assert.deepEqual(
    GatherGameRegistry.list().map(game => game.id),
    ["chess", "checkers", "tic_tac_toe", "connect_four", "battleship", "ludo", "uno", "dominoes"]
  );
  assert.equal(GatherGameRegistry.size(), 8);
});

test("registry returns immutable definitions", () => {
  const game = GatherGameRegistry.get("dominoes");
  assert.equal(Object.isFrozen(game), true);
  assert.equal(Object.isFrozen(game.tags), true);
  assert.equal(GatherGameRegistry.get("not-a-game"), null);
});

test("registry can filter by interaction model", () => {
  assert.equal(GatherGameRegistry.listByModel("turn-based").length, 8);
  assert.deepEqual(GatherGameRegistry.listByModel("unsupported"), []);
});

test("invalid player limits are rejected", () => {
  const result = validateGameDefinition({
    id: "example", name: "Example", interactionModel: "turn-based",
    minPlayers: 3, maxPlayers: 2
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid-player-limits");
});

test("duplicate game IDs are rejected", () => {
  const definition = {
    id: "example", name: "Example", interactionModel: "turn-based",
    minPlayers: 2, maxPlayers: 2
  };
  assert.throws(() => createGameRegistry([definition, definition]), /Duplicate game id/);
});

test("invalid interaction models and capability values are rejected", () => {
  assert.equal(validateGameDefinition({
    id: "example", name: "Example", interactionModel: "unsupported",
    minPlayers: 2, maxPlayers: 2
  }).reason, "invalid-interaction-model");

  assert.equal(validateGameDefinition({
    id: "example", name: "Example", interactionModel: "turn-based",
    minPlayers: 2, maxPlayers: 2, capabilities: { spectators: "yes" }
  }).reason, "capabilities-must-be-boolean");
});
