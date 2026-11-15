const HOST_ONLY_ACTIONS = new Set(["start", "cancel", "change-settings", "end"]);
const MUTATING_ACTIONS = new Set(["ready", "start", "cancel", "change-settings", "action", "end"]);
const MEMBER_STATUSES = new Set(["joined", "invited", "spectating", "left", "declined", "eliminated"]);
const TOP_LEVEL_STATUSES = new Set(["pending", "active", "completed", "cancelled", "declined"]);
const DEFAULT_MAX_PUBLIC_STATE_BYTES = 32768;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freezeJson(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
  if (isPlainObject(value)) {
    const copy = {};
    for (const [key, child] of Object.entries(value)) copy[key] = freezeJson(child);
    return Object.freeze(copy);
  }
  return value;
}

function safeRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("Match snapshot is missing " + field + ".");
  }
  return value;
}

/**
 * Converts the current Gather row/roster shape into a stable read model.
 * This is a client-side normalization contract, not an authorization boundary.
 */
export function normalizeMatchSnapshot(input) {
  if (!isPlainObject(input)) throw new TypeError("Match snapshot must be an object.");
  const game = input.game || input.match || input;
  if (!isPlainObject(game)) throw new TypeError("Match record must be an object.");

  const id = requireString(game.id, "game.id");
  const gameType = requireString(game.game_type || game.gameType, "game_type");
  const hostId = requireString(game.created_by || game.host_id || game.hostId, "created_by");
  const status = requireString(game.status, "status");
  if (!TOP_LEVEL_STATUSES.has(status)) throw new TypeError("Unsupported match status: " + status);

  const revision = game.revision === undefined || game.revision === null ? 0 : safeRevision(game.revision);
  if (revision === null) throw new TypeError("Match revision must be a non-negative safe integer.");

  const settings = game.settings === undefined || game.settings === null ? {} : game.settings;
  const state = game.state === undefined || game.state === null ? {} : game.state;
  if (!isPlainObject(settings)) throw new TypeError("Match settings must be an object.");
  if (!isPlainObject(state)) throw new TypeError("Public match state must be an object.");
  if (!isSafePublicMatchState(state)) throw new TypeError("Public match state exceeds the supported JSON size.");

  const rawPlayers = input.players || input.roster || [];
  if (!Array.isArray(rawPlayers)) throw new TypeError("Match players must be an array.");
  const seenPlayers = new Set();
  const players = rawPlayers.map(player => {
    if (!isPlainObject(player)) throw new TypeError("Each match player must be an object.");
    const userId = requireString(player.user_id || player.userId, "player.user_id");
    const memberStatus = requireString(player.status, "player.status");
    if (!MEMBER_STATUSES.has(memberStatus)) throw new TypeError("Unsupported player status: " + memberStatus);
    if (seenPlayers.has(userId)) throw new TypeError("Duplicate player in match roster: " + userId);
    seenPlayers.add(userId);
    return Object.freeze({
      userId,
      status: memberStatus,
      ready: player.ready === true,
      color: typeof player.color === "string" ? player.color : null,
      joinedAt: player.joined_at || player.joinedAt || null
    });
  });

  const match = Object.freeze({
    id,
    gameType,
    status,
    hostId,
    revision,
    joinMode: typeof game.join_mode === "string" ? game.join_mode : null,
    conversationId: typeof game.conversation_id === "string" ? game.conversation_id : null,
    playerOneId: typeof game.player_one_id === "string" ? game.player_one_id : null,
    playerTwoId: typeof game.player_two_id === "string" ? game.player_two_id : null,\n    playerOneReady: game.player_one_ready === true,\n    playerTwoReady: game.player_two_ready === true,
    turnUserId: typeof game.turn_user_id === "string" ? game.turn_user_id : null,
    startedAt: game.started_at || game.startedAt || null,
    winnerId: typeof game.winner_id === "string" ? game.winner_id : null,
    result: typeof game.result === "string" ? game.result : null,
    settings: freezeJson(settings),
    state: freezeJson(state),
    createdAt: game.created_at || game.createdAt || null,
    updatedAt: game.updated_at || game.updatedAt || null
  });

  return Object.freeze({ match, players: Object.freeze(players) });
}

export function getViewerMembership(snapshot, viewerId) {
  if (!snapshot?.match || typeof viewerId !== "string" || !viewerId) {
    return Object.freeze({ role: "visitor", status: null, isHost: false, isJoined: false, isSpectator: false, isInvited: false });
  }
  const player = snapshot.players.find(item => item.userId === viewerId) || null;
  const isHost = snapshot.match.hostId === viewerId && player?.status === "joined";
  const status = player?.status || null;
  const role = isHost ? "host"
    : status === "joined" ? "player"
    : status === "invited" ? "invited"
    : status === "spectating" ? "spectator"
    : status === "eliminated" ? "eliminated"
    : "visitor";
  return Object.freeze({
    role,
    status,
    isHost,
    isJoined: status === "joined",
    isSpectator: status === "spectating",
    isInvited: status === "invited",
    isEliminated: status === "eliminated"
  });
}

/**
 * UI affordance checks only. Every mutation must still be re-authorized by
 * trusted server-side SQL/RPC/Edge Function code using auth.uid().
 */
export function canPerformMatchCommand(snapshot, viewerId, command) {
  if (!snapshot?.match) return { ok: false, reason: "match-not-loaded" };
  const { match } = snapshot;
  const viewer = getViewerMembership(snapshot, viewerId);
  const phase = typeof match.state.phase === "string" ? match.state.phase : null;
  // Legacy two-seat games use started_at as the lifecycle authority. Their
  // state.phase describes gameplay phases (e.g. Battleship "placement"),
  // so it must not make an unstarted lobby appear closed.
  const isLegacyTwoPlayer = !!match.playerOneId && !!match.playerTwoId;
  const isLobby = match.status === "pending" || (match.status === "active" &&
    (isLegacyTwoPlayer ? !match.startedAt : (phase === "lobby" || (!phase && match.state.started !== true))));

  if (command === "read") {
    return viewer.status && ["joined", "invited", "spectating", "eliminated"].includes(viewer.status)
      ? { ok: true } : { ok: false, reason: "not-a-match-member" };
  }
  if (command === "join") {
    const invitedPending = match.status === "pending" && viewer.isInvited;
    const invitedActive = match.status === "active" && viewer.isInvited && match.state.finished !== true;
    // UNO's authoritative join RPC intentionally supports a returning player
    // from left/spectating status so they can rejoin an unfinished match.
    const returningPlayer = match.gameType === "uno" &&
      match.status === "active" &&
      ["left", "spectating"].includes(viewer.status) &&
      match.state.finished !== true &&
      match.state.winner_id == null;
    const openLobby = isLobby && match.joinMode === "open" && !viewer.status;
    return invitedPending || invitedActive || returningPlayer || openLobby
      ? { ok: true } : { ok: false, reason: "cannot-join" };
  }
  if (command === "decline") {
    return viewer.isInvited && ["pending", "active"].includes(match.status)
      ? { ok: true } : { ok: false, reason: "cannot-decline" };
  }
  if (command === "leave") {
    return ["joined", "invited", "spectating", "eliminated"].includes(viewer.status)
      ? { ok: true } : { ok: false, reason: "not-a-member" };
  }
  if (command === "spectate") {
    return match.status === "active" && viewer.isInvited
      ? { ok: true } : { ok: false, reason: "spectating-not-allowed" };
  }
  if (command === "ready") {
    return isLobby && viewer.isJoined
      ? { ok: true } : { ok: false, reason: "not-ready-eligible" };
  }
  if (command === "start" || command === "cancel" || command === "change-settings") {
    if (!isLobby) return { ok: false, reason: "match-not-in-lobby" };
    return viewer.isHost ? { ok: true } : { ok: false, reason: "host-only" };
  }
  if (command === "end") {
    if (match.status !== "active") return { ok: false, reason: "match-not-active" };
    return viewer.isJoined ? { ok: true } : { ok: false, reason: "not-joined" };
  }
  if (command === "action") {
    return match.status === "active" && viewer.isJoined && phase !== "lobby" && phase !== "completed"
      ? { ok: true } : { ok: false, reason: "action-not-allowed" };
  }
  if (command === "read-private-state") {
    return viewer.isJoined ? { ok: true } : { ok: false, reason: "private-state-not-available" };
  }
  return { ok: false, reason: "unknown-command" };
}

/**
 * Shared, deterministic guard used by contract tests and future server/RPC parity
 * checks. It intentionally does not replace database authorization.
 */
export function authorizeMatchCommand(context) {
  const {
    actorId,
    hostId,
    memberStatus,
    matchStatus,
    action,
    expectedRevision,
    currentRevision
  } = context || {};

  if (!actorId) return { ok: false, reason: "unauthenticated" };
  if (!MUTATING_ACTIONS.has(action)) return { ok: false, reason: "unknown-action" };
  if (memberStatus !== "joined") return { ok: false, reason: "not-joined" };
  if (matchStatus !== "active") return { ok: false, reason: "match-not-active" };
  if (HOST_ONLY_ACTIONS.has(action) && actorId !== hostId) {
    return { ok: false, reason: "host-only" };
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
      !Number.isSafeInteger(currentRevision) || currentRevision < 0) {
    return { ok: false, reason: "invalid-revision" };
  }
  if (expectedRevision !== currentRevision) {
    return { ok: false, reason: "stale-revision" };
  }
  return { ok: true, nextRevision: currentRevision + 1 };
}

export function isSafePublicMatchState(value, maxBytes = DEFAULT_MAX_PUBLIC_STATE_BYTES) {
  if (!isPlainObject(value)) return false;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 2) return false;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") return false;
    return new TextEncoder().encode(serialized).byteLength <= maxBytes;
  } catch {
    return false;
  }
}
