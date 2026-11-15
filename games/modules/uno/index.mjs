import {
  GatherGameRegistry,
  createGameModuleRegistry,
  createLobbyService,
  createSupabaseGameDrivers,
  createSupabaseMatchRepository
} from "../../core/index.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(field + " is required.");
  }
  return value;
}

function createRpc(db) {
  return async (name, params) => {
    const response = await db.rpc(name, params);
    if (!response) throw new Error(name + " returned no response.");
    if (response.error) {
      const error = new Error(response.error.message || name + " failed.");
      error.cause = response.error;
      throw error;
    }
    return response.data;
  };
}

/**
 * UNO's game module owns only UNO presentation-facing view models and
 * game-specific intent RPCs. Shared lobby membership, permissions, match
 * snapshots, and Realtime invalidation are delegated to the common engine.
 *
 * Player hands are returned only by gather_uno_get_state for an authorized
 * joined player. They are never stored in the shared match row or match cache.
 */
export function createUnoModule(options = {}) {
  const { db, getViewerId = () => null } = options;
  if (!db) throw new TypeError("A Supabase client is required.");

  const repository = createSupabaseMatchRepository(db);
  const drivers = createSupabaseGameDrivers(db);
  const rpc = createRpc(db);
  const lobby = createLobbyService({
    registry: GatherGameRegistry,
    drivers: drivers.byGame,
    repository,
    getViewerId
  });

  let activeMatchId = null;
  let activeSync = null;
  let mounted = false;
  let snapshotHandler = null;

  async function load(matchId) {
    requiredString(matchId, "matchId");
    if (!UUID_PATTERN.test(matchId)) throw new TypeError("matchId must be a valid match UUID.");
    const publicSnapshot = await lobby.load("uno", matchId);
    const privateState = await drivers.byGame.uno.loadPrivateState(matchId);
    if (!privateState || typeof privateState !== "object") {
      throw new Error("The UNO server returned an invalid private-state response.");
    }

    const match = publicSnapshot.match;
    const privatePlayers = new Map(
      (Array.isArray(privateState.players) ? privateState.players : [])
        .filter(player => player && typeof player.user_id === "string")
        .map(player => [player.user_id, player])
    );
    const game = Object.freeze({
      ...(privateState.game && typeof privateState.game === "object" ? privateState.game : {}),
      id: match.id,
      game_type: match.gameType,
      status: match.status,
      created_by: match.hostId,
      join_mode: match.joinMode,
      settings: match.settings,
      state: match.state,
      revision: match.revision,
      created_at: match.createdAt,
      updated_at: match.updatedAt
    });
    const players = Object.freeze(publicSnapshot.players.map(player => {
      const privatePlayer = privatePlayers.get(player.userId);
      return Object.freeze({
        user_id: player.userId,
        status: player.status,
        ready: player.ready,
        color: player.color,
        joined_at: player.joinedAt,
        ...(Number.isFinite(Number(privatePlayer?.card_count))
          ? { card_count: Number(privatePlayer.card_count) }
          : {})
      });
    }));

    return Object.freeze({
      ...privateState,
      game,
      players,
      public_state: match.state,
      hand: Object.freeze(Array.isArray(privateState.hand) ? privateState.hand : []),
      started: privateState.started === true
    });
  }

  function stopWatching() {
    if (activeSync) activeSync.stop();
    activeSync = null;
    activeMatchId = null;
  }

  async function loadAndNotify(matchId) {
    const next = await load(matchId);
    if (!mounted || activeMatchId !== matchId) return null;
    snapshotHandler?.(next, { source: "realtime", gameId: "uno", matchId });
    return next;
  }

  const module = {
    id: "uno",
    apiVersion: 1,

    async mount(context = {}) {
      stopWatching();
      mounted = true;
      snapshotHandler = typeof context.onSnapshot === "function" ? context.onSnapshot : null;
      if (context.matchId) {
        activeMatchId = requiredString(context.matchId, "matchId");
        activeSync = lobby.watch("uno", context.matchId, async () => {
          try {
            await loadAndNotify(context.matchId);
          } catch (error) {
            context.onError?.(error);
          }
        });
        activeSync.start();
      }
      return () => module.unmount();
    },

    renderLobby() {},
    renderMatch() {},

    async load(matchId) {
      return load(matchId);
    },

    async create(createOptions) {
      return lobby.create("uno", createOptions);
    },

    async join(matchId, color = "#40826D") {
      return lobby.join("uno", matchId, { color });
    },

    async decline(matchId) {
      return lobby.decline("uno", matchId);
    },

    async setReady(matchId, ready) {
      return lobby.setReady("uno", matchId, ready);
    },

    async start(matchId) {
      await lobby.start("uno", matchId);
      return load(matchId);
    },

    async leave(matchId) {
      return lobby.leave("uno", matchId);
    },

    async end(matchId) {
      return lobby.end("uno", matchId);
    },

    async spectate(matchId) {
      return lobby.spectate("uno", matchId);
    },

    async stopSpectating(matchId) {
      return drivers.byGame.uno.stopSpectating(matchId);
    },

    async action(matchId, action, cardId = null, color = null) {
      const id = requiredString(matchId, "matchId");
      if (!["play", "draw", "pass", "call_uno"].includes(action)) {
        throw new TypeError("Unsupported UNO action.");
      }
      if (cardId !== null && typeof cardId !== "string") {
        throw new TypeError("cardId must be a string or null.");
      }
      if (color !== null && !["red", "blue", "green", "yellow"].includes(color)) {
        throw new TypeError("Choose a valid UNO color.");
      }
      await rpc("gather_uno_action", {
        p_game_id: id,
        p_action: action,
        p_card_id: cardId,
        p_color: color
      });
      return load(id);
    },

    async setHouseRules(matchId, houseRules) {
      return rpc("gather_uno_set_house_rules", {
        p_game_id: requiredString(matchId, "matchId"),
        p_house_rules: houseRules
      });
    },

    async confirmDone(matchId) {
      return rpc("gather_uno_done", {
        p_game_id: requiredString(matchId, "matchId")
      });
    },

    async requestRematch(matchId) {
      return rpc("gather_uno_request_rematch", {
        p_game_id: requiredString(matchId, "matchId")
      });
    },

    async hostRematch(matchId) {
      await rpc("gather_uno_host_rematch", {
        p_game_id: requiredString(matchId, "matchId")
      });
      return load(matchId);
    },

    async respondToRematch(offerId, accept) {
      if (typeof accept !== "boolean") throw new TypeError("accept must be a boolean.");
      return rpc("gather_uno_respond_rematch", {
        p_offer_id: requiredString(offerId, "offerId"),
        p_accept: accept
      });
    },

    unmount() {
      mounted = false;
      stopWatching();
      snapshotHandler = null;
    }
  };

  const registry = createGameModuleRegistry([module], GatherGameRegistry);
  return Object.freeze({ module: registry.get("uno"), lobby, drivers, repository });
}
