-- Allow game invitations to people who share a private or group conversation with the host.
-- Accepted friends remain eligible; blocked accounts are always excluded.

create or replace function private.gather_can_invite_game_person(p_user_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null
   and p_user_id is not null
   and p_user_id <> auth.uid()
   and not private.is_blocked_between(auth.uid(), p_user_id)
   and (
     (exists(select 1 from public.friendships f where f.user_id=auth.uid() and f.friend_id=p_user_id)
      and exists(select 1 from public.friendships f where f.user_id=p_user_id and f.friend_id=auth.uid()))
     or exists(
       select 1
       from public.conversation_members mine
       join public.conversation_members theirs on theirs.conversation_id=mine.conversation_id
       join public.conversations c on c.id=mine.conversation_id
       where mine.user_id=auth.uid()
         and theirs.user_id=p_user_id
         and c.kind in ('direct','group')
     )
   );
$$;
revoke all on function private.gather_can_invite_game_person(uuid) from public,anon,authenticated;

create or replace function private.gather_game_invitable_people()
returns table(user_id uuid, username text, display_name text)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sign in to choose players.'; end if;
 return query
 select p.id,p.username,p.display_name
 from public.profiles p
 where private.gather_can_invite_game_person(p.id)
 order by coalesce(nullif(p.display_name,''),p.username);
end $$;

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
 if exists(select 1 from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) as invited(user_id)
   where invited.user_id is null or not private.gather_can_invite_game_person(invited.user_id)) then
   raise exception 'You can invite people from your private or group chats, or accepted friends, unless either account has blocked the other.';
 end if;
 insert into public.gather_multiplayer_games(conversation_id,game_type,created_by,join_mode,settings,state)
 values(null,p_game_type,v_uid,p_join_mode,coalesce(p_settings,'{}'::jsonb),coalesce(p_initial_state,'{}'::jsonb)) returning * into v_game;
 insert into public.gather_multiplayer_players(game_id,user_id,status,color,x,y,is_it,joined_at)
 values(v_game.id,v_uid,'joined',upper(p_creator_color),50,50,true,now());
 if p_join_mode='invite' then foreach v_invitee in array coalesce(p_invited_user_ids,'{}'::uuid[]) loop
  insert into public.gather_multiplayer_players(game_id,user_id,status) values(v_game.id,v_invitee,'invited') on conflict(game_id,user_id) do nothing;
 end loop; end if;
 return v_game;
end $$;

create or replace function private.gather_tag_create(
 p_conversation_id uuid,p_mode text,p_join_mode text,p_invited_user_ids uuid[],p_color text,p_max_players integer
) returns public.gather_tag_lobbies
language plpgsql security definer set search_path=''
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
 if exists(select 1 from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) as invited(user_id)
   where invited.user_id is null or not private.gather_can_invite_game_person(invited.user_id)) then
   raise exception 'You can invite people from your private or group chats, or accepted friends, unless either account has blocked the other.';
 end if;
 insert into public.gather_tag_lobbies(conversation_id,created_by,mode,join_mode,max_players)
 values(null,v_uid,p_mode,p_join_mode,p_max_players) returning * into v_lobby;
 insert into public.gather_tag_players(lobby_id,user_id,status,color,ready,x,y) values(v_lobby.id,v_uid,'joined',upper(p_color),false,50,50);
 if p_join_mode='invite' then foreach v_invitee in array coalesce(p_invited_user_ids,'{}'::uuid[]) loop
  insert into public.gather_tag_players(lobby_id,user_id,status,color,ready) values(v_lobby.id,v_invitee,'invited','#64748B',false) on conflict do nothing;
 end loop; end if;
 return v_lobby;
end $$;
