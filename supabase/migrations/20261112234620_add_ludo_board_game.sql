-- Ludo support for the existing head-to-head Gather Games engine.
-- This migration is recorded in the Supabase project as version 20261112234620.

alter table public.gather_games
  drop constraint if exists gather_games_game_type_check;

alter table public.gather_games
  add constraint gather_games_game_type_check
  check (game_type = any (array['chess','checkers','tic_tac_toe','connect_four','battleship','ludo']::text[]));

CREATE OR REPLACE FUNCTION public.gather_game_create(p_conversation_id uuid, p_game_type text, p_player_two_id uuid)
 RETURNS gather_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_games;
  v_state jsonb;
  v_board text;
  v_kind text;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Sign in to start a game.'; end if;
  if p_game_type is null or p_game_type not in ('chess','checkers','tic_tac_toe','connect_four','battleship','ludo') then
    raise exception 'That game is not available.';
  end if;
  if p_player_two_id is null or p_player_two_id = v_uid then
    raise exception 'Choose another member to play against.';
  end if;

  select c.kind into v_kind
  from public.conversations c
  where c.id = p_conversation_id
    and private.is_conversation_member(c.id)
    and private.can_send_message(c.id);

  if v_kind is null then
    raise exception 'This conversation is not available for games. Check its membership and messaging permissions.';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = p_player_two_id
  ) then
    raise exception 'The invited player must belong to this conversation.';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = p_player_two_id)
       or (b.blocker_id = p_player_two_id and b.blocked_id = v_uid)
  ) then
    raise exception 'Games are unavailable between blocked members.';
  end if;

  if p_game_type = 'chess' then
    v_state := jsonb_build_object('fen','rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','moves',jsonb_build_array());
  elsif p_game_type = 'checkers' then
    select string_agg(
      case
        when (floor(i/8)::int + mod(i,8)) % 2 = 1 and floor(i/8)::int between 0 and 2 then 'b'
        when (floor(i/8)::int + mod(i,8)) % 2 = 1 and floor(i/8)::int between 5 and 7 then 'w'
        else '.'
      end, '' order by i
    ) into v_board from generate_series(0,63) as g(i);
    v_state := jsonb_build_object('board',v_board,'turn','white','forcedIndex',null,'moves',0);
  elsif p_game_type = 'tic_tac_toe' then
    v_state := jsonb_build_object('board',jsonb_build_array('','','','','','','','',''),'turn','x','moves',0);
  elsif p_game_type = 'battleship' then
    v_state := jsonb_build_object(
      'phase','placement',
      'placed',jsonb_build_object('p1',false,'p2',false),
      'shots',jsonb_build_object('p1','[]'::jsonb,'p2','[]'::jsonb)
    );
  elsif p_game_type = 'ludo' then
    v_state := jsonb_build_object(
      'turn','red',
      'dice',null,
      'last_roll',null,
      'message','Roll a six to bring a token onto the board.',
      'pieces',jsonb_build_object(
        'red',jsonb_build_array(-1,-1,-1,-1),
        'yellow',jsonb_build_array(-1,-1,-1,-1)
      )
    );
  else
    select jsonb_agg(''::text order by i) into v_state from generate_series(0,41) as g(i);
    v_state := jsonb_build_object('board',v_state,'turn','red','moves',0);
  end if;

  insert into public.gather_games (
    conversation_id, game_type, status, created_by, player_one_id, player_two_id, state
  ) values (
    p_conversation_id, p_game_type, 'pending', v_uid, v_uid, p_player_two_id, v_state
  ) returning * into v_game;
  return v_game;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_game_move(p_game_id uuid, p_expected_revision bigint, p_state jsonb, p_next_turn_user_id uuid, p_result text DEFAULT NULL::text)
 RETURNS gather_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_games;
  v_winner uuid;
  v_continuing_checkers boolean := false;
begin
  if auth.uid() is null then raise exception 'Sign in to make a move.'; end if;
  select * into v_game from public.gather_games g
    where g.id=p_game_id and private.is_conversation_member(g.conversation_id)
    for update;
  if v_game.id is null or v_game.status <> 'active' then raise exception 'This game is not active.'; end if;
  if not private.can_send_message(v_game.conversation_id) then
    raise exception 'Game access is unavailable because conversation permissions have changed.';
  end if;
  if v_game.game_type in ('battleship','ludo') then
    raise exception 'This game must use its dedicated game actions.';
  end if;
  if v_game.turn_user_id <> auth.uid() then raise exception 'It is not your turn.'; end if;
  if v_game.revision <> p_expected_revision then raise exception 'The board changed. Refresh the game and try again.'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 16384 then
    raise exception 'The game update is invalid.';
  end if;
  if p_result is null then
    if p_next_turn_user_id is null
       or p_next_turn_user_id not in (v_game.player_one_id, v_game.player_two_id) then
      raise exception 'The next turn is invalid.';
    end if;
    if p_next_turn_user_id = auth.uid() then
      v_continuing_checkers :=
        v_game.game_type = 'checkers'
        and p_state->>'forcedIndex' ~ '^(0|[1-9]|[1-5][0-9]|6[0-3])$'
        and length(coalesce(p_state->>'board','')) = 64;
      if not v_continuing_checkers then raise exception 'The next turn is invalid.'; end if;
    end if;
    v_winner := null;
  else
    if p_result not in ('player_one_won','player_two_won','draw') or p_next_turn_user_id is not null then
      raise exception 'The game result is invalid.';
    end if;
    v_winner := case p_result
      when 'player_one_won' then v_game.player_one_id
      when 'player_two_won' then v_game.player_two_id
      else null
    end;
  end if;

  update public.gather_games g
     set state=p_state,
         turn_user_id=p_next_turn_user_id,
         winner_id=v_winner,
         result=p_result,
         status=case when p_result is null then 'active' else 'completed' end,
         updated_at=now(),
         revision=g.revision+1
   where g.id=p_game_id
  returning g.* into v_game;
  return v_game;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_ludo_action(p_game_id uuid, p_action text, p_token_index integer DEFAULT NULL::integer)
 RETURNS gather_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_games;
  v_actor uuid := (select auth.uid());
  v_state jsonb;
  v_pieces jsonb;
  v_color text;
  v_other_color text;
  v_dice integer;
  v_roll integer;
  v_progress integer;
  v_new_progress integer;
  v_track_position integer;
  v_other_track integer;
  v_start_offset integer;
  v_other_start_offset integer;
  v_step integer;
  v_can_move boolean := false;
  v_safe boolean := false;
  v_captured integer := 0;
  v_finished integer := 0;
  v_next_user uuid;
  v_next_color text;
  v_result text;
  v_message text;
begin
  if v_actor is null then raise exception 'Sign in to play Ludo.'; end if;
  if p_action is null or p_action not in ('roll','move','end') then
    raise exception 'That Ludo action is not supported.';
  end if;

  select * into v_game
  from public.gather_games g
  where g.id=p_game_id and g.game_type='ludo'
    and private.is_conversation_member(g.conversation_id)
  for update;

  if v_game.id is null then raise exception 'This Ludo game is not available.'; end if;
  if v_game.status <> 'active' then raise exception 'This Ludo match is not active.'; end if;
  if not private.can_send_message(v_game.conversation_id) then
    raise exception 'Game access is unavailable because conversation permissions have changed.';
  end if;
  if v_actor not in (v_game.player_one_id,v_game.player_two_id) then
    raise exception 'Only the two invited players can play Ludo.';
  end if;

  v_color := case when v_actor=v_game.player_one_id then 'red' else 'yellow' end;
  v_other_color := case when v_color='red' then 'yellow' else 'red' end;
  v_start_offset := case when v_color='red' then 0 else 26 end;
  v_other_start_offset := case when v_other_color='red' then 0 else 26 end;
  v_state := coalesce(v_game.state,'{}'::jsonb);
  v_pieces := coalesce(v_state->'pieces','{}'::jsonb);

  if p_action='end' then
    update public.gather_games g
       set status='completed',
           result=case when v_actor=v_game.player_one_id then 'ended_by_player_one' else 'ended_by_player_two' end,
           winner_id=null,
           turn_user_id=null,
           state=jsonb_set(v_state,'{message}',to_jsonb('The match was ended by a player.'::text),true),
           updated_at=now(),
           revision=g.revision+1
     where g.id=p_game_id
    returning g.* into v_game;
    return v_game;
  end if;

  if v_game.turn_user_id <> v_actor then raise exception 'It is not your turn.'; end if;

  if p_action='roll' then
    if v_state->>'dice' is not null then
      raise exception 'Move one of your tokens before rolling again.';
    end if;
    v_roll := floor(random()*6)::integer+1;

    for v_step in 0..3 loop
      v_progress := (v_pieces->v_color->>v_step)::integer;
      if (v_progress=-1 and v_roll=6)
         or (v_progress>=0 and v_progress<57 and v_progress+v_roll<=57) then
        v_can_move := true;
        exit;
      end if;
    end loop;

    if not v_can_move then
      v_next_user := case when v_color='red' then v_game.player_two_id else v_game.player_one_id end;
      v_next_color := v_other_color;
      v_state := jsonb_set(v_state,'{dice}','null'::jsonb,true);
      v_state := jsonb_set(v_state,'{last_roll}',to_jsonb(v_roll),true);
      v_state := jsonb_set(v_state,'{turn}',to_jsonb(v_next_color),true);
      v_message := case when v_color='red' then 'Red' else 'Yellow' end
        || ' rolled ' || v_roll::text || ' and had no legal move. '
        || case when v_next_color='red' then 'Red' else 'Yellow' end || ' goes next.';
      v_state := jsonb_set(v_state,'{message}',to_jsonb(v_message),true);
      update public.gather_games g
         set state=v_state,turn_user_id=v_next_user,updated_at=now(),revision=g.revision+1
       where g.id=p_game_id returning g.* into v_game;
      return v_game;
    end if;

    v_state := jsonb_set(v_state,'{dice}',to_jsonb(v_roll),true);
    v_state := jsonb_set(v_state,'{last_roll}',to_jsonb(v_roll),true);
    v_message := case when v_color='red' then 'Red' else 'Yellow' end
      || ' rolled a ' || v_roll::text || '. Choose a token to move.';
    v_state := jsonb_set(v_state,'{message}',to_jsonb(v_message),true);
    update public.gather_games g
       set state=v_state,updated_at=now(),revision=g.revision+1
     where g.id=p_game_id returning g.* into v_game;
    return v_game;
  end if;

  if p_token_index is null or p_token_index not between 0 and 3 then
    raise exception 'Choose one of your four tokens.';
  end if;
  if v_state->>'dice' is null then raise exception 'Roll the dice before moving a token.'; end if;
  v_dice := (v_state->>'dice')::integer;
  v_progress := (v_pieces->v_color->>p_token_index)::integer;

  if v_progress=-1 then
    if v_dice<>6 then raise exception 'A token needs a six to leave its base.'; end if;
    v_new_progress := 0;
  elsif v_progress>=0 and v_progress<57 and v_progress+v_dice<=57 then
    v_new_progress := v_progress+v_dice;
  else
    raise exception 'That token cannot move with this roll.';
  end if;

  v_pieces := jsonb_set(v_pieces,array[v_color,p_token_index::text],to_jsonb(v_new_progress),true);

  if v_new_progress<=51 then
    v_track_position := mod(v_start_offset+v_new_progress,52);
    v_safe := v_track_position=any(array[0,8,13,21,26,34,39,47]);
    if not v_safe then
      for v_step in 0..3 loop
        v_progress := (v_pieces->v_other_color->>v_step)::integer;
        if v_progress>=0 and v_progress<=51 then
          v_other_track := mod(v_other_start_offset+v_progress,52);
          if v_other_track=v_track_position then
            v_pieces := jsonb_set(v_pieces,array[v_other_color,v_step::text],to_jsonb(-1),true);
            v_captured := v_captured+1;
          end if;
        end if;
      end loop;
    end if;
  end if;

  select count(*) into v_finished
  from jsonb_array_elements_text(v_pieces->v_color) as token(value)
  where token.value::integer=57;

  v_state := jsonb_set(v_state,'{pieces}',v_pieces,true);
  v_state := jsonb_set(v_state,'{dice}','null'::jsonb,true);

  if v_finished=4 then
    v_result := case when v_color='red' then 'player_one_won' else 'player_two_won' end;
    v_message := case when v_color='red' then 'Red' else 'Yellow' end || ' brought all four tokens home and wins!';
    v_state := jsonb_set(v_state,'{message}',to_jsonb(v_message),true);
    update public.gather_games g
       set state=v_state,status='completed',turn_user_id=null,winner_id=v_actor,result=v_result,
           updated_at=now(),revision=g.revision+1
     where g.id=p_game_id returning g.* into v_game;
    return v_game;
  end if;

  if v_dice=6 then
    v_next_user := v_actor;
    v_next_color := v_color;
  else
    v_next_user := case when v_color='red' then v_game.player_two_id else v_game.player_one_id end;
    v_next_color := v_other_color;
  end if;

  v_message := case when v_color='red' then 'Red' else 'Yellow' end
    || ' moved token ' || (p_token_index+1)::text || '.';
  if v_captured>0 then
    v_message := v_message || ' Captured ' || v_captured::text || ' opposing token'
      || case when v_captured=1 then '' else 's' end || '.';
  end if;
  if v_dice=6 then v_message := v_message || ' Roll again!'; end if;
  v_state := jsonb_set(v_state,'{turn}',to_jsonb(v_next_color),true);
  v_state := jsonb_set(v_state,'{message}',to_jsonb(v_message),true);

  update public.gather_games g
     set state=v_state,turn_user_id=v_next_user,updated_at=now(),revision=g.revision+1
   where g.id=p_game_id returning g.* into v_game;
  return v_game;
end;
$function$
;

revoke all on function public.gather_ludo_action(uuid,text,integer) from public, anon;
grant execute on function public.gather_ludo_action(uuid,text,integer) to authenticated;
