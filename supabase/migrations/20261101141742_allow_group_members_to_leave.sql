create or replace function private.leave_group_chat(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_kind text;
  v_role text;
  v_next_owner uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in.';
  end if;

  select c.kind into v_kind
  from public.conversations c
  where c.id = p_conversation_id
  for update;

  if not found then
    raise exception 'That conversation could not be found.';
  end if;

  if v_kind <> 'group' then
    raise exception 'You can only leave group chats.';
  end if;

  select cm.role into v_role
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_me
  for update;

  if not found then
    raise exception 'You are no longer a member of this group.';
  end if;

  -- Keep at least one owner while there are still members in the group.
  if v_role = 'owner'
     and not exists (
       select 1
       from public.conversation_members cm
       where cm.conversation_id = p_conversation_id
         and cm.user_id <> v_me
         and cm.role = 'owner'
     ) then
    select cm.user_id into v_next_owner
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id <> v_me
    order by cm.joined_at asc, cm.user_id asc
    limit 1
    for update;

    if v_next_owner is not null then
      update public.conversation_members
      set role = 'owner'
      where conversation_id = p_conversation_id
        and user_id = v_next_owner;
    end if;
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id = v_me;

  return jsonb_build_object(
    'status', 'left',
    'new_owner_id', v_next_owner
  );
end;
$function$;

create or replace function public.leave_group_chat(p_conversation_id uuid)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.leave_group_chat(p_conversation_id);
$function$;

revoke all on function private.leave_group_chat(uuid) from public, anon;
grant execute on function private.leave_group_chat(uuid) to authenticated;
revoke all on function public.leave_group_chat(uuid) from public, anon;
grant execute on function public.leave_group_chat(uuid) to authenticated;
