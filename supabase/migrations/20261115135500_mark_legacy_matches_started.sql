create or replace function public.gather_game_start(p_game_id uuid)
returns public.gather_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.gather_games;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Sign in to start the match.'; end if;
  select * into v_game from public.gather_games g where g.id=p_game_id for update;
  if v_game.id is null or v_game.status<>'active' or v_game.started_at is not null then
    raise exception 'This game lobby is not available to start.';
  end if;
  if v_game.created_by<>v_actor then raise exception 'Only the host can start this match.'; end if;
  if v_game.player_one_id is null or v_game.player_two_id is null then raise exception 'Both player seats must be filled.'; end if;
  if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then
    raise exception 'Game access is unavailable because conversation permissions have changed.';
  end if;
  if not v_game.player_one_ready or not v_game.player_two_ready then
    raise exception 'Both players must be ready before the host starts the match.';
  end if;
  update public.gather_games
  set started_at=now(),
      state=jsonb_set(coalesce(state,'{}'::jsonb),'{started}','true'::jsonb,true),
      turn_user_id=player_one_id,
      revision=revision+1,
      updated_at=now()
  where id=p_game_id returning * into v_game;
  return v_game;
end;
$$;

update public.gather_games
set state=jsonb_set(coalesce(state,'{}'::jsonb),'{started}','true'::jsonb,true)
where status='active' and started_at is not null and coalesce(state->>'started','false')<>'true';
