-- Custom, server-authoritative Tag round timers and mode-specific results.
alter table public.gather_tag_lobbies
  add column if not exists round_seconds integer not null default 300
    check (round_seconds between 60 and 7200),
  add column if not exists started_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists winner_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists winning_team text;

alter table public.gather_tag_players
  add column if not exists tags_received integer not null default 0
    check (tags_received >= 0);

create or replace function private.gather_tag_count_received()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.is_it is distinct from new.is_it and new.is_it=true then
    update public.gather_tag_players
      set tags_received=tags_received+1
      where lobby_id=new.lobby_id and user_id=new.user_id;
  end if;
  return new;
end
$$;

drop trigger if exists gather_tag_count_received on public.gather_tag_players;
create trigger gather_tag_count_received
after update of is_it on public.gather_tag_players
for each row execute function private.gather_tag_count_received();

create or replace function public.gather_tag_start_round(
  p_lobby_id uuid,
  p_duration_seconds integer
)
returns public.gather_tag_lobbies
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_lobby public.gather_tag_lobbies;
  v_count integer;
  v_not_ready integer;
  v_it uuid;
  v_idx integer:=0;
  v_player record;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p_duration_seconds is null or p_duration_seconds<60 or p_duration_seconds>7200 then
    raise exception 'Choose a round length between 1 and 120 minutes.';
  end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'This Tag lobby is not waiting for a round.'; end if;
  if v_lobby.created_by<>v_uid then raise exception 'Only the lobby host can start the round.'; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) or not private.can_send_message(v_lobby.conversation_id) then
    raise exception 'The host no longer has access to this conversation.';
  end if;
  select count(*),count(*) filter(where not ready)
    into v_count,v_not_ready
    from public.gather_tag_players where lobby_id=p_lobby_id and status='joined';
  if v_count<2 then raise exception 'At least two players are required.'; end if;
  if v_not_ready>0 then raise exception 'Everyone must be ready before the round starts.'; end if;

  select user_id into v_it
    from public.gather_tag_players
    where lobby_id=p_lobby_id and status='joined'
    order by random() limit 1;

  for v_player in
    select user_id from public.gather_tag_players
    where lobby_id=p_lobby_id and status='joined'
    order by joined_at,user_id
  loop
    update public.gather_tag_players set
      x=12+mod(v_idx*19,76),
      y=15+mod(v_idx*31,70),
      is_it=case when v_lobby.mode='team_tag' then (v_idx%2=0) else user_id=v_it end,
      team=case when v_lobby.mode='team_tag' then case when v_idx%2=0 then 'taggers' else 'runners' end else null end,
      tags_received=0,
      ready=false,
      updated_at=now()
    where lobby_id=p_lobby_id and user_id=v_player.user_id;
    v_idx:=v_idx+1;
  end loop;

  update public.gather_tag_lobbies set
    status='active',
    round_seconds=p_duration_seconds,
    started_at=now(),
    ends_at=now()+make_interval(secs=>p_duration_seconds),
    winner_user_id=null,
    winning_team=null,
    updated_at=now()
  where id=p_lobby_id returning * into v_lobby;
  return v_lobby;
end
$$;

create or replace function public.gather_tag_finish_expired(p_lobby_id uuid)
returns public.gather_tag_lobbies
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lobby public.gather_tag_lobbies;
  v_best bigint;
  v_ties integer;
  v_winner uuid;
  v_team text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null then raise exception 'Tag round not found.'; end if;
  if v_lobby.status<>'active' then return v_lobby; end if;
  if v_lobby.ends_at is null or v_lobby.ends_at>now() then return v_lobby; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) then raise exception 'You cannot access this round.'; end if;

  if v_lobby.mode='classic' then
    select min(tags_received) into v_best
      from public.gather_tag_players where lobby_id=p_lobby_id and status='joined';
    select count(*),min(user_id::text)::uuid into v_ties,v_winner
      from public.gather_tag_players
      where lobby_id=p_lobby_id and status='joined' and tags_received=v_best;
    if v_ties<>1 then v_winner:=null; end if;
    update public.gather_tag_lobbies set
      status='completed',winner_user_id=v_winner,winning_team=null,updated_at=now()
      where id=p_lobby_id returning * into v_lobby;
  elsif v_lobby.mode='team_tag' then
    select max(score) into v_best from (
      select sum(tags_received) as score
      from public.gather_tag_players
      where lobby_id=p_lobby_id and status='joined' and team is not null
      group by team
    ) scores;
    select count(*) into v_ties from (
      select team,sum(tags_received) as score
      from public.gather_tag_players
      where lobby_id=p_lobby_id and status='joined' and team is not null
      group by team
    ) scores where score=v_best;
    if v_ties=1 and coalesce(v_best,0)>0 then
      select team into v_team from (
        select team,sum(tags_received) as score
        from public.gather_tag_players
        where lobby_id=p_lobby_id and status='joined' and team is not null
        group by team
      ) scores order by score desc limit 1;
    end if;
    update public.gather_tag_lobbies set
      status='completed',winner_user_id=null,winning_team=v_team,updated_at=now()
      where id=p_lobby_id returning * into v_lobby;
  else
    update public.gather_tag_lobbies set status='completed',updated_at=now()
      where id=p_lobby_id returning * into v_lobby;
  end if;
  return v_lobby;
end
$$;

create or replace function public.gather_tag_return_lobby(p_lobby_id uuid)
returns public.gather_tag_lobbies
language plpgsql
security definer
set search_path=''
as $$
declare v_lobby public.gather_tag_lobbies;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null then raise exception 'Tag lobby not found.'; end if;
  if v_lobby.created_by<>auth.uid() then raise exception 'Only the host can return everyone to the lobby.'; end if;
  if v_lobby.status not in ('active','completed') then raise exception 'This round cannot be returned to the lobby.'; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) then raise exception 'Lobby access is unavailable.'; end if;
  update public.gather_tag_players set
    ready=false,is_it=false,team=null,tags_received=0,updated_at=now()
    where lobby_id=p_lobby_id and status='joined';
  update public.gather_tag_lobbies set
    status='lobby',started_at=null,ends_at=null,winner_user_id=null,winning_team=null,updated_at=now()
    where id=p_lobby_id returning * into v_lobby;
  return v_lobby;
end
$$;

revoke all on function public.gather_tag_start_round(uuid,integer) from public,anon;
revoke all on function public.gather_tag_finish_expired(uuid) from public,anon;
revoke all on function public.gather_tag_return_lobby(uuid) from public,anon;
grant execute on function public.gather_tag_start_round(uuid,integer) to authenticated;
grant execute on function public.gather_tag_finish_expired(uuid) to authenticated;
grant execute on function public.gather_tag_return_lobby(uuid) to authenticated;
