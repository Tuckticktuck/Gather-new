
-- Restore Admin Mode using a server-managed auth app_metadata role.
create or replace function private.is_feedback_admin()
returns boolean
language sql
stable
set search_path = pg_catalog, auth
as $function$
  select coalesce(auth.jwt()->'app_metadata'->>'gather_role','') = 'admin'
    and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true';
$function$;

grant usage on schema private to authenticated;
revoke all on function private.is_feedback_admin() from public, anon;
grant execute on function private.is_feedback_admin() to authenticated;

create table if not exists public.admin_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);
create index if not exists admin_bans_user_active_idx on public.admin_bans(user_id, created_at desc) where lifted_at is null;
alter table public.admin_bans enable row level security;
revoke all on public.admin_bans from anon, authenticated;
grant select on public.admin_bans to authenticated;
grant all on public.admin_bans to service_role;
drop policy if exists "Gather admins can view moderation bans" on public.admin_bans;
create policy "Gather admins can view moderation bans" on public.admin_bans for select to authenticated using ((select private.is_feedback_admin()));

create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid,
  action text not null check (action in ('profile_updated','user_banned','user_unbanned','user_deleted','message_reported_user','report_status_updated')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists admin_action_logs_created_idx on public.admin_action_logs(created_at desc);
create index if not exists admin_action_logs_target_idx on public.admin_action_logs(target_user_id, created_at desc);
alter table public.admin_action_logs enable row level security;
revoke all on public.admin_action_logs from anon, authenticated;
grant select on public.admin_action_logs to authenticated;
grant all on public.admin_action_logs to service_role;
drop policy if exists "Gather admins can view admin action logs" on public.admin_action_logs;
create policy "Gather admins can view admin action logs" on public.admin_action_logs for select to authenticated using ((select private.is_feedback_admin()));

drop policy if exists "Feedback owners can view their own threads" on public.feedback_threads;
drop policy if exists "Feedback owners and admin can view threads" on public.feedback_threads;
create policy "Feedback owners and admin can view threads" on public.feedback_threads for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_feedback_admin()));
drop policy if exists "Only the feedback admin can update thread status" on public.feedback_threads;
create policy "Only the feedback admin can update thread status" on public.feedback_threads for update to authenticated
  using ((select private.is_feedback_admin())) with check ((select private.is_feedback_admin()));

drop policy if exists "Feedback owners can read their own messages" on public.feedback_messages;
drop policy if exists "Thread participants can read feedback messages" on public.feedback_messages;
create policy "Thread participants can read feedback messages" on public.feedback_messages for select to authenticated
  using (exists (select 1 from public.feedback_threads t where t.id = feedback_messages.thread_id and (t.user_id = (select auth.uid()) or (select private.is_feedback_admin()))));
drop policy if exists "Feedback owners can reply to their own threads" on public.feedback_messages;
drop policy if exists "Thread participants can reply as themselves" on public.feedback_messages;
create policy "Thread participants can reply as themselves" on public.feedback_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and exists (select 1 from public.feedback_threads t where t.id = feedback_messages.thread_id and (t.user_id = (select auth.uid()) or (select private.is_feedback_admin()))));

drop policy if exists "Feedback admin can read reports" on public.reports;
create policy "Feedback admin can read reports" on public.reports for select to authenticated using ((select private.is_feedback_admin()));
drop policy if exists "Feedback admin can update report status" on public.reports;
create policy "Feedback admin can update report status" on public.reports for update to authenticated using ((select private.is_feedback_admin())) with check ((select private.is_feedback_admin()));

alter table public.admin_announcements enable row level security;
revoke all on public.admin_announcements from anon, authenticated;
grant select, insert, update on public.admin_announcements to authenticated;
grant all on public.admin_announcements to service_role;
drop policy if exists "Signed-in members can read announcements" on public.admin_announcements;
create policy "Signed-in members can read announcements" on public.admin_announcements for select to authenticated using (true);
drop policy if exists "Only Gather admins can publish announcements" on public.admin_announcements;
create policy "Only Gather admins can publish announcements" on public.admin_announcements for insert to authenticated with check ((select private.is_feedback_admin()));
drop policy if exists "Only Gather admins can edit announcements" on public.admin_announcements;
create policy "Only Gather admins can edit announcements" on public.admin_announcements for update to authenticated using ((select private.is_feedback_admin())) with check ((select private.is_feedback_admin()));
