-- Harden Snake Arena host and leave lifecycle; these are the live corrected function definitions.
CREATE OR REPLACE FUNCTION public.gather_snake_leave(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_state jsonb;
  v_snakes jsonb;
  v_joined integer;
  v_alive integer;
  v_winner uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.status <> 'active' then
    raise exception 'This Snake Arena lobby is already closed.';
  end if;
  if not exists (
    select 1 from public.gather_multiplayer_players
     where game_id = p_game_id and user_id = auth.uid() and status = 'joined'
  ) then raise exception 'You are not a joined player in this Snake Arena lobby.'; end if;

  update public.gather_multiplayer_players
     set status = 'left', ready = false, updated_at = now()
   where game_id = p_game_id and user_id = auth.uid();
  delete from private.gather_snake_inputs
   where game_id = p_game_id and user_id = auth.uid();

  if v_game.state->>'phase' = 'lobby' then
    if v_game.created_by = auth.uid() then
      update public.gather_multiplayer_games
         set status = 'cancelled',
             state = jsonb_set(
               jsonb_set(v_game.state,'{phase}','"finished"'::jsonb,true),
               '{finishReason}',to_jsonb('host-left'::text),true
             ),
             revision = revision + 1,
             updated_at = now()
       where id = p_game_id;
    else
      update public.gather_multiplayer_games
         set revision = revision + 1, updated_at = now()
       where id = p_game_id;
    end if;
    return true;
  end if;

  select coalesce(jsonb_agg(
    case when item.value->>'user_id' = auth.uid()::text
         then jsonb_set(item.value,'{alive}','false'::jsonb,true)
         else item.value end
    order by item.ordinality
  ),'[]'::jsonb)
    into v_snakes
    from jsonb_array_elements(v_game.state->'snakes') with ordinality as item(value,ordinality);

  v_state := jsonb_set(v_game.state,'{snakes}',v_snakes,true);

  select count(*) into v_joined
    from public.gather_multiplayer_players
   where game_id = p_game_id and status = 'joined';
  select count(*) into v_alive
    from jsonb_array_elements(v_snakes) s(value)
   where coalesce((s.value->>'alive')::boolean,false);

  if v_joined = 0 or v_alive <= 1 then
    select (s.value->>'user_id')::uuid into v_winner
      from jsonb_array_elements(v_snakes) s(value)
     where coalesce((s.value->>'alive')::boolean,false)
     limit 1;
    v_state := jsonb_set(v_state,'{phase}','"finished"'::jsonb,true);
    v_state := jsonb_set(v_state,'{winnerId}',coalesce(to_jsonb(v_winner),'null'::jsonb),true);
    v_state := jsonb_set(v_state,'{finishReason}',to_jsonb('player-left'::text),true);
    update public.gather_multiplayer_games
       set status = 'completed',
           state = v_state,
           revision = revision + 1,
           updated_at = now()
     where id = p_game_id;
    delete from private.gather_snake_inputs where game_id = p_game_id;
  else
    update public.gather_multiplayer_games
       set state = v_state,
           revision = revision + 1,
           updated_at = now()
     where id = p_game_id;
  end if;

  return true;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_start(p_game_id uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_player record;
  v_count integer;
  v_index integer := 0;
  v_width integer;
  v_height integer;
  v_cx integer;
  v_cy integer;
  v_round_seconds integer;
  v_interval integer;
  v_now timestamptz := clock_timestamp();
  v_snakes jsonb := '[]'::jsonb;
  v_obstacles jsonb := '[]'::jsonb;
  v_food jsonb;
  v_segments jsonb;
  v_direction text;
  v_x integer;
  v_y integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.status <> 'active' or v_game.state->>'phase' <> 'lobby' then
    raise exception 'This Snake Arena lobby cannot be started.';
  end if;
  if v_game.created_by <> auth.uid() then raise exception 'Only the host can start Snake Arena.'; end if;
  if not exists (
    select 1 from public.gather_multiplayer_players
     where game_id = p_game_id and user_id = auth.uid() and status = 'joined'
  ) then raise exception 'The host must still be in the lobby to start Snake Arena.'; end if;

  select count(*) into v_count
    from public.gather_multiplayer_players
   where game_id = p_game_id and status = 'joined';
  if v_count < 2 then raise exception 'At least two players are needed to start.'; end if;
  if v_count > coalesce((v_game.settings->>'max_players')::integer,8) then
    raise exception 'The lobby has more players than its configured limit.';
  end if;
  if exists (
    select 1 from public.gather_multiplayer_players
     where game_id = p_game_id and status = 'joined' and not ready
  ) then
    raise exception 'Everyone who joined must be ready before the match starts.';
  end if;

  v_width := case v_game.settings->>'arena' when 'small' then 20 when 'large' then 36 else 28 end;
  v_height := case v_game.settings->>'arena' when 'small' then 14 when 'large' then 22 else 18 end;
  v_cx := floor(v_width / 2.0)::integer;
  v_cy := floor(v_height / 2.0)::integer;
  v_round_seconds := coalesce((v_game.settings->>'round_seconds')::integer,180);
  v_interval := case v_game.settings->>'speed' when 'slow' then 400 when 'fast' then 220 else 300 end;

  if v_game.settings->>'obstacles' = 'standard' then
    for v_x in (v_cx - 3)..(v_cx + 3) loop
      if v_x <> v_cx then
        v_obstacles := v_obstacles || jsonb_build_array(
          jsonb_build_object('x',v_x,'y',v_cy - 2),
          jsonb_build_object('x',v_x,'y',v_cy + 2)
        );
      end if;
    end loop;
  end if;

  for v_player in
    select user_id, coalesce(color,'#40826D') as color
      from public.gather_multiplayer_players
     where game_id = p_game_id and status = 'joined'
     order by joined_at, user_id
  loop
    v_index := v_index + 1;
    case v_index
      when 1 then
        v_x := 3; v_y := 3; v_direction := 'right';
        v_segments := jsonb_build_array(jsonb_build_object('x',3,'y',3),jsonb_build_object('x',2,'y',3),jsonb_build_object('x',1,'y',3));
      when 2 then
        v_x := v_width - 4; v_y := v_height - 4; v_direction := 'left';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',v_y),jsonb_build_object('x',v_x + 1,'y',v_y),jsonb_build_object('x',v_x + 2,'y',v_y));
      when 3 then
        v_x := 3; v_y := v_height - 4; v_direction := 'right';
        v_segments := jsonb_build_array(jsonb_build_object('x',3,'y',v_y),jsonb_build_object('x',2,'y',v_y),jsonb_build_object('x',1,'y',v_y));
      when 4 then
        v_x := v_width - 4; v_y := 3; v_direction := 'left';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',3),jsonb_build_object('x',v_x + 1,'y',3),jsonb_build_object('x',v_x + 2,'y',3));
      when 5 then
        v_x := v_cx; v_y := 2; v_direction := 'down';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',2),jsonb_build_object('x',v_x,'y',1),jsonb_build_object('x',v_x,'y',0));
      when 6 then
        v_x := v_cx; v_y := v_height - 3; v_direction := 'up';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',v_y),jsonb_build_object('x',v_x,'y',v_y + 1),jsonb_build_object('x',v_x,'y',v_y + 2));
      when 7 then
        v_x := 2; v_y := v_cy; v_direction := 'down';
        v_segments := jsonb_build_array(jsonb_build_object('x',2,'y',v_y),jsonb_build_object('x',2,'y',v_y - 1),jsonb_build_object('x',2,'y',v_y - 2));
      else
        v_x := v_width - 3; v_y := v_cy; v_direction := 'up';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',v_y),jsonb_build_object('x',v_x,'y',v_y + 1),jsonb_build_object('x',v_x,'y',v_y + 2));
    end case;

    v_snakes := v_snakes || jsonb_build_array(jsonb_build_object(
      'user_id', v_player.user_id,
      'name', 'Player',
      'color', v_player.color,
      'alive', true,
      'score', 0,
      'direction', v_direction,
      'segments', v_segments
    ));

    insert into private.gather_snake_inputs(game_id,user_id,direction,updated_at)
    values(p_game_id,v_player.user_id,v_direction,v_now)
    on conflict(game_id,user_id) do update
      set direction = excluded.direction,
          updated_at = excluded.updated_at;
  end loop;

  v_food := jsonb_build_object('x',v_cx,'y',v_cy);
  update public.gather_multiplayer_games
     set state = jsonb_build_object(
       'version',1,'phase','active','width',v_width,'height',v_height,
       'tick',0,'tickIntervalMs',v_interval,'startedAt',v_now,
       'lastTickAt',v_now,'endsAt',v_now + make_interval(secs => v_round_seconds),
       'snakes',v_snakes,'obstacles',v_obstacles,'food',v_food,
       'winnerId',null,'finishReason',null
     ),
     revision = revision + 1,
     updated_at = v_now
   where id = p_game_id
  returning * into v_game;

  return v_game;
end
$function$

