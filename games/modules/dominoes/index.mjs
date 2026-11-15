import {
  GatherGameRegistry,
  createGameModuleRegistry,
  createLobbyService,
  createSupabaseGameDrivers,
  createSupabaseMatchRepository
} from "../../core/index.mjs";

/**
 * Dominoes game module boundary.
 *
 * The module owns Dominoes presentation and game-specific private state.
 * Shared lobby mutations, participant permissions, and match synchronization
 * are delegated to the common engine. Private hands are fetched only through
 * the dedicated Dominoes RPC and are never copied into the public snapshot.
 */
export function createDominoesModule(options = {}) {
  const { db, getViewerId = () => null, onSnapshot = () => {} } = options;
  if (!db) throw new TypeError("A Supabase client is required.");

  const repository = createSupabaseMatchRepository(db);
  const drivers = createSupabaseGameDrivers(db);
  const lobby = createLobbyService({
    registry: GatherGameRegistry,
    drivers: drivers.byGame,
    repository,
    getViewerId
  });

  let activeMatchId = null;
  let activeSync = null;
  let renderers = {};
  let mounted = false;

  async function load(matchId) {
    const publicSnapshot = await lobby.load("dominoes", matchId);
    const match = publicSnapshot.match;
    const privateState = await drivers.byGame.dominoes.loadPrivateState(matchId);
    const game = Object.freeze({
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
    const players = Object.freeze(publicSnapshot.players.map(player => Object.freeze({
      user_id: player.userId,
      status: player.status,
      ready: player.ready,
      color: player.color,
      joined_at: player.joinedAt
    })));
    return Object.freeze({
      game,
      players,
      // This is returned only to the current viewer by the dedicated RPC.
      // It is never merged into or persisted as public match state.
      your_hand: Object.freeze(Array.isArray(privateState?.your_hand) ? privateState.your_hand : [])
    });
  }

  function stopWatching() {
    if (activeSync) activeSync.stop();
    activeSync = null;
    activeMatchId = null;
  }

  const module = {
    id: "dominoes",
    apiVersion: 1,

    async mount(context = {}) {
      stopWatching();
      mounted = true;
      renderers = {
        lobby: context.renderLobby,
        match: context.renderMatch,
        results: context.renderResults
      };
      if (context.matchId) {
        activeMatchId = context.matchId;
        activeSync = lobby.watch("dominoes", context.matchId, async publicSnapshot => {
          if (!mounted || activeMatchId !== context.matchId) return;
          try {
            const fullSnapshot = await load(context.matchId);
            module.onSnapshot?.(fullSnapshot, { source: "realtime" });
            if (fullSnapshot.game.state?.phase === "finished" ||
                fullSnapshot.game.status === "completed") {
              module.renderResults?.(fullSnapshot, context.container);
            } else if (fullSnapshot.game.state?.phase === "lobby" ||
                       !fullSnapshot.game.state?.started) {
              module.renderLobby(fullSnapshot, context.container);
            } else {
              module.renderMatch(fullSnapshot, context.container);
            }
          } catch (error) {
            context.onError?.(error);
          }
        });
        activeSync.start();
      }
      return () => module.unmount();
    },

    renderLobby(snapshot, container) {
      if (typeof renderers.lobby === "function") return renderers.lobby(snapshot, container);
    },

    renderMatch(snapshot, container) {
      if (typeof renderers.match === "function") return renderers.match(snapshot, container);
    },

    renderResults(snapshot, container) {
      if (typeof renderers.results === "function") return renderers.results(snapshot, container);
    },

    onSnapshot(snapshot, metadata) {
      onSnapshot(snapshot, metadata);
    },

    async load(matchId) {
      return load(matchId);
    },

    async create(options) {
      return lobby.create("dominoes", options);
    },

    async join(matchId, color) {
      return lobby.join("dominoes", matchId, { color });
    },

    async decline(matchId) {
      return lobby.decline("dominoes", matchId);
    },

    async setReady(matchId, ready) {
      return lobby.setReady("dominoes", matchId, ready);
    },

    async start(matchId) {
      return lobby.start("dominoes", matchId);
    },

    async leave(matchId) {
      return lobby.leave("dominoes", matchId);
    },

    async end(matchId) {
      return lobby.end("dominoes", matchId);
    },

    async spectate(matchId) {
      return lobby.spectate("dominoes", matchId);
    },

    unmount() {
      mounted = false;
      stopWatching();
      renderers = {};
    }
  };

  const registry = createGameModuleRegistry([module], GatherGameRegistry);
  return Object.freeze({ module: registry.get("dominoes"), lobby, drivers, repository });
}
