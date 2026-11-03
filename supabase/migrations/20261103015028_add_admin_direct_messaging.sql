alter table public.conversations
  add column if not exists admin_initiated boolean not null default false;

alter table public.messages
  add column if not exists is_admin_message boolean not null default false;

-- Regular authenticated clients may not create or reclassify messages as Gather Admin.
drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and is_admin_message = false
    and (select private.is_conversation_member(conversation_id))
    and (select private.can_send_message(conversation_id))
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

drop policy if exists "Senders can edit their own message text" on public.messages;
create policy "Senders can edit their own message text"
  on public.messages for update to authenticated
  using (
    sender_id = (select auth.uid())
    and is_admin_message = false
    and (select private.is_conversation_member(conversation_id))
  )
  with check (
    sender_id = (select auth.uid())
    and is_admin_message = false
    and (select private.is_conversation_member(conversation_id))
    and (
      attachment_path is null
      or split_part(attachment_path, '/', 1) = conversation_id::text
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
    'admin_direct_message_sent'
  ));

create or replace function public.admin_send_direct_message(
  p_user_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_conversation_id uuid;
  v_message_id uuid;
begin
  if v_admin_id is null or not private.is_feedback_admin() then
    raise exception using errcode = '42501', message = 'Only Gather Admin can send admin direct messages.';
  end if;

  if p_user_id is null or p_user_id = v_admin_id then
    raise exception using errcode = '22023', message = 'Choose another member account.';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception using errcode = '22023', message = 'The message must be between 1 and 4,000 characters.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'That member account could not be found.';
  end if;

  -- Serialize sends to the same member so repeated sends reuse one admin thread.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_admin_id::text),
    pg_catalog.hashtext(p_user_id::text)
  );

  select c.id into v_conversation_id
  from public.conversations c
  where c.kind = 'direct'
    and c.admin_initiated = true
    and c.created_by = v_admin_id
    and (select count(*) from public.conversation_members cm
         where cm.conversation_id = c.id) = 2
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = v_admin_id
    )
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = p_user_id
    )
  order by c.updated_at desc
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations(kind, created_by, admin_initiated)
    values ('direct', v_admin_id, true)
    returning id into v_conversation_id;

    insert into public.conversation_members(conversation_id, user_id, role)
    values
      (v_conversation_id, v_admin_id, 'member'),
      (v_conversation_id, p_user_id, 'member');
  end if;

  insert into public.messages(conversation_id, sender_id, body, is_admin_message)
  values (v_conversation_id, v_admin_id, v_body, true)
  returning id into v_message_id;

  update public.conversations
  set updated_at = now()
  where id = v_conversation_id;

  insert into public.admin_action_logs(actor_id, target_user_id, action, details)
  values (
    v_admin_id,
    p_user_id,
    'admin_direct_message_sent',
    jsonb_build_object(
      'conversation_id', v_conversation_id,
      'message_id', v_message_id
    )
  );

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'message_id', v_message_id
  );
end;
$function$;

revoke all on function public.admin_send_direct_message(uuid, text) from public, anon;
grant execute on function public.admin_send_direct_message(uuid, text) to authenticated;

-- Keep the existing report-follow-up action, but route it through the same official,
-- auditable Admin conversation path.
create or replace function public.admin_message_reported_user(
  p_report_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid := (select auth.uid());
  v_target_id uuid;
  v_result jsonb;
begin
  if v_admin_id is null or not private.is_feedback_admin() then
    raise exception using errcode = '42501', message = 'Only Gather Admin can contact a reported member.';
  end if;

  if p_report_id is null then
    raise exception using errcode = '22023', message = 'A report is required.';
  end if;

  select r.target_user_id into v_target_id
  from public.reports r
  where r.id = p_report_id;

  if v_target_id is null or v_target_id = v_admin_id then
    raise exception using errcode = '22023', message = 'The reported member could not be found.';
  end if;

  v_result := public.admin_send_direct_message(v_target_id, p_body);
  return (v_result ->> 'conversation_id')::uuid;
end;
$function$;

revoke all on function public.admin_message_reported_user(uuid, text) from public, anon;
grant execute on function public.admin_message_reported_user(uuid, text) to authenticated;

notify pgrst, 'reload schema';