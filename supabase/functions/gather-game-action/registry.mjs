import { createGameEngineRegistry } from "./engine.mjs";

// Game-specific adapters are registered here only after their rules and tests are complete.
export const gameEngines = createGameEngineRegistry([]);
