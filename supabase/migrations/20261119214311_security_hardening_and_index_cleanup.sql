-- Gather security and index cleanup.
-- Keep the existing public RPC signatures, but put privileged implementations
-- in the non-exposed private schema and make public wrappers SECURITY INVOKER.

-- Deny direct client access to tables that are intentionally managed only
-- through ownership-checked / admin-checked SECURITY DEFINER RPCs.
drop policy if exists "Deny direct client access" on public.age_change_requests;
create policy "Deny direct client access"
  on public.age_change_requests
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists "Deny direct client access" on public.conversation_unread_markers;
create policy "Deny direct client access"
  on public.conversation_unread_markers
  for all
  to authenticated
  using (false)
  with check (false);

comment on table public.age_change_requests is
  'Direct client table access is intentionally denied. Use the authenticated age-change RPCs; admin operations enforce Gather Admin authorization.';
comment on table public.conversation_unread_markers is
  'Direct client table access is intentionally denied. Use membership-checked unread-marker RPCs.';

-- Private implementations retain the existing authorization checks.
create or replace function private.delete_own_feedback_request(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'You must be signed in to delete feedback.';
  end if;

  if p_thread_id is null then
    raise exception using errcode = '22023', message = 'A feedback request is required.';
  end if;

  delete from public.feedback_threads as ft
  where ft.id = p_thread_id
    and ft.user_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'This feedback request is unavailable or you do not have permission to delete it.';
  end if;
end;
$function$;

create or replace function private.edit_own_feedback_request(
  p_thread_id uuid,
  p_subject text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_initial_message_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'You must be signed in to edit feedback.';
  end if;

  if p_thread_id is null then
    raise exception using errcode = '22023', message = 'A feedback request is required.';
  end if;

  if char_length(v_subject) < 3 or char_length(v_subject) > 100 then
    raise exception using errcode = '22023', message = 'The subject must be between 3 and 100 characters.';
  end if;

  if char_length(v_message) < 1 or char_length(v_message) > 4000 then
    raise exception using errcode = '22023', message = 'The original message must be between 1 and 4,000 characters.';
  end if;

  select fm.id
    into v_initial_message_id
  from public.feedback_messages as fm
  where fm.thread_id = p_thread_id
    and fm.sender_id = v_user_id
  order by fm.created_at asc, fm.id asc
  limit 1;

  if v_initial_message_id is null then
    raise exception using errcode = '42501', message = 'This feedback request is unavailable or cannot be edited.';
  end if;

  update public.feedback_threads as ft
  set subject = v_subject
  where ft.id = p_thread_id
    and ft.user_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'This feedback request is unavailable or cannot be edited.';
  end if;

  update public.feedback_messages as fm
  set body = v_message
  where fm.id = v_initial_message_id
    and fm.thread_id = p_thread_id
    and fm.sender_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'The original feedback message could not be edited.';
  end if;
end;
$function$;

create or replace function private.get_oldest_unread_message(p_conversation_id uuid)
returns table(message_id uuid, created_at timestamp with time zone)
language sql
stable
security definer
set search_path to ''
as $function$
  select m.id, m.created_at
  from public.messages m
  left join public.message_reads mr
    on mr.message_id = m.id
   and mr.user_id = (select auth.uid())
  left join public.user_deleted_messages udm
    on udm.message_id = m.id
   and udm.user_id = (select auth.uid())
  left join public.conversation_unread_markers marker
    on marker.conversation_id = m.conversation_id
   and marker.user_id = (select auth.uid())
  left join public.messages marker_message
    on marker_message.id = marker.message_id
  where p_conversation_id is not null
    and (select auth.uid()) is not null
    and m.conversation_id = p_conversation_id
    and m.sender_id <> (select auth.uid())
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id = (select auth.uid())
    )
    and udm.message_id is null
    and (
      mr.message_id is null
      or (
        marker_message.id is not null
        and (m.created_at, m.id) >= (marker_message.created_at, marker_message.id)
      )
    )
  order by m.created_at asc, m.id asc
  limit 1;
$function$;

create or replace function private.mark_conversation_unread(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_message_id uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = v_me
  ) then
    raise exception 'You are not a member of this conversation.';
  end if;

  select m.id
    into v_message_id
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id <> v_me
    and not exists (
      select 1
      from public.user_deleted_messages udm
      where udm.message_id = m.id
        and udm.user_id = v_me
    )
  order by m.created_at desc, m.id desc
  limit 1;

  if v_message_id is null then
    return false;
  end if;

  insert into public.conversation_unread_markers(user_id, conversation_id, message_id)
  values (v_me, p_conversation_id, v_message_id)
  on conflict (user_id, conversation_id)
  do update set message_id = excluded.message_id, marked_at = now();

  return true;
end;
$function$;

-- Public RPCs remain available to authenticated clients, but do not themselves
-- execute with elevated privileges. Only their private helpers do so.
create or replace function public.delete_own_feedback_request(p_thread_id uuid)
returns void
language sql
security invoker
set search_path to ''
as $function$
  select private.delete_own_feedback_request(p_thread_id);
$function$;

create or replace function public.edit_own_feedback_request(p_thread_id uuid, p_subject text, p_message text)
returns void
language sql
security invoker
set search_path to ''
as $function$
  select private.edit_own_feedback_request(p_thread_id, p_subject, p_message);
$function$;

create or replace function public.get_oldest_unread_message(p_conversation_id uuid)
returns table(message_id uuid, created_at timestamp with time zone)
language sql
stable
security invoker
set search_path to ''
as $function$
  select result.message_id, result.created_at
  from private.get_oldest_unread_message(p_conversation_id) as result;
$function$;

create or replace function public.mark_conversation_unread(p_conversation_id uuid)
returns boolean
language sql
security invoker
set search_path to ''
as $function$
  select private.mark_conversation_unread(p_conversation_id);
$function$;

grant usage on schema private to authenticated, service_role;

revoke all on function private.delete_own_feedback_request(uuid) from public, anon;
revoke all on function private.edit_own_feedback_request(uuid, text, text) from public, anon;
revoke all on function private.get_oldest_unread_message(uuid) from public, anon;
revoke all on function private.mark_conversation_unread(uuid) from public, anon;
grant execute on function private.delete_own_feedback_request(uuid) to authenticated, service_role;
grant execute on function private.edit_own_feedback_request(uuid, text, text) to authenticated, service_role;
grant execute on function private.get_oldest_unread_message(uuid) to authenticated, service_role;
grant execute on function private.mark_conversation_unread(uuid) to authenticated, service_role;

revoke all on function public.delete_own_feedback_request(uuid) from public, anon;
revoke all on function public.edit_own_feedback_request(uuid, text, text) from public, anon;
revoke all on function public.get_oldest_unread_message(uuid) from public, anon;
revoke all on function public.mark_conversation_unread(uuid) from public, anon;
grant execute on function public.delete_own_feedback_request(uuid) to authenticated, service_role;
grant execute on function public.edit_own_feedback_request(uuid, text, text) to authenticated, service_role;
grant execute on function public.get_oldest_unread_message(uuid) to authenticated, service_role;
grant execute on function public.mark_conversation_unread(uuid) to authenticated, service_role;

-- The unique (match_id, version) constraint already supplies this exact index.
-- Removing the additional non-unique copy preserves uniqueness and saves writes.
drop index if exists public.game_match_events_match_order_idx;
