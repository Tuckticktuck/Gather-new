-- Permit authenticated players to queue or cancel their own Chess pre-move
-- during the opponent's turn. The move itself is still validated by the
-- server-side Chess engine when the player's turn arrives.
CREATE OR REPLACE FUNCTION private.commit_validated_game_transition(
  p_match_id uuid,
  p_expected_version bigint,
  p_actor_id uuid,
  p_event_type text,
  p_payload jsonb,
  p_next_state jsonb,
  p_next_turn_user_id uuid,
  p_next_status text,
  p_private_state jsonb
)
RETURNS public.game_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_match public.game_matches%rowtype;
  v_next_version bigint;
BEGIN
  IF p_match_id IS NULL OR p_expected_version IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Match, expected version, and actor are required' USING errcode = '22023';
  END IF;
  IF p_event_type IS NULL OR p_event_type !~ '^[a-z][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'Invalid event type' USING errcode = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR p_next_state IS NULL OR jsonb_typeof(p_next_state) <> 'object' THEN
    RAISE EXCEPTION 'Event payload and next state must be JSON objects' USING errcode = '22023';
  END IF;
  IF p_private_state IS NOT NULL AND jsonb_typeof(p_private_state) <> 'object' THEN
    RAISE EXCEPTION 'Private game state must be a JSON object' USING errcode = '22023';
  END IF;
  IF p_next_status IS NULL OR p_next_status NOT IN ('active','completed') THEN
    RAISE EXCEPTION 'Game actions may only keep a match active or complete it' USING errcode = '22023';
  END IF;
  IF p_next_status = 'completed' AND p_next_turn_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'A completed match cannot have a current turn' USING errcode = '22023';
  END IF;

  SELECT * INTO v_match FROM public.game_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game match not found' USING errcode = 'P0002'; END IF;
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Only active matches accept game actions' USING errcode = '55000';
  END IF;
  IF v_match.version <> p_expected_version THEN
    RAISE EXCEPTION 'Stale game state; reload before retrying' USING errcode = '40001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.game_match_players p
    WHERE p.match_id = p_match_id AND p.user_id = p_actor_id AND p.response = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Actor is not an accepted player' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = v_match.conversation_id AND cm.user_id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'Actor is no longer a conversation member' USING errcode = '42501';
  END IF;

  IF v_match.current_turn_user_id IS NOT NULL
     AND v_match.current_turn_user_id <> p_actor_id
     AND NOT (
       (
         v_match.game_key = 'uno'
         AND p_event_type IN ('uno_called','uno_caught')
         AND v_match.state->>'pendingUnoPlayerId' IS NOT NULL
         AND v_match.state->'handCounts'->>(v_match.state->>'pendingUnoPlayerId') = '1'
         AND p_next_state->>'pendingUnoPlayerId' IS NULL
         AND p_next_turn_user_id IS NOT DISTINCT FROM v_match.current_turn_user_id
         AND (
           (p_event_type = 'uno_called' AND v_match.state->>'pendingUnoPlayerId' = p_actor_id::text)
           OR
           (p_event_type = 'uno_caught' AND v_match.state->>'pendingUnoPlayerId' <> p_actor_id::text)
         )
       )
       OR
       (
         v_match.game_key = 'chess'
         AND p_event_type IN ('chess_premove_queued','chess_premove_cancelled')
         AND v_match.current_turn_user_id IS NOT NULL
         AND p_next_turn_user_id IS NOT DISTINCT FROM v_match.current_turn_user_id
         AND p_next_status = 'active'
         AND p_next_state = v_match.state
         AND (
           v_match.state->>'whiteUserId' = p_actor_id::text
           OR v_match.state->>'blackUserId' = p_actor_id::text
         )
         AND p_private_state IS NOT NULL
         AND jsonb_typeof(p_private_state->'premoves') = 'object'
         AND (
           (p_event_type = 'chess_premove_queued' AND (p_private_state->'premoves') ? p_actor_id::text)
           OR
           (p_event_type = 'chess_premove_cancelled' AND NOT ((p_private_state->'premoves') ? p_actor_id::text))
         )
       )
     ) THEN
    RAISE EXCEPTION 'It is not this player''s turn' USING errcode = '42501';
  END IF;

  IF p_next_turn_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.game_match_players p
    WHERE p.match_id = p_match_id AND p.user_id = p_next_turn_user_id AND p.response = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Next turn must belong to an accepted player' USING errcode = '22023';
  END IF;

  v_next_version := v_match.version + 1;
  UPDATE public.game_matches
  SET state = p_next_state,
      status = p_next_status,
      current_turn_user_id = p_next_turn_user_id,
      version = v_next_version,
      updated_at = now()
  WHERE id = p_match_id RETURNING * INTO v_match;

  IF p_private_state IS NOT NULL THEN
    INSERT INTO public.game_match_private_state (match_id, state, updated_at)
    VALUES (p_match_id, p_private_state, now())
    ON CONFLICT (match_id) DO UPDATE
      SET state = excluded.state, updated_at = excluded.updated_at;
  END IF;

  INSERT INTO public.game_match_events (match_id, version, actor_id, event_type, payload)
  VALUES (p_match_id, v_next_version, p_actor_id, p_event_type, p_payload);
  RETURN v_match;
END;
$function$;
