import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const GATHER_ADMIN_EMAIL = "landoncordeiro237@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function adminError(status: number, message: string) {
  return response(status, { error: message });
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isAdmin(user: { email?: string; is_anonymous?: boolean } | null) {
  return !!user
    && user.is_anonymous !== true
    && String(user.email ?? "").trim().toLowerCase() === GATHER_ADMIN_EMAIL;
}

async function writeAdminLog(
  adminClient: ReturnType<typeof createClient>,
  actorId: string,
  targetUserId: string | null,
  action: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await adminClient.from("admin_action_logs").insert({
    actor_id: actorId,
    target_user_id: targetUserId,
    action,
    details,
  });
  if (error) console.error("Admin audit log insert failed:", error.message);
  return !error;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return adminError(405, "Use POST for Admin Mode actions.");
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    console.error("Admin function is missing Supabase environment variables.");
    return adminError(500, "Admin services are not configured yet.");
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return adminError(401, "Please sign in again.");
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !isAdmin(authData.user)) return adminError(403, "Admin Mode is not available for this account.");

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const actorId = authData.user.id;

  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 20000) return adminError(413, "That Admin Mode request is too large.");
    payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return adminError(400, "A valid Admin Mode request is required.");
    }
  } catch {
    return adminError(400, "The request body must be valid JSON.");
  }

  const action = cleanString(payload.action, 48);
  const targetId = cleanString(payload.user_id, 80);

  try {
    if (action === "summary") {
      const [accounts, reports, feedback, announcements, activity] = await Promise.all([
        adminClient.from("profiles").select("id", { count: "exact", head: true }),
        adminClient.from("reports").select("id", { count: "exact", head: true }).neq("status", "resolved"),
        adminClient.from("feedback_threads").select("id", { count: "exact", head: true }).neq("status", "resolved"),
        adminClient.from("admin_announcements").select("id", { count: "exact", head: true }),
        adminClient.from("admin_action_logs").select("id,actor_id,target_user_id,action,details,created_at").order("created_at", { ascending: false }).limit(8),
      ]);
      const firstError = accounts.error || reports.error || feedback.error || announcements.error || activity.error;
      if (firstError) return adminError(500, "The admin overview could not be loaded.");
      return response(200, {
        summary: {
          accounts: accounts.count ?? 0,
          reports: reports.count ?? 0,
          feedback: feedback.count ?? 0,
          announcements: announcements.count ?? 0,
        },
        activity: activity.data ?? [],
      });
    }

    if (action === "list_users") {
      const page = Math.max(1, Math.min(10000, Number(payload.page) || 1));
      const perPage = Math.max(1, Math.min(50, Number(payload.per_page) || 50));
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error) return adminError(500, "Member accounts could not be loaded.");
      const users = data.users ?? [];
      const ids = users.map((user) => user.id);
      const [profileResult, banResult] = await Promise.all([
        ids.length
          ? adminClient.from("profiles").select("id,username,display_name,bio,pronouns,banner_style,created_at").in("id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? adminClient.from("admin_bans").select("user_id,reason,created_at").in("user_id", ids).is("lifted_at", null).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (profileResult.error || banResult.error) return adminError(500, "Member account details could not be loaded.");
      const profileById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
      const banById = new Map();
      for (const ban of banResult.data ?? []) if (!banById.has(ban.user_id)) banById.set(ban.user_id, ban);
      return response(200, {
        users: users.map((user) => {
          const profile = profileById.get(user.id) ?? {};
          const ban = banById.get(user.id) ?? null;
          return {
            id: user.id,
            email: user.email ?? "",
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at ?? null,
            email_confirmed_at: user.email_confirmed_at ?? null,
            banned_until: user.banned_until ?? null,
            is_anonymous: user.is_anonymous === true,
            username: profile.username ?? "",
            display_name: profile.display_name ?? "",
            bio: profile.bio ?? "",
            pronouns: profile.pronouns ?? "",
            banner_style: profile.banner_style ?? "violet",
            profile_created_at: profile.created_at ?? null,
            active_ban_reason: ban?.reason ?? "",
          };
        }),
        page,
        per_page: perPage,
        has_more: users.length === perPage,
      });
    }

    if (action === "update_profile") {
      if (!targetId) return adminError(400, "Choose a member account first.");
      const input = payload.profile && typeof payload.profile === "object" && !Array.isArray(payload.profile)
        ? payload.profile as Record<string, unknown>
        : {};
      const profile: Record<string, string> = {};
      if (Object.hasOwn(input, "username")) {
        const value = cleanString(input.username, 24).toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(value)) return adminError(400, "Usernames must be 3–24 characters using lowercase letters, numbers, or underscores.");
        profile.username = value;
      }
      if (Object.hasOwn(input, "display_name")) {
        const value = cleanString(input.display_name, 50);
        if (!value) return adminError(400, "Display names cannot be empty.");
        profile.display_name = value;
      }
      if (Object.hasOwn(input, "bio")) profile.bio = cleanString(input.bio, 160);
      if (Object.hasOwn(input, "pronouns")) profile.pronouns = cleanString(input.pronouns, 35);
      if (Object.hasOwn(input, "banner_style")) {
        const value = cleanString(input.banner_style, 12);
        if (!["violet", "blue", "mint", "rose", "amber", "teal"].includes(value)) return adminError(400, "Choose a valid profile banner style.");
        profile.banner_style = value;
      }
      if (!Object.keys(profile).length) return adminError(400, "There are no profile changes to save.");
      const { data, error } = await adminClient.from("profiles").update(profile).eq("id", targetId)
        .select("id,username,display_name,bio,pronouns,banner_style").maybeSingle();
      if (error || !data) return adminError(400, error?.message || "That profile could not be updated.");
      await writeAdminLog(adminClient, actorId, targetId, "profile_updated", { fields: Object.keys(profile) });
      return response(200, { profile: data });
    }

    if (action === "ban_user" || action === "unban_user" || action === "delete_user") {
      if (!targetId) return adminError(400, "Choose a member account first.");
      if (targetId === actorId) return adminError(400, "You cannot ban or delete your own administrator account.");
      const { data: targetResult, error: targetError } = await adminClient.auth.admin.getUserById(targetId);
      const target = targetResult?.user;
      if (targetError || !target) return adminError(404, "That account could not be found.");
      if (String(target.email ?? "").trim().toLowerCase() === GATHER_ADMIN_EMAIL) {
        return adminError(400, "The designated Gather administrator account is protected.");
      }

      if (action === "ban_user") {
        const reason = cleanString(payload.reason, 1000);
        if (!reason) return adminError(400, "Add a reason for this ban.");
        const { error } = await adminClient.auth.admin.updateUserById(targetId, { ban_duration: "876000h" });
        if (error) return adminError(400, "That member could not be banned: " + error.message);
        await adminClient.from("admin_bans").update({ lifted_at: new Date().toISOString() }).eq("user_id", targetId).is("lifted_at", null);
        const { error: banLogError } = await adminClient.from("admin_bans").insert({
          user_id: targetId, reason, created_by: actorId,
        });
        await writeAdminLog(adminClient, actorId, targetId, "user_banned", { reason });
        return response(200, { success: true, audit_logged: !banLogError });
      }

      if (action === "unban_user") {
        const { error } = await adminClient.auth.admin.updateUserById(targetId, { ban_duration: "none" });
        if (error) return adminError(400, "That member could not be unbanned: " + error.message);
        await adminClient.from("admin_bans").update({ lifted_at: new Date().toISOString() }).eq("user_id", targetId).is("lifted_at", null);
        await writeAdminLog(adminClient, actorId, targetId, "user_unbanned", {});
        return response(200, { success: true });
      }

      // Ban first so a still-valid access token is rejected while deletion runs.
      const { error: banError } = await adminClient.auth.admin.updateUserById(targetId, { ban_duration: "876000h" });
      if (banError) return adminError(400, "The account could not be secured before deletion: " + banError.message);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetId, false);
      if (deleteError) {
        await adminClient.from("admin_bans").update({ lifted_at: new Date().toISOString() }).eq("user_id", targetId).is("lifted_at", null);
        await adminClient.from("admin_bans").insert({
          user_id: targetId,
          reason: "Account deletion was requested by Gather Admin but could not complete: " + deleteError.message.slice(0, 700),
          created_by: actorId,
        });
        await writeAdminLog(adminClient, actorId, targetId, "user_banned", { reason: "Deletion failed; account was left banned for safety." });
        return adminError(409, "The account is now blocked, but deletion could not finish. " + deleteError.message);
      }
      await writeAdminLog(adminClient, actorId, targetId, "user_deleted", { email: target.email ?? "" });
      return response(200, { success: true });
    }

    if (action === "list_audit") {
      const { data, error } = await adminClient.from("admin_action_logs")
        .select("id,actor_id,target_user_id,action,details,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return adminError(500, "Admin activity could not be loaded.");
      return response(200, { activity: data ?? [] });
    }

    return adminError(400, "That Admin Mode action is not supported.");
  } catch (error) {
    console.error("Admin Mode action failed:", error);
    return adminError(500, "Admin Mode could not complete that action. Please try again.");
  }
});
