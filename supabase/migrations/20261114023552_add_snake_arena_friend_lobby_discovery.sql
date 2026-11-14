CREATE OR REPLACE FUNCTION public.gather_snake_open_lobbies()
 RETURNS TABLE(id uuid, created_by uuid, settings jsonb, state jsonb, updated_at timestamp with time zone, joined_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in to browse Snake Arena lobbies.'; end if;

  return query
    select g.id, g.created_by, g.settings, g.state, g.updated_at,
           (select count(*)::integer
              from public.gather_multiplayer_players p
             where p.game_id = g.id and p.status = 'joined') as joined_count
      from public.gather_multiplayer_games g
     where g.game_type = 'snake_arena'
       and g.status = 'active'
       and g.state->>'phase' = 'lobby'
       and g.join_mode = 'open'
       and g.created_by <> v_uid
       and exists (
         select 1 from public.friendships f
          where f.user_id = g.created_by and f.friend_id = v_uid
       )
       and not private.is_blocked_between(g.created_by, v_uid)
       and (select count(*) from public.gather_multiplayer_players p
             where p.game_id = g.id and p.status = 'joined')
           < coalesce((g.settings->>'max_players')::integer, 8)
     order by g.updated_at desc
     limit 50;
end
$function$

revoke all on function public.gather_snake_open_lobbies() from public, anon;
grant execute on function public.gather_snake_open_lobbies() to authenticated;
