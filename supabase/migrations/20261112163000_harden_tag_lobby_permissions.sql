create or replace function private.gather_tag_join(p_lobby_id uuid,p_color text)
returns public.gather_tag_players language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies; v_player public.gather_tag_players; v_count integer;
begin
  if v_uid is null then raise exception 'Sign in to join Tag.'; end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid circle color.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'This lobby is no longer open.'; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) or not private.can_send_message(v_lobby.conversation_id) then raise exception 'You cannot join Tag in this conversation.'; end if;
  if v_lobby.join_mode='invite' and not exists(select 1 from public.gather_tag_players where lobby_id=p_lobby_id and user_id=v_uid and status='invited') then raise exception 'This lobby is invite-only.'; end if;
  if exists(select 1 from public.gather_tag_players where lobby_id=p_lobby_id and lower(color)=lower(p_color) and user_id<>v_uid and status='joined') then raise exception 'That color is already taken.'; end if;
  select count(*) into v_count from public.gather_tag_players where lobby_id=p_lobby_id and status='joined';
  if v_count>=v_lobby.max_players then raise exception 'This lobby is full.'; end if;
  insert into public.gather_tag_players(lobby_id,user_id,status,color,ready,x,y)
  values(p_lobby_id,v_uid,'joined',upper(p_color),false,12+mod(v_count*19,76),15+mod(v_count*31,70))
  on conflict(lobby_id,user_id) do update set status='joined',color=excluded.color,ready=false,joined_at=now(),updated_at=now()
  returning * into v_player;
  update public.gather_tag_lobbies set updated_at=now() where id=p_lobby_id;
  return v_player;
end $$;

create or replace function private.gather_tag_ready(p_lobby_id uuid,p_ready boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'This lobby is no longer waiting.'; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) or not private.can_send_message(v_lobby.conversation_id) then raise exception 'Lobby access is no longer available.'; end if;
  update public.gather_tag_players set ready=coalesce(p_ready,false),updated_at=now()
    where lobby_id=p_lobby_id and user_id=v_uid and status='joined';
  if not found then raise exception 'Join the lobby first.'; end if;
  update public.gather_tag_lobbies set updated_at=now() where id=p_lobby_id;
  return true;
end $$;

create or replace function private.gather_tag_start(p_lobby_id uuid)
returns public.gather_tag_lobbies language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies; v_count integer; v_not_ready integer; v_it uuid; v_idx integer:=0; v_player record;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'This lobby cannot be started.'; end if;
  if v_lobby.created_by<>v_uid then raise exception 'Only the lobby host can start the match.'; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) or not private.can_send_message(v_lobby.conversation_id) then raise exception 'The host no longer has access to this conversation.'; end if;
  select count(*),count(*) filter(where not ready) into v_count,v_not_ready
    from public.gather_tag_players where lobby_id=p_lobby_id and status='joined';
  if v_count<2 then raise exception 'At least two players are required.'; end if;
  if v_not_ready>0 then raise exception 'Everyone must be ready before the match starts.'; end if;
  select user_id into v_it from public.gather_tag_players where lobby_id=p_lobby_id and status='joined' order by random() limit 1;
  for v_player in select user_id from public.gather_tag_players where lobby_id=p_lobby_id and status='joined' order by joined_at,user_id loop
    update public.gather_tag_players set
      x=12+mod(v_idx*19,76), y=15+mod(v_idx*31,70),
      is_it=case when v_lobby.mode='team_tag' then (v_idx%2=0) else user_id=v_it end,
      team=case when v_lobby.mode='team_tag' then case when v_idx%2=0 then 'taggers' else 'runners' end else null end,
      updated_at=now()
      where lobby_id=p_lobby_id and user_id=v_player.user_id;
    v_idx:=v_idx+1;
  end loop;
  update public.gather_tag_lobbies set status='active',updated_at=now() where id=p_lobby_id returning * into v_lobby;
  return v_lobby;
end $$;

create or replace function private.gather_tag_move(p_lobby_id uuid,p_x numeric,p_y numeric)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies; v_player public.gather_tag_players; v_target public.gather_tag_players; v_tagged uuid;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p_x is null or p_y is null or p_x<0 or p_x>100 or p_y<0 or p_y>100 then raise exception 'Position is outside the arena.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'active' then raise exception 'This Tag match is not active.'; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) or not private.can_send_message(v_lobby.conversation_id) then raise exception 'You cannot access this match.'; end if;
  select * into v_player from public.gather_tag_players where lobby_id=p_lobby_id and user_id=v_uid and status='joined' for update;
  if v_player.user_id is null then raise exception 'Join the match before moving.'; end if;
  if sqrt(power(p_x-v_player.x,2)+power(p_y-v_player.y,2))>9 then raise exception 'Movement update is too large.'; end if;
  update public.gather_tag_players set x=p_x,y=p_y,updated_at=now() where lobby_id=p_lobby_id and user_id=v_uid;
  if v_player.is_it then
    select * into v_target from public.gather_tag_players
    where lobby_id=p_lobby_id and status='joined' and user_id<>v_uid and not is_it
      and sqrt(power(x-p_x,2)+power(y-p_y,2))<=4.2
      and (v_lobby.mode<>'team_tag' or team<>v_player.team)
    order by sqrt(power(x-p_x,2)+power(y-p_y,2)) limit 1 for update;
    if v_target.user_id is not null then
      v_tagged:=v_target.user_id;
      if v_lobby.mode='classic' then
        update public.gather_tag_players set is_it=false where lobby_id=p_lobby_id and user_id=v_uid;
        update public.gather_tag_players set is_it=true where lobby_id=p_lobby_id and user_id=v_target.user_id;
      elsif v_lobby.mode='infection' then
        update public.gather_tag_players set is_it=true where lobby_id=p_lobby_id and user_id=v_target.user_id;
      elsif v_lobby.mode='team_tag' then
        update public.gather_tag_players set is_it=true,team=v_player.team where lobby_id=p_lobby_id and user_id=v_target.user_id;
      elsif v_lobby.mode='last_standing' then
        update public.gather_tag_players set status='eliminated' where lobby_id=p_lobby_id and user_id=v_target.user_id;
        if (select count(*) from public.gather_tag_players where lobby_id=p_lobby_id and status='joined')<=1 then
          update public.gather_tag_lobbies set status='completed',updated_at=now() where id=p_lobby_id;
        end if;
      end if;
    end if;
  end if;
  update public.gather_tag_lobbies set updated_at=now() where id=p_lobby_id;
  return jsonb_build_object('tagged_user_id',v_tagged,'status',(select status from public.gather_tag_lobbies where id=p_lobby_id));
end $$;

create or replace function private.gather_tag_end(p_lobby_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_lobby public.gather_tag_lobbies;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status not in ('lobby','active') then return true; end if;
  if v_lobby.created_by<>v_uid then raise exception 'Only the host can end this match.'; end if;
  update public.gather_tag_lobbies set status='completed',updated_at=now() where id=p_lobby_id;
  return true;
end $$;
create or replace function public.gather_tag_end(p_lobby_id uuid)
returns boolean language sql set search_path='' as $$ select private.gather_tag_end($1) $$;
grant execute on function private.gather_tag_end(uuid),public.gather_tag_end(uuid) to authenticated;
