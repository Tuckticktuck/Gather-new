const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_ACTION_BYTES = 8 * 1024;
const MAX_STATE_BYTES = 64 * 1024;

export class GameRuleError extends Error {
  constructor(message) {
    super(message);
    this.name = "GameRuleError";
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function validateGameActionRequest(input) {
  if (!isRecord(input)) throw new TypeError("Request body must be a JSON object.");
  if (typeof input.matchId !== "string" || !UUID_PATTERN.test(input.matchId)) {
    throw new TypeError("A valid matchId is required.");
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new TypeError("expectedVersion must be a positive safe integer.");
  }
  if (!isRecord(input.action)) throw new TypeError("action must be a JSON object.");
  if (byteLength(input.action) > MAX_ACTION_BYTES) {
    throw new RangeError("Action payload is too large.");
  }
  return {
    matchId: input.matchId,
    expectedVersion: input.expectedVersion,
    action: structuredClone(input.action),
  };
}

export function createGameEngineRegistry(engines = []) {
  const registry = new Map();
  for (const engine of engines) {
    if (!engine || typeof engine.key !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,39}$/.test(engine.key) ||
        typeof engine.applyAction !== "function") {
      throw new TypeError("Each game engine must have a valid key and applyAction function.");
    }
    if (registry.has(engine.key)) throw new TypeError(`Duplicate game engine: ${engine.key}`);
    registry.set(engine.key, Object.freeze(engine));
  }
  return Object.freeze({
    get(key) { return registry.get(key) ?? null; },
    keys() { return [...registry.keys()]; },
  });
}

export async function resolveGameAction({ engine, match, actorId, players, action }) {
  if (!engine || typeof engine.applyAction !== "function") {
    throw new TypeError("No server-side engine is registered for this game.");
  }
  if (!match || match.status !== "active") throw new Error("This match is not active.");
  if (!Number.isSafeInteger(match.version) || match.version < 1) {
    throw new TypeError("The stored match version is invalid.");
  }
  if (!Array.isArray(players)) throw new TypeError("Player records are unavailable.");
  const acceptedIds = players
    .filter((player) => player.response === "accepted")
    .map((player) => player.user_id);
  if (!acceptedIds.includes(actorId)) throw new Error("Only accepted players may act.");
  if (match.current_turn_user_id && match.current_turn_user_id !== actorId) {
    throw new Error("It is not this player's turn.");
  }

  const result = await engine.applyAction({
    state: structuredClone(match.state),
    action: structuredClone(action),
    actorId,
    players: players.map((player) => ({ ...player })),
    currentTurnUserId: match.current_turn_user_id,
  });

  if (!isRecord(result) || !isRecord(result.nextState) ||
      !isRecord(result.eventPayload) || typeof result.eventType !== "string" ||
      !EVENT_PATTERN.test(result.eventType)) {
    throw new TypeError("The game engine returned an invalid transition.");
  }
  if (byteLength(result.nextState) > MAX_STATE_BYTES ||
      byteLength(result.eventPayload) > MAX_ACTION_BYTES) {
    throw new RangeError("The game engine returned an oversized transition.");
  }
  const nextStatus = result.nextStatus ?? "active";
  if (nextStatus !== "active" && nextStatus !== "completed") {
    throw new TypeError("A game action may only keep a match active or complete it.");
  }
  const nextTurnUserId = result.nextTurnUserId ?? null;
  if (nextTurnUserId !== null && !acceptedIds.includes(nextTurnUserId)) {
    throw new TypeError("The next turn must belong to an accepted player.");
  }
  if (nextStatus === "completed" && nextTurnUserId !== null) {
    throw new TypeError("A completed match cannot have a current turn.");
  }

  return {
    eventType: result.eventType,
    eventPayload: structuredClone(result.eventPayload),
    nextState: structuredClone(result.nextState),
    nextTurnUserId,
    nextStatus,
  };
}
