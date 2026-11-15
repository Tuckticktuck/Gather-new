import test from "node:test";
import assert from "node:assert/strict";
import { GatherGameRegistry, createGameModuleRegistry } from "../games/core/index.mjs";
import { createLegacyBoardModules } from "../games/modules/legacy-board-modules.mjs";

test("Tic-Tac-Toe and Connect Four implement the shared game-module contract", () => {
  const calls = [];
  const services = { load() {}, watch() {} };
  const modules = createGameModuleRegistry(createLegacyBoardModules({
    renderLobby: (context, instance) => calls.push(["lobby", context.game.game_type, instance.gameId]),
    renderTicTacToe: (context, instance) => calls.push(["match", "tic_tac_toe", context.game.id, instance.gameId]),
    renderConnectFour: (context, instance) => calls.push(["match", "connect_four", context.game.id, instance.gameId]),
    onMount: id => calls.push(["mount", id]),
    onUnmount: id => calls.push(["unmount", id])
  }), GatherGameRegistry);

  assert.equal(modules.size(), 2);
  for (const id of ["tic_tac_toe", "connect_four"]) {
    const module = modules.get(id);
    assert.ok(module);
    const instance = module.mount({ services, viewerId: "viewer-1" });
    assert.equal(instance.services, services);
    assert.equal(instance.viewerId, "viewer-1");
    module.renderLobby({ game: { game_type: id } }, instance);
    module.renderMatch({ game: { id: id + "-match" } }, instance);
    module.unmount(instance);
  }

  assert.deepEqual(calls, [
    ["mount", "tic_tac_toe"],
    ["lobby", "tic_tac_toe", "tic_tac_toe"],
    ["match", "tic_tac_toe", "tic_tac_toe-match", "tic_tac_toe"],
    ["unmount", "tic_tac_toe"],
    ["mount", "connect_four"],
    ["lobby", "connect_four", "connect_four"],
    ["match", "connect_four", "connect_four-match", "connect_four"],
    ["unmount", "connect_four"]
  ]);
});
