create table if not exists public.gather_tag_lobbies (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','active','completed','cancelled')),
  mode text not null default 'classic' check (mode in ('classic','infection','team_tag','last_standing')),
  join_mode text not null default 'open' check (join_mode in ('open','invite')),
  max_players integer not null default 12 check (max_players between 2 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.gather_tag_players (
  lobby_id uuid not null references public.gather_tag_lobbies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'joined' check (status in ('invited','joined','left','eliminated')),
  color text not null default '#38BDF8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  ready boolean not null default false,
  x numeric(6,2) not null default 50 check (x between 0 and 100),
  y numeric(6,2) not null default 50 check (y between 0 and 100),
  is_it boolean not null default false,
  team text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lobby_id,user_id)
);
create unique index if not exists gather_tag_unique_lobby_colors
  on public.gather_tag_players(lobby_id, lower(color)) where status='joined';
create index if not exists gather_tag_lobbies_conversation_status
  on public.gather_tag_lobbies(conversation_id,status,updated_at desc);
create index if not exists gather_tag_players_user_status
  on public.gather_tag_players(user_id,status);

alter table public.gather_tag_lobbies enable row level security;
alter table public.gather_tag_players enable row level security;
drop policy if exists "Conversation members can view Tag lobbies" on public.gather_tag_lobbies;
create policy "Conversation members can view Tag lobbies" on public.gather_tag_lobbies
  for select to authenticated using (private.is_conversation_member(conversation_id));
drop policy if exists "Conversation members can view Tag players" on public.gather_tag_players;
create policy "Conversation members can view Tag players" on public.gather_tag_players
  for select to authenticated using (
    exists(select 1 from public.gather_tag_lobbies l
      where l.id=lobby_id and private.is_conversation_member(l.conversation_id))
  );
revoke insert,update,delete on public.gather_tag_lobbies from anon,authenticated;
revoke insert,update,delete on public.gather_tag_players from anon,authenticated;
grant select on public.gather_tag_lobbies,public.gather_tag_players to authenticated;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gather_tag_lobbies') then
    alter publication supabase_realtime add table public.gather_tag_lobbies;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gather_tag_players') then
    alter publication supabase_realtime add table public.gather_tag_players;
  end if;
end $$;

create or replace function private.gather_tag_create(
  p_conversation_id uuid,p_mode text,p_join_mode text,p_invited_user_ids uuid[],p_color text,p_max_players integer
) returns public.gather_tag_lobbies
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies; v_invitee uuid;
begin
  if v_uid is null then raise exception 'Sign in to create a Tag lobby.'; end if;
  if p_mode not in ('classic','infection','team_tag','last_standing') then raise exception 'Choose a valid Tag mode.'; end if;
  if p_join_mode not in ('open','invite') then raise exception 'Choose open or invite-only joining.'; end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid circle color.'; end if;
  if p_max_players is null or p_max_players<2 or p_max_players>20 then raise exception 'Choose between 2 and 20 players.'; end if;
  if not private.is_conversation_member(p_conversation_id) or not private.can_send_message(p_conversation_id) then raise exception 'This conversation is unavailable for Tag.'; end if;
  if p_join_mode='invite' and coalesce(cardinality(p_invited_user_ids),0)=0 then raise exception 'Select at least one person to invite.'; end if;
  if exists(select 1 from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) u
    where u is null or u=v_uid or not exists(select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=u))
    then raise exception 'Every invite must be a different member of this conversation.'; end if;
  insert into public.gather_tag_lobbies(conversation_id,created_by,mode,join_mode,max_players)
  values(p_conversation_id,v_uid,p_mode,p_join_mode,p_max_players) returning * into v_lobby;
  insert into public.gather_tag_players(lobby_id,user_id,status,color,ready,x,y)
  values(v_lobby.id,v_uid,'joined',upper(p_color),false,50,50);
  if p_join_mode='invite' then
    foreach v_invitee in array coalesce(p_invited_user_ids,'{}'::uuid[]) loop
      insert into public.gather_tag_players(lobby_id,user_id,status,color,ready)
      values(v_lobby.id,v_invitee,'invited','#64748B',false) on conflict do nothing;
    end loop;
  end if;
  return v_lobby;
end $$;

create or replace function private.gather_tag_join(p_lobby_id uuid,p_color text)
returns public.gather_tag_players language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies; v_player public.gather_tag_players; v_count integer;
begin
  if v_uid is null then raise exception 'Sign in to join Tag.'; end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid circle color.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'This lobby is no longer open.'; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) then raise exception 'You are not in this conversation.'; end if;
  if v_lobby.join_mode='invite' and not exists(select 1 from public.gather_tag_players where lobby_id=p_lobby_id and user_id=v_uid and status='invited') then raise exception 'This lobby is invite-only.'; end if;
  if exists(select 1 from public.gather_tag_players where lobby_id=p_lobby_id and lower(color)=lower(p_color) and user_id<>v_uid and status='joined') then raise exception 'That color is already taken.'; end if;
  select count(*) into v_count from public.gather_tag_players where lobby_id=p_lobby_id and status='joined';
  if v_count>=v_lobby.max_players then raise exception 'This lobby is full.'; end if;
  insert into public.gather_tag_players(lobby_id,user_id,status,color,ready,x,y)
  values(p_lobby_id,v_uid,'joined',upper(p_color),false,12+mod(v_count*19,76),15+mod(v_count*31,70))
  on conflict(lobby_id,user_id) do update set status='joined',color=excluded.color,ready=false,joined_at=now(),updated_at=now()
  returning * into v_player;
  update public.gather_tag_lobbies set updated_at=now() where id=p_lobby_id;
  return v_player;
end $$;

create or replace function private.gather_tag_customize(p_lobby_id uuid,p_color text)
returns public.gather_tag_players language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies; v_player public.gather_tag_players;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid circle color.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'Circle colors can only be changed in the lobby.'; end if;
  if exists(select 1 from public.gather_tag_players where lobby_id=p_lobby_id and lower(color)=lower(p_color) and user_id<>v_uid and status='joined') then raise exception 'That color is already taken.'; end if;
  update public.gather_tag_players set color=upper(p_color),updated_at=now()
    where lobby_id=p_lobby_id and user_id=v_uid and status='joined' returning * into v_player;
  if v_player.user_id is null then raise exception 'Join the lobby before customizing your circle.'; end if;
  update public.gather_tag_lobbies set updated_at=now() where id=p_lobby_id;
  return v_player;
end $$;

create or replace function private.gather_tag_ready(p_lobby_id uuid,p_ready boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'This lobby is no longer waiting.'; end if;
  update public.gather_tag_players set ready=coalesce(p_ready,false),updated_at=now()
    where lobby_id=p_lobby_id and user_id=v_uid and status='joined';
  if not found then raise exception 'Join the lobby first.'; end if;
  update public.gather_tag_lobbies set updated_at=now() where id=p_lobby_id;
  return true;
end $$;

create or replace function private.gather_tag_start(p_lobby_id uuid)
returns public.gather_tag_lobbies language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies; v_count integer; v_not_ready integer; v_it uuid; v_idx integer:=0; v_player record;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'This lobby cannot be started.'; end if;
  if v_lobby.created_by<>v_uid then raise exception 'Only the lobby host can start the match.'; end if;
  select count(*),count(*) filter(where not ready) into v_count,v_not_ready
    from public.gather_tag_players where lobby_id=p_lobby_id and status='joined';
  if v_count<2 then raise exception 'At least two players are required.'; end if;
  if v_not_ready>0 then raise exception 'Everyone must be ready before the match starts.'; end if;
  select user_id into v_it from public.gather_tag_players where lobby_id=p_lobby_id and status='joined' order by random() limit 1;
  for v_player in select user_id from public.gather_tag_players where lobby_id=p_lobby_id and status='joined' order by joined_at,user_id loop
    update public.gather_tag_players set
      x=12+mod(v_idx*19,76), y=15+mod(v_idx*31,70),
      is_it=case when v_lobby.mode='team_tag' then (v_idx%2=0) else user_id=v_it end,
      team=case when v_lobby.mode='team_tag' then case when v_idx%2=0 then 'taggers' else 'runners' end else null end,
      updated_at=now()
      where lobby_id=p_lobby_id and user_id=v_player.user_id;
    v_idx:=v_idx+1;
  end loop;
  update public.gather_tag_lobbies set status='active',updated_at=now() where id=p_lobby_id returning * into v_lobby;
  return v_lobby;
end $$;

create or replace function private.gather_tag_leave(p_lobby_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null then return true; end if;
  update public.gather_tag_players set status='left',ready=false,updated_at=now()
    where lobby_id=p_lobby_id and user_id=v_uid and status in ('joined','invited');
  if v_lobby.created_by=v_uid and v_lobby.status='lobby' then
    update public.gather_tag_lobbies set status='cancelled',updated_at=now() where id=p_lobby_id;
  else
    update public.gather_tag_lobbies set updated_at=now() where id=p_lobby_id;
  end if;
  return true;
end $$;

create or replace function private.gather_tag_move(p_lobby_id uuid,p_x numeric,p_y numeric)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies; v_player public.gather_tag_players; v_target public.gather_tag_players; v_tagged uuid;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p_x is null or p_y is null or p_x<0 or p_x>100 or p_y<0 or p_y>100 then raise exception 'Position is outside the arena.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'active' then raise exception 'This Tag match is not active.'; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) then raise exception 'You cannot access this match.'; end if;
  select * into v_player from public.gather_tag_players where lobby_id=p_lobby_id and user_id=v_uid and status='joined' for update;
  if v_player.user_id is null then raise exception 'Join the match before moving.'; end if;
  if sqrt(power(p_x-v_player.x,2)+power(p_y-v_player.y,2))>9 then raise exception 'Movement update is too large.'; end if;
  update public.gather_tag_players set x=p_x,y=p_y,updated_at=now() where lobby_id=p_lobby_id and user_id=v_uid;
  if v_player.is_it then
    select * into v_target from public.gather_tag_players
    where lobby_id=p_lobby_id and status='joined' and user_id<>v_uid and not is_it
      and sqrt(power(x-p_x,2)+power(y-p_y,2))<=4.2
      and (v_lobby.mode<>'team_tag' or team<>v_player.team)
    order by sqrt(power(x-p_x,2)+power(y-p_y,2)) limit 1 for update;
    if v_target.user_id is not null then
      v_tagged:=v_target.user_id;
      if v_lobby.mode='classic' then
        update public.gather_tag_players set is_it=false where lobby_id=p_lobby_id and user_id=v_uid;
        update public.gather_tag_players set is_it=true where lobby_id=p_lobby_id and user_id=v_target.user_id;
      elsif v_lobby.mode='infection' then
        update public.gather_tag_players set is_it=true where lobby_id=p_lobby_id and user_id=v_target.user_id;
      elsif v_lobby.mode='team_tag' then
        update public.gather_tag_players set is_it=true,team=v_player.team where lobby_id=p_lobby_id and user_id=v_target.user_id;
      elsif v_lobby.mode='last_standing' then
        update public.gather_tag_players set status='eliminated' where lobby_id=p_lobby_id and user_id=v_target.user_id;
        if (select count(*) from public.gather_tag_players where lobby_id=p_lobby_id and status='joined')<=1 then
          update public.gather_tag_lobbies set status='completed',updated_at=now() where id=p_lobby_id;
        end if;
      end if;
    end if;
  end if;
  update public.gather_tag_lobbies set updated_at=now() where id=p_lobby_id;
  return jsonb_build_object('tagged_user_id',v_tagged,'status',(select status from public.gather_tag_lobbies where id=p_lobby_id));
end $$;

create or replace function public.gather_tag_create(p_conversation_id uuid,p_mode text,p_join_mode text,p_invited_user_ids uuid[],p_color text,p_max_players integer)
returns public.gather_tag_lobbies language sql set search_path='' as $$ select private.gather_tag_create($1,$2,$3,$4,$5,$6) $$;
create or replace function public.gather_tag_join(p_lobby_id uuid,p_color text)
returns public.gather_tag_players language sql set search_path='' as $$ select private.gather_tag_join($1,$2) $$;
create or replace function public.gather_tag_customize(p_lobby_id uuid,p_color text)
returns public.gather_tag_players language sql set search_path='' as $$ select private.gather_tag_customize($1,$2) $$;
create or replace function public.gather_tag_ready(p_lobby_id uuid,p_ready boolean)
returns boolean language sql set search_path='' as $$ select private.gather_tag_ready($1,$2) $$;
create or replace function public.gather_tag_start(p_lobby_id uuid)
returns public.gather_tag_lobbies language sql set search_path='' as $$ select private.gather_tag_start($1) $$;
create or replace function public.gather_tag_leave(p_lobby_id uuid)
returns boolean language sql set search_path='' as $$ select private.gather_tag_leave($1) $$;
create or replace function public.gather_tag_move(p_lobby_id uuid,p_x numeric,p_y numeric)
returns jsonb language sql set search_path='' as $$ select private.gather_tag_move($1,$2,$3) $$;

grant execute on function private.gather_tag_create(uuid,text,text,uuid[],text,integer),
 private.gather_tag_join(uuid,text),private.gather_tag_customize(uuid,text),
 private.gather_tag_ready(uuid,boolean),private.gather_tag_start(uuid),
 private.gather_tag_leave(uuid),private.gather_tag_move(uuid,numeric,numeric) to authenticated;
grant execute on function public.gather_tag_create(uuid,text,text,uuid[],text,integer),
 public.gather_tag_join(uuid,text),public.gather_tag_customize(uuid,text),
 public.gather_tag_ready(uuid,boolean),public.gather_tag_start(uuid),
 public.gather_tag_leave(uuid),public.gather_tag_move(uuid,numeric,numeric) to authenticated;
