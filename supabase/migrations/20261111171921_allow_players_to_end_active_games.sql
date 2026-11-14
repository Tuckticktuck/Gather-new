-- Allow either participant to end any active Gather game.
alter table public.gather_games
  drop constraint if exists gather_games_result_check;

alter table public.gather_games
  add constraint gather_games_result_check
  check (result = any (array[
    'player_one_won'::text,
    'player_two_won'::text,
    'draw'::text,
    'ended_by_player_one'::text,
    'ended_by_player_two'::text
  ]));

create or replace function public.gather_game_end(p_game_id uuid)
returns public.gather_games
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_game public.gather_games;
  v_actor uuid := (select auth.uid());
  v_result text;
begin
  if v_actor is null then
    raise exception 'Sign in to end a game.';
  end if;

  select *
    into v_game
    from public.gather_games g
   where g.id = p_game_id
     and private.is_conversation_member(g.conversation_id)
   for update;

  if v_game.id is null then
    raise exception 'This game is not available.';
  end if;

  if v_game.status <> 'active' then
    raise exception 'This game is no longer active.';
  end if;

  if v_actor not in (v_game.player_one_id, v_game.player_two_id) then
    raise exception 'Only one of the two players can end this game.';
  end if;

  v_result := case
    when v_actor = v_game.player_one_id then 'ended_by_player_one'
    else 'ended_by_player_two'
  end;

  update public.gather_games g
     set status = 'completed',
         result = v_result,
         winner_id = null,
         turn_user_id = null,
         updated_at = now(),
         revision = g.revision + 1
   where g.id = p_game_id
  returning g.* into v_game;

  return v_game;
end;
$function$;

revoke all on function public.gather_game_end(uuid) from public, anon;
grant execute on function public.gather_game_end(uuid) to authenticated;
