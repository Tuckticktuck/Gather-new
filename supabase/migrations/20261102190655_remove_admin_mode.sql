-- Remove the Gather Admin Mode backend and keep feedback private to its owner.
drop policy if exists "Feedback owners and admin can view threads" on public.feedback_threads;
create policy "Feedback owners can view their own threads"
  on public.feedback_threads for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Only the feedback admin can update thread status" on public.feedback_threads;

drop policy if exists "Thread participants can read feedback messages" on public.feedback_messages;
create policy "Feedback owners can read their own messages"
  on public.feedback_messages for select to authenticated
  using (exists (
    select 1 from public.feedback_threads t
    where t.id = feedback_messages.thread_id
      and t.user_id = (select auth.uid())
  ));

drop policy if exists "Thread participants can reply as themselves" on public.feedback_messages;
create policy "Feedback owners can reply to their own threads"
  on public.feedback_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.feedback_threads t
      where t.id = feedback_messages.thread_id
        and t.user_id = (select auth.uid())
    )
  );

drop policy if exists "Feedback admin can read reports" on public.reports;
drop policy if exists "Feedback admin can update report status" on public.reports;

drop policy if exists "Only Gather admins can edit announcements" on public.admin_announcements;
drop policy if exists "Only Gather admins can publish announcements" on public.admin_announcements;
drop policy if exists "Signed-in members can read announcements" on public.admin_announcements;
alter table public.admin_announcements enable row level security;
revoke all on public.admin_announcements from anon, authenticated;

drop table if exists public.admin_action_logs;
drop table if exists public.admin_bans;
drop function if exists private.is_feedback_admin();
