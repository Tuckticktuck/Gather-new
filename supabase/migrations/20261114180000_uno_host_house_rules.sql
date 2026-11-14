-- Host-configurable, server-enforced UNO house rules.
-- Rules are stored on the game row and copied into the private match state at start.
-- Defaults preserve the existing standard deal and Wild Draw Four restriction.

CREATE OR REPLACE FUNCTION public.gather_uno_set_house_rules(
  p_game_id uuid,
  p_house_rules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_game public.gather_multiplayer_games;
  v_hand_size integer := 7;
  v_draw_until_playable boolean := false;
  v_wild4_anytime boolean := false;
  v_rules jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  IF p_house_rules IS NULL OR jsonb_typeof(p_house_rules) <> 'object' THEN
    RAISE EXCEPTION 'House rules must be provided as an object.';
  END IF;

  IF p_house_rules ? 'starting_hand_size' THEN
    IF p_house_rules->>'starting_hand_size' NOT IN ('5', '7', '10') THEN
      RAISE EXCEPTION 'Starting hand size must be 5, 7, or 10 cards.';
    END IF;
    v_hand_size := (p_house_rules->>'starting_hand_size')::integer;
  END IF;

  IF p_house_rules ? 'draw_until_playable'
     AND jsonb_typeof(p_house_rules->'draw_until_playable') <> 'boolean' THEN
    RAISE EXCEPTION 'Draw-until-playable must be true or false.';
  END IF;

  IF p_house_rules ? 'wild4_anytime'
     AND jsonb_typeof(p_house_rules->'wild4_anytime') <> 'boolean' THEN
    RAISE EXCEPTION 'Wild Draw Four override must be true or false.';
  END IF;

  v_draw_until_playable := coalesce((p_house_rules->>'draw_until_playable')::boolean, false);
  v_wild4_anytime := coalesce((p_house_rules->>'wild4_anytime')::boolean, false);

  v_rules := jsonb_build_object(
    'starting_hand_size', v_hand_size,
    'draw_until_playable', v_draw_until_playable,
    'wild4_anytime', v_wild4_anytime
  );

  SELECT *
    INTO v_game
    FROM public.gather_multiplayer_games
   WHERE id = p_game_id
     AND game_type = 'uno'
   FOR UPDATE;

  IF v_game.id IS NULL OR v_game.status <> 'active' THEN
    RAISE EXCEPTION 'This UNO lobby is no longer active.';
  END IF;

  IF v_game.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'Only the host can change UNO house rules.';
  END IF;

  IF coalesce((v_game.state->>'started')::boolean, false) THEN
    RAISE EXCEPTION 'House rules cannot be changed after the match starts.';
  END IF;

  UPDATE public.gather_multiplayer_games
     SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{house_rules}', v_rules, true),
         state = jsonb_set(coalesce(state, '{}'::jsonb), '{house_rules}', v_rules, true),
         revision = revision + 1,
         updated_at = now()
   WHERE id = p_game_id;

  RETURN jsonb_build_object('game_id', p_game_id, 'house_rules', v_rules);
END
$function$;

REVOKE ALL ON FUNCTION public.gather_uno_set_house_rules(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gather_uno_set_house_rules(uuid, jsonb) TO authenticated;

DO $uno_house_rules_patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  -- Persist a complete default rule set when a new UNO lobby is created.
  v_definition := pg_get_functiondef('public.gather_uno_create(uuid,text,uuid[],integer)'::regprocedure);
  v_old := $old$jsonb_build_object('max_players',p_max_players),$old$;
  v_new := $new$jsonb_build_object(
      'max_players',p_max_players,
      'house_rules',jsonb_build_object(
        'starting_hand_size',7,
        'draw_until_playable',false,
        'wild4_anytime',false
      )
    ),$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO create settings clause.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  -- Copy sanitized host options into each new private match and its public state.
  v_definition := pg_get_functiondef('public.gather_uno_start(uuid)'::regprocedure);

  v_old := $old$card json;$old$;
  v_new := $new$card json; v_house_rules jsonb; v_hand_size integer;$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO start declarations.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$if i>least(10,coalesce((g.settings->>'max_players')::int,10)) then raise exception 'This lobby has too many players.'; end if;
 for c in select unnest(colors) loop$old$;
  v_new := $new$if i>least(10,coalesce((g.settings->>'max_players')::int,10)) then raise exception 'This lobby has too many players.'; end if;
 v_house_rules := jsonb_build_object(
   'starting_hand_size',
     case when g.settings->'house_rules'->>'starting_hand_size' in ('5','7','10')
       then (g.settings->'house_rules'->>'starting_hand_size')::integer else 7 end,
   'draw_until_playable',
     case when g.settings->'house_rules'->>'draw_until_playable' in ('true','false')
       then (g.settings->'house_rules'->>'draw_until_playable')::boolean else false end,
   'wild4_anytime',
     case when g.settings->'house_rules'->>'wild4_anytime' in ('true','false')
       then (g.settings->'house_rules'->>'wild4_anytime')::boolean else false end
 );
 v_hand_size := (v_house_rules->>'starting_hand_size')::integer;
 for c in select unnest(colors) loop$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO start player-limit clause.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$for i in 1..7 loop$old$;
  v_new := $new$for i in 1..v_hand_size loop$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO initial hand deal loop.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$'uno_called',jsonb_build_object(),'done',jsonb_build_object(),'finished',false))$old$;
  v_new := $new$'uno_called',jsonb_build_object(),'done',jsonb_build_object(),'finished',false,'house_rules',v_house_rules))$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO private state initializer.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$'done',jsonb_build_object(),'finished',false,
 'round_number',$old$;
  v_new := $new$'done',jsonb_build_object(),'finished',false,'house_rules',v_house_rules,
 'round_number',$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO public state initializer.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;

  -- Enforce draw-until-playable and the optional Wild Draw Four override in SQL.
  v_definition := pg_get_functiondef('public.gather_uno_action(uuid,text,text,text)'::regprocedure);

  v_old := $old$v_match_scores jsonb;$old$;
  v_new := $new$v_match_scores jsonb; v_house_rules jsonb; cards_drawn integer:=0; playable boolean:=false; topcard jsonb;$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO action declarations.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$currentcolor:=s->>'current_color'; if p_action<>'call_uno' then$old$;
  v_new := $new$currentcolor:=s->>'current_color';
 v_house_rules:=coalesce(s->'house_rules',g.settings->'house_rules',jsonb_build_object('starting_hand_size',7,'draw_until_playable',false,'wild4_anytime',false));
 if p_action<>'call_uno' then$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO current-color assignment.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$elsif p_action='draw' then
  if s->>'drawn_card_id' is not null then raise exception 'You already drew one card this turn. Play it if legal or pass.'; end if;
  if jsonb_array_length(deck)=0 then
   if jsonb_array_length(disc)>1 then
    select coalesce(jsonb_agg(x order by random()),'[]'::jsonb) into deck from jsonb_array_elements(disc) x where x->>'id'<>(disc->(jsonb_array_length(disc)-1)->>'id');
    disc:=jsonb_build_array(disc->(jsonb_array_length(disc)-1));
   end if;
  end if;
  if jsonb_array_length(deck)=0 then raise exception 'There are no cards left to draw.'; end if;
  card:=deck->0;
  hand:=hand||jsonb_build_array(card); deck:=deck - 0;
  s:=jsonb_set(s,array['hands',uid::text],hand,true);
  s:=jsonb_set(s,'{deck}',deck,false);
  s:=jsonb_set(s,'{drawn_card_id}',to_jsonb(card->>'id'),true);
  s:=jsonb_set(s,'{message}',to_jsonb('You drew one card. Play it if it is legal, or pass.'::text),true);
 elsif p_action='pass' then$old$;

  v_new := $new$elsif p_action='draw' then
  if s->>'drawn_card_id' is not null then raise exception 'You already drew one card this turn. Play it if legal or pass.'; end if;
  if coalesce((v_house_rules->>'draw_until_playable')::boolean,false) then
   cards_drawn:=0; playable:=false; topcard:=disc->(jsonb_array_length(disc)-1);
   while not playable loop
    if jsonb_array_length(deck)=0 then
     if jsonb_array_length(disc)>1 then
      select coalesce(jsonb_agg(x order by random()),'[]'::jsonb) into deck
        from jsonb_array_elements(disc) x
       where x->>'id'<>(disc->(jsonb_array_length(disc)-1)->>'id');
      disc:=jsonb_build_array(disc->(jsonb_array_length(disc)-1));
     else
      exit;
     end if;
    end if;
    if jsonb_array_length(deck)=0 then exit; end if;
    card:=deck->0; deck:=deck-0;
    hand:=hand||jsonb_build_array(card);
    cards_drawn:=cards_drawn+1;
    if card->>'kind'='wild' then
     playable:=true;
    elsif card->>'kind'='wild4' then
     playable:=coalesce((v_house_rules->>'wild4_anytime')::boolean,false)
       or not exists(select 1 from jsonb_array_elements(hand) x where x->>'color'=currentcolor and x->>'id'<>card->>'id');
    else
     playable:=card->>'color'=currentcolor or card->>'value'=topcard->>'value';
    end if;
   end loop;
   s:=jsonb_set(s,array['hands',uid::text],hand,true);
   s:=jsonb_set(s,'{deck}',deck,false);
   if playable then
    s:=jsonb_set(s,'{drawn_card_id}',to_jsonb(card->>'id'),true);
    s:=jsonb_set(s,'{message}',to_jsonb(format('You drew %s card(s). Play the drawn card if legal, or pass.',cards_drawn)),true);
   else
    idx:=mod(idx+dir+n,n);
    s:=jsonb_set(s,'{turn_index}',to_jsonb(idx),false);
    s:=jsonb_set(s,'{turn_user_id}',to_jsonb(order_ids[idx+1]),false);
    s:=jsonb_set(s,'{drawn_card_id}','null'::jsonb,true);
    s:=jsonb_set(s,'{message}',to_jsonb(format('No playable card was found after drawing %s card(s). Your turn was passed.',cards_drawn)),true);
   end if;
  else
   if jsonb_array_length(deck)=0 then
    if jsonb_array_length(disc)>1 then
     select coalesce(jsonb_agg(x order by random()),'[]'::jsonb) into deck
       from jsonb_array_elements(disc) x
      where x->>'id'<>(disc->(jsonb_array_length(disc)-1)->>'id');
     disc:=jsonb_build_array(disc->(jsonb_array_length(disc)-1));
    end if;
   end if;
   if jsonb_array_length(deck)=0 then raise exception 'There are no cards left to draw.'; end if;
   card:=deck->0;
   hand:=hand||jsonb_build_array(card); deck:=deck - 0;
   s:=jsonb_set(s,array['hands',uid::text],hand,true);
   s:=jsonb_set(s,'{deck}',deck,false);
   s:=jsonb_set(s,'{drawn_card_id}',to_jsonb(card->>'id'),true);
   s:=jsonb_set(s,'{message}',to_jsonb('You drew one card. Play it if it is legal, or pass.'::text),true);
  end if;
 elsif p_action='pass' then$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO draw-action block.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$if card->>'kind'='wild4' and exists(select 1 from jsonb_array_elements(hand) x where x->>'color'=currentcolor and x->>'id'<>p_card_id) then raise exception 'You can only play Wild Draw Four when you have no card matching the current color.'; end if;$old$;
  v_new := $new$if card->>'kind'='wild4' and not coalesce((v_house_rules->>'wild4_anytime')::boolean,false)
     and exists(select 1 from jsonb_array_elements(hand) x where x->>'color'=currentcolor and x->>'id'<>p_card_id)
   then raise exception 'You can only play Wild Draw Four when you have no card matching the current color.'; end if;$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO Wild Draw Four validation.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  -- In standard UNO, Reverse changes direction; with two players it acts like Skip.
  v_old := $old$elsif card->>'kind'='reverse' then dir:=dir*-1; skipturn:=true;$old$;
  v_new := $new$elsif card->>'kind'='reverse' then dir:=dir*-1; skipturn:=(n=2);$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO Reverse handling.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$update public.gather_multiplayer_games set state=jsonb_build_object('version',1,'started',true,'top_card',$old$;
  v_new := $new$update public.gather_multiplayer_games set state=jsonb_build_object('version',1,'started',true,'house_rules',v_house_rules,'top_card',$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate UNO public state update.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END
$uno_house_rules_patch$;
