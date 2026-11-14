-- Joining players need to explicitly ready up before Ludo can start.
CREATE OR REPLACE FUNCTION public.gather_ludo_join(p_game_id uuid, p_color text)
 RETURNS gather_multiplayer_players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_game public.gather_multiplayer_games; v_player public.gather_multiplayer_players; v_count integer; v_max integer;
begin
  if v_uid is null then raise exception 'Sign in to join Ludo.'; end if;
  if lower(coalesce(p_color,'')) not in ('#d85a60','#39a96b','#d9ad45','#4f83d1') then raise exception 'Choose a valid Ludo color.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='ludo' for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Ludo lobby is no longer available.'; end if;
  if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception 'You cannot join this conversation game.'; end if;
  select * into v_player from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid;
  if v_player.status='joined' then return v_player; end if;
  if coalesce((v_game.state->>'started')::boolean,false) then raise exception 'This Ludo match has already started.'; end if;
  if v_game.join_mode='invite' and coalesce(v_player.status,'') not in ('invited','left') then raise exception 'This Ludo lobby is invite-only.'; end if;
  select count(*) into v_count from public.gather_multiplayer_players where game_id=p_game_id and status='joined';
  v_max:=coalesce((v_game.settings->>'max_players')::integer,4);
  if v_count>=v_max then raise exception 'This Ludo lobby is full.'; end if;
  if exists(
    select 1 from public.gather_multiplayer_players p
    join public.user_blocks b on (b.blocker_id=v_uid and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=v_uid)
    where p.game_id=p_game_id and p.status='joined' and p.user_id<>v_uid
  ) then raise exception 'You cannot join a Ludo lobby with a member you have blocked or who has blocked you.'; end if;
  if exists(select 1 from public.gather_multiplayer_players p where p.game_id=p_game_id and p.status='joined' and p.user_id<>v_uid and lower(p.color)=lower(p_color)) then
    raise exception 'That color is already taken. Choose another.';
  end if;
  insert into public.gather_multiplayer_players(game_id,user_id,status,color,ready,joined_at,updated_at)
  values(p_game_id,v_uid,'joined',upper(p_color),false,now(),now())
  on conflict(game_id,user_id) do update set status='joined',color=upper(excluded.color),ready=false,joined_at=now(),updated_at=now()
  returning * into v_player;
  update public.gather_multiplayer_games set updated_at=now(),revision=revision+1 where id=p_game_id;
  return v_player;
end;
$function$
;
revoke all on function public.gather_ludo_join(uuid,text) from public,anon;
grant execute on function public.gather_ludo_join(uuid,text) to authenticated;
