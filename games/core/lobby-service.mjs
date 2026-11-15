import { canPerformMatchCommand, getViewerMembership, normalizeMatchSnapshot } from "./match-contract.mjs";
import { createMatchSync } from "./match-sync.mjs";

function fail(message, code = "invalid-request") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function uniqueIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(id => typeof id !== "string" || !id.trim())) {
    throw fail("Invited users must be a list of valid user IDs.");
  }
  const ids = [...new Set(value)];
  if (ids.length !== value.length) throw fail("Duplicate invitees are not allowed.");
  return ids;
}

function matchIdFrom(result) {
  const row = Array.isArray(result) ? result[0] : result;
  const id = row?.id || row?.game?.id || row?.match?.id;
  if (typeof id !== "string" || !id) throw fail("The game server did not return a match ID.", "invalid-server-response");
  return id;
}

function requireMethod(driver, method) {
  if (typeof driver?.[method] !== "function") {
    throw fail("This game does not support " + method + " through the shared lobby service.", "unsupported-operation");
  }
}

function validateCreateOptions(definition, driver, options, viewerId) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw fail("Game creation options are required.");
  }

  const invitedUserIds = uniqueIds(options.invitedUserIds);
  if (viewerId && invitedUserIds.includes(viewerId)) throw fail("You cannot invite yourself.");
  const joinMode = options.joinMode || "invite";
  if (!["invite", "open"].includes(joinMode)) throw fail("Choose invite-only or open joining.");
  if (joinMode === "open" && invitedUserIds.length) throw fail("Open lobbies cannot have a private invitation list.");
  if (joinMode === "invite" && !invitedUserIds.length && driver.family === "shared-multiplayer") {
    throw fail("Invite at least one person to create this lobby.");
  }

  if (driver.family === "legacy-two-player" && joinMode !== "invite") {
    throw fail("Two-player conversation games use invitations, not open lobbies.");
  }
  const totalSelected = driver.family === "legacy-two-player" ? 2 : invitedUserIds.length + 1;
  const playerLimit = options.playerLimit ?? definition.maxPlayers;
  if (!Number.isSafeInteger(playerLimit) || playerLimit < definition.minPlayers || playerLimit > definition.maxPlayers) {
    throw fail("The selected player limit is outside this game's supported range.");
  }
  if (joinMode === "invite" && totalSelected < definition.minPlayers) throw fail("Invite enough players for this game.");
  if (totalSelected > playerLimit) throw fail("The invitations exceed the selected player limit.");
  if (totalSelected > definition.maxPlayers) throw fail("This game has reached its player limit.");

  if (definition.id === "dominoes") {
    const mode = options.mode || "free_for_all";
    const preset = options.preset || "classic";
    if (!["free_for_all", "teams"].includes(mode)) throw fail("Choose a supported Dominoes mode.");
    if (!["quick", "classic", "marathon"].includes(preset)) throw fail("Choose a supported Dominoes rule preset.");
    if (mode === "teams" && totalSelected !== 4) {
      throw fail("Team Dominoes requires exactly four players.");
    }
  }

  if (driver.family === "legacy-two-player") {
    if (typeof options.conversationId !== "string" || !options.conversationId.trim()) {
      throw fail("Choose the conversation for this two-player invitation.");
    }
    if (typeof options.opponentId !== "string" || !options.opponentId.trim()) {
      throw fail("Choose an opponent for this two-player invitation.");
    }
    if (viewerId && options.opponentId === viewerId) throw fail("You cannot challenge yourself.");
  }

  return { ...options, gameId: definition.id, invitedUserIds, joinMode, playerLimit };
}

/**
 * Game-agnostic lobby facade. Game-specific RPC drivers retain their existing
 * server rules and argument shapes. This service only standardizes validation,
 * permissions, errors, snapshots, and lifecycle entry points.
 */
export function createLobbyService(options) {
  if (!options || typeof options !== "object") throw new TypeError("Lobby service options are required.");
  const { registry, drivers, repository, getViewerId = () => null, onSnapshot = () => {} } = options;
  if (!registry || typeof registry.get !== "function") throw new TypeError("A game registry is required.");
  if (!drivers || typeof drivers !== "object") throw new TypeError("Game drivers are required.");
  if (typeof getViewerId !== "function") throw new TypeError("getViewerId must be a function.");
  if (repository && typeof repository.getSnapshot !== "function") {
    throw new TypeError("repository.getSnapshot must be a function.");
  }

  function getDriver(gameId) {
    const definition = registry.get(gameId);
    if (!definition) throw fail("That game is not registered in Gather.", "unknown-game");
    const driver = drivers[gameId];
    if (!driver || driver.id !== gameId) throw fail("That game has no configured lifecycle driver.", "missing-driver");
    return { definition, driver };
  }

  async function load(gameId, matchId) {
    const { driver } = getDriver(gameId);
    if (!repository) throw fail("Match repository is not configured.", "missing-repository");
    const raw = await repository.getSnapshot(matchId, driver.family);
    const snapshot = normalizeMatchSnapshot(raw);
    if (snapshot.match.gameType !== gameId) throw fail("The match belongs to a different game.", "game-type-mismatch");
    return snapshot;
  }

  async function assertAllowed(gameId, matchId, command, driver) {
    if (!repository) return null;
    const snapshot = await load(gameId, matchId);
    const viewerId = await getViewerId();
    const permission = canPerformMatchCommand(snapshot, viewerId, command);
    if (!permission.ok) throw fail("You cannot " + command + " this match: " + permission.reason + ".", "permission-denied");

    if (command === "end" && driver.endPolicy === "host-only") {
      const membership = getViewerMembership(snapshot, viewerId);
      if (!membership.isHost) throw fail("Only the host can end this match.", "permission-denied");
    }
    return snapshot;
  }

  async function refreshAfter(gameId, matchId, result) {
    let snapshot = null;
    if (repository) {
      try {
        snapshot = await load(gameId, matchId);
        onSnapshot(snapshot, { gameId, matchId });
      } catch {
        // Mutation success is not turned into an apparent failure merely
        // because an immediate follow-up read is temporarily unavailable.
      }
    }
    return { gameId, matchId, result, snapshot };
  }

  async function create(gameId, createOptions) {
    const { definition, driver } = getDriver(gameId);
    requireMethod(driver, "create");
    const viewerId = await getViewerId();
    const safeOptions = validateCreateOptions(definition, driver, createOptions, viewerId);
    const result = await driver.create(safeOptions);
    const matchId = matchIdFrom(result);
    return refreshAfter(gameId, matchId, result);
  }

  async function perform(gameId, matchId, command, args = []) {
    const { driver } = getDriver(gameId);
    requireMethod(driver, command);
    await assertAllowed(gameId, matchId, command === "setReady" ? "ready" : command, driver);
    const result = await driver[command](matchId, ...args);
    return refreshAfter(gameId, matchId, result);
  }

  function watch(gameId, matchId, observer, syncOptions = {}) {
    const { driver } = getDriver(gameId);
    if (!repository || typeof repository.subscribe !== "function") {
      throw fail("Realtime match repository is not configured.", "missing-repository");
    }
    if (typeof observer !== "function") throw new TypeError("A snapshot observer is required.");

    return createMatchSync({
      debounceMs: syncOptions.debounceMs ?? 60,
      subscribe: invalidate => repository.subscribe(matchId, driver.family, invalidate),
      loadSnapshot: () => load(gameId, matchId),
      onSnapshot: (snapshot, metadata) => {
        onSnapshot(snapshot, { gameId, matchId, ...metadata });
        observer(snapshot, metadata);
      },
      onError: syncOptions.onError
    });
  }

  return Object.freeze({
    load,
    create,
    join: (gameId, matchId, extra) => perform(gameId, matchId, "join", [extra || {}]),
    decline: (gameId, matchId) => perform(gameId, matchId, "decline"),
    setReady: (gameId, matchId, ready) => perform(gameId, matchId, "setReady", [ready]),
    start: (gameId, matchId) => perform(gameId, matchId, "start"),
    leave: (gameId, matchId) => perform(gameId, matchId, "leave"),
    cancel: (gameId, matchId) => perform(gameId, matchId, "cancel"),
    end: (gameId, matchId) => perform(gameId, matchId, "end"),
    spectate: (gameId, matchId) => perform(gameId, matchId, "spectate"),
    watch
  });
}
