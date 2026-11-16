export const GAME_STATUSES = Object.freeze(["invited", "active", "completed", "cancelled"]);
export const PLAYER_STATUSES = Object.freeze(["pending", "accepted", "declined", "removed"]);
export const MATCH_VISIBILITIES = Object.freeze(["conversation"]);
export const GAME_MESSAGE_VERSION = 1;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isIsoDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function validateGameInvitation(input) {
  const errors = [];
  if (!isRecord(input)) return { valid: false, errors: ["Invitation must be an object."] };
  if (!isNonEmptyString(input.conversationId)) errors.push("conversationId is required.");
  if (!isNonEmptyString(input.messageId)) errors.push("messageId is required.");
  if (!isNonEmptyString(input.createdBy)) errors.push("createdBy is required.");
  if (!isNonEmptyString(input.gameType)) errors.push("gameType is required.");
  if (!Array.isArray(input.playerIds) || input.playerIds.length < 2) errors.push("At least two players are required.");
  else {
    if (input.playerIds.some((id) => !isNonEmptyString(id))) errors.push("Every player ID must be a non-empty string.");
    if (new Set(input.playerIds).size !== input.playerIds.length) errors.push("Player IDs must be unique.");
    if (!input.playerIds.includes(input.createdBy)) errors.push("The creator must be included in the player list.");
  }
  if (input.visibility !== undefined && !MATCH_VISIBILITIES.includes(input.visibility)) errors.push("Unsupported match visibility.");
  return { valid: errors.length === 0, errors };
}

export function validateMatchSnapshot(input) {
  const errors = [];
  if (!isRecord(input)) return { valid: false, errors: ["Match snapshot must be an object."] };
  for (const field of ["id", "conversationId", "messageId", "gameType", "createdBy"]) {
    if (!isNonEmptyString(input[field])) errors.push(field + " is required.");
  }
  if (!GAME_STATUSES.includes(input.status)) errors.push("Unsupported match status.");
  if (!Number.isSafeInteger(input.version) || input.version < 1) errors.push("version must be a positive safe integer.");
  if (!Array.isArray(input.players) || input.players.length < 2) errors.push("A match requires at least two players.");
  else {
    const ids = input.players.map((player) => player?.userId);
    if (ids.some((id) => !isNonEmptyString(id))) errors.push("Every player requires a userId.");
    if (new Set(ids).size !== ids.length) errors.push("Match player IDs must be unique.");
    for (const player of input.players) {
      if (!PLAYER_STATUSES.includes(player.status)) errors.push("Every player requires a supported status.");
    }
  }
  if (!isRecord(input.state)) errors.push("state must be a JSON object.");
  if (!isIsoDate(input.createdAt)) errors.push("createdAt must be an ISO date.");
  if (input.updatedAt !== undefined && !isIsoDate(input.updatedAt)) errors.push("updatedAt must be an ISO date.");
  return { valid: errors.length === 0, errors };
}

export function validateGameEvent(input) {
  const errors = [];
  if (!isRecord(input)) return { valid: false, errors: ["Game event must be an object."] };
  for (const field of ["id", "matchId", "actorId", "type"]) {
    if (!isNonEmptyString(input[field])) errors.push(field + " is required.");
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) errors.push("sequence must be a positive safe integer.");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) errors.push("expectedVersion must be a positive safe integer.");
  if (!isRecord(input.payload)) errors.push("payload must be a JSON object.");
  if (!isIsoDate(input.createdAt)) errors.push("createdAt must be an ISO date.");
  return { valid: errors.length === 0, errors };
}
