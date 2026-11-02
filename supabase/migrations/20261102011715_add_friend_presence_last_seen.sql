create table if not exists public.friend_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz
);

alter table public.friend_presence enable row level security;
grant select, insert, update on public.friend_presence to authenticated;

drop policy if exists "Users can view their own last seen" on public.friend_presence;
create policy "Users can view their own last seen"
  on public.friend_presence
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Friends can view shared last seen" on public.friend_presence;
create policy "Friends can view shared last seen"
  on public.friend_presence
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.friendships f
      join public.profiles p on p.id = f.friend_id
      where f.user_id = (select auth.uid())
        and f.friend_id = friend_presence.user_id
        and p.preferences ->> 'shareOnlineStatus' is distinct from 'false'
    )
  );

drop policy if exists "Users can insert their own last seen" on public.friend_presence;
create policy "Users can insert their own last seen"
  on public.friend_presence
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own last seen" on public.friend_presence;
create policy "Users can update their own last seen"
  on public.friend_presence
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index if not exists friend_presence_last_seen_at_idx
  on public.friend_presence(last_seen_at desc);
