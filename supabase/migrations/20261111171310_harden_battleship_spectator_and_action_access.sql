-- Tighten Battleship RPC validation and allow conversation spectators to view only the public board.
create or replace function public.gather_game_battleship_private_state(p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_game public.gather_games; v_ships jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view a Battleship board.'; end if;
  select * into v_game from public.gather_games g where g.id=p_game_id and g.game_type='battleship'
    and private.is_conversation_member(g.conversation_id);
  if v_game.id is null then raise exception 'This Battleship game is not available.'; end if;
  if auth.uid() not in(v_game.player_one_id,v_game.player_two_id) then
    return jsonb_build_object('is_player',false,'placed',false,'ships','[]'::jsonb);
  end if;
  if not private.can_send_message(v_game.conversation_id) then raise exception 'Your game access is unavailable because conversation permissions have changed.'; end if;
  select f.ships into v_ships from public.gather_battleship_fleets f where f.game_id=p_game_id and f.player_id=auth.uid();
  return jsonb_build_object('is_player',true,'placed',v_ships is not null,'ships',coalesce(v_ships,'[]'::jsonb));
end;
$function$;

create or replace function public.gather_game_battleship_action(p_game_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns public.gather_games language plpgsql security definer set search_path = ''
as $function$
declare
  v_game public.gather_games; v_actor uuid := (select auth.uid()); v_opponent uuid; v_player_key text; v_opponent_key text;
  v_ship jsonb; v_cell_value text; v_cell integer; v_length integer; v_min_row integer; v_max_row integer; v_min_col integer; v_max_col integer;
  v_all_cells integer[] := array[]::integer[]; v_lengths integer[] := array[]::integer[]; v_sorted_lengths integer[];
  v_clean_ships jsonb := '[]'::jsonb; v_state jsonb; v_shots jsonb; v_shot_list jsonb; v_hit boolean; v_hits integer; v_result text; v_winner uuid;
begin
  if v_actor is null then raise exception 'Sign in to play Battleship.'; end if;
  if p_action is null or p_action not in('place_fleet','fire') then raise exception 'That Battleship action is not supported.'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then raise exception 'The Battleship action is invalid.'; end if;
  select * into v_game from public.gather_games g where g.id=p_game_id and g.game_type='battleship'
    and private.is_conversation_member(g.conversation_id) for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Battleship match is not active.'; end if;
  if not private.can_send_message(v_game.conversation_id) then raise exception 'Game access is unavailable because conversation permissions have changed.'; end if;
  if v_actor not in(v_game.player_one_id,v_game.player_two_id) then raise exception 'Spectators can watch, but only the two players can play.'; end if;
  v_player_key:=case when v_actor=v_game.player_one_id then 'p1' else 'p2' end;
  v_opponent_key:=case when v_player_key='p1' then 'p2' else 'p1' end;
  v_opponent:=case when v_player_key='p1' then v_game.player_two_id else v_game.player_one_id end;
  v_state:=coalesce(v_game.state,'{}'::jsonb);
  if p_action='place_fleet' then
    if v_state->>'phase' is distinct from 'placement' then raise exception 'Fleet placement is already closed.'; end if;
    if exists(select 1 from public.gather_battleship_fleets f where f.game_id=p_game_id and f.player_id=v_actor) then raise exception 'Your fleet is already locked in.'; end if;
    if jsonb_typeof(p_payload->'ships') is distinct from 'array' then raise exception 'Place all five ships before locking your fleet.'; end if;
    if jsonb_array_length(p_payload->'ships')<>5 then raise exception 'Place all five ships before locking your fleet.'; end if;
    for v_ship in select item.value from jsonb_array_elements(p_payload->'ships') as item(value) loop
      if jsonb_typeof(v_ship->'cells') is distinct from 'array' then raise exception 'Each ship needs a list of board squares.'; end if;
      v_length:=jsonb_array_length(v_ship->'cells');
      if v_length not in(2,3,4,5) then raise exception 'A ship has an invalid length.'; end if;
      v_min_row:=10; v_max_row:=-1; v_min_col:=10; v_max_col:=-1;
      for v_cell_value in select cell.value from jsonb_array_elements_text(v_ship->'cells') as cell(value) loop
        if v_cell_value !~ '^(0|[1-9][0-9]?)$' then raise exception 'A ship uses an invalid board square.'; end if;
        v_cell:=v_cell_value::integer;
        if v_cell<0 or v_cell>99 then raise exception 'A ship is outside the board.'; end if;
        if v_cell=any(v_all_cells) then raise exception 'Ships cannot overlap.'; end if;
        v_all_cells:=array_append(v_all_cells,v_cell);
        v_min_row:=least(v_min_row,v_cell/10); v_max_row:=greatest(v_max_row,v_cell/10);
        v_min_col:=least(v_min_col,mod(v_cell,10)); v_max_col:=greatest(v_max_col,mod(v_cell,10));
      end loop;
      if not((v_min_row=v_max_row and v_max_col-v_min_col+1=v_length) or (v_min_col=v_max_col and v_max_row-v_min_row+1=v_length)) then
        raise exception 'Ships must be straight, continuous lines.';
      end if;
      v_lengths:=array_append(v_lengths,v_length);
      v_clean_ships:=v_clean_ships||jsonb_build_array(jsonb_build_object('cells',v_ship->'cells'));
    end loop;
    select array_agg(ship_length order by ship_length) into v_sorted_lengths from unnest(v_lengths) as lengths(ship_length);
    if v_sorted_lengths is distinct from array[2,3,3,4,5]::integer[] or cardinality(v_all_cells)<>17 then
      raise exception 'The fleet must contain one carrier (5), one battleship (4), two cruisers (3), and one destroyer (2).';
    end if;
    insert into public.gather_battleship_fleets(game_id,player_id,ships) values(p_game_id,v_actor,v_clean_ships);
    v_state:=jsonb_set(v_state,array['placed',v_player_key],'true'::jsonb,true);
    if coalesce((v_state->'placed'->>'p1')::boolean,false) and coalesce((v_state->'placed'->>'p2')::boolean,false) then
      v_state:=jsonb_set(v_state,'{phase}','"battle"'::jsonb,true);
      update public.gather_games g set state=v_state,turn_user_id=v_game.player_one_id,updated_at=now(),revision=g.revision+1 where g.id=p_game_id returning g.* into v_game;
    else
      update public.gather_games g set state=v_state,turn_user_id=null,updated_at=now(),revision=g.revision+1 where g.id=p_game_id returning g.* into v_game;
    end if;
    return v_game;
  end if;
  if v_state->>'phase' is distinct from 'battle' then raise exception 'Both players must place their fleets first.'; end if;
  if v_game.turn_user_id<>v_actor then raise exception 'It is not your turn to fire.'; end if;
  v_cell_value:=p_payload->>'cell';
  if v_cell_value is null or v_cell_value !~ '^(0|[1-9][0-9]?)$' then raise exception 'Choose a valid target square.'; end if;
  v_cell:=v_cell_value::integer;
  if v_cell<0 or v_cell>99 then raise exception 'Choose a square on the board.'; end if;
  v_shots:=coalesce(v_state->'shots',jsonb_build_object('p1','[]'::jsonb,'p2','[]'::jsonb));
  v_shot_list:=coalesce(v_shots->v_player_key,'[]'::jsonb);
  if exists(select 1 from jsonb_array_elements(v_shot_list) as prior(shot) where prior.shot->>'cell'=v_cell::text) then raise exception 'You already fired at that square.'; end if;
  select exists(select 1 from public.gather_battleship_fleets f,jsonb_array_elements(f.ships) as fleet_ship(ship),
    jsonb_array_elements_text(fleet_ship.ship->'cells') as fleet_cell(cell)
    where f.game_id=p_game_id and f.player_id=v_opponent and fleet_cell.cell::integer=v_cell) into v_hit;
  v_shot_list:=v_shot_list||jsonb_build_array(jsonb_build_object('cell',v_cell,'hit',v_hit));
  v_shots:=jsonb_set(v_shots,array[v_player_key],v_shot_list,true);
  v_state:=jsonb_set(v_state,'{shots}',v_shots,true);
  select count(*) into v_hits from jsonb_array_elements(v_shot_list) as shot(item) where coalesce((shot.item->>'hit')::boolean,false);
  if v_hits>=17 then
    v_result:=case when v_actor=v_game.player_one_id then 'player_one_won' else 'player_two_won' end; v_winner:=v_actor;
    update public.gather_games g set state=v_state,status='completed',turn_user_id=null,winner_id=v_winner,result=v_result,updated_at=now(),revision=g.revision+1 where g.id=p_game_id returning g.* into v_game;
  else
    update public.gather_games g set state=v_state,turn_user_id=v_opponent,updated_at=now(),revision=g.revision+1 where g.id=p_game_id returning g.* into v_game;
  end if;
  return v_game;
end;
$function$;

revoke all on function public.gather_game_battleship_private_state(uuid) from public,anon;
revoke all on function public.gather_game_battleship_action(uuid,text,jsonb) from public,anon;
grant execute on function public.gather_game_battleship_private_state(uuid) to authenticated;
grant execute on function public.gather_game_battleship_action(uuid,text,jsonb) to authenticated;
