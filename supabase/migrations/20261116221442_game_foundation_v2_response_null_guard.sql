-- Reject NULL invitation responses explicitly; SQL three-valued logic would otherwise skip NOT IN.
create or replace function private.respond_to_game_invitation(p_match_id uuid, p_response text)
returns public.game_matches language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.game_matches%rowtype;
  v_pending integer;
  v_accepted integer;
  v_next_status text;
  v_next_turn uuid;
  v_next_version bigint;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_response is null or p_response not in ('accepted','declined') then
    raise exception 'Response must be accepted or declined' using errcode = '22023';
  end if;
  select * into v_match from public.game_matches where id = p_match_id for update;
  if not found or not private.is_conversation_member(v_match.conversation_id) then
    raise exception 'Game invitation not found' using errcode = '42501';
  end if;
  if v_match.status <> 'invited' then
    raise exception 'This invitation is no longer open' using errcode = '55000';
  end if;
  update public.game_match_players set response = p_response, responded_at = now()
    where match_id = p_match_id and user_id = v_user_id and response = 'invited';
  if not found then raise exception 'No pending invitation exists for this account' using errcode = '42501'; end if;
  select count(*) filter (where response = 'invited'),
         count(*) filter (where response = 'accepted')
    into v_pending, v_accepted from public.game_match_players where match_id = p_match_id;
  v_next_status := v_match.status;
  v_next_turn := v_match.current_turn_user_id;
  if v_pending = 0 then
    if v_accepted >= 2 then
      v_next_status := 'active';
      select user_id into v_next_turn from public.game_match_players
        where match_id = p_match_id and response = 'accepted' order by player_order limit 1;
    else
      v_next_status := 'cancelled';
    end if;
  end if;
  v_next_version := v_match.version + 1;
  update public.game_matches set status = v_next_status, current_turn_user_id = v_next_turn,
    version = v_next_version, updated_at = now()
    where id = p_match_id returning * into v_match;
  insert into public.game_match_events (match_id, version, actor_id, event_type, payload)
    values (p_match_id, v_next_version, v_user_id, 'invitation_response',
      jsonb_build_object('response', p_response, 'status', v_next_status));
  return v_match;
end;
$$;