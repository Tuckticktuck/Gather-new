import { GAME_STATUSES, PLAYER_STATUSES, validateMatchSnapshot } from "./contracts.mjs";

const TRANSITIONS = Object.freeze({
  invited: new Set(["active", "cancelled"]),
  active: new Set(["completed", "cancelled"]),
  completed: new Set(),
  cancelled: new Set()
});

export function canTransitionMatch(from, to) {
  return Boolean(TRANSITIONS[from]?.has(to));
}

export function transitionMatch(match, nextStatus, actorId, now = new Date().toISOString()) {
  const validation = validateMatchSnapshot(match);
  if (!validation.valid) return { ok: false, reason: "invalid_match", errors: validation.errors };
  if (!match.players.some((player) => player.userId === actorId && player.status === "accepted")) {
    return { ok: false, reason: "actor_not_active_player" };
  }
  if (!GAME_STATUSES.includes(nextStatus) || !canTransitionMatch(match.status, nextStatus)) {
    return { ok: false, reason: "invalid_transition", from: match.status, to: nextStatus };
  }
  if (nextStatus === "active" && match.players.filter((player) => player.status === "accepted").length < 2) {
    return { ok: false, reason: "not_enough_accepted_players" };
  }
  return {
    ok: true,
    match: { ...match, status: nextStatus, version: match.version + 1, updatedAt: now }
  };
}

export function respondToInvitation(match, playerId, response, expectedVersion, now = new Date().toISOString()) {
  const validation = validateMatchSnapshot(match);
  if (!validation.valid) return { ok: false, reason: "invalid_match", errors: validation.errors };
  if (match.version !== expectedVersion) return { ok: false, reason: "version_conflict", currentVersion: match.version };
  if (!["accepted", "declined"].includes(response)) return { ok: false, reason: "invalid_response" };
  if (match.status !== "invited") return { ok: false, reason: "invitation_closed" };
  const player = match.players.find((item) => item.userId === playerId);
  if (!player || player.status !== "pending") return { ok: false, reason: "player_not_pending" };
  const players = match.players.map((item) => item.userId === playerId ? { ...item, status: response } : item);
  return { ok: true, match: { ...match, players, version: match.version + 1, updatedAt: now } };
}

export function assertValidPlayerSet(players) {
  if (!Array.isArray(players) || players.length < 2) return false;
  const ids = players.map((player) => player.userId);
  return ids.every((id) => typeof id === "string" && id.trim()) &&
    new Set(ids).size === ids.length &&
    players.every((player) => PLAYER_STATUSES.includes(player.status));
}
