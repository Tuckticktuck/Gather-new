import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { AccessToken } from "npm:livekit-server-sdk@2.19.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store"
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "Sign in to Gather before starting a call." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!supabaseUrl || !supabaseKey) return json({ error: "Gather authentication is not configured." }, 500);
  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return json({ error: "Gather calling is not configured yet. The calling-service setup still needs to be completed." }, 503);
  }

  let body: { conversation_id?: unknown; call_id?: unknown };
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
  const callId = typeof body.call_id === "string" ? body.call_id : "";
  if (!UUID_V4.test(conversationId) || !UUID_V4.test(callId)) {
    return json({ error: "Invalid conversation or call identifier." }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: "Bearer " + bearer } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
  if (authError || !authData.user) return json({ error: "Your Gather session is invalid or expired. Sign in again." }, 401);
  const user = authData.user;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations").select("id,kind").eq("id", conversationId).maybeSingle();
  if (conversationError || !conversation || conversation.kind !== "direct") {
    return json({ error: "Calls are available only in an existing private conversation." }, 403);
  }
  const { data: members, error: membersError } = await supabase
    .from("conversation_members").select("user_id").eq("conversation_id", conversationId);
  if (membersError || !Array.isArray(members) || members.length !== 2) {
    return json({ error: "This conversation is not eligible for a one-to-one call." }, 403);
  }
  const memberIds = members.map((member) => member.user_id);
  if (!memberIds.includes(user.id)) return json({ error: "You are not a member of this conversation." }, 403);
  const peerId = memberIds.find((id) => id !== user.id);
  if (!peerId) return json({ error: "A second conversation member is required." }, 403);

  const { data: permission, error: permissionError } = await supabase.rpc("get_direct_chat_status", {
    p_other_user_id: peerId
  });
  if (permissionError || permission?.can_message !== true) {
    return json({ error: "This private conversation is not currently permitted for calls." }, 403);
  }

  try {
    const roomName = "gather-" + conversationId + "-" + callId;
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      ttl: "10m"
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false
    });
    const participantToken = await token.toJwt();
    return json({ server_url: livekitUrl, participant_token: participantToken });
  } catch (error) {
    console.error("LiveKit token creation failed:", error);
    return json({ error: "Gather could not prepare a secure call. Please try again." }, 500);
  }
});
