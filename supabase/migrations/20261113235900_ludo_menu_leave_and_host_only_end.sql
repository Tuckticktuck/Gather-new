-- Ludo match menu: only the host may end a live match, and players may leave safely.

CREATE OR REPLACE FUNCTION public.gather_ludo_multiplayer_action(p_game_id uuid, p_action text, p_token_index integer DEFAULT NULL::integer)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games; v_actor uuid:=auth.uid(); v_state jsonb; v_pieces jsonb;
  v_color text; v_other_color text; v_dice integer; v_roll integer; v_progress integer; v_new_progress integer;
  v_track_position integer; v_other_track integer; v_start_offset integer; v_other_offset integer;
  v_step integer; v_idx integer; v_next_idx integer; v_player_count integer; v_can_move boolean:=false;
  v_safe boolean:=false; v_captured integer:=0; v_finished integer:=0; v_next_user uuid;
  v_result_message text; v_other record;
begin
  if v_actor is null then raise exception 'Sign in to play Ludo.'; end if;
  if p_action not in ('roll','move','end') then raise exception 'That Ludo action is not supported.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='ludo' for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Ludo match is not active.'; end if;
  if v_game.conversation_id is not null then
    if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception 'Game access is unavailable.'; end if;
  elsif not exists (select 1 from public.gather_multiplayer_players p where p.game_id=p_game_id and p.user_id=v_actor and p.status='joined') then
    raise exception 'Only joined players can access this Ludo match.';
  end if;
  if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_actor and status='joined') then
    raise exception 'Only players who joined this Ludo match can play.';
  end if;
  v_state:=coalesce(v_game.state,'{}'::jsonb);
  if p_action='end' then
    if v_game.created_by is distinct from v_actor then
      raise exception 'Only the Ludo host can end this match.';
    end if;
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('The match was ended by the host.'::text),true);
    update public.gather_multiplayer_games set status='completed',state=v_state,revision=revision+1,updated_at=now()
    where id=p_game_id returning * into v_game;
    return v_game;
  end if;
  if not coalesce((v_state->>'started')::boolean,false) then raise exception 'Ludo has not started yet.'; end if;
  if v_state->>'turn_user_id' is distinct from v_actor::text then raise exception 'It is not your turn.'; end if;
  v_color:=v_state->'colors'->>v_actor::text;
  v_start_offset:=case v_color when 'red' then 0 when 'yellow' then 13 when 'blue' then 26 when 'green' then 39 else null end;
  if v_start_offset is null then raise exception 'Your Ludo color could not be found.'; end if;
  v_pieces:=coalesce(v_state->'pieces','{}'::jsonb);
  v_idx:=coalesce((v_state->>'turn_index')::integer,0);
  v_player_count:=jsonb_array_length(coalesce(v_state->'turn_order','[]'::jsonb));
  if v_player_count<2 then raise exception 'This Ludo match has an invalid turn order.'; end if;

  if p_action='roll' then
    if v_state->>'dice' is not null then raise exception 'Move one of your tokens before rolling again.'; end if;
    v_roll:=floor(random()*6)::integer+1;
    for v_step in 0..3 loop
      v_progress:=(v_pieces->v_color->>v_step)::integer;
      if (v_progress=-1 and v_roll=6) or (v_progress>=0 and v_progress<57 and v_progress+v_roll<=57) then v_can_move:=true; exit; end if;
    end loop;
    v_state:=jsonb_set(v_state,'{last_roll}',to_jsonb(v_roll),true);
    if not v_can_move then
      v_next_idx:=mod(v_idx+1,v_player_count);
      v_next_user:=(v_state->'turn_order'->>v_next_idx)::uuid;
      v_state:=jsonb_set(v_state,'{dice}','null'::jsonb,true);
      v_state:=jsonb_set(v_state,'{turn_index}',to_jsonb(v_next_idx),true);
      v_state:=jsonb_set(v_state,'{turn_user_id}',to_jsonb(v_next_user),true);
      v_result_message:=initcap(v_color)||' rolled '||v_roll::text||' and had no legal move. '||
        initcap(v_state->'colors'->>v_next_user::text)||' goes next.';
      v_state:=jsonb_set(v_state,'{message}',to_jsonb(v_result_message),true);
    else
      v_state:=jsonb_set(v_state,'{dice}',to_jsonb(v_roll),true);
      v_state:=jsonb_set(v_state,'{message}',to_jsonb(initcap(v_color)||' rolled a '||v_roll::text||'. Choose a token.'),true);
    end if;
    update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now()
    where id=p_game_id returning * into v_game;
    return v_game;
  end if;

  if p_token_index is null or p_token_index not between 0 and 3 then raise exception 'Choose one of your four tokens.'; end if;
  if v_state->>'dice' is null then raise exception 'Roll the dice before moving a token.'; end if;
  v_dice:=(v_state->>'dice')::integer;
  v_progress:=(v_pieces->v_color->>p_token_index)::integer;
  if v_progress=-1 then
    if v_dice<>6 then raise exception 'A token needs a six to leave its base.'; end if;
    v_new_progress:=0;
  elsif v_progress>=0 and v_progress<57 and v_progress+v_dice<=57 then
    v_new_progress:=v_progress+v_dice;
  else
    raise exception 'That token cannot move with this roll.';
  end if;
  v_pieces:=jsonb_set(v_pieces,array[v_color,p_token_index::text],to_jsonb(v_new_progress),true);

  if v_new_progress<=51 then
    v_track_position:=mod(v_start_offset+v_new_progress,52);
    v_safe:=v_track_position=any(array[0,8,13,21,26,34,39,47]);
    if not v_safe then
      for v_other in select p.user_id from public.gather_multiplayer_players p
        where p.game_id=p_game_id and p.status='joined' and p.user_id<>v_actor
      loop
        v_other_color:=v_state->'colors'->>v_other.user_id::text;
        v_other_offset:=case v_other_color when 'red' then 0 when 'yellow' then 13 when 'blue' then 26 when 'green' then 39 else null end;
        if v_other_offset is not null then
          for v_step in 0..3 loop
            v_progress:=(v_pieces->v_other_color->>v_step)::integer;
            if v_progress>=0 and v_progress<=51 then
              v_other_track:=mod(v_other_offset+v_progress,52);
              if v_other_track=v_track_position then
                v_pieces:=jsonb_set(v_pieces,array[v_other_color,v_step::text],to_jsonb(-1),true);
                v_captured:=v_captured+1;
              end if;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end if;

  select count(*) into v_finished from jsonb_array_elements_text(v_pieces->v_color) as token(value) where token.value::integer=57;
  v_state:=jsonb_set(v_state,'{pieces}',v_pieces,true);
  v_state:=jsonb_set(v_state,'{dice}','null'::jsonb,true);

  if v_finished=4 then
    v_result_message:=initcap(v_color)||' brought all four tokens home and wins!';
    v_state:=jsonb_set(v_state,'{winner_id}',to_jsonb(v_actor),true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb(v_result_message),true);
    update public.gather_multiplayer_games set state=v_state,status='completed',revision=revision+1,updated_at=now()
    where id=p_game_id returning * into v_game;
    return v_game;
  end if;

  if v_dice=6 then
    v_next_idx:=v_idx; v_next_user:=v_actor;
  else
    v_next_idx:=mod(v_idx+1,v_player_count);
    v_next_user:=(v_state->'turn_order'->>v_next_idx)::uuid;
  end if;
  v_result_message:=initcap(v_color)||' moved token '||(p_token_index+1)::text||'.';
  if v_captured>0 then v_result_message:=v_result_message||' Captured '||v_captured::text||' opposing token'||case when v_captured=1 then '.' else 's.' end; end if;
  if v_dice=6 then v_result_message:=v_result_message||' Roll again!'; end if;
  v_state:=jsonb_set(v_state,'{turn_index}',to_jsonb(v_next_idx),true);
  v_state:=jsonb_set(v_state,'{turn_user_id}',to_jsonb(v_next_user),true);
  v_state:=jsonb_set(v_state,'{message}',to_jsonb(v_result_message),true);
  update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now()
  where id=p_game_id returning * into v_game;
  return v_game;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_ludo_leave(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_game public.gather_multiplayer_games;
  v_player_status text;
  v_state jsonb;
  v_old_order jsonb;
  v_new_order jsonb;
  v_turn_user text;
  v_leave_position bigint;
  v_next_user uuid;
  v_next_index integer := 0;
  v_joined_count integer := 0;
  v_new_host uuid;
  v_started boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  SELECT * INTO v_game
  FROM public.gather_multiplayer_games
  WHERE id = p_game_id AND game_type = 'ludo'
  FOR UPDATE;

  IF v_game.id IS NULL OR v_game.status <> 'active' THEN
    RAISE EXCEPTION 'This Ludo lobby is no longer active.';
  END IF;

  SELECT p.status INTO v_player_status
  FROM public.gather_multiplayer_players p
  WHERE p.game_id = p_game_id AND p.user_id = v_uid;

  IF v_player_status NOT IN ('joined', 'invited') OR v_player_status IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this Ludo lobby.';
  END IF;

  UPDATE public.gather_multiplayer_players
  SET status = 'left', ready = false, updated_at = now()
  WHERE game_id = p_game_id AND user_id = v_uid AND status IN ('joined', 'invited');

  SELECT count(*) INTO v_joined_count
  FROM public.gather_multiplayer_players
  WHERE game_id = p_game_id AND status = 'joined';

  IF v_joined_count = 0 THEN
    UPDATE public.gather_multiplayer_games
    SET status = 'completed',
        state = jsonb_set(coalesce(state, '{}'::jsonb), '{message}',
          to_jsonb('The Ludo lobby ended because no players remain.'::text), true),
        revision = revision + 1,
        updated_at = now()
    WHERE id = p_game_id;
    RETURN true;
  END IF;

  IF v_game.created_by = v_uid THEN
    SELECT p.user_id INTO v_new_host
    FROM public.gather_multiplayer_players p
    WHERE p.game_id = p_game_id AND p.status = 'joined'
    ORDER BY p.joined_at NULLS LAST, p.user_id
    LIMIT 1;
  END IF;

  v_state := coalesce(v_game.state, '{}'::jsonb);
  v_started := coalesce((v_state->>'started')::boolean, false);

  IF v_started THEN
    v_old_order := coalesce(v_state->'turn_order', '[]'::jsonb);
    v_turn_user := v_state->>'turn_user_id';

    SELECT e.ordinality INTO v_leave_position
    FROM jsonb_array_elements_text(v_old_order) WITH ORDINALITY AS e(value, ordinality)
    WHERE e.value = v_uid::text
    LIMIT 1;

    SELECT coalesce(jsonb_agg(to_jsonb(e.value) ORDER BY e.ordinality), '[]'::jsonb)
    INTO v_new_order
    FROM jsonb_array_elements_text(v_old_order) WITH ORDINALITY AS e(value, ordinality)
    JOIN public.gather_multiplayer_players p
      ON p.user_id = e.value::uuid
     AND p.game_id = p_game_id
     AND p.status = 'joined';

    IF jsonb_array_length(v_new_order) = 0 THEN
      SELECT coalesce(jsonb_agg(to_jsonb(p.user_id::text) ORDER BY p.joined_at NULLS LAST, p.user_id), '[]'::jsonb)
      INTO v_new_order
      FROM public.gather_multiplayer_players p
      WHERE p.game_id = p_game_id AND p.status = 'joined';
    END IF;

    IF v_turn_user = v_uid::text OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_new_order) AS e(value)
      WHERE e.value = v_turn_user
    ) THEN
      SELECT e.value::uuid INTO v_next_user
      FROM jsonb_array_elements_text(v_old_order) WITH ORDINALITY AS e(value, ordinality)
      JOIN public.gather_multiplayer_players p
        ON p.user_id = e.value::uuid
       AND p.game_id = p_game_id
       AND p.status = 'joined'
      ORDER BY CASE WHEN e.ordinality > coalesce(v_leave_position, 0) THEN 0 ELSE 1 END,
               e.ordinality
      LIMIT 1;
    ELSE
      v_next_user := v_turn_user::uuid;
    END IF;

    IF v_next_user IS NULL THEN
      SELECT p.user_id INTO v_next_user
      FROM public.gather_multiplayer_players p
      WHERE p.game_id = p_game_id AND p.status = 'joined'
      ORDER BY p.joined_at NULLS LAST, p.user_id
      LIMIT 1;
    END IF;

    SELECT (e.ordinality - 1)::integer INTO v_next_index
    FROM jsonb_array_elements_text(v_new_order) WITH ORDINALITY AS e(value, ordinality)
    WHERE e.value = v_next_user::text
    LIMIT 1;

    v_state := jsonb_set(v_state, '{turn_order}', v_new_order, true);
    v_state := jsonb_set(v_state, '{turn_user_id}', to_jsonb(v_next_user::text), true);

    IF v_joined_count = 1 THEN
      v_state := jsonb_set(v_state, '{turn_index}', to_jsonb(0), true);
      v_state := jsonb_set(v_state, '{dice}', 'null'::jsonb, true);
      v_state := jsonb_set(v_state, '{winner_id}', to_jsonb(v_next_user::text), true);
      v_state := jsonb_set(v_state, '{message}',
        to_jsonb('The match ended because the other players left. The remaining player wins.'::text), true);

      UPDATE public.gather_multiplayer_games
      SET status = 'completed',
          state = v_state,
          created_by = coalesce(v_new_host, created_by),
          revision = revision + 1,
          updated_at = now()
      WHERE id = p_game_id;
    ELSE
      v_state := jsonb_set(v_state, '{turn_index}', to_jsonb(coalesce(v_next_index, 0)), true);
      IF v_turn_user = v_uid::text OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_new_order) AS e(value)
        WHERE e.value = v_turn_user
      ) THEN
        v_state := jsonb_set(v_state, '{dice}', 'null'::jsonb, true);
        v_state := jsonb_set(v_state, '{message}',
          to_jsonb('A player left. The turn moved to the next player.'::text), true);
      ELSE
        v_state := jsonb_set(v_state, '{message}',
          to_jsonb('A player left the Ludo match.'::text), true);
      END IF;

      UPDATE public.gather_multiplayer_games
      SET state = v_state,
          created_by = coalesce(v_new_host, created_by),
          revision = revision + 1,
          updated_at = now()
      WHERE id = p_game_id;
    END IF;
  ELSE
    UPDATE public.gather_multiplayer_games
    SET created_by = coalesce(v_new_host, created_by),
        revision = revision + 1,
        updated_at = now()
    WHERE id = p_game_id;
  END IF;

  RETURN true;
END;
$function$
;

REVOKE ALL ON FUNCTION public.gather_ludo_leave(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gather_ludo_leave(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.gather_ludo_multiplayer_action(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gather_ludo_multiplayer_action(uuid, text, integer) TO authenticated;
