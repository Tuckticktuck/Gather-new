-- Add a distinct, read-only Snake Arena spectator roster state.
-- Spectators can read public match state but are never joined players.

ALTER TABLE public.gather_multiplayer_players
  DROP CONSTRAINT IF EXISTS gather_multiplayer_players_status_check;

ALTER TABLE public.gather_multiplayer_players
  ADD CONSTRAINT gather_multiplayer_players_status_check
  CHECK (status = ANY (ARRAY['invited'::text, 'joined'::text, 'left'::text, 'spectating'::text]));

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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to watch Snake Arena.';
  END IF;
  SELECT * INTO v_game FROM public.gather_multiplayer_games
   WHERE id = p_game_id AND game_type = 'snake_arena' FOR UPDATE;
  IF v_game.id IS NULL OR v_game.status NOT IN ('active','completed')
     OR v_game.state->>'phase' NOT IN ('lobby','active','finished') THEN
    RAISE EXCEPTION 'This Snake Arena match is not available to watch.';
  END IF;
  IF v_game.created_by = v_uid THEN
    RAISE EXCEPTION 'The host is already part of this Snake Arena match.';
  END IF;
  SELECT * INTO v_member FROM public.gather_multiplayer_players
   WHERE game_id = p_game_id AND user_id = v_uid FOR UPDATE;
  IF v_member.status = 'joined' THEN
    RAISE EXCEPTION 'You already joined as a player.';
  END IF;
  IF v_member.status = 'spectating' THEN
    RETURN v_member;
  END IF;
  v_is_invited := v_member.status = 'invited';
  v_is_open_friend := v_game.join_mode = 'open'
    AND EXISTS (SELECT 1 FROM public.friendships f
                 WHERE f.user_id = v_game.created_by AND f.friend_id = v_uid);
  IF NOT v_is_invited AND NOT v_is_open_friend THEN
    RAISE EXCEPTION 'Only invited players or the host’s accepted friends can spectate.';
  END IF;
  IF private.is_blocked_between(v_game.created_by, v_uid) THEN
    RAISE EXCEPTION 'You cannot watch this match.';
  END IF;
  IF v_game.status <> 'active' OR v_game.state->>'phase' <> 'lobby' THEN
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
  UPDATE public.gather_multiplayer_games
     SET revision=revision+1,updated_at=now()
   WHERE id=p_game_id;
  RETURN v_player;
END
$function$;

CREATE OR REPLACE FUNCTION public.gather_snake_join(
  p_game_id uuid,
  p_color text DEFAULT '#40826D'::text
)
RETURNS public.gather_multiplayer_players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_game public.gather_multiplayer_games;
  v_count integer;
  v_max integer;
  v_player public.gather_multiplayer_players;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to join Snake Arena.'; END IF;
  SELECT * INTO v_game FROM public.gather_multiplayer_games
   WHERE id=p_game_id AND game_type='snake_arena' FOR UPDATE;
  IF v_game.id IS NULL OR v_game.status<>'active' OR v_game.state->>'phase'<>'lobby' THEN
    RAISE EXCEPTION 'This Snake Arena lobby is no longer open for players.';
  END IF;
  UPDATE public.gather_multiplayer_players
     SET status='invited',ready=false,color=NULL,x=NULL,y=NULL,updated_at=now()
   WHERE game_id=p_game_id AND user_id=auth.uid()
     AND status='spectating' AND v_game.join_mode='invite';
  v_max:=coalesce((v_game.settings->>'max_players')::integer,8);
  SELECT count(*) INTO v_count FROM public.gather_multiplayer_players
   WHERE game_id=p_game_id AND status='joined' AND user_id<>auth.uid();
  IF v_count>=v_max THEN RAISE EXCEPTION 'This Snake Arena lobby is full.'; END IF;
  SELECT * INTO v_player FROM private.gather_multiplayer_join(p_game_id,p_color);
  RETURN v_player;
END
$function$;

CREATE OR REPLACE FUNCTION public.gather_snake_leave(p_game_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_game public.gather_multiplayer_games;
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
  IF v_game.id IS NULL OR v_game.status<>'active' THEN
    RAISE EXCEPTION 'This Snake Arena lobby is already closed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gather_multiplayer_players
    WHERE game_id=p_game_id AND user_id=auth.uid() AND status IN ('joined','spectating')) THEN
    RAISE EXCEPTION 'You are not a joined player or spectator in this Snake Arena match.';
  END IF;
  UPDATE public.gather_multiplayer_players
     SET status='left',ready=false,updated_at=now()
   WHERE game_id=p_game_id AND user_id=auth.uid();
  IF EXISTS (SELECT 1 FROM public.gather_multiplayer_players
    WHERE game_id=p_game_id AND user_id=auth.uid() AND status='left')
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_game.state->'snakes','[]'::jsonb)) s(value)
                      WHERE s.value->>'user_id'=auth.uid()::text) THEN
    UPDATE public.gather_multiplayer_games SET revision=revision+1,updated_at=now() WHERE id=p_game_id;
    RETURN true;
  END IF;
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

REVOKE ALL ON FUNCTION public.gather_snake_spectate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gather_snake_spectate(uuid) TO authenticated;
