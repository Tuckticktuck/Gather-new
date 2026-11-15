create or replace function public.gather_public_game_lobbies(p_game_type text default null)
returns table(
  game_id uuid, game_type text, host_id uuid, host_name text, settings jsonb,
  is_started boolean, player_count integer, spectator_count integer, max_players integer,
  open_seats integer, available_colors text[], viewer_status text,
  can_join boolean, can_spectate boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in to browse open game lobbies.'; end if;
  if p_game_type is not null and p_game_type not in ('chess','checkers','tic_tac_toe','connect_four','battleship','uno','ludo','dominoes') then
    raise exception 'That game is not available in the lobby directory.';
  end if;
  return query
  with visible as (
    select g.id,g.game_type,g.created_by,
      coalesce(nullif(btrim(pr.display_name),''),nullif(btrim(pr.username),''),'Gather member') as host_name,
      case when g.game_type='dominoes' then jsonb_build_object('mode',coalesce(g.settings->>'mode','free_for_all'),'preset',coalesce(g.settings->>'preset','classic')) else '{}'::jsonb end as settings,
      case when g.game_type='dominoes' then coalesce(g.state->>'phase','lobby') <> 'lobby' else coalesce((g.state->>'started')::boolean,false) end as is_started,
      case g.game_type
        when 'uno' then least(10,greatest(2,coalesce((g.settings->>'max_players')::integer,10)))
        when 'ludo' then least(4,greatest(2,coalesce((g.settings->>'max_players')::integer,4)))
        else 4
      end::integer as max_players,
      g.created_at,g.updated_at,g.state
    from public.gather_multiplayer_games g
    join public.profiles pr on pr.id=g.created_by
    where g.status='active' and g.join_mode='open' and g.conversation_id is null
      and g.game_type in ('uno','ludo','dominoes')
      and (p_game_type is null or g.game_type=p_game_type)
      and (g.created_by=v_uid or exists(select 1 from public.friendships f where f.user_id=v_uid and f.friend_id=g.created_by))
      and not private.is_blocked_between(g.created_by,v_uid)
  ),
  counts as (
    select p.game_id,count(*) filter(where p.status='joined')::integer as player_count,
      count(*) filter(where p.status='spectating')::integer as spectator_count
    from public.gather_multiplayer_players p join visible v on v.id=p.game_id group by p.game_id
  ),
  viewer as (
    select p.game_id,p.status from public.gather_multiplayer_players p
    join visible v on v.id=p.game_id where p.user_id=v_uid
  )
  select v.id,v.game_type,v.created_by,v.host_name,v.settings,v.is_started,
    coalesce(c.player_count,0),coalesce(c.spectator_count,0),v.max_players,
    greatest(0,v.max_players-coalesce(c.player_count,0)),
    case when v.game_type='ludo' then
      array(select palette.color from unnest(array['#D85A60','#39A96B','#D9AD45','#4F83D1']::text[]) as palette(color)
        where not exists(select 1 from public.gather_multiplayer_players occupied
          where occupied.game_id=v.id and occupied.status='joined' and lower(occupied.color)=lower(palette.color)))
    else
      array(select palette.color from unnest(array['#22D3EE','#40826D','#D85A60','#D9AD45','#4F83D1','#A78BFA','#F472B6','#39A96B']::text[]) as palette(color)
        where not exists(select 1 from public.gather_multiplayer_players occupied
          where occupied.game_id=v.id and occupied.status='joined' and lower(occupied.color)=lower(palette.color)))
    end,
    vw.status,
    (coalesce(c.player_count,0)<v.max_players and coalesce(vw.status,'')<>'joined'
      and (not v.is_started or v.game_type='uno')
      and not (v.game_type='uno' and (coalesce(v.state->>'finished','false')='true' or v.state->>'winner_id' is not null))
      and (v.game_type<>'ludo' or cardinality(array(
        select palette.color from unnest(array['#D85A60','#39A96B','#D9AD45','#4F83D1']::text[]) as palette(color)
        where not exists(select 1 from public.gather_multiplayer_players occupied
          where occupied.game_id=v.id and occupied.status='joined' and lower(occupied.color)=lower(palette.color))
      ))>0)),
    (v.is_started and coalesce(vw.status,'')<>'joined'),
    v.created_at,v.updated_at
  from visible v left join counts c on c.game_id=v.id left join viewer vw on vw.game_id=v.id
  order by v.updated_at desc limit 100;
end;
$function$;

create or replace function public.gather_public_lobby_action(p_game_id uuid,p_action text,p_color text default null)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_game public.gather_multiplayer_games;
  v_status text;
  v_color text := p_color;
begin
  if v_uid is null then raise exception 'Sign in to join or watch a game.'; end if;
  if p_action not in ('join','spectate') then raise exception 'Choose Join or Spectate.'; end if;
  select * into v_game from public.gather_multiplayer_games
  where id=p_game_id and game_type in ('uno','ludo','dominoes')
    and status='active' and join_mode='open' and conversation_id is null for update;
  if v_game.id is null then raise exception 'This open lobby is no longer available.'; end if;
  if v_game.created_by<>v_uid and not exists(select 1 from public.friendships f where f.user_id=v_uid and f.friend_id=v_game.created_by) then
    raise exception 'Only the host’s accepted friends can join or watch this open lobby.';
  end if;
  if private.is_blocked_between(v_game.created_by,v_uid) then raise exception 'You cannot join or watch this lobby.'; end if;
  select p.status into v_status from public.gather_multiplayer_players p where p.game_id=p_game_id and p.user_id=v_uid;

  if p_action='join' then
    if v_status='joined' then return true; end if;
    if v_game.game_type='ludo' then
      if v_color is null then
        select palette.color into v_color from unnest(array['#D85A60','#39A96B','#D9AD45','#4F83D1']::text[]) as palette(color)
        where not exists(select 1 from public.gather_multiplayer_players occupied
          where occupied.game_id=p_game_id and occupied.status='joined' and lower(occupied.color)=lower(palette.color)) limit 1;
      end if;
      if v_color is null or lower(v_color) not in ('#d85a60','#39a96b','#d9ad45','#4f83d1') then raise exception 'No Ludo colors are available in this lobby.'; end if;
    elsif v_game.game_type='dominoes' and v_color is null then
      select palette.color into v_color from unnest(array['#22D3EE','#40826D','#D85A60','#D9AD45','#4F83D1','#A78BFA','#F472B6','#39A96B']::text[]) as palette(color)
      where not exists(select 1 from public.gather_multiplayer_players occupied
        where occupied.game_id=p_game_id and occupied.status='joined' and lower(occupied.color)=lower(palette.color)) limit 1;
      if v_color is null then raise exception 'No player colors are available in this lobby.'; end if;
    end if;
    if v_game.game_type in ('uno','ludo') then
      insert into public.gather_multiplayer_players(game_id,user_id,status,color,ready,updated_at)
      values(p_game_id,v_uid,'invited',coalesce(v_color,'#40826D'),false,now())
      on conflict(game_id,user_id) do update set status='invited',ready=false,updated_at=now()
      where public.gather_multiplayer_players.status in ('left','declined','spectating');
    end if;
    if v_game.game_type='uno' then
      perform public.gather_uno_join(p_game_id,coalesce(v_color,'#40826D'));
    elsif v_game.game_type='ludo' then
      perform public.gather_ludo_join(p_game_id,v_color);
    else
      perform public.gather_dominoes_join(p_game_id,coalesce(v_color,'#22D3EE'));
    end if;
    return true;
  end if;

  if v_status='joined' then raise exception 'You are already a player in this match.'; end if;
  if v_status='spectating' then return true; end if;
  if v_game.game_type='ludo' then
    if not coalesce((v_game.state->>'started')::boolean,false) then raise exception 'Spectating is available after the Ludo match starts.'; end if;
    insert into public.gather_multiplayer_players(game_id,user_id,status,color,ready,updated_at)
    values(p_game_id,v_uid,'spectating',null,false,now())
    on conflict(game_id,user_id) do update set status='spectating',color=null,ready=false,updated_at=now();
    update public.gather_multiplayer_games set revision=revision+1,updated_at=now() where id=p_game_id;
    return true;
  end if;
  insert into public.gather_multiplayer_players(game_id,user_id,status,color,ready,updated_at)
  values(p_game_id,v_uid,'invited',coalesce(v_color,'#40826D'),false,now())
  on conflict(game_id,user_id) do update set status='invited',ready=false,updated_at=now()
  where public.gather_multiplayer_players.status in ('left','declined');
  if v_game.game_type='uno' then
    perform public.gather_uno_spectate(p_game_id);
  else
    if coalesce(v_game.state->>'phase','lobby')='lobby' then raise exception 'Spectating is available after the Dominoes match starts.'; end if;
    perform public.gather_dominoes_spectate(p_game_id);
  end if;
  return true;
end;
$function$;

revoke all on function public.gather_public_game_lobbies(text) from public,anon;
grant execute on function public.gather_public_game_lobbies(text) to authenticated;
revoke all on function public.gather_public_lobby_action(uuid,text,text) from public,anon;
grant execute on function public.gather_public_lobby_action(uuid,text,text) to authenticated;