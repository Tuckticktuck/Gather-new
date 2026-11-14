create table if not exists public.favorite_friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint favorite_friends_not_self check (user_id <> friend_id)
);

create index if not exists favorite_friends_friend_id_idx
  on public.favorite_friends(friend_id);

alter table public.favorite_friends enable row level security;

drop policy if exists "Users can view their own favorite friends" on public.favorite_friends;
create policy "Users can view their own favorite friends"
  on public.favorite_friends for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can favorite their own friends" on public.favorite_friends;
create policy "Users can favorite their own friends"
  on public.favorite_friends for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.friendships f
      where f.user_id = (select auth.uid())
        and f.friend_id = favorite_friends.friend_id
    )
  );

drop policy if exists "Users can unfavorite their own friends" on public.favorite_friends;
create policy "Users can unfavorite their own friends"
  on public.favorite_friends for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.favorite_friends to authenticated;

create table if not exists public.friend_activity_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);

create index if not exists friend_activity_posts_created_at_idx
  on public.friend_activity_posts(created_at desc);
create index if not exists friend_activity_posts_author_created_idx
  on public.friend_activity_posts(author_id, created_at desc);

alter table public.friend_activity_posts enable row level security;

drop policy if exists "Friends can read shared activity posts" on public.friend_activity_posts;
create policy "Friends can read shared activity posts"
  on public.friend_activity_posts for select to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where f.user_id = (select auth.uid())
        and f.friend_id = friend_activity_posts.author_id
    )
  );

drop policy if exists "Users can publish their own activity posts" on public.friend_activity_posts;
create policy "Users can publish their own activity posts"
  on public.friend_activity_posts for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists "Users can delete their own activity posts" on public.friend_activity_posts;
create policy "Users can delete their own activity posts"
  on public.friend_activity_posts for delete to authenticated
  using (author_id = (select auth.uid()));

grant select, insert, delete on public.friend_activity_posts to authenticated;

drop policy if exists "Members can create polls with their own messages" on public.message_polls;
create policy "Members can create polls with their own messages"
  on public.message_polls for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.is_conversation_member(conversation_id)
    and exists (
      select 1 from public.conversations c
      where c.id = message_polls.conversation_id
        and c.kind = 'group'
    )
    and exists (
      select 1 from public.messages m
      where m.id = message_polls.message_id
        and m.conversation_id = message_polls.conversation_id
        and m.sender_id = (select auth.uid())
    )
  );

drop policy if exists "Poll creators can add their poll options" on public.message_poll_options;
create policy "Poll creators can add their poll options"
  on public.message_poll_options for insert to authenticated
  with check (
    private.is_conversation_member(conversation_id)
    and exists (
      select 1
      from public.message_polls p
      join public.conversations c on c.id = p.conversation_id
      where p.id = message_poll_options.poll_id
        and p.conversation_id = message_poll_options.conversation_id
        and p.created_by = (select auth.uid())
        and c.kind = 'group'
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'friend_activity_posts'
     ) then
    alter publication supabase_realtime add table public.friend_activity_posts;
  end if;
end
$$;
