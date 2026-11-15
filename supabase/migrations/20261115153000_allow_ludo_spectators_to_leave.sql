do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef('public.gather_ludo_leave(uuid)'::regprocedure);
  v_old := $old$
  IF v_game.id IS NULL OR v_game.status <> 'active' THEN
    RAISE EXCEPTION 'This Ludo lobby is no longer active.';
  END IF;

  SELECT p.status INTO v_player_status
  FROM public.gather_multiplayer_players p
  WHERE p.game_id = p_game_id AND p.user_id = v_uid;

  IF v_player_status NOT IN ('joined', 'invited') OR v_player_status IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this Ludo lobby.';
  END IF;
$old$;
  v_new := $new$
  IF v_game.id IS NULL THEN
    RAISE EXCEPTION 'This Ludo lobby is no longer available.';
  END IF;

  SELECT p.status INTO v_player_status
  FROM public.gather_multiplayer_players p
  WHERE p.game_id = p_game_id AND p.user_id = v_uid;

  IF v_player_status = 'spectating' THEN
    UPDATE public.gather_multiplayer_players
    SET status = 'left', ready = false, updated_at = now()
    WHERE game_id = p_game_id AND user_id = v_uid AND status = 'spectating';

    UPDATE public.gather_multiplayer_games
    SET revision = revision + 1, updated_at = now()
    WHERE id = p_game_id;

    RETURN true;
  END IF;

  IF v_game.status <> 'active' THEN
    RAISE EXCEPTION 'This Ludo lobby is no longer active.';
  END IF;

  IF v_player_status NOT IN ('joined', 'invited') OR v_player_status IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this Ludo lobby.';
  END IF;
$new$;

  if position(v_new in v_definition) > 0 then
    null;
  elsif position(v_old in v_definition) > 0 then
    execute replace(v_definition, v_old, v_new);
  else
    raise exception 'Could not safely patch the Ludo leave lifecycle.';
  end if;
end;
$migration$;