drop policy if exists "Users can view their own last seen" on public.friend_presence;
drop policy if exists "Friends can view shared last seen" on public.friend_presence;

create policy "Users and friends can view permitted last seen"
  on public.friend_presence
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.friendships f
      join public.profiles p on p.id = f.friend_id
      where f.user_id = (select auth.uid())
        and f.friend_id = friend_presence.user_id
        and p.preferences ->> 'shareOnlineStatus' is distinct from 'false'
    )
  );
