-- When every joined player confirms the results, return to the same waiting room.
-- Keep cumulative points in public game state and require players to Ready again.

CREATE OR REPLACE FUNCTION public.gather_uno_done(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  g public.gather_multiplayer_games;
  s jsonb;
  done_map jsonb;
  joined_ids uuid[];
  all_done boolean;
  pending boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;

  SELECT * INTO g
    FROM public.gather_multiplayer_games
   WHERE id=p_game_id AND game_type='uno'
   FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'UNO game not found.'; END IF;

  IF g.conversation_id IS NOT NULL THEN
    IF NOT private.is_conversation_member(g.conversation_id) THEN
      RAISE EXCEPTION 'Game access is unavailable.';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.gather_multiplayer_players AS mp
     WHERE mp.game_id=p_game_id
       AND mp.user_id=auth.uid()
       AND mp.status='joined'
  ) THEN
    RAISE EXCEPTION 'Game access is unavailable.';
  END IF;

  SELECT payload INTO s
    FROM private.gather_uno_private_states
   WHERE game_id=p_game_id
   FOR UPDATE;
  IF s IS NULL OR (s->>'winner_id' IS NULL AND NOT coalesce((s->>'finished')::boolean,false)) THEN
    RAISE EXCEPTION 'The match has not finished yet.';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.gather_multiplayer_players
     WHERE game_id=p_game_id AND user_id=auth.uid() AND status='joined'
  ) THEN
    RAISE EXCEPTION 'Only players in this match can confirm they are done.';
  END IF;

  done_map:=coalesce(s->'done','{}'::jsonb)
    || jsonb_build_object(auth.uid()::text,true);
  s:=jsonb_set(s,'{done}',done_map,true);

  SELECT coalesce(array_agg(user_id),'{}'::uuid[])
    INTO joined_ids
    FROM public.gather_multiplayer_players
   WHERE game_id=p_game_id AND status='joined';

  all_done:=cardinality(joined_ids)>0 AND NOT EXISTS(
    SELECT 1 FROM unnest(joined_ids) u
     WHERE NOT coalesce((done_map->>u::text)::boolean,false)
  );

  SELECT EXISTS(
    SELECT 1 FROM private.gather_uno_rematch_offers
     WHERE game_id=p_game_id AND status='pending'
  ) INTO pending;

  IF all_done AND NOT pending THEN
    DELETE FROM private.gather_uno_private_states
     WHERE game_id=p_game_id;

    UPDATE public.gather_multiplayer_players
       SET ready=false
     WHERE game_id=p_game_id AND status='joined';

    UPDATE public.gather_multiplayer_games
       SET status='active',
           state=jsonb_build_object(
             'version',1,
             'started',false,
             'round_number',coalesce((g.state->>'round_number')::integer,1),
             'match_scores',coalesce(g.state->'match_scores','{}'::jsonb),
             'round_points',0
           ),
           revision=revision+1,
           updated_at=now()
     WHERE id=p_game_id;

    RETURN jsonb_build_object(
      'done',true,
      'all_done',true,
      'lobby_status','active',
      'returned_to_lobby',true
    );
  END IF;

  UPDATE private.gather_uno_private_states
     SET payload=s,updated_at=now()
   WHERE game_id=p_game_id;

  UPDATE public.gather_multiplayer_games
     SET state=state||jsonb_build_object('done',done_map,'finished',true),
         status='active',
         revision=revision+1,
         updated_at=now()
   WHERE id=p_game_id;

  RETURN jsonb_build_object(
    'done',true,
    'all_done',all_done,
    'lobby_status','active',
    'returned_to_lobby',false
  );
END
$function$;
