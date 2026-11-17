import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGIN = "https://tuckticktuck.github.io";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(status: number, body: Record<string, unknown>, origin = "") {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    },
  });
}

function headers(serviceKey: string) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

async function getRows<T>(baseUrl: string, serviceKey: string, table: string, query: URLSearchParams): Promise<T> {
  const result = await fetch(`${baseUrl}/rest/v1/${table}?${query.toString()}`, {
    headers: headers(serviceKey),
  });
  if (!result.ok) throw new Error("Could not load the game view.");
  return await result.json() as T;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin") ?? "";
  if (request.method === "OPTIONS") return respond(204, {}, origin);
  if (request.method !== "POST") return respond(405, { error: "Method not allowed." }, origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return respond(500, { error: "Game view service is not configured." }, origin);

    const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return respond(401, { error: "Sign in is required." }, origin);
    const auth = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
    });
    if (!auth.ok) return respond(401, { error: "Your sign-in session is invalid or expired." }, origin);
    const user = await auth.json();
    if (typeof user?.id !== "string") return respond(401, { error: "Could not verify your account." }, origin);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 2048) return respond(413, { error: "Request is too large." }, origin);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return respond(400, { error: "Request body must be valid JSON." }, origin); }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        typeof (body as Record<string, unknown>).matchId !== "string" ||
        !UUID_PATTERN.test((body as Record<string, string>).matchId)) {
      return respond(400, { error: "A valid matchId is required." }, origin);
    }
    const matchId = (body as Record<string, string>).matchId;

    const matchQuery = new URLSearchParams({
      id: `eq.${matchId}`,
      select: "id,conversation_id,game_key,status,state,version,current_turn_user_id",
      limit: "1",
    });
    const matches = await getRows<Array<Record<string, unknown>>>(supabaseUrl, serviceKey, "game_matches", matchQuery);
    const match = matches[0];
    if (!match || !["uno", "chess"].includes(String(match.game_key))) return respond(404, { error: "Game match not found." }, origin);

    const membershipQuery = new URLSearchParams({
      conversation_id: `eq.${String(match.conversation_id)}`,
      user_id: `eq.${user.id}`,
      select: "user_id",
      limit: "1",
    });
    const memberships = await getRows<Array<{ user_id: string }>>(supabaseUrl, serviceKey, "conversation_members", membershipQuery);
    if (!memberships.length) return respond(403, { error: "You are no longer a member of this conversation." }, origin);

    const playerQuery = new URLSearchParams({
      match_id: `eq.${matchId}`,
      user_id: `eq.${user.id}`,
      select: "response,player_order",
      limit: "1",
    });
    const playerRows = await getRows<Array<{ response: string; player_order: number }>>(
      supabaseUrl, serviceKey, "game_match_players", playerQuery,
    );
    const player = playerRows[0];
    if (!player || player.response !== "accepted") {
      return respond(403, { error: "Only accepted players can view this UNO hand." }, origin);
    }

    const state = match.state && typeof match.state === "object" ? match.state as Record<string, unknown> : {};
    if (match.game_key === "chess") {
      return respond(200, {
        matchId,
        gameKey: "chess",
        status: match.status,
        version: match.version,
        currentTurnUserId: match.current_turn_user_id,
        initialized: state.started === true,
        publicState: state,
        hand: [],
        drawnCardId: null,
        drawPileCount: null,
      }, origin);
    }
    if (state.started !== true) {
      return respond(200, {
        matchId,
        gameKey: "uno",
        status: match.status,
        version: match.version,
        currentTurnUserId: match.current_turn_user_id,
        initialized: false,
        publicState: state,
        hand: [],
        drawnCardId: null,
        drawPileCount: null,
      }, origin);
    }

    const privateQuery = new URLSearchParams({
      match_id: `eq.${matchId}`,
      select: "state",
      limit: "1",
    });
    const privateRows = await getRows<Array<{ state: Record<string, unknown> }>>(
      supabaseUrl, serviceKey, "game_match_private_state", privateQuery,
    );
    const privateState = privateRows[0]?.state;
    if (!privateState || !privateState.hands || typeof privateState.hands !== "object") {
      return respond(500, { error: "Private UNO hand data is unavailable." }, origin);
    }
    const hands = privateState.hands as Record<string, unknown>;
    const hand = hands[user.id];
    if (!Array.isArray(hand)) return respond(403, { error: "Your UNO hand is unavailable." }, origin);

    return respond(200, {
      matchId,
      gameKey: "uno",
      status: match.status,
      version: match.version,
      currentTurnUserId: match.current_turn_user_id,
      initialized: true,
      publicState: state,
      hand,
      drawnCardId: user.id === match.current_turn_user_id && typeof privateState.drawnCardId === "string"
        ? privateState.drawnCardId : null,
      drawPileCount: Array.isArray(privateState.drawPile) ? privateState.drawPile.length : 0,
    }, origin);
  } catch (error) {
    console.error("UNO game view failed:", error instanceof Error ? error.message : "unknown");
    return respond(500, { error: "The UNO game view could not be loaded." }, origin);
  }
});
