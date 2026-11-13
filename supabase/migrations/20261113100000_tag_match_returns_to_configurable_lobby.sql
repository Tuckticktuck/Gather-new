create or replace function private.gather_tag_end(p_lobby_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_lobby public.gather_tag_lobbies;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status not in ('lobby','active','completed') then
    raise exception 'This Tag lobby is no longer available.';
  end if;
  if v_lobby.created_by <> v_uid then raise exception 'Only the host can return this match to its lobby.'; end if;
  update public.gather_tag_lobbies set status='lobby',updated_at=now() where id=p_lobby_id;
  update public.gather_tag_players
    set ready=false,is_it=false,team=null,x=50,y=50,updated_at=now()
    where lobby_id=p_lobby_id and status='joined';
  return true;
end
$function$;

create or replace function private.gather_tag_set_mode(p_lobby_id uuid,p_mode text)
returns public.gather_tag_lobbies
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_lobby public.gather_tag_lobbies;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p_mode not in ('classic','infection','team_tag','last_standing') then
    raise exception 'Choose a valid Tag game mode.';
  end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null then raise exception 'This Tag lobby could not be found.'; end if;
  if v_lobby.created_by <> v_uid then raise exception 'Only the host can change the game mode.'; end if;
  if v_lobby.status <> 'lobby' then raise exception 'Game mode can only be changed from the waiting room.'; end if;
  update public.gather_tag_lobbies set mode=p_mode,updated_at=now()
    where id=p_lobby_id returning * into v_lobby;
  return v_lobby;
end
$function$;

create or replace function public.gather_tag_set_mode(p_lobby_id uuid,p_mode text)
returns public.gather_tag_lobbies
language sql
security invoker
set search_path to ''
as $function$
  select private.gather_tag_set_mode($1,$2)
$function$;

revoke all on function private.gather_tag_set_mode(uuid,text) from public,anon;
revoke all on function public.gather_tag_set_mode(uuid,text) from public,anon;
grant execute on function private.gather_tag_set_mode(uuid,text) to authenticated;
grant execute on function public.gather_tag_set_mode(uuid,text) to authenticated;
