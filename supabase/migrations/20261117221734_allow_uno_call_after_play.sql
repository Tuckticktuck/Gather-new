create or replace function private.commit_validated_game_transition(
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
returns public.game_matches
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_match public.game_matches%rowtype;
  v_next_version bigint;
begin
  if p_match_id is null or p_expected_version is null or p_actor_id is null then
    raise exception 'Match, expected version, and actor are required' using errcode = '22023';
  end if;
  if p_event_type is null or p_event_type !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'Invalid event type' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_next_state is null or jsonb_typeof(p_next_state) <> 'object' then
    raise exception 'Event payload and next state must be JSON objects' using errcode = '22023';
  end if;
  if p_private_state is not null and jsonb_typeof(p_private_state) <> 'object' then
    raise exception 'Private game state must be a JSON object' using errcode = '22023';
  end if;
  if p_next_status is null or p_next_status not in ('active','completed') then
    raise exception 'Game actions may only keep a match active or complete it' using errcode = '22023';
  end if;
  if p_next_status = 'completed' and p_next_turn_user_id is not null then
    raise exception 'A completed match cannot have a current turn' using errcode = '22023';
  end if;

  select * into v_match from public.game_matches where id = p_match_id for update;
  if not found then raise exception 'Game match not found' using errcode = 'P0002'; end if;
  if v_match.status <> 'active' then
    raise exception 'Only active matches accept game actions' using errcode = '55000';
  end if;
  if v_match.version <> p_expected_version then
    raise exception 'Stale game state; reload before retrying' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.game_match_players p
    where p.match_id = p_match_id and p.user_id = p_actor_id and p.response = 'accepted'
  ) then
    raise exception 'Actor is not an accepted player' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = v_match.conversation_id and cm.user_id = p_actor_id
  ) then
    raise exception 'Actor is no longer a conversation member' using errcode = '42501';
  end if;
  if v_match.current_turn_user_id is not null
     and v_match.current_turn_user_id <> p_actor_id
     and not (
       v_match.game_key = 'uno'
       and p_event_type = 'uno_called'
       and v_match.state->>'pendingUnoPlayerId' = p_actor_id::text
       and p_next_state->>'pendingUnoPlayerId' is null
       and p_next_turn_user_id is not distinct from v_match.current_turn_user_id
     ) then
    raise exception 'It is not this player''s turn' using errcode = '42501';
  end if;
  if p_next_turn_user_id is not null and not exists (
    select 1 from public.game_match_players p
    where p.match_id = p_match_id and p.user_id = p_next_turn_user_id and p.response = 'accepted'
  ) then
    raise exception 'Next turn must belong to an accepted player' using errcode = '22023';
  end if;

  v_next_version := v_match.version + 1;
  update public.game_matches
  set state = p_next_state,
      status = p_next_status,
      current_turn_user_id = p_next_turn_user_id,
      version = v_next_version,
      updated_at = now()
  where id = p_match_id returning * into v_match;

  if p_private_state is not null then
    insert into public.game_match_private_state (match_id, state, updated_at)
    values (p_match_id, p_private_state, now())
    on conflict (match_id) do update
      set state = excluded.state, updated_at = excluded.updated_at;
  end if;

  insert into public.game_match_events (match_id, version, actor_id, event_type, payload)
  values (p_match_id, v_next_version, p_actor_id, p_event_type, p_payload);
  return v_match;
end;
$function$;
