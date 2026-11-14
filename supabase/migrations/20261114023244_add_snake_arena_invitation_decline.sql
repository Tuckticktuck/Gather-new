create or replace function public.gather_snake_decline(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_game public.gather_multiplayer_games;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.status <> 'active' or v_game.state->>'phase' <> 'lobby' then
    raise exception 'This Snake Arena invitation is no longer available.';
  end if;

  update public.gather_multiplayer_players
     set status = 'left', ready = false, updated_at = now()
   where game_id = p_game_id
     and user_id = auth.uid()
     and status = 'invited';
  if not found then
    raise exception 'This Snake Arena invitation is not for your account.';
  end if;

  update public.gather_multiplayer_games
     set revision = revision + 1, updated_at = now()
   where id = p_game_id;
  return true;
end
$function$;

revoke all on function public.gather_snake_decline(uuid) from public, anon;
grant execute on function public.gather_snake_decline(uuid) to authenticated;
