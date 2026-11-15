const LEGACY_BOARD_GAME_TYPES = Object.freeze([
  "chess",
  "checkers",
  "tic_tac_toe",
  "connect_four",
  "battleship"
]);

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(field + " is required.");
  }
  return value;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredMatchId(value) {
  const id = requiredString(value, "matchId");
  if (!UUID_PATTERN.test(id)) throw new TypeError("matchId must be a valid match UUID.");
  return id;
}

function uniqueUserIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(id => typeof id !== "string" || !id.trim())) {
    throw new TypeError("invitedUserIds must be an array of user IDs.");
  }
  const ids = [...new Set(value)];
  if (ids.length !== value.length) throw new TypeError("Duplicate invitees are not allowed.");
  return ids;
}

function unwrap(result, operation) {
  if (!result) throw new Error(operation + " returned no response.");
  if (result.error) {
    const error = new Error(result.error.message || operation + " failed.");
    error.cause = result.error;
    throw error;
  }
  return Array.isArray(result.data) ? result.data[0] ?? null : result.data;
}

function createRpc(db) {
  if (!db || typeof db.rpc !== "function") {
    throw new TypeError("A Supabase client with rpc() is required.");
  }
  return async (name, params = {}) => unwrap(await db.rpc(name, params), name);
}

function makeDriver(id, family, methods, endPolicy = "host-only") {
  return Object.freeze({
    id,
    family,
    endPolicy,
    supportedActions: Object.freeze(Object.keys(methods)),
    ...methods
  });
}

function createLegacyBoardDriver(rpc, id) {
  if (!LEGACY_BOARD_GAME_TYPES.includes(id)) throw new TypeError("Unsupported legacy board game: " + id);
  const methods = {
    async create(options = {}) {
      return rpc("gather_game_create", { p_conversation_id: requiredString(options.conversationId, "conversationId"), p_game_type: id, p_player_two_id: requiredString(options.opponentId, "opponentId") });
    },
    async join(matchId) { return rpc("gather_game_accept", { p_game_id: requiredString(matchId, "matchId") }); },
    async setReady(matchId, ready) {
      if (typeof ready !== "boolean") throw new TypeError("ready must be a boolean.");
      return rpc("gather_game_set_ready", { p_game_id: requiredString(matchId, "matchId"), p_ready: ready });
    },
    async start(matchId) { return rpc("gather_game_start", { p_game_id: requiredString(matchId, "matchId") }); },
    async decline(matchId) { return rpc("gather_game_decline", { p_game_id: requiredString(matchId, "matchId") }); },
    async cancel(matchId) { return rpc("gather_game_cancel", { p_game_id: requiredString(matchId, "matchId") }); },
    async end(matchId) { return rpc("gather_game_end", { p_game_id: requiredString(matchId, "matchId") }); }
  };
  if (id === "battleship") {
    methods.loadPrivateState = async matchId => rpc("gather_game_battleship_private_state", { p_game_id: requiredMatchId(matchId) });
    methods.action = async (matchId, action, payload) => {
      const gameId = requiredMatchId(matchId);
      if (!["place_fleet", "fire"].includes(action)) throw new TypeError("Unsupported Battleship action.");
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Battleship action payload must be an object.");
      if (JSON.stringify(payload).length > 12000) throw new TypeError("Battleship action payload is too large.");
      if (action === "place_fleet") {
        if (!Array.isArray(payload.ships) || payload.ships.length !== 5 || payload.ships.some(ship => !ship || !Array.isArray(ship.cells) || !ship.cells.length || ship.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell > 99))) throw new TypeError("Place five ships using valid board squares.");
      } else if (!Number.isInteger(payload.cell) || payload.cell < 0 || payload.cell > 99) throw new TypeError("Choose a valid Battleship square.");
      return rpc("gather_game_battleship_action", { p_game_id: gameId, p_action: action, p_payload: payload });
    };
  }
  return makeDriver(id, "legacy-two-player", methods, "any-joined-player");
}

function createUnoDriver(rpc) {
  return makeDriver("uno", "shared-multiplayer", {
    async create(options = {}) {
      const invitedUserIds = uniqueUserIds(options.invitedUserIds);
      const joinMode = options.joinMode || "invite";
      const maxPlayers = 2;
      return rpc("gather_uno_create", {
        p_conversation_id: options.conversationId ?? null,
        p_join_mode: joinMode,
        p_invited_user_ids: invitedUserIds,
        p_max_players: maxPlayers
      });
    },
    async join(matchId, options = {}) {
      return rpc("gather_uno_join", {
        p_game_id: requiredString(matchId, "matchId"),
        p_color: options.color || "#40826D"
      });
    },
    async decline(matchId) {
      return rpc("gather_uno_decline", { p_game_id: requiredString(matchId, "matchId") });
    },
    async setReady(matchId, ready) {
      if (typeof ready !== "boolean") throw new TypeError("ready must be a boolean.");
      return rpc("gather_uno_ready", { p_game_id: requiredString(matchId, "matchId"), p_ready: ready });
    },
    async start(matchId) {
      return rpc("gather_uno_start", { p_game_id: requiredString(matchId, "matchId") });
    },
    async leave(matchId) {
      return rpc("gather_uno_leave", { p_game_id: requiredString(matchId, "matchId") });
    },
    async end(matchId) {
      return rpc("gather_uno_end", { p_game_id: requiredString(matchId, "matchId") });
    },
    async spectate(matchId) {
      return rpc("gather_uno_spectate", { p_game_id: requiredString(matchId, "matchId") });
    },
    async stopSpectating(matchId) {
      return rpc("gather_uno_stop_spectating", { p_game_id: requiredString(matchId, "matchId") });
    },
    async loadPrivateState(matchId) {
      return rpc("gather_uno_get_state", { p_game_id: requiredString(matchId, "matchId") });
    }
  });
}

function createLudoDriver(rpc) {
  return makeDriver("ludo", "shared-multiplayer", {
    async create(options = {}) {
      const invitedUserIds = uniqueUserIds(options.invitedUserIds);
      return rpc("gather_ludo_create", {
        p_conversation_id: options.conversationId ?? null,
        p_join_mode: options.joinMode || "invite",
        p_invited_user_ids: invitedUserIds,
        p_max_players: 2,
        p_creator_color: options.color || "#D85A60"
      });
    },
    async join(matchId, options = {}) {
      return rpc("gather_ludo_join", {
        p_game_id: requiredString(matchId, "matchId"),
        p_color: requiredString(options.color, "Ludo player color")
      });
    },
    async decline(matchId) {
      return rpc("gather_ludo_decline", { p_game_id: requiredString(matchId, "matchId") });
    },
    async setReady(matchId, ready) {
      if (typeof ready !== "boolean") throw new TypeError("ready must be a boolean.");
      return rpc("gather_ludo_ready", { p_game_id: requiredString(matchId, "matchId"), p_ready: ready });
    },
    async start(matchId) {
      return rpc("gather_ludo_start", { p_game_id: requiredString(matchId, "matchId") });
    },
    async leave(matchId) {
      return rpc("gather_ludo_leave", { p_game_id: requiredString(matchId, "matchId") });
    },
    async cancel(matchId) {
      return rpc("gather_ludo_cancel", { p_game_id: requiredString(matchId, "matchId") });
    },
    async action(matchId, action, tokenIndex = null) {
      const id = requiredString(matchId, "matchId");
      if (!["roll", "move", "end"].includes(action)) throw new TypeError("Unsupported Ludo action.");
      if (action === "move" && (!Number.isInteger(tokenIndex) || tokenIndex < 0 || tokenIndex > 3)) throw new TypeError("Ludo token index must be an integer from 0 through 3.");
      if (action !== "move" && tokenIndex !== null && tokenIndex !== undefined) throw new TypeError("Only a Ludo move accepts a token index.");
      return rpc("gather_ludo_multiplayer_action", {p_game_id:id,p_action:action,p_token_index:action==="move"?tokenIndex:null});
    }
  });
}

function createDominoesDriver(rpc) {
  return makeDriver("dominoes", "shared-multiplayer", {
    async create(options = {}) {
      const invitedUserIds = uniqueUserIds(options.invitedUserIds);
      return rpc("gather_dominoes_create", {
        p_join_mode: options.joinMode || "invite",
        p_invited_user_ids: invitedUserIds,
        p_mode: "free_for_all",
        p_preset: options.preset || "classic"
      });
    },
    async join(matchId, options = {}) {
      return rpc("gather_dominoes_join", {
        p_game_id: requiredString(matchId, "matchId"),
        p_color: options.color || "#22D3EE"
      });
    },
    // The current Dominoes decline path intentionally uses the same
    // server-validated leave RPC, which accepts invited roster members.
    async decline(matchId) {
      return rpc("gather_dominoes_leave", { p_game_id: requiredString(matchId, "matchId") });
    },
    async setReady(matchId, ready) {
      if (typeof ready !== "boolean") throw new TypeError("ready must be a boolean.");
      return rpc("gather_dominoes_ready", { p_game_id: requiredString(matchId, "matchId"), p_ready: ready });
    },
    async start(matchId) {
      return rpc("gather_dominoes_start", { p_game_id: requiredString(matchId, "matchId") });
    },
    async leave(matchId) {
      return rpc("gather_dominoes_leave", { p_game_id: requiredString(matchId, "matchId") });
    },
    async end(matchId) {
      return rpc("gather_dominoes_end", { p_game_id: requiredString(matchId, "matchId") });
    },
    async spectate(matchId) {
      return rpc("gather_dominoes_spectate", { p_game_id: requiredString(matchId, "matchId") });
    },
    async loadPrivateState(matchId) {
      return rpc("gather_dominoes_get_state", { p_game_id: requiredString(matchId, "matchId") });
    }
  });
}

function legacyRoster(game) {
  const pending = game.status === "pending";
  const declined = game.status === "declined";
  const cancelled = game.status === "cancelled";
  return [
    { user_id: game.player_one_id, status: "joined", ready: game.player_one_ready === true, color: null, joined_at: game.created_at },
    {
      user_id: game.player_two_id,
      status: pending ? "invited" : declined || cancelled ? (declined ? "declined" : "left") : "joined",
      ready: game.player_two_ready === true,
      color: null,
      joined_at: game.started_at || null
    }
  ];
}

function normalizeLegacyRow(game) {
  return {
    game: {
      id: game.id,
      game_type: game.game_type,
      status: game.status,
      created_by: game.created_by,
      join_mode: "invite",
      settings: {},
      state: game.state || {},
      revision: Number(game.revision || 0),
      created_at: game.created_at,
      updated_at: game.updated_at,
      conversation_id: game.conversation_id,
      player_one_id: game.player_one_id,
      player_two_id: game.player_two_id,
      turn_user_id: game.turn_user_id,
      winner_id: game.winner_id,
      result: game.result,
      started_at: game.started_at || null,
      player_one_ready: game.player_one_ready === true,
      player_two_ready: game.player_two_ready === true
    },
    players: legacyRoster(game)
  };
}

function checkQuery(result, label) {
  if (!result) throw new Error(label + " returned no response.");
  if (result.error) {
    const error = new Error(result.error.message || label + " failed.");
    error.cause = result.error;
    throw error;
  }
  return result.data;
}

/**
 * Read adapter for the two existing match persistence families.
 * Realtime events only invalidate the snapshot; event records are never trusted.
 */
export function createSupabaseMatchRepository(db) {
  if (!db || typeof db.from !== "function" || typeof db.channel !== "function") {
    throw new TypeError("A Supabase client with from() and channel() is required.");
  }

  async function getSnapshot(matchId, family) {
    requiredMatchId(matchId);
    if (family === "legacy-two-player") {
      const row = checkQuery(
        await db.from("gather_games").select("*").eq("id", matchId).maybeSingle(),
        "Load legacy match"
      );
      if (!row) throw new Error("This game is not available.");
      return normalizeLegacyRow(row);
    }
    if (family !== "shared-multiplayer") {
      throw new TypeError("Unknown match persistence family: " + family);
    }

    const [gameResult, playerResult] = await Promise.all([
      db.from("gather_multiplayer_games").select("*").eq("id", matchId).maybeSingle(),
      db.from("gather_multiplayer_players")
        .select("game_id,user_id,status,color,ready,joined_at")
        .eq("game_id", matchId)
    ]);
    const game = checkQuery(gameResult, "Load multiplayer match");
    const players = checkQuery(playerResult, "Load multiplayer roster");
    if (!game) throw new Error("This multiplayer game is not available.");
    return { game, players: players || [] };
  }

  function subscribe(matchId, family, onChange) {
    requiredMatchId(matchId);
    if (typeof onChange !== "function") throw new TypeError("onChange must be a function.");
    if (!["legacy-two-player", "shared-multiplayer"].includes(family)) {
      throw new TypeError("Unknown match persistence family: " + family);
    }

    const safeId = matchId.replace(/[^a-zA-Z0-9_-]/g, "");
    let channel = db.channel("gather-match-" + family + "-" + safeId);
    const invalidate = () => onChange();
    const gameTable = family === "legacy-two-player" ? "gather_games" : "gather_multiplayer_games";

    channel = channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: gameTable,
      filter: "id=eq." + matchId
    }, invalidate);

    if (family === "shared-multiplayer") {
      channel = channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "gather_multiplayer_players",
        filter: "game_id=eq." + matchId
      }, invalidate);
    }

    channel.subscribe();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      void db.removeChannel(channel);
    };
  }

  return Object.freeze({
    getSnapshot,
    subscribe,
    normalizeLegacyRow
  });
}

/**
 * Creates per-game RPC drivers matching the existing live Supabase function
 * signatures. No schema or database function is created or altered here.
 */
export function createSupabaseGameDrivers(db) {
  const rpc = createRpc(db);
  const drivers = {};

  for (const id of LEGACY_BOARD_GAME_TYPES) {
    drivers[id] = createLegacyBoardDriver(rpc, id);
  }
  drivers.uno = createUnoDriver(rpc);
  drivers.ludo = createLudoDriver(rpc);
  drivers.dominoes = createDominoesDriver(rpc);

  return Object.freeze({
    byGame: Object.freeze(drivers),
    legacyBoard: Object.freeze({
      forGame(id) { return createLegacyBoardDriver(rpc, id); }
    })
  });
}
