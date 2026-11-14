-- Keep late joins and ready confirmations consistent with host-selected UNO rules.

DO $uno_house_rules_followup$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.gather_uno_join(uuid,text)'::regprocedure);
  v_old := $old$for i in 1..7 loop$old$;
  v_new := $new$for i in 1..(case
       when coalesce(s->'house_rules'->>'starting_hand_size','7') in ('5','7','10')
         then coalesce((s->'house_rules'->>'starting_hand_size')::integer,7)
       else 7
     end) loop$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO late-join deal loop.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;

  v_definition := pg_get_functiondef('public.gather_uno_set_house_rules(uuid,jsonb)'::regprocedure);
  v_old := $old$  RETURN jsonb_build_object('game_id', p_game_id, 'house_rules', v_rules);$old$;
  v_new := $new$  UPDATE public.gather_multiplayer_players
     SET ready = false
   WHERE game_id = p_game_id
     AND status = 'joined';

  RETURN jsonb_build_object('game_id', p_game_id, 'house_rules', v_rules);$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO house-rules response block.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END
$uno_house_rules_followup$;
