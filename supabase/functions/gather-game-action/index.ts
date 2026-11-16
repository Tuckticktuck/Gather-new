import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { gameEngines } from "./registry.mjs";
import { GameRuleError, resolveGameAction, validateGameActionRequest } from "./engine.mjs";

const ALLOWED_ORIGIN = "https://tuckticktuck.github.io";
const MAX_BODY_BYTES = 16 * 1024;

function response(status: number, body: Record<string, unknown>, origin = "") {
  const allowedOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected server error.";
}

async function readJson(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    throw new RangeError("Request body is too large.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new TypeError("Request body must be valid JSON.");
  }
}

function serviceHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

async function restGet<T>(
  baseUrl: string,
  serviceKey: string,
  table: string,
  query: URLSearchParams,
): Promise<T> {
  const url = `${baseUrl}/rest/v1/${table}?${query.toString()}`;
  const result = await fetch(url, { headers: serviceHeaders(serviceKey) });
  if (!result.ok) throw new Error("Could not load the requested game data.");
  return await result.json() as T;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin") ?? "";
  if (request.method === "OPTIONS") return response(204, {}, origin);
  if (request.method !== "POST") return response(405, { error: "Method not allowed." }, origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("Missing required Supabase server environment.");
      return response(500, { error: "Game action service is not configured." }, origin);
    }

    const authorization = request.headers.get("Authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response(401, { error: "Sign in is required." }, origin);

    // Verify the caller with Supabase Auth; never trust a user id supplied in JSON.
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
    });
    if (!authResponse.ok) return response(401, { error: "Your sign-in session is invalid or expired." }, origin);
    const user = await authResponse.json();
    if (typeof user?.id !== "string") return response(401, { error: "Could not verify your account." }, origin);
    const actorId = user.id;

    const input = validateGameActionRequest(await readJson(request));
    const matchQuery = new URLSearchParams({
      id: `eq.${input.matchId}`,
      select: "id,conversation_id,game_key,status,state,version,current_turn_user_id",
      limit: "1",
    });
    const matches = await restGet<Array<Record<string, unknown>>>(
      supabaseUrl, serviceKey, "game_matches", matchQuery,
    );
    const match = matches[0];
    if (!match) return response(404, { error: "Game match not found." }, origin);

    let privateState: Record<string, unknown> | null = null;
    if (match.game_key === "uno") {
      const privateQuery = new URLSearchParams({
        match_id: `eq.${input.matchId}`,
        select: "state",
        limit: "1",
      });
      const privateRows = await restGet<Array<{ state: Record<string, unknown> }>>(
        supabaseUrl, serviceKey, "game_match_private_state", privateQuery,
      );
      privateState = privateRows[0]?.state ?? null;
    }

    const playerQuery = new URLSearchParams({
      match_id: `eq.${input.matchId}`,
      select: "user_id,response,player_order",
      order: "player_order.asc",
    });
    const players = await restGet<Array<{ user_id: string; response: string; player_order: number }>>(
      supabaseUrl, serviceKey, "game_match_players", playerQuery,
    );
    const actor = players.find((player) => player.user_id === actorId);
    if (!actor || actor.response !== "accepted") {
      return response(403, { error: "Only accepted players can make a move." }, origin);
    }

    // Also require current conversation membership, not merely an old participant row.
    const membershipQuery = new URLSearchParams({
      conversation_id: `eq.${String(match.conversation_id)}`,
      user_id: `eq.${actorId}`,
      select: "user_id",
      limit: "1",
    });
    const memberships = await restGet<Array<{ user_id: string }>>(
      supabaseUrl, serviceKey, "conversation_members", membershipQuery,
    );
    if (!memberships.length) return response(403, { error: "You are no longer a member of this conversation." }, origin);

    if (match.status !== "active") return response(409, { error: "This match is not active." }, origin);
    if (Number(match.version) !== input.expectedVersion) {
      return response(409, { error: "The game has changed. Refresh the match and try again." }, origin);
    }

    const engine = gameEngines.get(String(match.game_key));
    if (!engine) return response(422, { error: "This game does not have a server-side engine yet." }, origin);

    const transition = await resolveGameAction({
      engine,
      match: {
        status: String(match.status),
        state: match.state,
        version: Number(match.version),
        current_turn_user_id: typeof match.current_turn_user_id === "string"
          ? match.current_turn_user_id : null,
      },
      actorId,
      players,
      action: input.action,
    });

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/commit_validated_game_transition`, {
      method: "POST",
      headers: { ...serviceHeaders(serviceKey), Prefer: "return=representation" },
      body: JSON.stringify({
        p_match_id: input.matchId,
        p_expected_version: input.expectedVersion,
        p_actor_id: actorId,
        p_event_type: transition.eventType,
        p_payload: transition.eventPayload,
        p_next_state: transition.nextState,
        p_next_turn_user_id: transition.nextTurnUserId,
        p_next_status: transition.nextStatus,\n        p_private_state: transition.nextPrivateState ?? null,
      }),
    });

    if (!rpcResponse.ok) {
      const rpcError = await rpcResponse.json().catch(() => ({}));
      if (rpcError?.code === "40001") {
        return response(409, { error: "The game has changed. Refresh the match and try again." }, origin);
      }
      if (rpcError?.code === "42501") return response(403, { error: "This action is not allowed." }, origin);
      console.error("Game transition commit failed:", rpcError?.code ?? "unknown");
      return response(500, { error: "The move could not be saved." }, origin);
    }

    const savedMatch = await rpcResponse.json();
    return response(200, { match: Array.isArray(savedMatch) ? savedMatch[0] : savedMatch }, origin);
  } catch (error) {
    const message = errorMessage(error);
    if (error instanceof GameRuleError) {
      return response(422, { error: message }, origin);
    }
    if (error instanceof RangeError) return response(413, { error: message }, origin);
    if (error instanceof TypeError) return response(400, { error: message }, origin);
    if (message.includes("Only accepted players") || message.includes("turn")) {
      return response(403, { error: message }, origin);
    }
    if (message.includes("not active")) return response(409, { error: message }, origin);
    console.error("Game action failed:", message);
    return response(500, { error: "The move could not be processed." }, origin);
  }
});
