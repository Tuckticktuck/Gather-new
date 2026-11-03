import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";

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

function isAdmin(user: { is_anonymous?: boolean; app_metadata?: Record<string, unknown> } | null) {
  return !!user
    && user.is_anonymous !== true
    && user.app_metadata?.gather_role === "admin";
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
  const authenticatedUser = authData?.user ?? null;
  if (authError || !authenticatedUser || !isAdmin(authenticatedUser)) {
    return adminError(403, "Admin Mode is not available for this account.");
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const actorId = authenticatedUser.id;

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
      const [accounts, reports, feedback, announcements, activity, approvals, approvedAccounts] = await Promise.all([
        adminClient.from("profiles").select("id", { count: "exact", head: true }),
        adminClient.from("reports").select("id", { count: "exact", head: true }).neq("status", "resolved"),
        adminClient.from("feedback_threads").select("id", { count: "exact", head: true }).neq("status", "resolved"),
        adminClient.from("admin_announcements").select("id", { count: "exact", head: true }),
        adminClient.from("admin_action_logs").select("id,actor_id,target_user_id,action,details,created_at").order("created_at", { ascending: false }).limit(8),
        adminClient.from("account_approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        adminClient.from("approved_accounts").select("user_id", { count: "exact", head: true }),
      ]);
      const firstError = accounts.error || reports.error || feedback.error || announcements.error || activity.error || approvals.error || approvedAccounts.error;
      if (firstError) return adminError(500, "The admin overview could not be loaded.");
      return response(200, {
        summary: {
          accounts: accounts.count ?? 0,
          reports: reports.count ?? 0,
          feedback: feedback.count ?? 0,
          announcements: announcements.count ?? 0,
          pendingApprovals: approvals.count ?? 0,
          approvedAccounts: approvedAccounts.count ?? 0,
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
      const [profileResult, banResult, approvedResult, restrictionResult] = await Promise.all([
        ids.length
          ? adminClient.from("profiles").select("id,username,display_name,bio,pronouns,banner_style,created_at").in("id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? adminClient.from("admin_bans").select("user_id,reason,created_at").in("user_id", ids).is("lifted_at", null).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? adminClient.from("approved_accounts").select("user_id,approved_at").in("user_id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? adminClient.from("message_restrictions").select("user_id,expires_at,notice,created_at,created_by").in("user_id", ids).gt("expires_at", new Date().toISOString())
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (profileResult.error || banResult.error || approvedResult.error || restrictionResult.error) return adminError(500, "Member account details could not be loaded.");
      const profileById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
      const banById = new Map();
      for (const ban of banResult.data ?? []) if (!banById.has(ban.user_id)) banById.set(ban.user_id, ban);
      const approvedById = new Map((approvedResult.data ?? []).map((item) => [item.user_id, item]));
      const restrictionById = new Map((restrictionResult.data ?? []).map((item) => [item.user_id, item]));
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
            message_restriction: restrictionById.get(user.id) ?? null,
            is_gather_admin: user.app_metadata?.gather_role === "admin",
            is_approved: approvedById.has(user.id),
            approved_at: approvedById.get(user.id)?.approved_at ?? null,
          };
        }),
        page,
        per_page: perPage,
        has_more: users.length === perPage,
      });
    }

    if (action === "set_messaging_restriction") {
      if (!targetId || targetId === actorId) return adminError(400, "Choose another member account.");
      const durationMinutes = Number(payload.duration_minutes);
      const allowedDurations = [15, 30, 60, 360, 1440, 4320, 10080];
      if (!allowedDurations.includes(durationMinutes)) return adminError(400, "Choose a valid restriction duration.");
      const notice = cleanString(payload.notice, 500);
      if (!notice) return adminError(400, "Add a message explaining the restriction.");
      const { data: targetResult, error: targetError } = await adminClient.auth.admin.getUserById(targetId);
      const target = targetResult?.user;
      if (targetError || !target) return adminError(404, "That member account could not be found.");
      if (target.app_metadata?.gather_role === "admin") return adminError(400, "The designated Gather administrator account cannot be restricted.");
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + durationMinutes * 60 * 1000).toISOString();
      const { data, error } = await adminClient.from("message_restrictions").upsert({
        user_id: targetId,
        expires_at: expiresAt,
        notice,
        created_by: actorId,
        created_at: createdAt.toISOString(),
      }, { onConflict: "user_id" })
        .select("user_id,expires_at,notice,created_at,created_by")
        .single();
      if (error || !data) {
        console.error("Messaging restriction could not be saved:", error?.message);
        return adminError(500, "The messaging restriction could not be saved.");
      }
      await writeAdminLog(adminClient, actorId, targetId, "messaging_restricted", {
        expires_at: expiresAt,
        duration_minutes: durationMinutes,
        notice,
      });
      return response(200, { restriction: data });
    }

    if (action === "clear_messaging_restriction") {
      if (!targetId || targetId === actorId) return adminError(400, "Choose another member account.");
      const { data: targetResult, error: targetError } = await adminClient.auth.admin.getUserById(targetId);
      const target = targetResult?.user;
      if (targetError || !target) return adminError(404, "That member account could not be found.");
      if (target.app_metadata?.gather_role === "admin") return adminError(400, "The designated Gather administrator account is protected.");
      const { data, error } = await adminClient.from("message_restrictions")
        .delete()
        .eq("user_id", targetId)
        .select("user_id")
        .maybeSingle();
      if (error) return adminError(500, "The messaging restriction could not be removed.");
      if (data) await writeAdminLog(adminClient, actorId, targetId, "messaging_restriction_removed", {});
      return response(200, { success: true, removed: !!data });
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
      if (target.app_metadata?.gather_role === "admin") {
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

    if (action === "admin_direct_message") {
      if (!targetId) return adminError(400, "Choose a member account first.");
      const body = cleanString(payload.body, 4000);
      if (!body) return adminError(400, "Write a message before sending.");
      const { data, error } = await userClient.rpc("admin_send_direct_message", {
        p_user_id: targetId,
        p_body: body,
      });
      if (error || !data?.conversation_id) {
        console.error("Admin direct message failed:", error?.message ?? "No conversation returned.");
        return adminError(400, error?.message ?? "The Admin message could not be sent.");
      }
      return response(200, {
        conversation_id: data.conversation_id,
        message_id: data.message_id,
      });
    }

    if (action === "message_reported_user") {
      const reportId = cleanString(payload.report_id, 80);
      const body = cleanString(payload.body, 4000);
      if (!reportId) return adminError(400, "Choose a report first.");
      if (!body) return adminError(400, "Write a message before sending.");
      const { data: report, error: reportError } = await adminClient.from("reports")
        .select("id,target_user_id")
        .eq("id", reportId)
        .maybeSingle();
      if (reportError || !report) return adminError(404, "That report could not be found.");
      const targetId = report.target_user_id;
      if (!targetId || targetId === actorId) return adminError(400, "That reported account cannot be contacted.");
      const { data, error } = await userClient.rpc("admin_send_direct_message", {
        p_user_id: targetId,
        p_body: body,
      });
      if (error || !data?.conversation_id) {
        console.error("Admin report follow-up message failed:", error?.message ?? "No conversation returned.");
        return adminError(400, error?.message ?? "The private message could not be sent.");
      }
      await writeAdminLog(adminClient, actorId, targetId, "message_reported_user", {
        report_id: reportId,
        message_id: data.message_id,
      });
      return response(200, { conversation_id: data.conversation_id });
    }

    if (action === "update_report_status") {
      const reportId = cleanString(payload.report_id, 80);
      const status = cleanString(payload.status, 20);
      if (!reportId) return adminError(400, "Choose a report first.");
      if (!["new", "reviewing", "resolved"].includes(status)) {
        return adminError(400, "Choose a valid report status.");
      }
      const { data, error } = await adminClient.from("reports")
        .update({ status })
        .eq("id", reportId)
        .select("id,target_user_id,status")
        .maybeSingle();
      if (error || !data) return adminError(400, "The report status could not be updated.");
      await writeAdminLog(adminClient, actorId, data.target_user_id, "report_status_updated", {
        report_id: data.id,
        status: data.status,
      });
      return response(200, { report: data });
    }


    if (action === "list_approval_data") {
      const [pendingResult, approvedResult] = await Promise.all([
        adminClient.from("account_approval_requests")
          .select("id,user_id,message,created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(200),
        adminClient.from("approved_accounts")
          .select("user_id,approved_at")
          .order("approved_at", { ascending: false })
          .limit(500),
      ]);
      if (pendingResult.error || approvedResult.error) {
        return adminError(500, "Account approval records could not be loaded.");
      }
      const ids = [...new Set([
        ...(pendingResult.data ?? []).map((item) => item.user_id),
        ...(approvedResult.data ?? []).map((item) => item.user_id),
      ])];
      const { data: profiles, error: profileError } = ids.length
        ? await adminClient.from("profiles").select("id,username,display_name,created_at").in("id", ids)
        : { data: [], error: null };
      if (profileError) return adminError(500, "Member profiles for approval records could not be loaded.");
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return response(200, {
        pending: (pendingResult.data ?? []).map((item) => ({
          ...item,
          profile: profileById.get(item.user_id) ?? null,
        })),
        approved: (approvedResult.data ?? []).map((item) => ({
          ...item,
          profile: profileById.get(item.user_id) ?? null,
        })),
      });
    }

    if (action === "review_account_approval") {
      const requestId = cleanString(payload.request_id, 80);
      const decision = cleanString(payload.decision, 20);
      const reviewNote = cleanString(payload.review_note, 500);
      if (!requestId) return adminError(400, "Choose an approval request first.");
      if (!["approve", "decline"].includes(decision)) return adminError(400, "Choose approve or decline.");
      const { data: approvalRequest, error: requestError } = await adminClient
        .from("account_approval_requests")
        .select("id,user_id,status")
        .eq("id", requestId)
        .maybeSingle();
      if (requestError || !approvalRequest) return adminError(404, "That approval request could not be found.");
      if (approvalRequest.status !== "pending") return adminError(409, "That approval request has already been reviewed.");
      if (approvalRequest.user_id === actorId) return adminError(400, "You cannot approve your own account.");
      const { data: targetResult, error: targetError } = await adminClient.auth.admin.getUserById(approvalRequest.user_id);
      const targetUser = targetResult?.user;
      if (targetError || !targetUser) return adminError(404, "That member account could not be found.");
      if (targetUser.app_metadata?.gather_role === "admin") return adminError(400, "The Gather administrator does not need account approval.");
      const now = new Date().toISOString();

      if (decision === "approve") {
        const { data: existing, error: existingError } = await adminClient
          .from("approved_accounts").select("user_id").eq("user_id", approvalRequest.user_id).maybeSingle();
        if (existingError) return adminError(500, "The current approval status could not be checked.");
        if (!existing) {
          const { error: insertError } = await adminClient.from("approved_accounts").insert({
            user_id: approvalRequest.user_id,
            approved_by: actorId,
          });
          if (insertError) return adminError(500, "The approved account badge could not be created.");
        }
        const { data: updated, error: updateError } = await adminClient
          .from("account_approval_requests")
          .update({ status: "approved", reviewed_at: now, reviewed_by: actorId, review_note: reviewNote })
          .eq("id", requestId)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (updateError || !updated) {
          if (!existing) await adminClient.from("approved_accounts").delete().eq("user_id", approvalRequest.user_id);
          return adminError(409, "The approval request changed before it could be saved. Refresh and try again.");
        }
        await writeAdminLog(adminClient, actorId, approvalRequest.user_id, "account_approval_approved", { request_id: requestId });
        return response(200, { success: true, decision, user_id: approvalRequest.user_id });
      }

      const { data: updated, error: updateError } = await adminClient
        .from("account_approval_requests")
        .update({ status: "declined", reviewed_at: now, reviewed_by: actorId, review_note: reviewNote })
        .eq("id", requestId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (updateError || !updated) return adminError(409, "The approval request changed before it could be saved. Refresh and try again.");
      await writeAdminLog(adminClient, actorId, approvalRequest.user_id, "account_approval_declined", { request_id: requestId });
      return response(200, { success: true, decision, user_id: approvalRequest.user_id });
    }

    if (action === "revoke_account_approval") {
      if (!targetId) return adminError(400, "Choose an approved member first.");
      if (targetId === actorId) return adminError(400, "You cannot revoke your own administrator account approval.");
      const { data: targetResult, error: targetError } = await adminClient.auth.admin.getUserById(targetId);
      const targetUser = targetResult?.user;
      if (targetError || !targetUser) return adminError(404, "That member account could not be found.");
      if (targetUser.app_metadata?.gather_role === "admin") return adminError(400, "The Gather administrator account is protected.");
      const { data: existing, error: existingError } = await adminClient
        .from("approved_accounts").select("user_id,approved_at,approved_by").eq("user_id", targetId).maybeSingle();
      if (existingError || !existing) return adminError(404, "That account is not currently approved.");
      const now = new Date().toISOString();
      const { data: updatedRequests, error: requestError } = await adminClient
        .from("account_approval_requests")
        .update({ status: "revoked", reviewed_at: now, reviewed_by: actorId })
        .eq("user_id", targetId)
        .eq("status", "approved")
        .select("id");
      if (requestError || !updatedRequests?.length) return adminError(500, "The approval history could not be updated.");
      const { error: deleteError } = await adminClient.from("approved_accounts").delete().eq("user_id", targetId);
      if (deleteError) {
        await adminClient.from("account_approval_requests")
          .update({ status: "approved", reviewed_at: existing.approved_at, reviewed_by: existing.approved_by })
          .eq("user_id", targetId)
          .eq("status", "revoked");
        return adminError(500, "The approved badge could not be revoked. No account status change was kept.");
      }
      await writeAdminLog(adminClient, actorId, targetId, "account_approval_revoked", {});
      return response(200, { success: true, user_id: targetId });
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
