-- Enforce explicit Ready confirmation for every UNO player, including the host.
-- Clamp the effective player capacity to the agreed 2–10 range, even for older lobbies.

DO $uno_readiness_and_cap$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition:=pg_get_functiondef('public.gather_uno_create(uuid,text,uuid[],integer)'::regprocedure);
  v_old:=$old$set ready=true$old$;
  v_new:=$new$set ready=false$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find UNO host default readiness.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);

  v_definition:=pg_get_functiondef('public.gather_uno_join(uuid,text)'::regprocedure);
  v_old:=$old$set status='joined',ready=true,joined_at=now()$old$;
  v_new:=$new$set status='joined',ready=false,joined_at=now()$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find UNO join readiness update.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old:=$old$values(p_game_id,auth.uid(),'joined',upper(coalesce(p_color,'#40826D')),true,now())$old$;
  v_new:=$new$values(p_game_id,auth.uid(),'joined',upper(coalesce(p_color,'#40826D')),false,now())$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find UNO join insertion readiness.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old:=$old$if n>=coalesce((g.settings->>'max_players')::int,10) then$old$;
  v_new:=$new$if n>=least(10,coalesce((g.settings->>'max_players')::int,10)) then$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find UNO join player cap.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);

  v_definition:=pg_get_functiondef('public.gather_uno_start(uuid)'::regprocedure);
  v_old:=$old$if i>coalesce((g.settings->>'max_players')::int,10) then$old$;
  v_new:=$new$if i>least(10,coalesce((g.settings->>'max_players')::int,10)) then$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find UNO start player cap.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END
$uno_readiness_and_cap$;
