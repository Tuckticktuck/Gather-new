-- Preserve finished UNO recap state when a player leaves and close pending rematches safely.
-- All lifecycle operations lock the match row before rematch offer rows.
CREATE OR REPLACE FUNCTION public.gather_uno_leave(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  g public.gather_multiplayer_games;
  s jsonb;
  old_index integer;
  new_index integer;
  new_order text[];
  leaving_index integer;
  remaining integer;
  next_user text;
  pending_offer private.gather_uno_rematch_offers;
  done_map jsonb;
  joined_ids uuid[];
  all_done boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  SELECT * INTO g
    FROM public.gather_multiplayer_games
   WHERE id=p_game_id
     AND game_type='uno'
     AND status='active'
   FOR UPDATE;

  IF g.id IS NULL THEN
    RAISE EXCEPTION 'This UNO lobby is no longer active.';
  END IF;

  IF g.created_by=auth.uid() THEN
    RAISE EXCEPTION 'The host cannot leave. Use End game instead.';
  END IF;

  SELECT payload INTO s
    FROM private.gather_uno_private_states
   WHERE game_id=p_game_id
   FOR UPDATE;

  UPDATE public.gather_multiplayer_players
     SET status='left',ready=false
   WHERE game_id=p_game_id
     AND user_id=auth.uid()
     AND status='joined';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not in this UNO lobby.';
  END IF;

  -- A finished match can remain active while recap confirmations or a
  -- rematch offer are pending. Leaving must not turn that recap back into
  -- an active round or preserve a pending offer for an absent participant.
  IF s IS NOT NULL
     AND (coalesce((s->>'finished')::boolean,false) OR s->>'winner_id' IS NOT NULL) THEN

    FOR pending_offer IN
      SELECT *
        FROM private.gather_uno_rematch_offers
       WHERE game_id=p_game_id
         AND status='pending'
         AND auth.uid()=ANY(participants)
       FOR UPDATE
    LOOP
      UPDATE private.gather_uno_rematch_offers
         SET responses=coalesce(responses,'{}'::jsonb)
               || jsonb_build_object(auth.uid()::text,'declined'),
             status='declined',
             updated_at=now()
       WHERE id=pending_offer.id;

      UPDATE public.notifications
         SET read_at=now()
       WHERE kind='uno_rematch'
         AND body=pending_offer.id::text
         AND read_at IS NULL;

      INSERT INTO public.notifications
        (recipient_id,actor_id,kind,title,body,conversation_id)
      SELECT participant_id,auth.uid(),'uno_rematch_result',
             'UNO rematch cancelled',
             'A player left before the rematch started.',
             g.conversation_id
        FROM unnest(pending_offer.participants) AS participant_id
       WHERE participant_id<>auth.uid();
    END LOOP;

    done_map:=coalesce(s->'done','{}'::jsonb)-auth.uid()::text;
    s:=jsonb_set(s,'{done}',done_map,true);
    s:=jsonb_set(s,'{finished}','true'::jsonb,true);
    s:=s #- array['hands',auth.uid()::text];
    s:=s #- array['uno_called',auth.uid()::text];

    SELECT coalesce(array_agg(user_id),'{}'::uuid[])
      INTO joined_ids
      FROM public.gather_multiplayer_players
     WHERE game_id=p_game_id
       AND status='joined';

    all_done:=cardinality(joined_ids)>0 AND NOT EXISTS(
      SELECT 1
        FROM unnest(joined_ids) u
       WHERE NOT coalesce((done_map->>u::text)::boolean,false)
    );

    UPDATE private.gather_uno_private_states
       SET payload=s,updated_at=now()
     WHERE game_id=p_game_id;

    UPDATE public.gather_multiplayer_games
       SET state=state||jsonb_build_object('done',done_map,'finished',true),
           status=CASE WHEN all_done THEN 'completed' ELSE 'active' END,
           revision=revision+1,
           updated_at=now()
     WHERE id=p_game_id;

    UPDATE public.notifications
       SET read_at=now()
     WHERE recipient_id=auth.uid()
       AND kind='uno_invite'
       AND body=p_game_id::text
       AND read_at IS NULL;

    RETURN true;
  END IF;

  IF s IS NOT NULL AND coalesce((s->>'started')::boolean,false) THEN
    old_index:=coalesce((s->>'turn_index')::integer,0);

    SELECT ordinality-1 INTO leaving_index
      FROM jsonb_array_elements_text(coalesce(s->'order','[]'::jsonb))
        WITH ORDINALITY
     WHERE value=auth.uid()::text
     LIMIT 1;

    SELECT coalesce(array_agg(value ORDER BY ordinality),'{}'::text[])
      INTO new_order
      FROM jsonb_array_elements_text(coalesce(s->'order','[]'::jsonb))
        WITH ORDINALITY
     WHERE value<>auth.uid()::text;

    remaining:=cardinality(new_order);
    s:=jsonb_set(s,'{order}',to_jsonb(new_order),true);
    s:=s #- array['hands',auth.uid()::text];
    s:=s #- array['done',auth.uid()::text];
    s:=s #- array['uno_called',auth.uid()::text];

    IF remaining<2 THEN
      s:=jsonb_set(s,'{finished}','true'::jsonb,true);
      s:=jsonb_set(s,'{turn_user_id}','null'::jsonb,true);

      UPDATE public.gather_multiplayer_games
         SET status='completed',
             state=state||jsonb_build_object('finished',true,'turn_user_id',null),
             revision=revision+1,
             updated_at=now()
       WHERE id=p_game_id;
    ELSE
      IF leaving_index IS NOT NULL AND leaving_index<old_index THEN
        old_index:=old_index-1;
      END IF;

      new_index:=mod(greatest(0,old_index),remaining);
      next_user:=new_order[new_index+1];
      s:=jsonb_set(s,'{turn_index}',to_jsonb(new_index),true);
      s:=jsonb_set(s,'{turn_user_id}',to_jsonb(next_user),true);

      UPDATE public.gather_multiplayer_games
         SET state=state||jsonb_build_object('turn_user_id',next_user,'finished',false),
             revision=revision+1,
             updated_at=now()
       WHERE id=p_game_id;
    END IF;

    UPDATE private.gather_uno_private_states
       SET payload=s,updated_at=now()
     WHERE game_id=p_game_id;
  ELSE
    UPDATE public.gather_multiplayer_games
       SET revision=revision+1,updated_at=now()
     WHERE id=p_game_id;
  END IF;

  UPDATE public.notifications
     SET read_at=now()
   WHERE recipient_id=auth.uid()
     AND kind='uno_invite'
     AND body=p_game_id::text
     AND read_at IS NULL;

  RETURN true;
END
$function$
;

CREATE OR REPLACE FUNCTION public.gather_uno_respond_rematch(p_offer_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  o private.gather_uno_rematch_offers;
  g public.gather_multiplayer_games;
  v_game_id uuid;
  response_map jsonb;
  all_accepted boolean;
  s jsonb;
  joined_ids uuid[];
  done_map jsonb;
  all_done boolean;
  joined_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  -- Match row is always locked before the offer row. UNO leave/rematch
  -- operations use this same order to avoid deadlocks during concurrent clicks.
  SELECT game_id INTO v_game_id
    FROM private.gather_uno_rematch_offers
   WHERE id=p_offer_id;

  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'This rematch request no longer exists.';
  END IF;

  SELECT * INTO g
    FROM public.gather_multiplayer_games
   WHERE id=v_game_id
     AND game_type='uno'
   FOR UPDATE;

  IF g.id IS NULL THEN
    RAISE EXCEPTION 'The UNO lobby no longer exists.';
  END IF;

  SELECT * INTO o
    FROM private.gather_uno_rematch_offers
   WHERE id=p_offer_id
   FOR UPDATE;

  IF o.id IS NULL OR o.status<>'pending' THEN
    RAISE EXCEPTION 'This rematch request is no longer waiting for responses.';
  END IF;

  IF NOT (auth.uid()=ANY(o.participants)) OR auth.uid()=o.requested_by THEN
    RAISE EXCEPTION 'This rematch request is not for you.';
  END IF;

  IF NOT EXISTS(
    SELECT 1
      FROM public.gather_multiplayer_players
     WHERE game_id=o.game_id
       AND user_id=auth.uid()
       AND status='joined'
  ) THEN
    response_map:=coalesce(o.responses,'{}'::jsonb)
      || jsonb_build_object(auth.uid()::text,'declined');

    UPDATE private.gather_uno_rematch_offers
       SET responses=response_map,status='declined',updated_at=now()
     WHERE id=p_offer_id;

    UPDATE public.notifications
       SET read_at=now()
     WHERE kind='uno_rematch'
       AND body=p_offer_id::text
       AND read_at IS NULL;

    INSERT INTO public.notifications
      (recipient_id,actor_id,kind,title,body,conversation_id)
    VALUES(o.requested_by,auth.uid(),'uno_rematch_result',
      'UNO rematch cancelled',
      'A participant left before accepting the rematch.',
      g.conversation_id);

    SELECT payload INTO s
      FROM private.gather_uno_private_states
     WHERE game_id=o.game_id;

    done_map:=coalesce(s->'done','{}'::jsonb);
    SELECT coalesce(array_agg(user_id),'{}'::uuid[])
      INTO joined_ids
      FROM public.gather_multiplayer_players
     WHERE game_id=o.game_id
       AND status='joined';

    all_done:=cardinality(joined_ids)>0 AND NOT EXISTS(
      SELECT 1 FROM unnest(joined_ids) u
       WHERE NOT coalesce((done_map->>u::text)::boolean,false)
    );

    IF all_done THEN
      UPDATE public.gather_multiplayer_games
         SET status='completed',revision=revision+1,updated_at=now()
       WHERE id=o.game_id;
    END IF;

    RETURN jsonb_build_object('status','declined','reason','participant_left','all_done',all_done);
  END IF;

  response_map:=coalesce(o.responses,'{}'::jsonb)
    || jsonb_build_object(auth.uid()::text,CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END);

  IF NOT p_accept THEN
    UPDATE private.gather_uno_rematch_offers
       SET responses=response_map,status='declined',updated_at=now()
     WHERE id=p_offer_id;

    UPDATE public.notifications
       SET read_at=now()
     WHERE kind='uno_rematch'
       AND body=p_offer_id::text;

    INSERT INTO public.notifications
      (recipient_id,actor_id,kind,title,body,conversation_id)
    VALUES(o.requested_by,auth.uid(),'uno_rematch_result',
      'UNO rematch declined',
      'A player declined the rematch request.',
      g.conversation_id);

    SELECT payload INTO s
      FROM private.gather_uno_private_states
     WHERE game_id=o.game_id;

    done_map:=coalesce(s->'done','{}'::jsonb);
    SELECT coalesce(array_agg(user_id),'{}'::uuid[])
      INTO joined_ids
      FROM public.gather_multiplayer_players
     WHERE game_id=o.game_id
       AND status='joined';

    all_done:=cardinality(joined_ids)>0 AND NOT EXISTS(
      SELECT 1 FROM unnest(joined_ids) u
       WHERE NOT coalesce((done_map->>u::text)::boolean,false)
    );

    IF all_done THEN
      UPDATE public.gather_multiplayer_games
         SET status='completed',revision=revision+1,updated_at=now()
       WHERE id=o.game_id;
    END IF;

    RETURN jsonb_build_object('status','declined','all_done',all_done);
  END IF;

  all_accepted:=NOT EXISTS(
    SELECT 1
      FROM unnest(o.participants) participant_id
     WHERE response_map->>participant_id::text IS DISTINCT FROM 'accepted'
  );

  UPDATE private.gather_uno_rematch_offers
     SET responses=response_map,
         status=CASE WHEN all_accepted THEN 'accepted' ELSE 'pending' END,
         updated_at=now()
   WHERE id=p_offer_id;

  UPDATE public.notifications
     SET read_at=now()
   WHERE kind='uno_rematch'
     AND body=p_offer_id::text
     AND recipient_id=auth.uid();

  IF NOT all_accepted THEN
    RETURN jsonb_build_object('status','accepted_waiting');
  END IF;

  SELECT count(*) INTO joined_count
    FROM public.gather_multiplayer_players
   WHERE game_id=o.game_id
     AND status='joined'
     AND user_id=ANY(o.participants);

  IF joined_count<>cardinality(o.participants) THEN
    UPDATE private.gather_uno_rematch_offers
       SET status='declined',updated_at=now()
     WHERE id=p_offer_id;

    UPDATE public.notifications
       SET read_at=now()
     WHERE kind='uno_rematch'
       AND body=p_offer_id::text
       AND read_at IS NULL;

    INSERT INTO public.notifications
      (recipient_id,actor_id,kind,title,body,conversation_id)
    VALUES(o.requested_by,auth.uid(),'uno_rematch_result',
      'UNO rematch cancelled',
      'A participant left before the rematch could start.',
      g.conversation_id);

    SELECT payload INTO s
      FROM private.gather_uno_private_states
     WHERE game_id=o.game_id;

    done_map:=coalesce(s->'done','{}'::jsonb);
    SELECT coalesce(array_agg(user_id),'{}'::uuid[])
      INTO joined_ids
      FROM public.gather_multiplayer_players
     WHERE game_id=o.game_id
       AND status='joined';

    all_done:=cardinality(joined_ids)>0 AND NOT EXISTS(
      SELECT 1 FROM unnest(joined_ids) u
       WHERE NOT coalesce((done_map->>u::text)::boolean,false)
    );

    IF all_done THEN
      UPDATE public.gather_multiplayer_games
         SET status='completed',revision=revision+1,updated_at=now()
       WHERE id=o.game_id;
    END IF;

    RETURN jsonb_build_object('status','declined','reason','participant_left','all_done',all_done);
  END IF;

  UPDATE public.notifications
     SET read_at=now()
   WHERE kind='uno_rematch'
     AND body=p_offer_id::text;

  UPDATE public.gather_multiplayer_players
     SET ready=true
   WHERE game_id=o.game_id
     AND status='joined';

  DELETE FROM private.gather_uno_private_states
   WHERE game_id=o.game_id;

  UPDATE public.gather_multiplayer_games
     SET status='active',
         state=jsonb_build_object('version',1,'started',false),
         revision=revision+1,
         updated_at=now()
   WHERE id=o.game_id;

  PERFORM public.gather_uno_start(o.game_id);

  RETURN jsonb_build_object('status','started','game_id',o.game_id);
END
$function$
;
