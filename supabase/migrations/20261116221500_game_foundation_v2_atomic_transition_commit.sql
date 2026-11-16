create or replace function private.commit_validated_game_transition(
  p_match_id uuid, p_expected_version bigint, p_actor_id uuid, p_event_type text,
  p_payload jsonb, p_next_state jsonb, p_next_turn_user_id uuid default null
)
returns public.game_matches language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
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
  select * into v_match from public.game_matches where id = p_match_id for update;
  if not found then raise exception 'Game match not found' using errcode = 'P0002'; end if;
  if v_match.status <> 'active' then
    raise exception 'Only active matches accept game actions' using errcode = '55000';
  end if;
  if v_match.version <> p_expected_version then
    raise exception 'Stale game state; reload before retrying' using errcode = '40001';
  end if;
  if not exists (select 1 from public.game_match_players p
    where p.match_id = p_match_id and p.user_id = p_actor_id and p.response = 'accepted') then
    raise exception 'Actor is not an accepted player' using errcode = '42501';
  end if;
  if v_match.current_turn_user_id is not null and v_match.current_turn_user_id <> p_actor_id then
    raise exception 'It is not this player''s turn' using errcode = '42501';
  end if;
  if p_next_turn_user_id is not null and not exists (select 1 from public.game_match_players p
    where p.match_id = p_match_id and p.user_id = p_next_turn_user_id and p.response = 'accepted') then
    raise exception 'Next turn must belong to an accepted player' using errcode = '22023';
  end if;
  v_next_version := v_match.version + 1;
  update public.game_matches set state = p_next_state, current_turn_user_id = p_next_turn_user_id,
    version = v_next_version, updated_at = now()
    where id = p_match_id returning * into v_match;
  insert into public.game_match_events (match_id, version, actor_id, event_type, payload)
    values (p_match_id, v_next_version, p_actor_id, p_event_type, p_payload);
  return v_match;
end;
$$;

create or replace function public.commit_validated_game_transition(
  p_match_id uuid, p_expected_version bigint, p_actor_id uuid, p_event_type text,
  p_payload jsonb, p_next_state jsonb, p_next_turn_user_id uuid default null
)
returns public.game_matches language sql security invoker
set search_path = pg_catalog, public
as $$
  select private.commit_validated_game_transition(
    p_match_id, p_expected_version, p_actor_id, p_event_type,
    p_payload, p_next_state, p_next_turn_user_id
  );
$$;

revoke all on function private.commit_validated_game_transition(uuid, bigint, uuid, text, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.commit_validated_game_transition(uuid, bigint, uuid, text, jsonb, jsonb, uuid)
  to service_role;
revoke all on function public.commit_validated_game_transition(uuid, bigint, uuid, text, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.commit_validated_game_transition(uuid, bigint, uuid, text, jsonb, jsonb, uuid)
  to service_role;