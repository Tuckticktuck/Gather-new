import { canPerformMatchCommand } from "../../core/match-contract.mjs";

const GAME_IDS = Object.freeze(["chess", "checkers"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function matchId(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TypeError("matchId must be a valid match UUID.");
  return value;
}

function validateMove(gameType, action) {
  if (!action || typeof action !== "object" || Array.isArray(action) || action.type !== "move") {
    throw new TypeError("A legal move intent is required.");
  }
  if (gameType === "chess") {
    if (!/^[a-h][1-8]$/.test(action.from || "") || !/^[a-h][1-8]$/.test(action.to || "")) {
      throw new TypeError("Choose valid Chess squares.");
    }
    if (action.promotion !== undefined && !["q", "r", "b", "n"].includes(action.promotion)) {
      throw new TypeError("Choose a valid Chess promotion piece.");
    }
  } else if (!Number.isInteger(action.from) || action.from < 0 || action.from > 63 ||
             !Number.isInteger(action.to) || action.to < 0 || action.to > 63) {
    throw new TypeError("Choose valid Checkers squares.");
  }
}

function createModule(gameType, options) {
  const { db, lobbyService, getViewerId, renderLobby, renderMatch } = options;
  return Object.freeze({
    id: gameType,
    apiVersion: 1,
    mount(context = {}) {
      return Object.freeze({ gameId: gameType, viewerId: context.viewerId || null, services: context.services || lobbyService });
    },
    renderLobby(context, instance) { return renderLobby(context, instance); },
    renderMatch(context, instance) { return renderMatch(context, instance); },
    unmount() {},
    create(options = {}) { return lobbyService.create(gameType, options); },
    join(id) { return lobbyService.join(gameType, matchId(id)); },
    decline(id) { return lobbyService.decline(gameType, matchId(id)); },
    cancel(id) { return lobbyService.cancel(gameType, matchId(id)); },
    end(id) { return lobbyService.end(gameType, matchId(id)); },
    load(id) { return lobbyService.load(gameType, matchId(id)); },
    watch(id, observer, watchOptions) { return lobbyService.watch(gameType, matchId(id), observer, watchOptions); },
    async action(id, intent) {
      const gameId = matchId(id);
      validateMove(gameType, intent);
      const snapshot = await lobbyService.load(gameType, gameId);
      const permission = canPerformMatchCommand(snapshot, getViewerId(), "action");
      if (!permission.ok) throw new Error("You cannot make this move: " + permission.reason + ".");
      const response = await db.functions.invoke("gather-board-game-action", {
        body: { gameId, expectedRevision: snapshot.match.revision, action: intent }
      });
      if (response?.error) {
        const error = new Error(response.error.message || "The move could not be saved.");
        error.cause = response.error;
        throw error;
      }
      const updated = response?.data?.game || response?.data;
      if (!updated?.id) throw new Error("The board-game service did not return the updated match.");
      return updated;
    }
  });
}

export function createLegacyTurnBasedModules(options = {}) {
  if (!options.db?.functions?.invoke) throw new TypeError("A Supabase Edge Function client is required.");
  if (!options.lobbyService || typeof options.lobbyService.load !== "function" || typeof options.lobbyService.watch !== "function") {
    throw new TypeError("The shared lobby service is required.");
  }
  if (typeof options.getViewerId !== "function") throw new TypeError("getViewerId must be a function.");
  if (typeof options.renderLobby !== "function" || typeof options.renderChess !== "function" || typeof options.renderCheckers !== "function") {
    throw new TypeError("Chess and Checkers render handlers are required.");
  }
  return Object.freeze(GAME_IDS.map(id => createModule(id, {
    ...options,
    renderMatch: id === "chess" ? options.renderChess : options.renderCheckers
  })));
}
