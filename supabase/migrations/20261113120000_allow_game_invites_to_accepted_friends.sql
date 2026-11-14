-- Invite games directly from accepted friendships without creating chat conversations.
alter table public.gather_multiplayer_games alter column conversation_id drop not null;
alter table public.gather_tag_lobbies alter column conversation_id drop not null;

create or replace function private.gather_game_invitable_people()
returns table(user_id uuid, username text, display_name text)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sign in to choose players.'; end if;
 return query
 select p.id,p.username,p.display_name
 from public.friendships f join public.profiles p on p.id=f.friend_id
 where f.user_id=v_uid
 and exists(select 1 from public.friendships back where back.user_id=f.friend_id and back.friend_id=v_uid)
 and not private.is_blocked_between(v_uid,f.friend_id)
 order by coalesce(nullif(p.display_name,''),p.username);
end $$;
create or replace function public.gather_game_invitable_people()
returns table(user_id uuid, username text, display_name text)
language sql set search_path=''
as $$ select * from private.gather_game_invitable_people() $$;
revoke all on function public.gather_game_invitable_people() from public,anon;
revoke all on function private.gather_game_invitable_people() from public,anon;
grant execute on function public.gather_game_invitable_people() to authenticated;
grant execute on function private.gather_game_invitable_people() to authenticated;

create or replace function private.is_multiplayer_game_player(p_game_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.gather_multiplayer_players p where p.game_id=p_game_id and p.user_id=auth.uid()) $$;
create or replace function private.is_tag_lobby_player(p_lobby_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.gather_tag_players p where p.lobby_id=p_lobby_id and p.user_id=auth.uid()) $$;
revoke all on function private.is_multiplayer_game_player(uuid) from public,anon;
revoke all on function private.is_tag_lobby_player(uuid) from public,anon;
grant execute on function private.is_multiplayer_game_player(uuid) to authenticated;
grant execute on function private.is_tag_lobby_player(uuid) to authenticated;

create or replace function private.gather_multiplayer_create(
 p_conversation_id uuid,p_game_type text,p_join_mode text,p_invited_user_ids uuid[] default '{}'::uuid[],
 p_settings jsonb default '{}'::jsonb,p_initial_state jsonb default '{}'::jsonb,p_creator_color text default '#38BDF8'
) returns public.gather_multiplayer_games
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_game public.gather_multiplayer_games;v_invitee uuid;
begin
 if v_uid is null then raise exception 'Sign in to create a multiplayer game.'; end if;
 if p_game_type is null or p_game_type !~ '^[a-z][a-z0-9_]{1,39}$' then raise exception 'Invalid multiplayer game type.'; end if;
 if p_join_mode not in ('invite','open') then raise exception 'Choose invite-only or open joining.'; end if;
 if p_creator_color is null or p_creator_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid player color.'; end if;
 if jsonb_typeof(coalesce(p_settings,'{}'::jsonb))<>'object' or octet_length(coalesce(p_settings,'{}'::jsonb)::text)>8192
 or jsonb_typeof(coalesce(p_initial_state,'{}'::jsonb))<>'object' or octet_length(coalesce(p_initial_state,'{}'::jsonb)::text)>16384 then raise exception 'The multiplayer game settings are invalid.'; end if;
 if p_join_mode='invite' and coalesce(cardinality(p_invited_user_ids),0)=0 then raise exception 'Select at least one person to invite.'; end if;
 if p_join_mode='open' and coalesce(cardinality(p_invited_user_ids),0)>0 then raise exception 'Open games cannot include a private invite list.'; end if;
 if exists(select 1 from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) u where u is null or u=v_uid
  or not exists(select 1 from public.friendships f where f.user_id=v_uid and f.friend_id=u)
  or not exists(select 1 from public.friendships f where f.user_id=u and f.friend_id=v_uid)
  or private.is_blocked_between(v_uid,u)) then raise exception 'Every invite must be an accepted friend who has not blocked you.'; end if;
 insert into public.gather_multiplayer_games(conversation_id,game_type,created_by,join_mode,settings,state)
 values(null,p_game_type,v_uid,p_join_mode,coalesce(p_settings,'{}'::jsonb),coalesce(p_initial_state,'{}'::jsonb)) returning * into v_game;
 insert into public.gather_multiplayer_players(game_id,user_id,status,color,x,y,is_it,joined_at)
 values(v_game.id,v_uid,'joined',upper(p_creator_color),50,50,true,now());
 if p_join_mode='invite' then foreach v_invitee in array coalesce(p_invited_user_ids,'{}'::uuid[]) loop
  insert into public.gather_multiplayer_players(game_id,user_id,status) values(v_game.id,v_invitee,'invited') on conflict(game_id,user_id) do nothing;
 end loop; end if;
 return v_game;
end $$;

create or replace function private.gather_multiplayer_join(p_game_id uuid,p_color text)
returns public.gather_multiplayer_players language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_game public.gather_multiplayer_games;v_player public.gather_multiplayer_players;v_count integer;v_x numeric(6,2);v_y numeric(6,2);
begin
 if v_uid is null then raise exception 'Sign in to join this game.'; end if;
 if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid player color.'; end if;
 select * into v_game from public.gather_multiplayer_games where id=p_game_id for update;
 if v_game.id is null or v_game.status<>'active' then raise exception 'This game is no longer open.'; end if;
 if v_game.join_mode='invite' and not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid and status in ('invited','joined')) then raise exception 'This match is invite-only.'; end if;
 if v_game.join_mode='open' and not exists(select 1 from public.friendships f where f.user_id=v_game.created_by and f.friend_id=v_uid) then raise exception 'Only the host’s accepted friends can join this open game.'; end if;
 if private.is_blocked_between(v_game.created_by,v_uid) then raise exception 'You cannot join this game.'; end if;
 if exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and lower(color)=lower(p_color) and user_id<>v_uid and status='joined') then raise exception 'That color is already taken.'; end if;
 select count(*) into v_count from public.gather_multiplayer_players where game_id=p_game_id and status='joined' and user_id<>v_uid;
 v_x:=12+mod(v_count*19,76);v_y:=15+mod(v_count*31,70);
 insert into public.gather_multiplayer_players(game_id,user_id,status,color,x,y,is_it,joined_at,updated_at)
 values(p_game_id,v_uid,'joined',p_color,v_x,v_y,false,now(),now())
 on conflict(game_id,user_id) do update set status='joined',color=excluded.color,x=coalesce(public.gather_multiplayer_players.x,excluded.x),y=coalesce(public.gather_multiplayer_players.y,excluded.y),joined_at=coalesce(public.gather_multiplayer_players.joined_at,now()),updated_at=now()
 returning * into v_player;
 update public.gather_multiplayer_games set updated_at=now(),revision=revision+1 where id=p_game_id;
 return v_player;
end $$;

create or replace function private.gather_tag_create(
 p_conversation_id uuid,p_mode text,p_join_mode text,p_invited_user_ids uuid[],p_color text,p_max_players integer
) returns public.gather_tag_lobbies language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_lobby public.gather_tag_lobbies;v_invitee uuid;
begin
 if v_uid is null then raise exception 'Sign in to create a Tag lobby.'; end if;
 if p_mode not in ('classic','infection','team_tag','last_standing') then raise exception 'Choose a valid Tag mode.'; end if;
 if p_join_mode not in ('open','invite') then raise exception 'Choose invite-only or open joining.'; end if;
 if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid circle color.'; end if;
 if p_max_players is null or p_max_players<2 or p_max_players>20 then raise exception 'Choose between 2 and 20 players.'; end if;
 if p_join_mode='invite' and coalesce(cardinality(p_invited_user_ids),0)=0 then raise exception 'Select at least one person to invite.'; end if;
 if p_join_mode='open' and coalesce(cardinality(p_invited_user_ids),0)>0 then raise exception 'Open lobbies cannot include a private invite list.'; end if;
 if exists(select 1 from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) u where u is null or u=v_uid
  or not exists(select 1 from public.friendships f where f.user_id=v_uid and f.friend_id=u)
  or not exists(select 1 from public.friendships f where f.user_id=u and f.friend_id=v_uid)
  or private.is_blocked_between(v_uid,u)) then raise exception 'Every invite must be an accepted friend who has not blocked you.'; end if;
 insert into public.gather_tag_lobbies(conversation_id,created_by,mode,join_mode,max_players)
 values(null,v_uid,p_mode,p_join_mode,p_max_players) returning * into v_lobby;
 insert into public.gather_tag_players(lobby_id,user_id,status,color,ready,x,y) values(v_lobby.id,v_uid,'joined',upper(p_color),false,50,50);
 if p_join_mode='invite' then foreach v_invitee in array coalesce(p_invited_user_ids,'{}'::uuid[]) loop
  insert into public.gather_tag_players(lobby_id,user_id,status,color,ready) values(v_lobby.id,v_invitee,'invited','#64748B',false) on conflict do nothing;
 end loop; end if;
 return v_lobby;
end $$;

create or replace function private.gather_tag_join(p_lobby_id uuid,p_color text)
returns public.gather_tag_players language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_lobby public.gather_tag_lobbies;v_player public.gather_tag_players;v_count integer;
begin
 if v_uid is null then raise exception 'Sign in to join Tag.'; end if;
 if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid circle color.'; end if;
 select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
 if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'This lobby is no longer open.'; end if;
 if v_lobby.join_mode='invite' and not exists(select 1 from public.gather_tag_players where lobby_id=p_lobby_id and user_id=v_uid and status='invited') then raise exception 'This lobby is invite-only.'; end if;
 if v_lobby.join_mode='open' and not exists(select 1 from public.friendships f where f.user_id=v_lobby.created_by and f.friend_id=v_uid) then raise exception 'Only the host’s accepted friends can join this open lobby.'; end if;
 if private.is_blocked_between(v_lobby.created_by,v_uid) then raise exception 'You cannot join this lobby.'; end if;
 if exists(select 1 from public.gather_tag_players where lobby_id=p_lobby_id and lower(color)=lower(p_color) and user_id<>v_uid and status='joined') then raise exception 'That color is already taken.'; end if;
 select count(*) into v_count from public.gather_tag_players where lobby_id=p_lobby_id and status='joined';
 if v_count>=v_lobby.max_players then raise exception 'This lobby is full.'; end if;
 insert into public.gather_tag_players(lobby_id,user_id,status,color,ready,x,y) values(p_lobby_id,v_uid,'joined',upper(p_color),false,12+mod(v_count*19,76),15+mod(v_count*31,70))
 on conflict(lobby_id,user_id) do update set status='joined',color=excluded.color,ready=false,joined_at=now(),updated_at=now() returning * into v_player;
 update public.gather_tag_lobbies set updated_at=now() where id=p_lobby_id;
 return v_player;
end $$;

drop policy if exists "Conversation members can view multiplayer games" on public.gather_multiplayer_games;
create policy "Game participants can view multiplayer games" on public.gather_multiplayer_games for select to authenticated using(private.is_multiplayer_game_player(id));
drop policy if exists "Conversation members can view multiplayer players" on public.gather_multiplayer_players;
create policy "Game participants can view multiplayer players" on public.gather_multiplayer_players for select to authenticated using(private.is_multiplayer_game_player(game_id));
drop policy if exists "Conversation members can view Tag lobbies" on public.gather_tag_lobbies;
create policy "Tag participants can view Tag lobbies" on public.gather_tag_lobbies for select to authenticated using(private.is_tag_lobby_player(id));
drop policy if exists "Conversation members can view Tag players" on public.gather_tag_players;
create policy "Tag participants can view Tag players" on public.gather_tag_players for select to authenticated using(private.is_tag_lobby_player(lobby_id));

revoke all on function private.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb,text) from public,anon;
revoke all on function private.gather_multiplayer_join(uuid,text) from public,anon;
revoke all on function private.gather_tag_create(uuid,text,text,uuid[],text,integer) from public,anon;
revoke all on function private.gather_tag_join(uuid,text) from public,anon;
grant execute on function private.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb,text) to authenticated;
grant execute on function private.gather_multiplayer_join(uuid,text) to authenticated;
grant execute on function private.gather_tag_create(uuid,text,text,uuid[],text,integer) to authenticated;
grant execute on function private.gather_tag_join(uuid,text) to authenticated;
