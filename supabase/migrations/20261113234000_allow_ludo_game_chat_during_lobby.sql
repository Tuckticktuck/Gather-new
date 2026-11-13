-- Allow joined Ludo and UNO players to use temporary game chat in both the lobby and active match.
create or replace function private.gather_game_chat_send(p_game_type text, p_game_id uuid, p_body text)
returns public.gather_game_chat_messages
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_member boolean := false;
  v_row public.gather_game_chat_messages;
begin
  if v_uid is null then
    raise exception 'Sign in to send a game message.';
  end if;
  if p_game_type not in ('tag','uno','ludo') then
    raise exception 'This game chat is unavailable.';
  end if;
  if char_length(btrim(coalesce(p_body,''))) not between 1 and 1200 then
    raise exception 'Messages must be between 1 and 1200 characters.';
  end if;
  if p_game_type = 'tag' then
    select exists(
      select 1 from public.gather_tag_players p
      join public.gather_tag_lobbies l on l.id = p.lobby_id
      where p.lobby_id = p_game_id and p.user_id = v_uid
        and p.status in ('joined','eliminated') and l.status in ('lobby','active')
    ) into v_member;
  elsif p_game_type in ('uno','ludo') then
    select exists(
      select 1 from public.gather_multiplayer_players p
      join public.gather_multiplayer_games g on g.id = p.game_id
      where p.game_id = p_game_id and p.user_id = v_uid and p.status = 'joined'
        and g.game_type = p_game_type and g.status in ('lobby','active')
    ) into v_member;
  end if;
  if not v_member then
    raise exception 'You must be in an active game or its lobby to send messages.';
  end if;
  insert into public.gather_game_chat_messages(game_type,game_id,sender_id,body)
  values(p_game_type,p_game_id,v_uid,btrim(p_body)) returning * into v_row;
  return v_row;
end
$function$;
