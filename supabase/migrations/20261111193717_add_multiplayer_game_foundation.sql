-- Reusable multiplayer game foundation for Gather.
create table if not exists public.gather_multiplayer_games (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  game_type text not null check (game_type ~ '^[a-z][a-z0-9_]{1,39}$'),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  join_mode text not null default 'invite' check (join_mode in ('invite','open')),
  settings jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gather_multiplayer_games_conversation_updated_idx on public.gather_multiplayer_games(conversation_id,updated_at desc);
create table if not exists public.gather_multiplayer_players (
  game_id uuid not null references public.gather_multiplayer_games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','joined','left')),
  color text,
  x numeric(6,2),
  y numeric(6,2),
  is_it boolean not null default false,
  joined_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(game_id,user_id),
  constraint gather_multiplayer_player_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint gather_multiplayer_player_position check ((x is null and y is null) or (x between 0 and 100 and y between 0 and 100))
);
create index if not exists gather_multiplayer_players_user_status_idx on public.gather_multiplayer_players(user_id,status,game_id);
alter table public.gather_multiplayer_games enable row level security;
alter table public.gather_multiplayer_players enable row level security;
drop policy if exists "Conversation members can view multiplayer games" on public.gather_multiplayer_games;
create policy "Conversation members can view multiplayer games" on public.gather_multiplayer_games for select to authenticated using (private.is_conversation_member(conversation_id));
drop policy if exists "Conversation members can view multiplayer players" on public.gather_multiplayer_players;
create policy "Conversation members can view multiplayer players" on public.gather_multiplayer_players for select to authenticated using (exists(select 1 from public.gather_multiplayer_games g where g.id=game_id and private.is_conversation_member(g.conversation_id)));
revoke all on public.gather_multiplayer_games from anon,authenticated;
revoke all on public.gather_multiplayer_players from anon,authenticated;
grant select on public.gather_multiplayer_games to authenticated;
grant select on public.gather_multiplayer_players to authenticated;

create or replace function public.gather_multiplayer_create(p_conversation_id uuid,p_game_type text,p_join_mode text,p_invited_user_ids uuid[] default '{}',p_settings jsonb default '{}'::jsonb,p_initial_state jsonb default '{}'::jsonb)
returns public.gather_multiplayer_games language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_game public.gather_multiplayer_games; v_invitee uuid;
begin
 if v_uid is null then raise exception 'Sign in to create a multiplayer game.'; end if;
 if p_game_type is null or p_game_type !~ '^[a-z][a-z0-9_]{1,39}$' then raise exception 'Invalid multiplayer game type.'; end if;
 if p_join_mode not in ('invite','open') then raise exception 'Choose invite-only or open joining.'; end if;
 if jsonb_typeof(coalesce(p_settings,'{}'::jsonb))<>'object' or octet_length(coalesce(p_settings,'{}'::jsonb)::text)>8192 or jsonb_typeof(coalesce(p_initial_state,'{}'::jsonb))<>'object' or octet_length(coalesce(p_initial_state,'{}'::jsonb)::text)>16384 then raise exception 'The multiplayer game settings are invalid.'; end if;
 if not private.is_conversation_member(p_conversation_id) or not private.can_send_message(p_conversation_id) then raise exception 'This conversation is unavailable for multiplayer games.'; end if;
 if p_join_mode='invite' and coalesce(cardinality(p_invited_user_ids),0)=0 then raise exception 'Select at least one person to invite, or allow everyone to join.'; end if;
 if exists(select 1 from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) u where u is null or u=v_uid or not exists(select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=u)) then raise exception 'Every invite must be a different member of this conversation.'; end if;
 if exists(select 1 from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) u join public.user_blocks b on (b.blocker_id=v_uid and b.blocked_id=u) or (b.blocker_id=u and b.blocked_id=v_uid)) then raise exception 'Games are unavailable with a blocked member.'; end if;
 insert into public.gather_multiplayer_games(conversation_id,game_type,created_by,join_mode,settings,state) values(p_conversation_id,p_game_type,v_uid,p_join_mode,coalesce(p_settings,'{}'::jsonb),coalesce(p_initial_state,'{}'::jsonb)) returning * into v_game;
 insert into public.gather_multiplayer_players(game_id,user_id,status,color,x,y,is_it,joined_at) values(v_game.id,v_uid,'joined','#38BDF8',50,50,true,now());
 if p_join_mode='invite' then foreach v_invitee in array coalesce(p_invited_user_ids,'{}'::uuid[]) loop insert into public.gather_multiplayer_players(game_id,user_id,status) values(v_game.id,v_invitee,'invited') on conflict(game_id,user_id) do nothing; end loop; end if;
 return v_game;
end; $$;

create or replace function public.gather_multiplayer_join(p_game_id uuid,p_color text)
returns public.gather_multiplayer_players language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_game public.gather_multiplayer_games; v_player public.gather_multiplayer_players; v_count integer; v_x numeric(6,2); v_y numeric(6,2);
begin
 if v_uid is null then raise exception 'Sign in to join this game.'; end if;
 if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid player color.'; end if;
 select * into v_game from public.gather_multiplayer_games where id=p_game_id for update;
 if v_game.id is null or v_game.status<>'active' then raise exception 'This game is no longer open.'; end if;
 if not private.is_conversation_member(v_game.conversation_id) then raise exception 'You are not a member of this conversation.'; end if;
 if v_game.join_mode='invite' and not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid and status in ('invited','joined')) then raise exception 'This match is invite-only.'; end if;
 if exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and lower(color)=lower(p_color) and user_id<>v_uid and status='joined') then raise exception 'That color is already taken. Choose another.'; end if;
 select count(*) into v_count from public.gather_multiplayer_players where game_id=p_game_id and status='joined' and user_id<>v_uid;
 v_x:=12+mod(v_count*19,76); v_y:=15+mod(v_count*31,70);
 insert into public.gather_multiplayer_players(game_id,user_id,status,color,x,y,is_it,joined_at,updated_at) values(p_game_id,v_uid,'joined',p_color,v_x,v_y,false,now(),now())
 on conflict(game_id,user_id) do update set status='joined',color=excluded.color,x=coalesce(public.gather_multiplayer_players.x,excluded.x),y=coalesce(public.gather_multiplayer_players.y,excluded.y),joined_at=coalesce(public.gather_multiplayer_players.joined_at,now()),updated_at=now() returning * into v_player;
 update public.gather_multiplayer_games set updated_at=now(),revision=revision+1 where id=p_game_id; return v_player;
end; $$;

create or replace function public.gather_multiplayer_move(p_game_id uuid,p_x numeric,p_y numeric)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_game public.gather_multiplayer_games; v_player public.gather_multiplayer_players; v_target public.gather_multiplayer_players; v_dx numeric; v_dy numeric;
begin
 if v_uid is null then raise exception 'Sign in to move.'; end if;
 if p_x is null or p_y is null or p_x<0 or p_x>100 or p_y<0 or p_y>100 then raise exception 'Position is outside the arena.'; end if;
 select * into v_game from public.gather_multiplayer_games where id=p_game_id for update;
 if v_game.id is null or v_game.status<>'active' then raise exception 'This game is not active.'; end if;
 if not private.is_conversation_member(v_game.conversation_id) then raise exception 'You cannot access this game.'; end if;
 select * into v_player from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid and status='joined' for update;
 if v_player.user_id is null then raise exception 'Join the game before moving.'; end if;
 v_dx:=p_x-v_player.x; v_dy:=p_y-v_player.y;
 if sqrt(v_dx*v_dx+v_dy*v_dy)>7.5 then raise exception 'Movement update is too large. Try again.'; end if;
 update public.gather_multiplayer_players set x=p_x,y=p_y,updated_at=now() where game_id=p_game_id and user_id=v_uid returning * into v_player;
 if v_player.is_it then
  select * into v_target from public.gather_multiplayer_players where game_id=p_game_id and status='joined' and user_id<>v_uid and sqrt(power(x-p_x,2)+power(y-p_y,2))<=4.2 order by sqrt(power(x-p_x,2)+power(y-p_y,2)) limit 1 for update;
  if v_target.user_id is not null then update public.gather_multiplayer_players set is_it=false,updated_at=now() where game_id=p_game_id and user_id=v_uid; update public.gather_multiplayer_players set is_it=true,updated_at=now() where game_id=p_game_id and user_id=v_target.user_id; end if;
 end if;
 update public.gather_multiplayer_games set revision=revision+1,updated_at=now() where id=p_game_id;
 return jsonb_build_object('game_id',p_game_id,'revision',(select revision from public.gather_multiplayer_games where id=p_game_id));
end; $$;

create or replace function public.gather_multiplayer_leave(p_game_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_game public.gather_multiplayer_games; v_next uuid;
begin
 if v_uid is null then raise exception 'Sign in first.'; end if;
 select * into v_game from public.gather_multiplayer_games where id=p_game_id for update;
 if v_game.id is null then return false; end if;
 update public.gather_multiplayer_players set status='left',is_it=false,updated_at=now() where game_id=p_game_id and user_id=v_uid and status='joined';
 if not found then raise exception 'You are not an active player in this game.'; end if;
 if exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and status='joined') then
  if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and status='joined' and is_it) then select user_id into v_next from public.gather_multiplayer_players where game_id=p_game_id and status='joined' order by joined_at limit 1; update public.gather_multiplayer_players set is_it=true where game_id=p_game_id and user_id=v_next; end if;
 else update public.gather_multiplayer_games set status='completed',updated_at=now(),revision=revision+1 where id=p_game_id; end if;
 update public.gather_multiplayer_games set updated_at=now(),revision=revision+1 where id=p_game_id and status='active'; return true;
end; $$;

create or replace function public.gather_multiplayer_end(p_game_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_game public.gather_multiplayer_games;
begin
 if v_uid is null then raise exception 'Sign in first.'; end if;
 select * into v_game from public.gather_multiplayer_games where id=p_game_id for update;
 if v_game.id is null or v_game.status<>'active' then raise exception 'This game is not active.'; end if;
 if v_game.created_by<>v_uid and not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid and status='joined') then raise exception 'Only a player can end this game.'; end if;
 update public.gather_multiplayer_games set status='completed',updated_at=now(),revision=revision+1 where id=p_game_id; return true;
end; $$;

create or replace function public.gather_multiplayer_update_state(p_game_id uuid,p_expected_revision bigint,p_state jsonb)
returns public.gather_multiplayer_games language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_game public.gather_multiplayer_games;
begin
 if v_uid is null then raise exception 'Sign in first.'; end if;
 select * into v_game from public.gather_multiplayer_games where id=p_game_id for update;
 if v_game.id is null or v_game.status<>'active' then raise exception 'This game is not active.'; end if;
 if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid and status='joined') then raise exception 'Join the game first.'; end if;
 if v_game.revision<>p_expected_revision then raise exception 'The game state changed. Refresh and try again.'; end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>32768 then raise exception 'Invalid game state.'; end if;
 update public.gather_multiplayer_games set state=p_state,revision=revision+1,updated_at=now() where id=p_game_id returning * into v_game; return v_game;
end; $$;

revoke all on function public.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb) from public,anon;
revoke all on function public.gather_multiplayer_join(uuid,text) from public,anon;
revoke all on function public.gather_multiplayer_move(uuid,numeric,numeric) from public,anon;
revoke all on function public.gather_multiplayer_leave(uuid) from public,anon;
revoke all on function public.gather_multiplayer_end(uuid) from public,anon;
revoke all on function public.gather_multiplayer_update_state(uuid,bigint,jsonb) from public,anon;
grant execute on function public.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb) to authenticated;
grant execute on function public.gather_multiplayer_join(uuid,text) to authenticated;
grant execute on function public.gather_multiplayer_move(uuid,numeric,numeric) to authenticated;
grant execute on function public.gather_multiplayer_leave(uuid) to authenticated;
grant execute on function public.gather_multiplayer_end(uuid) to authenticated;
grant execute on function public.gather_multiplayer_update_state(uuid,bigint,jsonb) to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gather_multiplayer_games') then alter publication supabase_realtime add table public.gather_multiplayer_games; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gather_multiplayer_players') then alter publication supabase_realtime add table public.gather_multiplayer_players; end if;
end $$;
