create or replace function private.create_game_invitation(p_conversation_id uuid, p_game_key text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_match_id uuid := gen_random_uuid();
  v_message_id uuid;
  v_player_count integer;
  v_order integer := 0;
  v_member record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_conversation_id is null then
    raise exception 'Conversation is required' using errcode = '22023';
  end if;
  if p_game_key is null or p_game_key !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
    raise exception 'Invalid game key' using errcode = '22023';
  end if;

  perform 1
  from public.conversations c
  where c.id = p_conversation_id
  for share;
  if not found or not private.is_conversation_member(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;
  if not private.can_send_message(p_conversation_id)
     or private.is_message_restricted(v_user_id) then
    raise exception 'Messaging is not available for this account or conversation' using errcode = '42501';
  end if;

  select count(*) into v_player_count
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id;
  if v_player_count < 2 then
    raise exception 'A game invitation requires at least two conversation members' using errcode = '22023';
  end if;
  if p_game_key = 'battleship' and v_player_count <> 2 then
    raise exception 'Battleship is available only in one-to-one conversations' using errcode = '22023';
  end if;

  insert into public.game_matches (
    id, conversation_id, game_key, created_by, status, state, version, current_turn_user_id
  ) values (
    v_match_id, p_conversation_id, p_game_key, v_user_id, 'invited', '{}'::jsonb, 1, null
  );

  insert into public.messages (
    conversation_id, sender_id, body, is_admin_message
  ) values (
    p_conversation_id,
    v_user_id,
    '[GATHER_GAME_V2:' || v_match_id::text || ']',
    false
  ) returning id into v_message_id;

  update public.game_matches
  set message_id = v_message_id
  where id = v_match_id;

  for v_member in
    select cm.user_id
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
    order by cm.joined_at, cm.user_id
  loop
    insert into public.game_match_players (
      match_id, user_id, response, player_order, responded_at
    ) values (
      v_match_id,
      v_member.user_id,
      case when v_member.user_id = v_user_id then 'accepted' else 'invited' end,
      v_order,
      case when v_member.user_id = v_user_id then now() else null end
    );
    v_order := v_order + 1;
  end loop;

  insert into public.game_match_events (
    match_id, version, actor_id, event_type, payload
  ) values (
    v_match_id, 1, v_user_id, 'invitation_created',
    jsonb_build_object('gameKey', p_game_key, 'conversationId', p_conversation_id)
  );

  return v_match_id;
end;
$function$;
