create or replace function public.gather_game_move(
  p_game_id uuid,
  p_expected_revision bigint,
  p_state jsonb,
  p_next_turn_user_id uuid,
  p_result text default null
)
returns public.gather_games
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_game public.gather_games;
  v_winner uuid;
  v_continuing_checkers boolean := false;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Sign in to make a move.'; end if;

  select * into v_game
  from public.gather_games g
  where g.id=p_game_id and private.is_conversation_member(g.conversation_id)
  for update;

  if v_game.id is null or v_game.status <> 'active' then
    raise exception 'This game is not active.';
  end if;
  if not private.can_send_message(v_game.conversation_id) then
    raise exception 'Game access is unavailable because conversation permissions have changed.';
  end if;
  if v_game.game_type in ('battleship','ludo') then
    raise exception 'This game must use its dedicated game actions.';
  end if;
  if v_game.turn_user_id <> v_uid then raise exception 'It is not your turn.'; end if;
  if v_game.revision <> p_expected_revision then
    raise exception 'The board changed. Refresh the game and try again.';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 16384 then
    raise exception 'The game update is invalid.';
  end if;

  if p_result is null then
    if p_next_turn_user_id is null
       or p_next_turn_user_id not in (v_game.player_one_id, v_game.player_two_id) then
      raise exception 'The next turn is invalid.';
    end if;
    if p_next_turn_user_id = v_uid then
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
    if v_winner is not null and v_winner <> v_uid then
      raise exception 'A player can only report a win for themselves on their turn.';
    end if;
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
$function$;
