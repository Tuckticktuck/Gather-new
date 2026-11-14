-- Let a spectator stop watching after a match is completed/cancelled.
-- Removing a spectator never changes the match's result or player state.
CREATE OR REPLACE FUNCTION public.gather_snake_leave(p_game_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_game public.gather_multiplayer_games;
  v_member public.gather_multiplayer_players;
  v_state jsonb;
  v_snakes jsonb;
  v_joined integer;
  v_alive integer;
  v_winner uuid;
  v_new_host uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  SELECT * INTO v_game FROM public.gather_multiplayer_games
   WHERE id=p_game_id AND game_type='snake_arena' FOR UPDATE;
  IF v_game.id IS NULL OR v_game.status NOT IN ('active','completed','cancelled') THEN
    RAISE EXCEPTION 'This Snake Arena lobby is no longer available.';
  END IF;
  SELECT * INTO v_member FROM public.gather_multiplayer_players
   WHERE game_id=p_game_id AND user_id=auth.uid() FOR UPDATE;
  IF v_member.user_id IS NULL OR v_member.status NOT IN ('joined','spectating') THEN
    RAISE EXCEPTION 'You are not watching or playing in this Snake Arena match.';
  END IF;
  UPDATE public.gather_multiplayer_players SET status='left',ready=false,updated_at=now()
   WHERE game_id=p_game_id AND user_id=auth.uid();
  IF v_member.status='spectating' THEN
    UPDATE public.gather_multiplayer_games SET revision=revision+1,updated_at=now() WHERE id=p_game_id;
    RETURN true;
  END IF;
  IF v_game.status<>'active' THEN RAISE EXCEPTION 'This Snake Arena match has already finished.'; END IF;
  DELETE FROM private.gather_snake_inputs WHERE game_id=p_game_id AND user_id=auth.uid();
  IF v_game.state->>'phase'='lobby' THEN
    IF v_game.created_by=auth.uid() THEN
      UPDATE public.gather_multiplayer_games SET status='cancelled',
        state=jsonb_set(jsonb_set(v_game.state,'{phase}','"finished"'::jsonb,true),
        '{finishReason}',to_jsonb('host-left'::text),true),
        revision=revision+1,updated_at=now() WHERE id=p_game_id;
    ELSE
      UPDATE public.gather_multiplayer_games SET revision=revision+1,updated_at=now() WHERE id=p_game_id;
    END IF;
    RETURN true;
  END IF;
  SELECT coalesce(jsonb_agg(
    CASE WHEN item.value->>'user_id'=auth.uid()::text
      THEN jsonb_set(item.value,'{alive}','false'::jsonb,true) ELSE item.value END
    ORDER BY item.ordinality
  ),'[]'::jsonb) INTO v_snakes
  FROM jsonb_array_elements(v_game.state->'snakes') WITH ORDINALITY AS item(value,ordinality);
  v_state:=jsonb_set(v_game.state,'{snakes}',v_snakes,true);
  SELECT count(*) INTO v_joined FROM public.gather_multiplayer_players
   WHERE game_id=p_game_id AND status='joined';
  IF v_game.created_by=auth.uid() AND v_joined>0 THEN
    SELECT user_id INTO v_new_host FROM public.gather_multiplayer_players
     WHERE game_id=p_game_id AND status='joined' ORDER BY joined_at,user_id LIMIT 1;
  END IF;
  SELECT count(*) INTO v_alive FROM jsonb_array_elements(v_snakes) s(value)
   WHERE coalesce((s.value->>'alive')::boolean,false);
  IF v_joined=0 OR v_alive<=1 THEN
    SELECT (s.value->>'user_id')::uuid INTO v_winner FROM jsonb_array_elements(v_snakes) s(value)
     WHERE coalesce((s.value->>'alive')::boolean,false) LIMIT 1;
    v_state:=jsonb_set(v_state,'{phase}','"finished"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{winnerId}',coalesce(to_jsonb(v_winner),'null'::jsonb),true);
    v_state:=jsonb_set(v_state,'{finishReason}',to_jsonb('player-left'::text),true);
    UPDATE public.gather_multiplayer_games SET status='completed',
      created_by=coalesce(v_new_host,created_by),state=v_state,revision=revision+1,updated_at=now()
     WHERE id=p_game_id;
    DELETE FROM private.gather_snake_inputs WHERE game_id=p_game_id;
  ELSE
    UPDATE public.gather_multiplayer_games SET created_by=coalesce(v_new_host,created_by),
      state=v_state,revision=revision+1,updated_at=now() WHERE id=p_game_id;
  END IF;
  RETURN true;
END
$function$;
