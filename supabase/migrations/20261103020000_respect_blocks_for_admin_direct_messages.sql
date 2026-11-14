create or replace function private.admin_send_direct_message(
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
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'That member account could not be found.';
  end if;
  if private.is_blocked_between(v_admin_id, p_user_id) then
    raise exception using errcode = '42501', message = 'This member cannot be contacted because a block is in place between the accounts.';
  end if;

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

  update public.conversations set updated_at = now() where id = v_conversation_id;

  insert into public.admin_action_logs(actor_id, target_user_id, action, details)
  values (
    v_admin_id,
    p_user_id,
    'admin_direct_message_sent',
    jsonb_build_object('conversation_id', v_conversation_id, 'message_id', v_message_id)
  );

  return jsonb_build_object('conversation_id', v_conversation_id, 'message_id', v_message_id);
end;
$function$;

notify pgrst, 'reload schema';