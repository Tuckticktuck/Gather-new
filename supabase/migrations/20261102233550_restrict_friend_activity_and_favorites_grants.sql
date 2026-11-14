revoke all privileges on table public.favorite_friends from anon, authenticated;
grant select, insert, delete on table public.favorite_friends to authenticated;

revoke all privileges on table public.friend_activity_posts from anon, authenticated;
grant select, insert, delete on table public.friend_activity_posts to authenticated;
