-- Gather Game Foundation v2 — Phase 2
-- Conversation-scoped persistent matches with participant responses and ordered events.

create table public.game_matches (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid unique references public.messages(id) on delete set null,
  game_key text not null check (game_key ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','active','completed','cancelled')),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  version bigint not null default 1 check (version >= 1),
  current_turn_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index game_matches_conversation_updated_idx on public.game_matches (conversation_id, updated_at desc);
create index game_matches_created_by_idx on public.game_matches (created_by, created_at desc);

create table public.game_match_players (
  match_id uuid not null references public.game_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null default 'invited' check (response in ('invited','accepted','declined','left')),
  player_order integer not null check (player_order >= 0),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (match_id, user_id),
  unique (match_id, player_order)
);
create index game_match_players_user_idx on public.game_match_players (user_id, match_id);

create table public.game_match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.game_matches(id) on delete cascade,
  version bigint not null check (version >= 1),
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (match_id, version)
);
create index game_match_events_match_order_idx on public.game_match_events (match_id, version);

alter table public.game_matches enable row level security;
alter table public.game_match_players enable row level security;
alter table public.game_match_events enable row level security;

create policy "Conversation members can read game matches"
  on public.game_matches for select to authenticated
  using (private.is_conversation_member(conversation_id));
create policy "Conversation members can read game participants"
  on public.game_match_players for select to authenticated
  using (exists (select 1 from public.game_matches gm
    where gm.id = game_match_players.match_id
      and private.is_conversation_member(gm.conversation_id)));
create policy "Conversation members can read game events"
  on public.game_match_events for select to authenticated
  using (exists (select 1 from public.game_matches gm
    where gm.id = game_match_events.match_id
      and private.is_conversation_member(gm.conversation_id)));

revoke all on public.game_matches, public.game_match_players, public.game_match_events from anon, authenticated;
grant select on public.game_matches, public.game_match_players, public.game_match_events to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.game_matches, public.game_match_players, public.game_match_events from anon, authenticated;

create or replace function private.create_game_invitation(p_conversation_id uuid, p_game_key text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_match_id uuid := gen_random_uuid();
  v_message_id uuid;
  v_player_count integer;
  v_order integer := 0;
  v_member record;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_conversation_id is null then raise exception 'Conversation is required' using errcode = '22023'; end if;
  if p_game_key is null or p_game_key !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
    raise exception 'Invalid game key' using errcode = '22023';
  end if;
  perform 1 from public.conversations c where c.id = p_conversation_id for share;
  if not found or not private.is_conversation_member(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;
  if not private.can_send_message(p_conversation_id) or private.is_message_restricted(v_user_id) then
    raise exception 'Messaging is not available for this account or conversation' using errcode = '42501';
  end if;
  select count(*) into v_player_count from public.conversation_members cm
    where cm.conversation_id = p_conversation_id;
  if v_player_count < 2 then
    raise exception 'A game invitation requires at least two conversation members' using errcode = '22023';
  end if;

  insert into public.game_matches (id, conversation_id, game_key, created_by, status, state, version)
    values (v_match_id, p_conversation_id, p_game_key, v_user_id, 'invited', '{}'::jsonb, 1);
  insert into public.messages (conversation_id, sender_id, body, is_admin_message)
    values (p_conversation_id, v_user_id, '[GATHER_GAME_V2:' || v_match_id::text || ']', false)
    returning id into v_message_id;
  update public.game_matches set message_id = v_message_id where id = v_match_id;

  for v_member in
    select cm.user_id from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
    order by cm.joined_at, cm.user_id
  loop
    insert into public.game_match_players (match_id, user_id, response, player_order, responded_at)
    values (v_match_id, v_member.user_id,
      case when v_member.user_id = v_user_id then 'accepted' else 'invited' end,
      v_order, case when v_member.user_id = v_user_id then now() else null end);
    v_order := v_order + 1;
  end loop;

  insert into public.game_match_events (match_id, version, actor_id, event_type, payload)
    values (v_match_id, 1, v_user_id, 'invitation_created',
      jsonb_build_object('gameKey', p_game_key, 'conversationId', p_conversation_id));
  return v_match_id;
end;
$$;

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
  if p_response not in ('accepted','declined') then
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
    into v_pending, v_accepted
    from public.game_match_players where match_id = p_match_id;
  v_next_status := v_match.status;
  v_next_turn := v_match.current_turn_user_id;
  if v_pending = 0 then
    if v_accepted >= 2 then
      v_next_status := 'active';
      select user_id into v_next_turn from public.game_match_players
        where match_id = p_match_id and response = 'accepted'
        order by player_order limit 1;
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

create or replace function public.create_game_invitation(p_conversation_id uuid, p_game_key text)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select private.create_game_invitation(p_conversation_id, p_game_key); $$;
create or replace function public.respond_to_game_invitation(p_match_id uuid, p_response text)
returns public.game_matches language sql security invoker set search_path = pg_catalog, public
as $$ select private.respond_to_game_invitation(p_match_id, p_response); $$;

revoke all on function private.create_game_invitation(uuid, text) from public, anon;
revoke all on function private.respond_to_game_invitation(uuid, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.create_game_invitation(uuid, text) to authenticated;
grant execute on function private.respond_to_game_invitation(uuid, text) to authenticated;
revoke all on function public.create_game_invitation(uuid, text) from public, anon;
revoke all on function public.respond_to_game_invitation(uuid, text) from public, anon;
grant execute on function public.create_game_invitation(uuid, text) to authenticated;
grant execute on function public.respond_to_game_invitation(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.game_matches;
    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.game_match_players;
    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.game_match_events;
    exception when duplicate_object then null; end;
  end if;
end;
$$;
