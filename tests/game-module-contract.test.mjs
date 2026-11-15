import test from "node:test";
import assert from "node:assert/strict";
import {
  createGameModuleRegistry,
  validateGameModule
} from "../games/core/game-module-contract.mjs";
import { GatherGameRegistry } from "../games/core/game-registry.mjs";

const moduleDefinition = id => ({
  id,
  apiVersion: 1,
  mount() {},
  renderLobby() {},
  renderMatch() {},
  unmount() {}
});

test("valid game modules must target a registered game and provide core hooks", () => {
  assert.equal(validateGameModule(moduleDefinition("dominoes"), GatherGameRegistry).ok, true);
  assert.equal(validateGameModule(moduleDefinition("not_registered"), GatherGameRegistry).reason, "module-game-is-not-registered");
});

test("missing and invalid hooks are rejected", () => {
  const missing = moduleDefinition("chess");
  delete missing.renderMatch;
  assert.equal(validateGameModule(missing, GatherGameRegistry).reason, "missing-hook:renderMatch");

  const invalidOptional = { ...moduleDefinition("chess"), renderResults: true };
  assert.equal(validateGameModule(invalidOptional, GatherGameRegistry).reason, "invalid-optional-hook:renderResults");
});

test("module registry rejects duplicate modules and exposes immutable entries", () => {
  const module = moduleDefinition("dominoes");
  assert.throws(() => createGameModuleRegistry([module, module], GatherGameRegistry), /Duplicate game module/);
  const registry = createGameModuleRegistry([module], GatherGameRegistry);
  assert.equal(registry.get("dominoes").id, "dominoes");
  assert.equal(Object.isFrozen(registry.get("dominoes")), true);
});
