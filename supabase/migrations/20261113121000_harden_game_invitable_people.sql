create or replace function private.gather_game_invitable_people()
returns table(user_id uuid,username text,display_name text)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sign in to choose players.'; end if;
 return query select p.id,p.username,p.display_name from public.friendships f
 join public.profiles p on p.id=f.friend_id
 where f.user_id=v_uid
 and exists(select 1 from public.friendships back where back.user_id=f.friend_id and back.friend_id=v_uid)
 and not private.is_blocked_between(v_uid,f.friend_id)
 order by coalesce(nullif(p.display_name,''),p.username);
end $$;
create or replace function public.gather_game_invitable_people()
returns table(user_id uuid,username text,display_name text)
language sql set search_path=''
as $$ select * from private.gather_game_invitable_people() $$;
revoke all on function public.gather_game_invitable_people() from public,anon;
revoke all on function private.gather_game_invitable_people() from public,anon;
grant execute on function public.gather_game_invitable_people() to authenticated;
grant execute on function private.gather_game_invitable_people() to authenticated;
