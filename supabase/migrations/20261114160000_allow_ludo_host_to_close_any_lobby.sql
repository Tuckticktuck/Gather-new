-- Let the Ludo host close the lobby during setup, during a match, or after completion.
create or replace function public.gather_ludo_cancel(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_game public.gather_multiplayer_games;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  select *
    into v_game
    from public.gather_multiplayer_games
   where id = p_game_id
     and game_type = 'ludo'
   for update;

  if v_game.id is null then
    raise exception 'This Ludo lobby could not be found.';
  end if;
  if v_game.created_by <> auth.uid() then
    raise exception 'Only the host can close this Ludo lobby.';
  end if;
  if v_game.status = 'cancelled' then
    return true;
  end if;
  if v_game.status not in ('active', 'completed') then
    raise exception 'This Ludo lobby can no longer be closed.';
  end if;

  update public.gather_multiplayer_games
     set status = 'cancelled',
         revision = revision + 1,
         updated_at = now()
   where id = p_game_id;

  update public.gather_multiplayer_players
     set status = 'left',
         ready = false,
         is_it = false,
         updated_at = now()
   where game_id = p_game_id
     and status in ('invited', 'joined', 'spectating', 'eliminated');

  return true;
end;
$function$;

revoke all on function public.gather_ludo_cancel(uuid) from public, anon;
grant execute on function public.gather_ludo_cancel(uuid) to authenticated, service_role;
