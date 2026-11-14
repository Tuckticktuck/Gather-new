drop policy if exists "Gather friends can view online presence" on realtime.messages;

create policy "Gather friends can view online presence"
  on realtime.messages
  for select
  to authenticated
  using (
    extension in ('presence', 'broadcast')
    and (
      (select realtime.topic()) = 'gather-presence:' || (select auth.uid())::text
      or exists (
        select 1
        from public.friendships f
        join public.profiles p on p.id = f.friend_id
        where f.user_id = (select auth.uid())
          and (select realtime.topic()) = 'gather-presence:' || f.friend_id::text
          and p.preferences ->> 'shareOnlineStatus' is distinct from 'false'
      )
    )
  );
