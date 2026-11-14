CREATE OR REPLACE FUNCTION public.gather_uno_spectate(p_game_id uuid)
RETURNS public.gather_multiplayer_players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_game public.gather_multiplayer_games;
  v_player public.gather_multiplayer_players;
  v_private_state jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to watch UNO.'; END IF;
  SELECT * INTO v_game FROM public.gather_multiplayer_games
   WHERE id=p_game_id AND game_type='uno' AND status='active' FOR UPDATE;
  IF v_game.id IS NULL THEN RAISE EXCEPTION 'This UNO match is not available to watch.'; END IF;
  IF v_game.created_by=v_uid THEN RAISE EXCEPTION 'The host is already part of this UNO match.'; END IF;
  IF private.is_blocked_between(v_game.created_by,v_uid) THEN RAISE EXCEPTION 'You cannot watch this match.'; END IF;
  SELECT * INTO v_player FROM public.gather_multiplayer_players
   WHERE game_id=p_game_id AND user_id=v_uid FOR UPDATE;
  IF v_player.user_id IS NULL OR v_player.status NOT IN ('invited','spectating') THEN
    RAISE EXCEPTION 'You need a UNO invitation to watch this match.';
  END IF;
  IF v_player.status='spectating' THEN RETURN v_player; END IF;
  SELECT payload INTO v_private_state FROM private.gather_uno_private_states WHERE game_id=p_game_id;
  IF v_private_state IS NULL OR NOT coalesce((v_private_state->>'started')::boolean,false) THEN
    RAISE EXCEPTION 'Spectating is available after the UNO match starts.';
  END IF;
  IF v_private_state->>'winner_id' IS NOT NULL OR coalesce((v_private_state->>'finished')::boolean,false) THEN
    RAISE EXCEPTION 'This UNO round has finished.';
  END IF;
  UPDATE public.gather_multiplayer_players
     SET status='spectating',ready=false,color=NULL,x=NULL,y=NULL,is_it=false,updated_at=now()
   WHERE game_id=p_game_id AND user_id=v_uid RETURNING * INTO v_player;
  UPDATE public.gather_multiplayer_games SET revision=revision+1,updated_at=now() WHERE id=p_game_id;
  RETURN v_player;
END
$function$;
