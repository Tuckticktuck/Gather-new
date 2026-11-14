-- Prevent missing invite rows from passing spectator admission due to SQL NULL logic.
-- Only invited users and accepted friends of open-lobby hosts may spectate.
CREATE OR REPLACE FUNCTION public.gather_snake_spectate(p_game_id uuid)
RETURNS public.gather_multiplayer_players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_game public.gather_multiplayer_games;
  v_member public.gather_multiplayer_players;
  v_player public.gather_multiplayer_players;
  v_is_invited boolean := false;
  v_is_open_friend boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to watch Snake Arena.'; END IF;
  SELECT * INTO v_game FROM public.gather_multiplayer_games
   WHERE id=p_game_id AND game_type='snake_arena' FOR UPDATE;
  IF v_game.id IS NULL OR v_game.status NOT IN ('active','completed')
     OR v_game.state->>'phase' NOT IN ('lobby','active','finished') THEN
    RAISE EXCEPTION 'This Snake Arena match is not available to watch.';
  END IF;
  IF v_game.created_by=v_uid THEN RAISE EXCEPTION 'The host is already part of this Snake Arena match.'; END IF;
  SELECT * INTO v_member FROM public.gather_multiplayer_players
   WHERE game_id=p_game_id AND user_id=v_uid FOR UPDATE;
  IF private.is_blocked_between(v_game.created_by,v_uid) THEN RAISE EXCEPTION 'You cannot watch this match.'; END IF;
  IF v_member.status='joined' THEN RAISE EXCEPTION 'You already joined as a player.'; END IF;
  IF v_member.status='spectating' THEN RETURN v_member; END IF;
  v_is_invited:=coalesce(v_member.status='invited',false);
  v_is_open_friend:=v_game.join_mode='open'
    AND EXISTS (SELECT 1 FROM public.friendships f
      WHERE f.user_id=v_game.created_by AND f.friend_id=v_uid);
  IF NOT v_is_invited AND NOT v_is_open_friend THEN
    RAISE EXCEPTION 'Only invited players or the host’s accepted friends can spectate.';
  END IF;
  IF v_game.status<>'active' OR v_game.state->>'phase'<>'lobby' THEN
    RAISE EXCEPTION 'Join as a spectator before the match starts.';
  END IF;
  INSERT INTO public.gather_multiplayer_players
    (game_id,user_id,status,color,x,y,is_it,joined_at,updated_at,ready)
  VALUES (p_game_id,v_uid,'spectating',NULL,NULL,NULL,false,now(),now(),false)
  ON CONFLICT (game_id,user_id) DO UPDATE
    SET status='spectating',color=NULL,x=NULL,y=NULL,is_it=false,ready=false,updated_at=now()
    WHERE public.gather_multiplayer_players.status IN ('invited','left')
  RETURNING * INTO v_player;
  IF v_player.user_id IS NULL THEN
    RAISE EXCEPTION 'This account cannot join the match as a spectator.';
  END IF;
  UPDATE public.gather_multiplayer_games SET revision=revision+1,updated_at=now() WHERE id=p_game_id;
  RETURN v_player;
END
$function$;

REVOKE ALL ON FUNCTION public.gather_snake_spectate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gather_snake_spectate(uuid) TO authenticated;
