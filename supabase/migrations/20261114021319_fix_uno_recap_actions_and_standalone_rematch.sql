create or replace function public.gather_uno_request_rematch(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  g public.gather_multiplayer_games;
  s jsonb;
  people uuid[];
  offer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  select *
    into g
    from public.gather_multiplayer_games
   where id = p_game_id
     and game_type = 'uno'
   for update;

  if g.id is null then
    raise exception 'UNO match not found.';
  end if;

  -- Conversation-linked matches require current conversation access.
  -- Standalone UNO lobbies have no conversation_id, so membership in the
  -- joined player roster is their access boundary.
  if g.conversation_id is not null then
    if not private.is_conversation_member(g.conversation_id) then
      raise exception 'UNO match not found.';
    end if;
  elsif not exists (
    select 1
      from public.gather_multiplayer_players
     where game_id = p_game_id
       and user_id = auth.uid()
       and status = 'joined'
  ) then
    raise exception 'UNO match not found.';
  end if;

  if not exists (
    select 1
      from public.gather_multiplayer_players
     where game_id = p_game_id
       and user_id = auth.uid()
       and status = 'joined'
  ) then
    raise exception 'Only a player from this match can request a rematch.';
  end if;

  select payload
    into s
    from private.gather_uno_private_states
   where game_id = p_game_id;

  if s is null
     or (s->>'winner_id' is null and not coalesce((s->>'finished')::boolean, false)) then
    raise exception 'The match must finish before requesting a rematch.';
  end if;

  if exists (
    select 1
      from private.gather_uno_rematch_offers
     where game_id = p_game_id
       and status = 'pending'
  ) then
    raise exception 'A rematch request is already waiting for responses.';
  end if;

  select coalesce(array_agg(user_id), '{}'::uuid[])
    into people
    from public.gather_multiplayer_players
   where game_id = p_game_id
     and status = 'joined';

  if cardinality(people) < 2 then
    raise exception 'At least two players are needed for a rematch.';
  end if;

  insert into private.gather_uno_rematch_offers(game_id, requested_by, participants, responses)
  values (p_game_id, auth.uid(), people, jsonb_build_object(auth.uid()::text, 'accepted'))
  returning id into offer_id;

  update public.gather_multiplayer_games
     set status = 'active',
         revision = revision + 1,
         updated_at = now()
   where id = p_game_id;

  insert into public.notifications(recipient_id, actor_id, kind, title, body, conversation_id)
  select p.user_id, auth.uid(), 'uno_rematch', 'UNO rematch requested', offer_id::text, g.conversation_id
    from public.gather_multiplayer_players p
   where p.game_id = p_game_id
     and p.status = 'joined'
     and p.user_id <> auth.uid();

  return offer_id;
end
$function$;
