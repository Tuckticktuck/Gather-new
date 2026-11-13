
create table if not exists public.gather_game_parties (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Game Party'
    check (char_length(btrim(title)) between 1 and 36),
  status text not null default 'active'
    check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gather_game_party_members (
  party_id uuid not null references public.gather_game_parties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','member')),
  status text not null default 'invited' check (status in ('invited','joined')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (party_id,user_id)
);

create index if not exists gather_game_party_members_user_status_idx
  on public.gather_game_party_members(user_id,status,party_id);
create index if not exists gather_game_party_members_party_status_idx
  on public.gather_game_party_members(party_id,status,joined_at);

create table if not exists public.gather_game_party_polls (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.gather_game_parties(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 90),
  options text[] not null check (cardinality(options) between 2 and 8),
  status text not null default 'open' check (status in ('open','closed')),
  closes_at timestamptz not null default (now() + interval '3 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists gather_game_party_polls_party_created_idx
  on public.gather_game_party_polls(party_id,created_at desc);

create table if not exists public.gather_game_party_votes (
  poll_id uuid not null references public.gather_game_party_polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer not null check (option_index between 0 and 7),
  updated_at timestamptz not null default now(),
  primary key (poll_id,user_id)
);

alter table public.gather_game_parties enable row level security;
alter table public.gather_game_party_members enable row level security;
alter table public.gather_game_party_polls enable row level security;
alter table public.gather_game_party_votes enable row level security;

revoke all on public.gather_game_parties, public.gather_game_party_members,
  public.gather_game_party_polls, public.gather_game_party_votes from anon, authenticated;

create or replace function public.gather_party_list()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in to view your parties.'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'created_by', p.created_by,
      'status', p.status,
      'created_at', p.created_at,
      'my_role', mine.role,
      'my_status', mine.status,
      'members', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'user_id', m.user_id,
            'role', m.role,
            'status', m.status,
            'display_name', coalesce(nullif(btrim(pr.display_name),''),pr.username,'Gather member'),
            'username', pr.username,
            'joined_at', m.joined_at,
            'invited_at', m.invited_at
          ) order by case when m.status='joined' then 0 else 1 end,
                     m.joined_at nulls last, m.invited_at
        ), '[]'::jsonb)
        from public.gather_game_party_members m
        left join public.profiles pr on pr.id=m.user_id
        where m.party_id=p.id
      ),
      'poll', (
        select jsonb_build_object(
          'id', q.id,
          'question', q.question,
          'options', to_jsonb(q.options),
          'status', case
            when q.status='closed' or q.closes_at <= now()
              or (select count(*) from public.gather_game_party_votes v where v.poll_id=q.id)
                 >= (select count(*) from public.gather_game_party_members pm where pm.party_id=p.id and pm.status='joined')
            then 'closed' else 'open' end,
          'closes_at', q.closes_at,
          'created_at', q.created_at,
          'my_vote', (select v.option_index from public.gather_game_party_votes v
                      where v.poll_id=q.id and v.user_id=v_uid),
          'vote_counts', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'option_index', n.i,
                'count', (select count(*) from public.gather_game_party_votes v
                          where v.poll_id=q.id and v.option_index=n.i)
              ) order by n.i
            ), '[]'::jsonb)
            from generate_series(0,cardinality(q.options)-1) as n(i)
          )
        )
        from public.gather_game_party_polls q
        where q.party_id=p.id
        order by q.created_at desc
        limit 1
      )
    ) order by p.updated_at desc
  ), '[]'::jsonb)
  into v_result
  from public.gather_game_parties p
  join public.gather_game_party_members mine on mine.party_id=p.id
  where p.status='active' and mine.user_id=v_uid and mine.status in ('joined','invited');

  return v_result;
end;
$$;

create or replace function public.gather_party_create(
  p_title text default 'Game Party',
  p_invited_user_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_party_id uuid;
  v_invitees uuid[] := coalesce(p_invited_user_ids,'{}'::uuid[]);
  v_title text := coalesce(nullif(btrim(p_title),''),'Game Party');
begin
  if v_uid is null then raise exception 'Sign in to create a party.'; end if;
  if char_length(v_title) > 36 then raise exception 'Party names must be 36 characters or fewer.'; end if;

  v_invitees := array(
    select distinct x from unnest(v_invitees) as requested(x)
    where x is not null and x <> v_uid
  );
  if cardinality(v_invitees) > 19 then raise exception 'A party can have up to 20 members.'; end if;
  if exists (
    select 1 from unnest(v_invitees) as requested(x)
    where not private.gather_can_invite_game_person(x)
  ) then
    raise exception 'You can invite people from your private or group chats, or accepted friends, unless either account has blocked the other.';
  end if;

  insert into public.gather_game_parties(created_by,title)
  values(v_uid,v_title)
  returning id into v_party_id;

  insert into public.gather_game_party_members(party_id,user_id,role,status,invited_by,joined_at)
  values(v_party_id,v_uid,'leader','joined',v_uid,now());

  insert into public.gather_game_party_members(party_id,user_id,role,status,invited_by)
  select v_party_id,x,'member','invited',v_uid
  from unnest(v_invitees) as requested(x);

  return v_party_id;
end;
$$;

create or replace function public.gather_party_invite(
  p_party_id uuid,
  p_invited_user_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invitees uuid[] := coalesce(p_invited_user_ids,'{}'::uuid[]);
  v_existing integer;
begin
  if v_uid is null then raise exception 'Sign in to invite party members.'; end if;
  if not exists (
    select 1 from public.gather_game_party_members m
    join public.gather_game_parties p on p.id=m.party_id
    where m.party_id=p_party_id and m.user_id=v_uid
      and m.role='leader' and m.status='joined' and p.status='active'
  ) then raise exception 'Only the party leader can invite people.'; end if;

  v_invitees := array(
    select distinct x from unnest(v_invitees) as requested(x)
    where x is not null and x <> v_uid
      and not exists (
        select 1 from public.gather_game_party_members existing
        where existing.party_id=p_party_id and existing.user_id=x
      )
  );
  if cardinality(v_invitees)=0 then raise exception 'Choose at least one new person to invite.'; end if;
  select count(*) into v_existing from public.gather_game_party_members
    where party_id=p_party_id and status in ('joined','invited');
  if v_existing + cardinality(v_invitees) > 20 then
    raise exception 'A party can have up to 20 members, including invitations.';
  end if;
  if exists (
    select 1 from unnest(v_invitees) as requested(x)
    where not private.gather_can_invite_game_person(x)
  ) then
    raise exception 'You can invite people from your private or group chats, or accepted friends, unless either account has blocked the other.';
  end if;

  insert into public.gather_game_party_members(party_id,user_id,role,status,invited_by)
  select p_party_id,x,'member','invited',v_uid
  from unnest(v_invitees) as requested(x);
  update public.gather_game_parties set updated_at=now() where id=p_party_id;
  return true;
end;
$$;

create or replace function public.gather_party_join(p_party_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in to join a party.'; end if;
  update public.gather_game_party_members m
    set status='joined', joined_at=now()
  from public.gather_game_parties p
  where m.party_id=p.id and m.party_id=p_party_id and m.user_id=v_uid
    and m.status='invited' and p.status='active';
  if not found then raise exception 'This party invitation is no longer available.'; end if;
  update public.gather_game_parties set updated_at=now() where id=p_party_id;
  return true;
end;
$$;

create or replace function public.gather_party_leave(p_party_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_next_leader uuid;
begin
  if v_uid is null then raise exception 'Sign in to leave a party.'; end if;
  select role into v_role from public.gather_game_party_members
    where party_id=p_party_id and user_id=v_uid;
  if v_role is null then raise exception 'You are not in this party.'; end if;

  delete from public.gather_game_party_members
    where party_id=p_party_id and user_id=v_uid;

  if v_role='leader' then
    select user_id into v_next_leader
    from public.gather_game_party_members
    where party_id=p_party_id and status='joined'
    order by joined_at nulls last, invited_at
    limit 1;
    if v_next_leader is null then
      update public.gather_game_parties set status='closed',updated_at=now()
        where id=p_party_id;
      delete from public.gather_game_party_members where party_id=p_party_id;
    else
      update public.gather_game_party_members set role='leader'
        where party_id=p_party_id and user_id=v_next_leader;
      update public.gather_game_parties set created_by=v_next_leader,updated_at=now()
        where id=p_party_id;
    end if;
  else
    update public.gather_game_parties set updated_at=now() where id=p_party_id;
  end if;
  return true;
end;
$$;

create or replace function public.gather_party_close(p_party_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in to close a party.'; end if;
  if not exists (
    select 1 from public.gather_game_party_members m
    join public.gather_game_parties p on p.id=m.party_id
    where m.party_id=p_party_id and m.user_id=v_uid
      and m.role='leader' and m.status='joined' and p.status='active'
  ) then raise exception 'Only the party leader can close this party.'; end if;
  update public.gather_game_parties set status='closed',updated_at=now() where id=p_party_id;
  delete from public.gather_game_party_members where party_id=p_party_id;
  return true;
end;
$$;

create or replace function public.gather_party_poll_create(
  p_party_id uuid,
  p_question text,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_options text[] := coalesce(p_options,'{}'::text[]);
  v_poll_id uuid;
  v_party_size integer;
begin
  if v_uid is null then raise exception 'Sign in to create a vote.'; end if;
  if not exists (
    select 1 from public.gather_game_party_members m
    join public.gather_game_parties p on p.id=m.party_id
    where m.party_id=p_party_id and m.user_id=v_uid
      and m.status='joined' and p.status='active'
  ) then raise exception 'Join the party before creating a vote.'; end if;
  if char_length(btrim(coalesce(p_question,''))) not between 1 and 90 then
    raise exception 'The vote question must be 1–90 characters.';
  end if;
  if cardinality(v_options) not between 2 and 8 then raise exception 'Choose between 2 and 8 options.'; end if;
  if exists (
    select 1 from unnest(v_options) as opt(value)
    where value not in ('chess','checkers','tic_tac_toe','connect_four','battleship','uno','ludo','tag')
  ) then raise exception 'One of those games is not available for voting.'; end if;
  if (select count(distinct value) from unnest(v_options) as opt(value)) <> cardinality(v_options) then
    raise exception 'Vote options must be unique.';
  end if;
  select count(*) into v_party_size from public.gather_game_party_members
    where party_id=p_party_id and status='joined';
  if v_party_size < 2 then raise exception 'At least two party members must join before voting.'; end if;
  if v_party_size > 2 and exists (
    select 1 from unnest(v_options) as opt(value)
    where value in ('chess','checkers','tic_tac_toe','connect_four','battleship')
  ) then raise exception 'Head-to-head games can only be voted on by two-player parties.'; end if;
  if v_party_size > 4 and 'ludo'=any(v_options) then raise exception 'Ludo supports up to four players.'; end if;
  if v_party_size > 12 and 'tag'=any(v_options) then raise exception 'Tag lobbies support up to twelve players.'; end if;

  update public.gather_game_party_polls set status='closed'
    where party_id=p_party_id and status='open';
  insert into public.gather_game_party_polls(party_id,created_by,question,options,closes_at)
  values(p_party_id,v_uid,btrim(p_question),v_options,now()+interval '3 minutes')
  returning id into v_poll_id;
  update public.gather_game_parties set updated_at=now() where id=p_party_id;
  return v_poll_id;
end;
$$;

create or replace function public.gather_party_poll_vote(
  p_poll_id uuid,
  p_option_index integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_party_id uuid;
  v_status text;
  v_closes_at timestamptz;
  v_option_count integer;
  v_joined_count integer;
  v_vote_count integer;
begin
  if v_uid is null then raise exception 'Sign in to vote.'; end if;
  select q.party_id,q.status,q.closes_at,cardinality(q.options)
    into v_party_id,v_status,v_closes_at,v_option_count
  from public.gather_game_party_polls q where q.id=p_poll_id for update;
  if v_party_id is null then raise exception 'This vote is no longer available.'; end if;
  if not exists (
    select 1 from public.gather_game_party_members m
    join public.gather_game_parties p on p.id=m.party_id
    where m.party_id=v_party_id and m.user_id=v_uid
      and m.status='joined' and p.status='active'
  ) then raise exception 'Only joined party members can vote.'; end if;
  if v_status<>'open' or v_closes_at<=now() then raise exception 'Voting has closed.'; end if;
  if p_option_index is null or p_option_index<0 or p_option_index>=v_option_count then
    raise exception 'Choose one of the listed options.';
  end if;

  insert into public.gather_game_party_votes(poll_id,user_id,option_index,updated_at)
  values(p_poll_id,v_uid,p_option_index,now())
  on conflict(poll_id,user_id) do update
    set option_index=excluded.option_index,updated_at=now();

  select count(*) into v_vote_count from public.gather_game_party_votes where poll_id=p_poll_id;
  select count(*) into v_joined_count from public.gather_game_party_members
    where party_id=v_party_id and status='joined';
  if v_vote_count>=v_joined_count then
    update public.gather_game_party_polls set status='closed' where id=p_poll_id;
  end if;
  update public.gather_game_parties set updated_at=now() where id=v_party_id;
  return true;
end;
$$;

revoke all on function public.gather_party_list() from public;
revoke all on function public.gather_party_create(text,uuid[]) from public;
revoke all on function public.gather_party_invite(uuid,uuid[]) from public;
revoke all on function public.gather_party_join(uuid) from public;
revoke all on function public.gather_party_leave(uuid) from public;
revoke all on function public.gather_party_close(uuid) from public;
revoke all on function public.gather_party_poll_create(uuid,text,text[]) from public;
revoke all on function public.gather_party_poll_vote(uuid,integer) from public;

grant execute on function public.gather_party_list() to authenticated;
grant execute on function public.gather_party_create(text,uuid[]) to authenticated;
grant execute on function public.gather_party_invite(uuid,uuid[]) to authenticated;
grant execute on function public.gather_party_join(uuid) to authenticated;
grant execute on function public.gather_party_leave(uuid) to authenticated;
grant execute on function public.gather_party_close(uuid) to authenticated;
grant execute on function public.gather_party_poll_create(uuid,text,text[]) to authenticated;
grant execute on function public.gather_party_poll_vote(uuid,integer) to authenticated;
