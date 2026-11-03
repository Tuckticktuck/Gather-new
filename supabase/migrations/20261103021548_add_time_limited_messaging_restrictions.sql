create table if not exists public.message_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  notice text not null check (char_length(btrim(notice)) between 1 and 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint message_restrictions_expiry_after_creation check (expires_at > created_at)
);

create index if not exists message_restrictions_expires_at_idx
  on public.message_restrictions(expires_at);

alter table public.message_restrictions enable row level security;
revoke all on public.message_restrictions from anon, authenticated;
grant select on public.message_restrictions to authenticated;
grant all on public.message_restrictions to service_role;

drop policy if exists "Members can view their own messaging restriction" on public.message_restrictions;
create policy "Members can view their own messaging restriction"
  on public.message_restrictions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_feedback_admin()));

create or replace function private.is_message_restricted(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.message_restrictions mr
      where mr.user_id = p_user_id
        and mr.expires_at > now()
    );
$function$;

revoke all on function private.is_message_restricted(uuid) from public, anon;
grant execute on function private.is_message_restricted(uuid) to authenticated;

drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and is_admin_message = false
    and (select private.is_conversation_member(conversation_id))
    and (select private.can_send_message(conversation_id))
    and not (select private.is_message_restricted((select auth.uid())))
    and (
      reply_to_id is null
      or (select private.reply_target_is_in_conversation(reply_to_id, conversation_id))
    )
    and (
      attachment_path is null
      or split_part(attachment_path, '/', 1) = conversation_id::text
    )
    and (
      forwarded_from_id is null
      or (select private.forwarded_message_is_accessible(forwarded_from_id))
    )
  );

alter table public.admin_action_logs
  drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs
  add constraint admin_action_logs_action_check
  check (action in (
    'profile_updated',
    'user_banned',
    'user_unbanned',
    'user_deleted',
    'message_reported_user',
    'report_status_updated',
    'account_approval_approved',
    'account_approval_declined',
    'account_approval_revoked',
    'admin_direct_message_sent',
    'messaging_restricted',
    'messaging_restriction_removed'
  ));

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='message_restrictions'
  ) then
    alter publication supabase_realtime add table public.message_restrictions;
  end if;
end
$publication$;

notify pgrst, 'reload schema';