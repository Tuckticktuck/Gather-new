import test from "node:test";
import assert from "node:assert/strict";
import { GatherGameRegistry } from "../games/core/game-registry.mjs";

test("only the intended tabletop games expose multiplayer capacities", () => {
  assert.deepEqual(
    ["chess", "checkers", "tic_tac_toe", "connect_four", "battleship"].map(id => {
      const game = GatherGameRegistry.get(id);
      return [game.minPlayers, game.maxPlayers];
    }),
    [[2, 2], [2, 2], [2, 2], [2, 2], [2, 2]]
  );
  assert.deepEqual(
    ["uno", "ludo", "dominoes"].map(id => {
      const game = GatherGameRegistry.get(id);
      return [game.minPlayers, game.maxPlayers];
    }),
    [[2, 10], [2, 4], [2, 4]]
  );
});
