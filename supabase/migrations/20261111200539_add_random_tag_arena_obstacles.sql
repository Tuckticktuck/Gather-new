create or replace function private.gather_multiplayer_move(p_game_id uuid, p_x numeric, p_y numeric)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_game public.gather_multiplayer_games;
  v_player public.gather_multiplayer_players;
  v_target public.gather_multiplayer_players;
  v_obstacle jsonb;
  v_dx numeric;
  v_dy numeric;
begin
  if v_uid is null then raise exception 'Sign in to move.'; end if;
  if p_x is null or p_y is null or p_x<0 or p_x>100 or p_y<0 or p_y>100 then raise exception 'Position is outside the arena.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This game is not active.'; end if;
  if not private.is_conversation_member(v_game.conversation_id) then raise exception 'You cannot access this game.'; end if;
  if not private.can_send_message(v_game.conversation_id) then raise exception 'Game access is unavailable because conversation permissions have changed.'; end if;
  select * into v_player from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid and status='joined' for update;
  if v_player.user_id is null then raise exception 'Join the game before moving.'; end if;
  v_dx:=p_x-v_player.x; v_dy:=p_y-v_player.y;
  if sqrt(v_dx*v_dx+v_dy*v_dy)>7.5 then raise exception 'Movement update is too large. Try again.'; end if;
  if jsonb_typeof(v_game.settings->'obstacles')='array' then
    for v_obstacle in select value from jsonb_array_elements(v_game.settings->'obstacles')
    loop
      if jsonb_typeof(v_obstacle->'x')='number'
         and jsonb_typeof(v_obstacle->'y')='number'
         and jsonb_typeof(v_obstacle->'r')='number'
         and sqrt(power(p_x-(v_obstacle->>'x')::numeric,2)+power(p_y-(v_obstacle->>'y')::numeric,2)) < (v_obstacle->>'r')::numeric+2.3 then
        raise exception 'An obstacle is blocking that path.';
      end if;
    end loop;
  end if;
  update public.gather_multiplayer_players set x=p_x,y=p_y,updated_at=now() where game_id=p_game_id and user_id=v_uid returning * into v_player;
  if v_player.is_it then
    select * into v_target from public.gather_multiplayer_players
    where game_id=p_game_id and status='joined' and user_id<>v_uid
      and sqrt(power(x-p_x,2)+power(y-p_y,2))<=4.2
    order by sqrt(power(x-p_x,2)+power(y-p_y,2)) limit 1 for update;
    if v_target.user_id is not null then
      update public.gather_multiplayer_players set is_it=false,updated_at=now() where game_id=p_game_id and user_id=v_uid;
      update public.gather_multiplayer_players set is_it=true,updated_at=now() where game_id=p_game_id and user_id=v_target.user_id;
    end if;
  end if;
  return jsonb_build_object('game_id',p_game_id,'tagged_user_id',v_target.user_id);
end;
$function$;