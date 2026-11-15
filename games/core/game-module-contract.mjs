const REQUIRED_HOOKS = Object.freeze(["mount", "renderLobby", "renderMatch", "unmount"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateGameModule(module, gameRegistry) {
  if (!isPlainObject(module)) return { ok: false, reason: "module-must-be-an-object" };
  if (typeof module.id !== "string" || !gameRegistry?.has?.(module.id)) {
    return { ok: false, reason: "module-game-is-not-registered" };
  }
  if (module.apiVersion !== 1) return { ok: false, reason: "unsupported-module-api-version" };

  for (const hook of REQUIRED_HOOKS) {
    if (typeof module[hook] !== "function") {
      return { ok: false, reason: "missing-hook:" + hook };
    }
  }

  for (const hook of ["renderResults", "onSnapshot", "onConnectionChange"]) {
    if (module[hook] !== undefined && typeof module[hook] !== "function") {
      return { ok: false, reason: "invalid-optional-hook:" + hook };
    }
  }

  return { ok: true };
}

/**
 * Game modules own game-specific presentation and controls only.
 * Shared lobby, identity, permissions, and persistence are injected as services.
 */
export function createGameModuleRegistry(modules, gameRegistry) {
  if (!Array.isArray(modules)) throw new TypeError("Game modules must be an array.");
  if (!gameRegistry || typeof gameRegistry.has !== "function") {
    throw new TypeError("A game registry is required.");
  }

  const entries = new Map();
  for (const module of modules) {
    const validation = validateGameModule(module, gameRegistry);
    if (!validation.ok) throw new TypeError("Invalid game module: " + validation.reason);
    if (entries.has(module.id)) throw new TypeError("Duplicate game module: " + module.id);
    entries.set(module.id, Object.freeze({ ...module }));
  }

  return Object.freeze({
    get(id) { return entries.get(id) || null; },
    has(id) { return entries.has(id); },
    list() { return Object.freeze([...entries.values()]); },
    size() { return entries.size; }
  });
}
