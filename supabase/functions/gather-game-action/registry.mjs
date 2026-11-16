import { createGameEngineRegistry } from "./engine.mjs";
import { unoEngine } from "./uno.mjs";

// Production adapters are registered only after their rule tests pass.
export const gameEngines = createGameEngineRegistry([unoEngine]);
