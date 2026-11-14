drop policy if exists "Gather friends can view online presence" on realtime.messages;
drop policy if exists "Users can publish their own online presence" on realtime.messages;

create policy "Gather friends can view online presence"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'presence'
    and (
      substring(
        (select realtime.topic())
        from '^gather-presence:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'
      )::uuid = (select auth.uid())
      or exists (
        select 1
        from public.friendships f
        where f.user_id = (select auth.uid())
          and f.friend_id = substring(
            (select realtime.topic())
            from '^gather-presence:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'
          )::uuid
      )
    )
  );

create policy "Users can publish their own online presence"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension = 'presence'
    and substring(
      (select realtime.topic())
      from '^gather-presence:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'
    )::uuid = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.preferences ->> 'shareOnlineStatus' is distinct from 'false'
    )
  );
