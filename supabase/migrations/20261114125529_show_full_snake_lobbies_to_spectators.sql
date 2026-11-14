-- Show full friend-open Snake lobbies to friends who want to spectate.
-- The client disables Join to play when capacity is full, but keeps Watch only available.
CREATE OR REPLACE FUNCTION public.gather_snake_open_lobbies()
RETURNS TABLE(id uuid,created_by uuid,settings jsonb,state jsonb,updated_at timestamptz,joined_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to browse Snake Arena lobbies.'; END IF;
  RETURN QUERY
    SELECT g.id,g.created_by,g.settings,g.state,g.updated_at,
      (SELECT count(*)::integer FROM public.gather_multiplayer_players p
        WHERE p.game_id=g.id AND p.status='joined') AS joined_count
    FROM public.gather_multiplayer_games g
    WHERE g.game_type='snake_arena' AND g.status='active'
      AND g.state->>'phase'='lobby' AND g.join_mode='open' AND g.created_by<>v_uid
      AND EXISTS (SELECT 1 FROM public.friendships f
        WHERE f.user_id=g.created_by AND f.friend_id=v_uid)
      AND NOT private.is_blocked_between(g.created_by,v_uid)
      AND NOT EXISTS (SELECT 1 FROM public.gather_multiplayer_players own
        WHERE own.game_id=g.id AND own.user_id=v_uid
          AND own.status IN ('joined','invited','spectating'))
    ORDER BY g.updated_at DESC LIMIT 50;
END
$function$;
