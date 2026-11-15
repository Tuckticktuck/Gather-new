const ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;
const INTERACTION_MODELS = new Set(["turn-based", "round-based", "real-time"]);
const CATEGORIES = new Set(["board", "card", "tabletop", "arcade", "party"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freezeDefinition(definition) {
  const capabilities = Object.freeze({ ...(definition.capabilities || {}) });
  const tags = Object.freeze([...(definition.tags || [])]);
  return Object.freeze({ ...definition, capabilities, tags });
}

export function validateGameDefinition(definition) {
  if (!isPlainObject(definition)) {
    return { ok: false, reason: "definition-must-be-an-object" };
  }

  const { id, name, description = "", category = "board", interactionModel, minPlayers, maxPlayers } = definition;

  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    return { ok: false, reason: "invalid-game-id" };
  }
  if (typeof name !== "string" || !name.trim() || name.length > 80) {
    return { ok: false, reason: "invalid-game-name" };
  }
  if (typeof description !== "string" || description.length > 500) {
    return { ok: false, reason: "invalid-game-description" };
  }
  if (!CATEGORIES.has(category)) {
    return { ok: false, reason: "invalid-game-category" };
  }
  if (!INTERACTION_MODELS.has(interactionModel)) {
    return { ok: false, reason: "invalid-interaction-model" };
  }
  if (!Number.isSafeInteger(minPlayers) || !Number.isSafeInteger(maxPlayers) ||
      minPlayers < 1 || maxPlayers < minPlayers || maxPlayers > 20) {
    return { ok: false, reason: "invalid-player-limits" };
  }
  if (definition.capabilities !== undefined && !isPlainObject(definition.capabilities)) {
    return { ok: false, reason: "invalid-capabilities" };
  }
  if (definition.capabilities && Object.values(definition.capabilities).some(value => typeof value !== "boolean")) {
    return { ok: false, reason: "capabilities-must-be-boolean" };
  }
  if (definition.tags !== undefined &&
      (!Array.isArray(definition.tags) || definition.tags.some(tag => typeof tag !== "string" || tag.length > 32))) {
    return { ok: false, reason: "invalid-tags" };
  }

  return { ok: true };
}

export function createGameRegistry(definitions = []) {
  if (!Array.isArray(definitions)) throw new TypeError("Game definitions must be an array.");

  const entries = new Map();
  for (const definition of definitions) {
    const validation = validateGameDefinition(definition);
    if (!validation.ok) throw new TypeError("Invalid game definition: " + validation.reason);
    if (entries.has(definition.id)) throw new TypeError("Duplicate game id: " + definition.id);
    entries.set(definition.id, freezeDefinition(definition));
  }

  return Object.freeze({
    get(id) {
      return entries.get(id) || null;
    },
    has(id) {
      return entries.has(id);
    },
    list() {
      return Object.freeze([...entries.values()]);
    },
    listByModel(interactionModel) {
      if (!INTERACTION_MODELS.has(interactionModel)) return Object.freeze([]);
      return Object.freeze([...entries.values()].filter(game => game.interactionModel === interactionModel));
    },
    size() {
      return entries.size;
    }
  });
}

/*
 * This is the initial catalog of games currently exposed by Gather.
 * Capability flags are deliberately conservative: a game can opt into a
 * shared feature only after its migration and server-side permissions pass.
 */
export const GATHER_GAME_DEFINITIONS = Object.freeze([
  { id: "chess", name: "Chess", description: "Classic chess with legal moves, castling, en passant and promotion.", category: "board", interactionModel: "turn-based", minPlayers: 2, maxPlayers: 2, tags: ["strategy", "classic"] },
  { id: "checkers", name: "Checkers", description: "Jump, capture and crown your pieces.", category: "board", interactionModel: "turn-based", minPlayers: 2, maxPlayers: 2, tags: ["strategy", "classic"] },
  { id: "tic_tac_toe", name: "Tic-Tac-Toe", description: "A quick three-in-a-row match.", category: "board", interactionModel: "turn-based", minPlayers: 2, maxPlayers: 2, tags: ["quick", "classic"] },
  { id: "connect_four", name: "Connect Four", description: "Drop four discs in a row to win.", category: "board", interactionModel: "turn-based", minPlayers: 2, maxPlayers: 2, tags: ["quick", "classic"] },
  { id: "battleship", name: "Battleship", description: "Place your fleet, then find and hit every ship square.", category: "board", interactionModel: "turn-based", minPlayers: 2, maxPlayers: 2, tags: ["strategy", "hidden-information"] },
  { id: "ludo", name: "Ludo", description: "Race tokens around the board and into home.", category: "board", interactionModel: "turn-based", minPlayers: 2, maxPlayers: 2, tags: ["family", "dice"] },
  { id: "uno", name: "UNO", description: "Play cards, use action cards, and race to empty your hand.", category: "card", interactionModel: "turn-based", minPlayers: 2, maxPlayers: 2, tags: ["cards", "party", "hidden-information"] },
  { id: "dominoes", name: "Dominoes", description: "Draw, match, and score your way to the target.", category: "tabletop", interactionModel: "turn-based", minPlayers: 2, maxPlayers: 2, tags: ["tabletop", "strategy", "hidden-information"] }
]);

export const GatherGameRegistry = createGameRegistry(GATHER_GAME_DEFINITIONS);
