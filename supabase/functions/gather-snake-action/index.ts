import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { advanceSnakeState, canQueueSnakeDirection } from "./snake-engine.mjs";

const APP_ORIGIN = "https://tuckticktuck.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

function keyFromJson(value: string | undefined): string | null {
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

function envKey(names: string[], jsonNames: string[] = []): string | null {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  for (const name of jsonNames) {
    const value = keyFromJson(Deno.env.get(name));
    if (value) return value;
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Use POST for Snake Arena actions." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!accessToken || accessToken === authorization) {
    return reply({ error: "Sign in before using Snake Arena." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "The Snake Arena request is not valid JSON." }, 400);
  }

  const gameId = body.gameId;
  const action = body.action;
  if (typeof gameId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gameId) ||
      !["direction", "tick"].includes(String(action))) {
    return reply({ error: "The Snake Arena request is missing a valid game or action." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = envKey(["SUPABASE_ANON_KEY"], ["SUPABASE_PUBLISHABLE_KEYS"]);
  const secretKey = envKey(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"], ["SUPABASE_SECRET_KEYS"]);
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return reply({ error: "The Snake Arena service is not configured correctly." }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } }
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return reply({ error: "Your session is no longer valid. Sign in again." }, 401);
  }
  const actorId = authData.user.id;

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  if (action === "direction") {
    const direction = body.direction;
    if (!["up", "down", "left", "right"].includes(String(direction))) {
      return reply({ error: "Choose a valid movement direction." }, 400);
    }

    const { data: game, error: gameError } = await admin
      .from("gather_multiplayer_games")
      .select("id,game_type,status,state")
      .eq("id", gameId)
      .maybeSingle();
    if (gameError || !game || game.game_type !== "snake_arena") {
      return reply({ error: "This Snake Arena match could not be found." }, 404);
    }
    if (game.status !== "active" || game.state?.phase !== "active") {
      return reply({ error: "This Snake Arena match is not accepting movement." }, 409);
    }
    const snake = Array.isArray(game.state?.snakes)
      ? game.state.snakes.find((item: Record<string, unknown>) => item.user_id === actorId)
      : null;
    if (!snake || snake.alive !== true || !canQueueSnakeDirection(String(snake.direction), String(direction))) {
      return reply({ error: "That direction is not available for your snake." }, 409);
    }

    const { data, error } = await admin.rpc("gather_snake_record_input", {
      p_game_id: gameId,
      p_actor_id: actorId,
      p_direction: direction
    });
    if (error) {
      const status = /not active|joined|turn|direction|reverse|wait|active/i.test(error.message) ? 409 : 400;
      return reply({ error: error.message }, status);
    }
    return reply({ accepted: true, input: data });
  }

  const { data: snapshot, error: snapshotError } = await admin.rpc("gather_snake_tick_snapshot", {
    p_game_id: gameId,
    p_actor_id: actorId
  });
  if (snapshotError || !snapshot?.game || !snapshot.inputs) {
    return reply({ error: snapshotError?.message || "The Snake Arena state could not be loaded." }, 409);
  }

  const game = snapshot.game;
  if (game.game_type !== "snake_arena" || game.status !== "active") {
    return reply({ error: "This Snake Arena match is not active." }, 409);
  }

  const transition = advanceSnakeState(game.state, snapshot.inputs, Date.now(), Number(game.state?.tick || 0) + 1);
  if (!transition.advanced) {
    return reply({ advanced: false, reason: transition.reason, revision: game.revision }, 200);
  }

  const { data: updated, error: commitError } = await admin.rpc("gather_snake_commit_tick", {
    p_game_id: gameId,
    p_actor_id: actorId,
    p_expected_revision: game.revision,
    p_expected_state: game.state,
    p_next_state: transition.state
  });
  if (commitError || !updated) {
    const message = commitError?.message || "The Snake Arena tick could not be saved.";
    const status = /not due|changed|revision|joined|not active/i.test(message) ? 409 : 400;
    return reply({ error: message, advanced: false }, status);
  }

  return reply({ advanced: true, game: updated });
});
