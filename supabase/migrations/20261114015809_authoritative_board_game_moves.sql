-- Route all legacy board-game transitions through the authenticated server validator.
-- This is intentionally separate from Battleship and Ludo, which have their own action RPCs.

create or replace function private.can_send_message_for_user(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and exists (
        select 1
        from public.conversation_members mine
        where mine.conversation_id = c.id
          and mine.user_id = p_user_id
      )
      and (
        (
          c.kind = 'direct'
          and (select count(*) from public.conversation_members cm where cm.conversation_id = c.id) = 2
          and not exists (
            select 1
            from public.conversation_members a
            join public.conversation_members b
              on b.conversation_id = a.conversation_id
             and b.user_id <> a.user_id
            where a.conversation_id = c.id
              and not private.can_pair_message(a.user_id, b.user_id)
          )
        )
        or
        (
          c.kind = 'group'
          and not exists (
            select 1
            from public.conversation_members a
            join public.conversation_members b
              on b.conversation_id = a.conversation_id
             and b.user_id > a.user_id
            where a.conversation_id = c.id
              and not private.can_pair_message(a.user_id, b.user_id)
          )
        )
      )
  );
$function$;

revoke all on function private.can_send_message_for_user(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.gather_board_game_commit_move(
  p_game_id uuid,
  p_actor_id uuid,
  p_expected_revision bigint,
  p_expected_state jsonb,
  p_next_state jsonb,
  p_next_turn_user_id uuid,
  p_result text
)
returns public.gather_games
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_game public.gather_games;
  v_winner uuid;
begin
  if p_actor_id is null then
    raise exception 'Sign in before making a move.';
  end if;

  select *
    into v_game
    from public.gather_games g
   where g.id = p_game_id
   for update;

  if v_game.id is null then
    raise exception 'This game could not be found.';
  end if;
  if v_game.game_type not in ('chess', 'checkers', 'tic_tac_toe', 'connect_four') then
    raise exception 'This game must use its dedicated game actions.';
  end if;
  if v_game.status <> 'active' then
    raise exception 'This game is not active.';
  end if;
  if p_actor_id not in (v_game.player_one_id, v_game.player_two_id) then
    raise exception 'Only the two players can make moves.';
  end if;
  if v_game.turn_user_id <> p_actor_id then
    raise exception 'It is not your turn.';
  end if;
  if v_game.revision <> p_expected_revision
     or v_game.state is distinct from p_expected_state then
    raise exception 'The board changed. Refresh the game and try again.';
  end if;
  if not private.can_send_message_for_user(v_game.conversation_id, p_actor_id) then
    raise exception 'Game access is unavailable because conversation permissions have changed.';
  end if;
  if p_next_state is null
     or jsonb_typeof(p_next_state) <> 'object'
     or octet_length(p_next_state::text) > 16384 then
    raise exception 'The validated game state is invalid.';
  end if;

  if p_result is null then
    if p_next_turn_user_id is null
       or p_next_turn_user_id not in (v_game.player_one_id, v_game.player_two_id) then
      raise exception 'The next turn is invalid.';
    end if;
    if p_next_turn_user_id = p_actor_id
       and not (
         v_game.game_type = 'checkers'
         and coalesce(p_next_state->>'forcedIndex', '') ~ '^(0|[1-9]|[1-5][0-9]|6[0-3])$'
       ) then
      raise exception 'The next turn is invalid.';
    end if;
    v_winner := null;
  else
    if p_result not in ('player_one_won', 'player_two_won', 'draw')
       or p_next_turn_user_id is not null then
      raise exception 'The game result is invalid.';
    end if;
    v_winner := case p_result
      when 'player_one_won' then v_game.player_one_id
      when 'player_two_won' then v_game.player_two_id
      else null
    end;
    if v_winner is not null and v_winner <> p_actor_id then
      raise exception 'A player can only report a win for themselves.';
    end if;
  end if;

  update public.gather_games g
     set state = p_next_state,
         turn_user_id = p_next_turn_user_id,
         winner_id = v_winner,
         result = p_result,
         status = case when p_result is null then 'active' else 'completed' end,
         updated_at = now(),
         revision = g.revision + 1
   where g.id = p_game_id
  returning g.* into v_game;

  return v_game;
end;
$function$;

revoke all on function public.gather_board_game_commit_move(
  uuid, uuid, bigint, jsonb, jsonb, uuid, text
) from public, anon, authenticated;
grant execute on function public.gather_board_game_commit_move(
  uuid, uuid, bigint, jsonb, jsonb, uuid, text
) to service_role;

-- The old RPC accepted a complete browser-authored board, so remove its user-facing execute permission.
revoke execute on function public.gather_game_move(uuid, bigint, jsonb, uuid, text)
  from public, anon, authenticated;
