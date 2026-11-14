-- Snake Arena shared multiplayer foundation.
-- Source is reconstructed from the successfully applied migration state and inspected live definitions.
create table if not exists private.gather_snake_inputs (
  game_id uuid not null references public.gather_multiplayer_games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('up','down','left','right')),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (game_id, user_id)
);
alter table private.gather_snake_inputs enable row level security;
revoke all on table private.gather_snake_inputs from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.gather_game_chat_list(p_game_type text, p_game_id uuid)
 RETURNS TABLE(id uuid, game_type text, game_id uuid, sender_id uuid, body text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_member boolean := false;
begin
  if v_uid is null then raise exception 'Sign in to view game chat.'; end if;

  if p_game_type = 'tag' then
    select exists(
      select 1 from public.gather_tag_players tp
       where tp.lobby_id = p_game_id and tp.user_id = v_uid
         and tp.status in ('joined','eliminated')
    ) into v_member;
  elsif p_game_type in ('uno','ludo','snake_arena') then
    select exists(
      select 1 from public.gather_multiplayer_players mp
       where mp.game_id = p_game_id and mp.user_id = v_uid and mp.status = 'joined'
    ) into v_member;
  end if;

  if not v_member then raise exception 'Join this game to view its temporary chat.'; end if;

  return query
    select recent.id,recent.game_type,recent.game_id,recent.sender_id,recent.body,recent.created_at
      from (
        select m.id,m.game_type,m.game_id,m.sender_id,m.body,m.created_at
          from public.gather_game_chat_messages m
         where m.game_type = p_game_type and m.game_id = p_game_id
         order by m.created_at desc
         limit 150
      ) recent
     order by recent.created_at asc;
end
$function$


CREATE OR REPLACE FUNCTION private.gather_game_chat_send(p_game_type text, p_game_id uuid, p_body text)
 RETURNS gather_game_chat_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member boolean := false;
  v_row public.gather_game_chat_messages;
begin
  if v_uid is null then raise exception 'Sign in to send a game message.'; end if;
  if p_game_type not in ('tag','uno','ludo','snake_arena') then raise exception 'This game chat is unavailable.'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 1 and 1200 then
    raise exception 'Messages must be between 1 and 1200 characters.';
  end if;

  if p_game_type = 'tag' then
    select exists(
      select 1 from public.gather_tag_players p
      join public.gather_tag_lobbies l on l.id = p.lobby_id
       where p.lobby_id = p_game_id and p.user_id = v_uid
         and p.status in ('joined','eliminated') and l.status in ('lobby','active')
    ) into v_member;
  else
    select exists(
      select 1 from public.gather_multiplayer_players p
      join public.gather_multiplayer_games g on g.id = p.game_id
       where p.game_id = p_game_id and p.user_id = v_uid and p.status = 'joined'
         and g.game_type = p_game_type and g.status = 'active'
    ) into v_member;
  end if;

  if not v_member then raise exception 'You must be in an active game or its lobby to send messages.'; end if;

  insert into public.gather_game_chat_messages(game_type,game_id,sender_id,body)
  values(p_game_type,p_game_id,v_uid,btrim(p_body))
  returning * into v_row;
  return v_row;
end
$function$


CREATE OR REPLACE FUNCTION private.gather_snake_normalize_settings(p_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_arena text;
  v_obstacles text;
  v_speed text;
  v_round_seconds integer;
  v_max_players integer;
begin
  if jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception 'Snake Arena settings must be an object.';
  end if;

  v_arena := coalesce(p_settings->>'arena', 'standard');
  v_obstacles := coalesce(p_settings->>'obstacles', 'standard');
  v_speed := coalesce(p_settings->>'speed', 'standard');

  if v_arena not in ('small','standard','large') then
    raise exception 'Choose a supported arena size.';
  end if;
  if v_obstacles not in ('off','standard') then
    raise exception 'Choose supported obstacle settings.';
  end if;
  if v_speed not in ('slow','standard','fast') then
    raise exception 'Choose a supported speed preset.';
  end if;

  if coalesce(p_settings->>'round_seconds','180') !~ '^[0-9]{1,3}$' then
    raise exception 'Round duration must be a whole number of seconds.';
  end if;
  v_round_seconds := coalesce(p_settings->>'round_seconds','180')::integer;
  if v_round_seconds < 60 or v_round_seconds > 300 then
    raise exception 'Round duration must be between 60 and 300 seconds.';
  end if;

  if coalesce(p_settings->>'max_players','8') !~ '^[0-9]{1,2}$' then
    raise exception 'Player capacity must be a whole number.';
  end if;
  v_max_players := coalesce(p_settings->>'max_players','8')::integer;
  if v_max_players < 2 or v_max_players > 8 then
    raise exception 'Snake Arena supports between 2 and 8 players.';
  end if;

  return jsonb_build_object(
    'arena', v_arena,
    'obstacles', v_obstacles,
    'speed', v_speed,
    'round_seconds', v_round_seconds,
    'max_players', v_max_players
  );
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_commit_tick(p_game_id uuid, p_actor_id uuid, p_expected_revision bigint, p_expected_state jsonb, p_next_state jsonb)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_now timestamptz := clock_timestamp();
  v_last_tick timestamptz;
  v_interval integer;
  v_next_state jsonb;
begin
  if p_actor_id is null then raise exception 'A verified player identity is required.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;

  if v_game.id is null or v_game.status <> 'active' or v_game.state->>'phase' <> 'active' then
    raise exception 'This Snake Arena match is not active.';
  end if;
  if not exists (
    select 1 from public.gather_multiplayer_players
     where game_id = p_game_id and user_id = p_actor_id and status = 'joined'
  ) then raise exception 'Only joined players can advance Snake Arena.'; end if;
  if v_game.revision <> p_expected_revision or v_game.state is distinct from p_expected_state then
    raise exception 'The Snake Arena state changed. Refresh before advancing the next tick.';
  end if;
  if p_next_state is null or jsonb_typeof(p_next_state) <> 'object'
     or octet_length(p_next_state::text) > 32768
     or p_next_state->>'phase' not in ('active','finished') then
    raise exception 'The server-computed Snake Arena state is invalid.';
  end if;

  v_last_tick := (v_game.state->>'lastTickAt')::timestamptz;
  v_interval := (v_game.state->>'tickIntervalMs')::integer;
  if v_now < v_last_tick + (v_interval * interval '1 millisecond') then
    raise exception 'The next Snake Arena tick is not due yet.';
  end if;
  if (p_next_state->>'tick')::integer <> coalesce((v_game.state->>'tick')::integer,0) + 1 then
    raise exception 'The Snake Arena tick sequence is invalid.';
  end if;

  v_next_state := jsonb_set(p_next_state,'{lastTickAt}',to_jsonb(v_now),true);
  update public.gather_multiplayer_games
     set state = v_next_state,
         status = case when v_next_state->>'phase' = 'finished' then 'completed' else 'active' end,
         revision = revision + 1,
         updated_at = v_now
   where id = p_game_id
  returning * into v_game;

  if v_next_state->>'phase' = 'finished' then
    delete from private.gather_snake_inputs where game_id = p_game_id;
  else
    update private.gather_snake_inputs i
       set direction = s.value->>'direction',
           updated_at = v_now
      from jsonb_array_elements(v_next_state->'snakes') s(value)
     where i.game_id = p_game_id
       and i.user_id = (s.value->>'user_id')::uuid;
  end if;

  return v_game;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_create(p_invited_user_ids uuid[], p_settings jsonb DEFAULT '{}'::jsonb, p_join_mode text DEFAULT 'invite'::text)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_settings jsonb;
  v_invites uuid[];
  v_existing public.gather_multiplayer_games;
  v_initial jsonb;
  v_width integer;
  v_height integer;
  v_interval integer;
begin
  if v_uid is null then raise exception 'Sign in to create Snake Arena.'; end if;
  if p_join_mode not in ('invite','open') then
    raise exception 'Choose invite-only or open joining.';
  end if;

  v_settings := private.gather_snake_normalize_settings(p_settings);
  select coalesce(array_agg(distinct invited.user_id order by invited.user_id), '{}'::uuid[])
    into v_invites
    from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) as invited(user_id)
   where invited.user_id is not null;

  if cardinality(v_invites) <> coalesce(cardinality(p_invited_user_ids),0) then
    raise exception 'The invitation list contains an empty or repeated entry.';
  end if;
  if v_uid = any(v_invites) then
    raise exception 'You are already included as the host.';
  end if;
  if p_join_mode = 'invite' and cardinality(v_invites) < 1 then
    raise exception 'Choose at least one person to invite.';
  end if;
  if p_join_mode = 'open' and cardinality(v_invites) > 0 then
    raise exception 'Open lobbies do not use a private invite list.';
  end if;
  if cardinality(v_invites) + 1 > (v_settings->>'max_players')::integer then
    raise exception 'The player limit must include you and everyone invited.';
  end if;
  if exists (
    select 1 from unnest(v_invites) as invited(user_id)
    where not private.gather_can_invite_game_person(invited.user_id)
  ) then
    raise exception 'One or more people cannot be invited to this game.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':snake_arena', 0));
  select * into v_existing
    from public.gather_multiplayer_games
   where created_by = v_uid
     and game_type = 'snake_arena'
     and status = 'active'
   order by created_at desc
   limit 1
   for update;

  if v_existing.id is not null then
    raise exception 'You already have an active Snake Arena lobby or match. Open that one before creating another.';
  end if;

  v_width := case v_settings->>'arena' when 'small' then 20 when 'large' then 36 else 28 end;
  v_height := case v_settings->>'arena' when 'small' then 14 when 'large' then 22 else 18 end;
  v_interval := case v_settings->>'speed' when 'slow' then 400 when 'fast' then 220 else 300 end;

  v_initial := jsonb_build_object(
    'version', 1,
    'phase', 'lobby',
    'width', v_width,
    'height', v_height,
    'tick', 0,
    'tickIntervalMs', v_interval,
    'startedAt', null,
    'lastTickAt', null,
    'endsAt', null,
    'snakes', '[]'::jsonb,
    'obstacles', '[]'::jsonb,
    'food', null,
    'winnerId', null,
    'finishReason', null
  );

  return private.gather_multiplayer_create(
    null,
    'snake_arena',
    p_join_mode,
    v_invites,
    v_settings,
    v_initial,
    '#40826D'
  );
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_end(p_game_id uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.created_by <> auth.uid() then
    raise exception 'Only the host can end this Snake Arena match.';
  end if;
  if v_game.status <> 'active' then raise exception 'This Snake Arena lobby is already closed.'; end if;

  v_reason := case when v_game.state->>'phase' = 'lobby' then 'host-cancelled' else 'host-ended' end;
  update public.gather_multiplayer_games
     set state = jsonb_set(
       jsonb_set(v_game.state,'{phase}','"finished"'::jsonb,true),
       '{finishReason}',to_jsonb(v_reason),true
     ),
     status = case when v_game.state->>'phase' = 'lobby' then 'cancelled' else 'completed' end,
     revision = revision + 1,
     updated_at = now()
   where id = p_game_id
  returning * into v_game;
  delete from private.gather_snake_inputs where game_id = p_game_id;
  return v_game;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_join(p_game_id uuid, p_color text DEFAULT '#40826D'::text)
 RETURNS gather_multiplayer_players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_count integer;
  v_max integer;
  v_player public.gather_multiplayer_players;
begin
  if auth.uid() is null then raise exception 'Sign in to join Snake Arena.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.status <> 'active' or v_game.state->>'phase' <> 'lobby' then
    raise exception 'This Snake Arena lobby is no longer open for players.';
  end if;

  v_max := coalesce((v_game.settings->>'max_players')::integer, 8);
  select count(*) into v_count
    from public.gather_multiplayer_players
   where game_id = p_game_id and status = 'joined'
     and user_id <> auth.uid();
  if v_count >= v_max then raise exception 'This Snake Arena lobby is full.'; end if;

  select * into v_player from private.gather_multiplayer_join(p_game_id, p_color);
  return v_player;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_leave(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_state jsonb;
  v_snakes jsonb;
  v_joined integer;
  v_alive integer;
  v_winner uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.status <> 'active' then
    raise exception 'This Snake Arena lobby is already closed.';
  end if;
  if not exists (
    select 1 from public.gather_multiplayer_players
     where game_id = p_game_id and user_id = auth.uid() and status = 'joined'
  ) then raise exception 'You are not a joined player in this Snake Arena lobby.'; end if;

  update public.gather_multiplayer_players
     set status = 'left', ready = false, updated_at = now()
   where game_id = p_game_id and user_id = auth.uid();
  delete from private.gather_snake_inputs
   where game_id = p_game_id and user_id = auth.uid();

  if v_game.state->>'phase' = 'lobby' then
    if v_game.created_by = auth.uid() then
      update public.gather_multiplayer_games
         set status = 'cancelled',
             state = jsonb_set(
               jsonb_set(v_game.state,'{phase}','"finished"'::jsonb,true),
               '{finishReason}',to_jsonb('host-left'::text),true
             ),
             revision = revision + 1,
             updated_at = now()
       where id = p_game_id;
    else
      update public.gather_multiplayer_games
         set revision = revision + 1, updated_at = now()
       where id = p_game_id;
    end if;
    return true;
  end if;

  select coalesce(jsonb_agg(
    case when item.value->>'user_id' = auth.uid()::text
         then jsonb_set(item.value,'{alive}','false'::jsonb,true)
         else item.value end
    order by item.ordinality
  ),'[]'::jsonb)
    into v_snakes
    from jsonb_array_elements(v_game.state->'snakes') with ordinality as item(value,ordinality);

  v_state := jsonb_set(v_game.state,'{snakes}',v_snakes,true);

  select count(*) into v_joined
    from public.gather_multiplayer_players
   where game_id = p_game_id and status = 'joined';
  select count(*) into v_alive
    from jsonb_array_elements(v_snakes) s(value)
   where coalesce((s.value->>'alive')::boolean,false);

  if v_joined = 0 or v_alive <= 1 then
    select (s.value->>'user_id')::uuid into v_winner
      from jsonb_array_elements(v_snakes) s(value)
     where coalesce((s.value->>'alive')::boolean,false)
     limit 1;
    v_state := jsonb_set(v_state,'{phase}','"finished"'::jsonb,true);
    v_state := jsonb_set(v_state,'{winnerId}',coalesce(to_jsonb(v_winner),'null'::jsonb),true);
    v_state := jsonb_set(v_state,'{finishReason}',to_jsonb('player-left'::text),true);
    update public.gather_multiplayer_games
       set status = 'completed',
           state = v_state,
           revision = revision + 1,
           updated_at = now()
     where id = p_game_id;
    delete from private.gather_snake_inputs where game_id = p_game_id;
  else
    update public.gather_multiplayer_games
       set state = v_state,
           revision = revision + 1,
           updated_at = now()
     where id = p_game_id;
  end if;

  return true;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_ready(p_game_id uuid, p_ready boolean)
 RETURNS gather_multiplayer_players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_player public.gather_multiplayer_players;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.status <> 'active' or v_game.state->>'phase' <> 'lobby' then
    raise exception 'This Snake Arena lobby is no longer waiting for players.';
  end if;

  update public.gather_multiplayer_players
     set ready = p_ready, updated_at = now()
   where game_id = p_game_id and user_id = auth.uid() and status = 'joined'
  returning * into v_player;
  if v_player.user_id is null then raise exception 'Join the lobby before changing your ready status.'; end if;

  update public.gather_multiplayer_games
     set revision = revision + 1, updated_at = now()
   where id = p_game_id;
  return v_player;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_record_input(p_game_id uuid, p_actor_id uuid, p_direction text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_snake jsonb;
  v_input private.gather_snake_inputs;
  v_current_direction text;
  v_last_tick timestamptz;
  v_opposite text;
begin
  if p_actor_id is null then raise exception 'A verified player identity is required.'; end if;
  if p_direction not in ('up','down','left','right') then raise exception 'Choose a valid direction.'; end if;

  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.status <> 'active' or v_game.state->>'phase' <> 'active' then
    raise exception 'This Snake Arena match is not active.';
  end if;
  if not exists (
    select 1 from public.gather_multiplayer_players
     where game_id = p_game_id and user_id = p_actor_id and status = 'joined'
  ) then raise exception 'Only joined players can steer a snake.'; end if;

  select item.value into v_snake
    from jsonb_array_elements(v_game.state->'snakes') as item(value)
   where item.value->>'user_id' = p_actor_id::text;
  if v_snake is null or coalesce((v_snake->>'alive')::boolean,false) is false then
    raise exception 'Your snake is no longer active.';
  end if;

  v_current_direction := v_snake->>'direction';
  v_opposite := case v_current_direction
    when 'up' then 'down'
    when 'down' then 'up'
    when 'left' then 'right'
    else 'left'
  end;
  if p_direction = v_opposite then raise exception 'A snake cannot reverse directly into its own body.'; end if;

  v_last_tick := (v_game.state->>'lastTickAt')::timestamptz;
  select * into v_input
    from private.gather_snake_inputs
   where game_id = p_game_id and user_id = p_actor_id
   for update;

  if v_input.game_id is null then
    raise exception 'Your snake input state is not ready. Reopen the match.';
  end if;
  if p_direction = v_input.direction then return true; end if;
  if v_input.updated_at > v_last_tick then
    raise exception 'Wait for the next movement before changing direction again.';
  end if;

  v_opposite := case v_input.direction
    when 'up' then 'down'
    when 'down' then 'up'
    when 'left' then 'right'
    else 'left'
  end;
  if p_direction = v_opposite then raise exception 'A snake cannot reverse directly into its own body.'; end if;

  update private.gather_snake_inputs
     set direction = p_direction, updated_at = clock_timestamp()
   where game_id = p_game_id and user_id = p_actor_id;
  return true;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_rematch(p_game_id uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.created_by <> auth.uid() then
    raise exception 'Only the host can restart this Snake Arena lobby.';
  end if;
  if v_game.status <> 'completed' or v_game.state->>'phase' <> 'finished' then
    raise exception 'The Snake Arena match must finish before it can be restarted.';
  end if;
  update public.gather_multiplayer_players
     set ready = false, updated_at = now()
   where game_id = p_game_id and status = 'joined';
  delete from private.gather_snake_inputs where game_id = p_game_id;

  update public.gather_multiplayer_games
     set status = 'active',
         state = jsonb_build_object(
           'version',1,
           'phase','lobby',
           'width',(v_game.state->>'width')::integer,
           'height',(v_game.state->>'height')::integer,
           'tick',0,
           'tickIntervalMs',(v_game.state->>'tickIntervalMs')::integer,
           'startedAt',null,
           'lastTickAt',null,
           'endsAt',null,
           'snakes','[]'::jsonb,
           'obstacles','[]'::jsonb,
           'food',null,
           'winnerId',null,
           'finishReason',null
         ),
         revision = revision + 1,
         updated_at = now()
   where id = p_game_id
  returning * into v_game;
  return v_game;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_set_settings(p_game_id uuid, p_settings jsonb)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_settings jsonb;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.created_by <> auth.uid() then
    raise exception 'Only the host can change Snake Arena settings.';
  end if;
  if v_game.status <> 'active' or v_game.state->>'phase' <> 'lobby' then
    raise exception 'Settings are locked after the match starts.';
  end if;

  v_settings := private.gather_snake_normalize_settings(p_settings);
  select count(*) into v_count
    from public.gather_multiplayer_players
   where game_id = p_game_id and status in ('joined','invited');
  if v_count > (v_settings->>'max_players')::integer then
    raise exception 'Player capacity cannot be lower than the current lobby and invitation count.';
  end if;

  update public.gather_multiplayer_games
     set settings = v_settings, revision = revision + 1, updated_at = now()
   where id = p_game_id
  returning * into v_game;
  return v_game;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_start(p_game_id uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_player record;
  v_count integer;
  v_index integer := 0;
  v_width integer;
  v_height integer;
  v_cx integer;
  v_cy integer;
  v_round_seconds integer;
  v_interval integer;
  v_now timestamptz := clock_timestamp();
  v_snakes jsonb := '[]'::jsonb;
  v_obstacles jsonb := '[]'::jsonb;
  v_food jsonb;
  v_segments jsonb;
  v_direction text;
  v_x integer;
  v_y integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena'
   for update;
  if v_game.id is null or v_game.status <> 'active' or v_game.state->>'phase' <> 'lobby' then
    raise exception 'This Snake Arena lobby cannot be started.';
  end if;
  if v_game.created_by <> auth.uid() then raise exception 'Only the host can start Snake Arena.'; end if;
  if not exists (
    select 1 from public.gather_multiplayer_players
     where game_id = p_game_id and user_id = auth.uid() and status = 'joined'
  ) then raise exception 'The host must still be in the lobby to start Snake Arena.'; end if;

  select count(*) into v_count
    from public.gather_multiplayer_players
   where game_id = p_game_id and status = 'joined';
  if v_count < 2 then raise exception 'At least two players are needed to start.'; end if;
  if v_count > coalesce((v_game.settings->>'max_players')::integer,8) then
    raise exception 'The lobby has more players than its configured limit.';
  end if;
  if exists (
    select 1 from public.gather_multiplayer_players
     where game_id = p_game_id and status = 'joined' and not ready
  ) then
    raise exception 'Everyone who joined must be ready before the match starts.';
  end if;

  v_width := case v_game.settings->>'arena' when 'small' then 20 when 'large' then 36 else 28 end;
  v_height := case v_game.settings->>'arena' when 'small' then 14 when 'large' then 22 else 18 end;
  v_cx := floor(v_width / 2.0)::integer;
  v_cy := floor(v_height / 2.0)::integer;
  v_round_seconds := coalesce((v_game.settings->>'round_seconds')::integer,180);
  v_interval := case v_game.settings->>'speed' when 'slow' then 400 when 'fast' then 220 else 300 end;

  if v_game.settings->>'obstacles' = 'standard' then
    for v_x in (v_cx - 3)..(v_cx + 3) loop
      if v_x <> v_cx then
        v_obstacles := v_obstacles || jsonb_build_array(
          jsonb_build_object('x',v_x,'y',v_cy - 2),
          jsonb_build_object('x',v_x,'y',v_cy + 2)
        );
      end if;
    end loop;
  end if;

  for v_player in
    select user_id, coalesce(color,'#40826D') as color
      from public.gather_multiplayer_players
     where game_id = p_game_id and status = 'joined'
     order by joined_at, user_id
  loop
    v_index := v_index + 1;
    case v_index
      when 1 then
        v_x := 3; v_y := 3; v_direction := 'right';
        v_segments := jsonb_build_array(jsonb_build_object('x',3,'y',3),jsonb_build_object('x',2,'y',3),jsonb_build_object('x',1,'y',3));
      when 2 then
        v_x := v_width - 4; v_y := v_height - 4; v_direction := 'left';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',v_y),jsonb_build_object('x',v_x + 1,'y',v_y),jsonb_build_object('x',v_x + 2,'y',v_y));
      when 3 then
        v_x := 3; v_y := v_height - 4; v_direction := 'right';
        v_segments := jsonb_build_array(jsonb_build_object('x',3,'y',v_y),jsonb_build_object('x',2,'y',v_y),jsonb_build_object('x',1,'y',v_y));
      when 4 then
        v_x := v_width - 4; v_y := 3; v_direction := 'left';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',3),jsonb_build_object('x',v_x + 1,'y',3),jsonb_build_object('x',v_x + 2,'y',3));
      when 5 then
        v_x := v_cx; v_y := 2; v_direction := 'down';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',2),jsonb_build_object('x',v_x,'y',1),jsonb_build_object('x',v_x,'y',0));
      when 6 then
        v_x := v_cx; v_y := v_height - 3; v_direction := 'up';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',v_y),jsonb_build_object('x',v_x,'y',v_y + 1),jsonb_build_object('x',v_x,'y',v_y + 2));
      when 7 then
        v_x := 2; v_y := v_cy; v_direction := 'down';
        v_segments := jsonb_build_array(jsonb_build_object('x',2,'y',v_y),jsonb_build_object('x',2,'y',v_y - 1),jsonb_build_object('x',2,'y',v_y - 2));
      else
        v_x := v_width - 3; v_y := v_cy; v_direction := 'up';
        v_segments := jsonb_build_array(jsonb_build_object('x',v_x,'y',v_y),jsonb_build_object('x',v_x,'y',v_y + 1),jsonb_build_object('x',v_x,'y',v_y + 2));
    end case;

    v_snakes := v_snakes || jsonb_build_array(jsonb_build_object(
      'user_id', v_player.user_id,
      'name', 'Player',
      'color', v_player.color,
      'alive', true,
      'score', 0,
      'direction', v_direction,
      'segments', v_segments
    ));

    insert into private.gather_snake_inputs(game_id,user_id,direction,updated_at)
    values(p_game_id,v_player.user_id,v_direction,v_now)
    on conflict(game_id,user_id) do update
      set direction = excluded.direction,
          updated_at = excluded.updated_at;
  end loop;

  v_food := jsonb_build_object('x',v_cx,'y',v_cy);
  update public.gather_multiplayer_games
     set state = jsonb_build_object(
       'version',1,'phase','active','width',v_width,'height',v_height,
       'tick',0,'tickIntervalMs',v_interval,'startedAt',v_now,
       'lastTickAt',v_now,'endsAt',v_now + make_interval(secs => v_round_seconds),
       'snakes',v_snakes,'obstacles',v_obstacles,'food',v_food,
       'winnerId',null,'finishReason',null
     ),
     revision = revision + 1,
     updated_at = v_now
   where id = p_game_id
  returning * into v_game;

  return v_game;
end
$function$


CREATE OR REPLACE FUNCTION public.gather_snake_tick_snapshot(p_game_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_inputs jsonb;
begin
  if p_actor_id is null then raise exception 'A verified player identity is required.'; end if;
  select * into v_game
    from public.gather_multiplayer_games
   where id = p_game_id and game_type = 'snake_arena';
  if v_game.id is null or v_game.status <> 'active' or v_game.state->>'phase' <> 'active' then
    raise exception 'This Snake Arena match is not active.';
  end if;
  if not exists (
    select 1 from public.gather_multiplayer_players
     where game_id = p_game_id and user_id = p_actor_id and status = 'joined'
  ) then raise exception 'Only joined players can advance Snake Arena.'; end if;

  select coalesce(jsonb_object_agg(user_id::text,direction),'{}'::jsonb)
    into v_inputs
    from private.gather_snake_inputs
   where game_id = p_game_id;

  return jsonb_build_object('game',to_jsonb(v_game),'inputs',v_inputs);
end
$function$


revoke all on function private.gather_snake_normalize_settings(jsonb) from public, anon, authenticated;
revoke all on function public.gather_snake_create(uuid[],jsonb,text) from public, anon;
grant execute on function public.gather_snake_create(uuid[],jsonb,text) to authenticated;
revoke all on function public.gather_snake_join(uuid,text) from public, anon;
grant execute on function public.gather_snake_join(uuid,text) to authenticated;
revoke all on function public.gather_snake_ready(uuid,boolean) from public, anon;
grant execute on function public.gather_snake_ready(uuid,boolean) to authenticated;
revoke all on function public.gather_snake_set_settings(uuid,jsonb) from public, anon;
grant execute on function public.gather_snake_set_settings(uuid,jsonb) to authenticated;
revoke all on function public.gather_snake_start(uuid) from public, anon;
grant execute on function public.gather_snake_start(uuid) to authenticated;
revoke all on function public.gather_snake_end(uuid) from public, anon;
grant execute on function public.gather_snake_end(uuid) to authenticated;
revoke all on function public.gather_snake_leave(uuid) from public, anon;
grant execute on function public.gather_snake_leave(uuid) to authenticated;
revoke all on function public.gather_snake_rematch(uuid) from public, anon;
grant execute on function public.gather_snake_rematch(uuid) to authenticated;
revoke all on function public.gather_snake_record_input(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.gather_snake_record_input(uuid,uuid,text) to service_role;
revoke all on function public.gather_snake_tick_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.gather_snake_tick_snapshot(uuid,uuid) to service_role;
revoke all on function public.gather_snake_commit_tick(uuid,uuid,bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.gather_snake_commit_tick(uuid,uuid,bigint,jsonb,jsonb) to service_role;
grant execute on function private.gather_game_chat_list(text,uuid) to authenticated;
grant execute on function private.gather_game_chat_send(text,uuid,text) to authenticated;
