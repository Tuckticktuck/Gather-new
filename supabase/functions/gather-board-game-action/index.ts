import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Chess } from "npm:chess.js@1.4.0";
import { applyBoardGameMove } from "./board-rules.mjs";

const APP_ORIGIN = "https://tuckticktuck.github.io";
const ALLOWED_GAMES = new Set(["chess", "checkers", "tic_tac_toe", "connect_four"]);
const INITIAL_CHESS_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

function defaultKeyFromJson(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.default === "string") return parsed.default;
      const first = Object.values(parsed).find(item => typeof item === "string");
      return typeof first === "string" ? first : null;
    }
  } catch {
    return value;
  }
  return null;
}

function environmentKey(names: string[], jsonNames: string[] = []): string | null {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  for (const name of jsonNames) {
    const value = defaultKeyFromJson(Deno.env.get(name));
    if (value) return value;
  }
  return null;
}

function validateAndApplyChessMove(game: Record<string, any>, actorId: string, action: Record<string, unknown>) {
  const state = game.state || {};
  if (typeof state.fen !== "string" || !Array.isArray(state.moves) ||
      state.moves.length > 512 || state.moves.some((move: unknown) => typeof move !== "string" || move.length > 32)) {
    throw new Error("This saved chess position cannot be verified. Start a new match.");
  }

  const chess = new Chess();
  try {
    for (const san of state.moves) chess.move(san, { strict: true });
    if (chess.fen({ forceEnpassantSquare: true }) !== state.fen) {
      throw new Error("This saved chess position does not match its move history. Start a new match.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not match")) throw error;
    throw new Error("This saved chess position cannot be verified. Start a new match.");
  }

  const expectedColor = actorId === game.player_one_id ? "w" : "b";
  if (chess.turn() !== expectedColor) throw new Error("It is not your turn.");
  const from = action.from;
  const to = action.to;
  const promotion = action.promotion;
  if (typeof from !== "string" || !/^[a-h][1-8]$/.test(from) ||
      typeof to !== "string" || !/^[a-h][1-8]$/.test(to) ||
      (promotion !== undefined && !["q", "r", "b", "n"].includes(String(promotion)))) {
    throw new Error("That chess move is not valid.");
  }

  let move;
  try {
    move = chess.move({
      from,
      to,
      promotion: typeof promotion === "string" ? promotion : "q"
    });
  } catch {
    throw new Error("That chess move is not legal.");
  }
  if (!move) throw new Error("That chess move is not legal.");

  const finished = chess.isGameOver();
  const checkmate = chess.isCheckmate();
  const result = checkmate
    ? (actorId === game.player_one_id ? "player_one_won" : "player_two_won")
    : (finished ? "draw" : null);
  const nextTurnUserId = finished
    ? null
    : (chess.turn() === "w" ? game.player_one_id : game.player_two_id);

  return {
    state: {
      fen: chess.fen({ forceEnpassantSquare: true }),
      moves: chess.history(),
      lastMove: move.san
    },
    nextTurnUserId,
    result
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Use POST to submit a board-game move." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!accessToken || accessToken === authorization) {
    return jsonResponse({ error: "Sign in before making a move." }, 401);
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "The move request is not valid JSON." }, 400);
  }

  if (typeof body.gameId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.gameId) ||
      !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 ||
      !body.action || typeof body.action !== "object" || Array.isArray(body.action)) {
    return jsonResponse({ error: "The move request is missing a valid game, revision or action." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = environmentKey(["SUPABASE_ANON_KEY"], ["SUPABASE_PUBLISHABLE_KEYS"]);
  const secretKey = environmentKey(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"], ["SUPABASE_SECRET_KEYS"]);
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse({ error: "The board-game service is not configured correctly." }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } }
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !authData.user) return jsonResponse({ error: "Your session is no longer valid. Sign in again." }, 401);

  const actorId = authData.user.id;
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const { data: game, error: gameError } = await admin
    .from("gather_games")
    .select("id,conversation_id,game_type,status,player_one_id,player_two_id,turn_user_id,state,winner_id,result,revision")
    .eq("id", body.gameId)
    .maybeSingle();

  if (gameError || !game) return jsonResponse({ error: "This game could not be found." }, 404);
  if (!ALLOWED_GAMES.has(game.game_type)) {
    return jsonResponse({ error: "This game must use its dedicated game actions." }, 400);
  }
  if (game.status !== "active") return jsonResponse({ error: "This game is not active." }, 409);
  if (actorId !== game.player_one_id && actorId !== game.player_two_id) {
    return jsonResponse({ error: "Only the two players can make moves." }, 403);
  }
  if (actorId !== game.turn_user_id) return jsonResponse({ error: "It is not your turn." }, 409);
  if (Number(game.revision) !== body.expectedRevision) {
    return jsonResponse({ error: "The board changed. Refresh the game and try again." }, 409);
  }

  let transition;
  try {
    if (game.game_type === "chess") {
      transition = validateAndApplyChessMove(game, actorId, body.action);
    } else {
      transition = applyBoardGameMove(game, actorId, body.action);
    }
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "That move is not valid." }, 400);
  }

  const { data: updated, error: commitError } = await admin.rpc("gather_board_game_commit_move", {
    p_game_id: game.id,
    p_actor_id: actorId,
    p_expected_revision: body.expectedRevision,
    p_expected_state: game.state,
    p_next_state: transition.state,
    p_next_turn_user_id: transition.nextTurnUserId,
    p_result: transition.result
  });

  if (commitError || !updated) {
    const message = commitError?.message || "The move could not be saved.";
    const status = /revision|changed|turn|permission|access|not active/i.test(message) ? 409 : 400;
    return jsonResponse({ error: message }, status);
  }

  return jsonResponse({ game: Array.isArray(updated) ? updated[0] : updated });
});
