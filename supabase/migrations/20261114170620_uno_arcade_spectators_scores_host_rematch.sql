-- Extend UNO with read-only spectators, authoritative match scores, a 10-player server cap,
-- and a host-only rematch override. Existing UNO rule validation remains server-side.

DO $uno_arcade_replacements$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.gather_uno_create(uuid,text,uuid[],integer)'::regprocedure);
  v_old := $old$if p_max_players < 2 or p_max_players > 20 then raise exception 'Choose between 2 and 20 players.'; end if;$old$;
  v_new := $new$if p_max_players < 2 or p_max_players > 10 then raise exception 'Choose between 2 and 10 players.'; end if;$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO create player limit clause.'; END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.gather_uno_join(uuid,text)'::regprocedure);
  v_old := $old$status in ('invited','joined','left')$old$;
  v_new := $new$status in ('invited','joined','left','spectating')$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO invite membership check.'; END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$elsif coalesce(p.status,'') not in ('invited','joined','left','declined') then$old$;
  v_new := $new$elsif coalesce(p.status,'') not in ('invited','joined','left','declined','spectating') then$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO standalone membership check.'; END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$where game_id=p_game_id and user_id=auth.uid() and status in ('invited','left','declined')$old$;
  v_new := $new$where game_id=p_game_id and user_id=auth.uid() and status in ('invited','left','declined','spectating')$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO late-join status update.'; END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.gather_uno_get_state(uuid)'::regprocedure);
  v_old := $old$status in ('invited','joined','left','declined')$old$;
  v_new := $new$status in ('invited','joined','left','declined','spectating')$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO state membership check.'; END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$ if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=me and status='joined') then raise exception 'Join this UNO game to view your cards.'; end if;
 result:=jsonb_build_object($old$;
  v_new := $new$ if exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=me and status='spectating') then
  result:=jsonb_build_object(
   'game',to_jsonb(g),'public_state',g.state,
   'hand','[]'::jsonb,'drawn_card_id',null,
   'started',s->>'started'='true','spectating',true,'rematch_pending',pending,
   'players',(select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'status',p.status,'ready',p.ready,'card_count',jsonb_array_length(coalesce(s->'hands'->p.user_id::text,'[]'::jsonb))) order by p.joined_at),'[]'::jsonb) from public.gather_multiplayer_players p where p.game_id=p_game_id and p.status in ('joined','invited'))
  );
  return result;
 end if;
 if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=me and status='joined') then raise exception 'Join this UNO game to view your cards.'; end if;
 result:=jsonb_build_object($new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO private-state return path.'; END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$'started',true,'rematch_pending',pending,$old$;
  v_new := $new$'started',true,'spectating',false,'rematch_pending',pending,$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO joined-state marker.'; END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.gather_uno_action(uuid,text,text,text)'::regprocedure);
  v_old := $old$declare g public.gather_multiplayer_games; s jsonb; hand jsonb; deck jsonb; disc jsonb; order_ids uuid[]; idx int; dir int; n int; nextidx int; uid uuid:=auth.uid(); card jsonb; target uuid; targethand jsonb; prevuid uuid; currentcolor text; penalty int:=0; skipturn boolean:=false; foundcard boolean:=false; i int; counts jsonb;$old$;
  v_new := $new$declare g public.gather_multiplayer_games; s jsonb; hand jsonb; deck jsonb; disc jsonb; order_ids uuid[]; idx int; dir int; n int; nextidx int; uid uuid:=auth.uid(); card jsonb; target uuid; targethand jsonb; prevuid uuid; currentcolor text; penalty int:=0; skipturn boolean:=false; foundcard boolean:=false; i int; counts jsonb; v_round_points integer:=0; v_match_scores jsonb;$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO action declaration.'; END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$ select payload into s from private.gather_uno_private_states where game_id=p_game_id for update;$old$;
  v_new := $new$ if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=uid and status='joined') then
  raise exception 'Only joined players can take UNO actions.';
 end if;
 select payload into s from private.gather_uno_private_states where game_id=p_game_id for update;$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO action-state load.'; END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$if jsonb_array_length(hand)=0 then
   s:=jsonb_set(s,'{winner_id}',to_jsonb(uid),false);
  else$old$;
  v_new := $new$if jsonb_array_length(hand)=0 then
   s:=jsonb_set(s,'{winner_id}',to_jsonb(uid),false);
   select coalesce(sum(
    case
     when card_rows.card->>'kind'='number' then coalesce((card_rows.card->>'value')::integer,0)
     when card_rows.card->>'kind' in ('draw2','skip','reverse') then 20
     when card_rows.card->>'kind' in ('wild','wild4') then 50
     else 0
    end
   ),0)::integer
   into v_round_points
   from jsonb_each(coalesce(s->'hands','{}'::jsonb)) as player_hands(user_id, cards)
   cross join lateral jsonb_array_elements(player_hands.cards) as card_rows(card)
   where player_hands.user_id<>uid::text;
   v_match_scores:=coalesce(g.state->'match_scores','{}'::jsonb);
   v_match_scores:=jsonb_set(
    v_match_scores,
    array[uid::text],
    to_jsonb(coalesce((v_match_scores->>uid::text)::integer,0)+v_round_points),
    true
   );
   s:=jsonb_set(s,'{round_points}',to_jsonb(v_round_points),true);
   s:=jsonb_set(s,'{match_scores}',v_match_scores,true);
  else$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO round winner scoring block.'; END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$'drawn_pending',s->>'drawn_card_id' is not null)$old$;
  v_new := $new$'drawn_pending',s->>'drawn_card_id' is not null,
 'round_points',s->'round_points',
 'match_scores',coalesce(s->'match_scores',g.state->'match_scores','{}'::jsonb),
 'round_number',coalesce((g.state->>'round_number')::integer,1))$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO public state update.'; END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.gather_uno_start(uuid)'::regprocedure);
  v_old := $old$'players',jsonb_build_array(),'done',jsonb_build_object(),'finished',false)$old$;
  v_new := $new$'players',jsonb_build_array(),'done',jsonb_build_object(),'finished',false,
 'round_number',coalesce((g.state->>'round_number')::integer,0)+1,
 'match_scores',coalesce(g.state->'match_scores','{}'::jsonb),
 'round_points',0)$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO start public state.'; END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.gather_uno_respond_rematch(uuid,boolean)'::regprocedure);
  v_old := $old$state=jsonb_build_object('version',1,'started',false),$old$;
  v_new := $new$state=jsonb_build_object(
          'version',1,'started',false,
          'round_number',coalesce((g.state->>'round_number')::integer,0),
          'match_scores',coalesce(g.state->'match_scores','{}'::jsonb),
          'round_points',0
         ),$new$;
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not locate UNO rematch state reset.'; END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END
$uno_arcade_replacements$;

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
  SELECT * INTO v_game
    FROM public.gather_multiplayer_games
   WHERE id=p_game_id AND game_type='uno' AND status='active'
   FOR UPDATE;
  IF v_game.id IS NULL THEN RAISE EXCEPTION 'This UNO match is not available to watch.'; END IF;
  IF v_game.created_by=v_uid THEN RAISE EXCEPTION 'The host is already part of this UNO match.'; END IF;
  IF private.is_blocked_between(v_game.created_by,v_uid) THEN RAISE EXCEPTION 'You cannot watch this match.'; END IF;

  SELECT * INTO v_player
    FROM public.gather_multiplayer_players
   WHERE game_id=p_game_id AND user_id=v_uid
   FOR UPDATE;
  IF v_player.user_id IS NULL OR v_player.status NOT IN ('invited','spectating') THEN
    RAISE EXCEPTION 'You need a UNO invitation to watch this match.';
  END IF;
  IF v_player.status='spectating' THEN RETURN v_player; END IF;

  SELECT payload INTO v_private_state
    FROM private.gather_uno_private_states
   WHERE game_id=p_game_id;
  IF v_private_state IS NOT NULL
     AND (v_private_state->>'winner_id' IS NOT NULL OR coalesce((v_private_state->>'finished')::boolean,false)) THEN
    RAISE EXCEPTION 'This UNO round has finished.';
  END IF;

  UPDATE public.gather_multiplayer_players
     SET status='spectating',ready=false,color=NULL,x=NULL,y=NULL,is_it=false,updated_at=now()
   WHERE game_id=p_game_id AND user_id=v_uid
   RETURNING * INTO v_player;
  UPDATE public.gather_multiplayer_games SET revision=revision+1,updated_at=now() WHERE id=p_game_id;
  RETURN v_player;
END
$function$;

CREATE OR REPLACE FUNCTION public.gather_uno_stop_spectating(p_game_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  UPDATE public.gather_multiplayer_players
     SET status='left',ready=false,updated_at=now()
   WHERE game_id=p_game_id AND user_id=auth.uid() AND status='spectating';
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not spectating this UNO game.'; END IF;
  UPDATE public.gather_multiplayer_games SET revision=revision+1,updated_at=now() WHERE id=p_game_id AND game_type='uno';
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.gather_uno_host_rematch(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.gather_multiplayer_games;
  v_private_state jsonb;
  v_responses jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  SELECT * INTO v_game
    FROM public.gather_multiplayer_games
   WHERE id=p_game_id AND game_type='uno'
   FOR UPDATE;
  IF v_game.id IS NULL OR v_game.created_by<>auth.uid() THEN
    RAISE EXCEPTION 'Only the UNO host can start a host-authorized rematch.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.gather_multiplayer_players WHERE game_id=p_game_id AND user_id=auth.uid() AND status='joined') THEN
    RAISE EXCEPTION 'The host must still be in the match.';
  END IF;
  SELECT payload INTO v_private_state
    FROM private.gather_uno_private_states
   WHERE game_id=p_game_id
   FOR UPDATE;
  IF v_private_state IS NULL OR (v_private_state->>'winner_id' IS NULL AND NOT coalesce((v_private_state->>'finished')::boolean,false)) THEN
    RAISE EXCEPTION 'The current UNO round must finish before starting a rematch.';
  END IF;
  IF (SELECT count(*) FROM public.gather_multiplayer_players WHERE game_id=p_game_id AND status='joined') < 2 THEN
    RAISE EXCEPTION 'At least two joined players are required for a rematch.';
  END IF;

  SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb('accepted'::text)),'{}'::jsonb)
    INTO v_responses
    FROM public.gather_multiplayer_players
   WHERE game_id=p_game_id AND status='joined';
  UPDATE private.gather_uno_rematch_offers
     SET status='accepted',responses=v_responses,updated_at=now()
   WHERE game_id=p_game_id AND status='pending';
  UPDATE public.notifications SET read_at=now()
   WHERE kind='uno_rematch'
     AND body IN (SELECT id::text FROM private.gather_uno_rematch_offers WHERE game_id=p_game_id AND status='accepted')
     AND read_at IS NULL;

  UPDATE public.gather_multiplayer_players SET ready=true
   WHERE game_id=p_game_id AND status='joined';
  DELETE FROM private.gather_uno_private_states WHERE game_id=p_game_id;
  UPDATE public.gather_multiplayer_games
     SET status='active',
         state=jsonb_build_object(
           'version',1,'started',false,
           'round_number',coalesce((v_game.state->>'round_number')::integer,0),
           'match_scores',coalesce(v_game.state->'match_scores','{}'::jsonb),
           'round_points',0
         ),
         revision=revision+1,updated_at=now()
   WHERE id=p_game_id;
  PERFORM public.gather_uno_start(p_game_id);
  RETURN public.gather_uno_get_state(p_game_id);
END
$function$;

REVOKE ALL ON FUNCTION public.gather_uno_spectate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gather_uno_spectate(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.gather_uno_stop_spectating(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gather_uno_stop_spectating(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.gather_uno_host_rematch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gather_uno_host_rematch(uuid) TO authenticated;
