alter table public.gather_games
  add column if not exists player_one_ready boolean not null default false,
  add column if not exists player_two_ready boolean not null default false,
  add column if not exists started_at timestamptz;

create or replace function public.gather_game_set_ready(p_game_id uuid, p_ready boolean)
returns public.gather_games language plpgsql security definer set search_path = '' as $$
declare v_game public.gather_games; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Sign in before changing readiness.'; end if;
  select * into v_game from public.gather_games g
  where g.id=p_game_id and g.status='active' and g.started_at is null
    and v_actor in (g.player_one_id,g.player_two_id)
    and private.is_conversation_member(g.conversation_id)
    and private.can_send_message(g.conversation_id)
  for update;
  if v_game.id is null then raise exception 'This game lobby is no longer available.'; end if;
  update public.gather_games set
    player_one_ready=case when v_actor=player_one_id then coalesce(p_ready,false) else player_one_ready end,
    player_two_ready=case when v_actor=player_two_id then coalesce(p_ready,false) else player_two_ready end,
    revision=revision+1,updated_at=now()
  where id=p_game_id returning * into v_game;
  return v_game;
end; $$;

create or replace function public.gather_game_start(p_game_id uuid)
returns public.gather_games language plpgsql security definer set search_path = '' as $$
declare v_game public.gather_games; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Sign in to start the match.'; end if;
  select * into v_game from public.gather_games g where g.id=p_game_id for update;
  if v_game.id is null or v_game.status<>'active' or v_game.started_at is not null then raise exception 'This game lobby is not available to start.'; end if;
  if v_game.created_by<>v_actor then raise exception 'Only the host can start this match.'; end if;
  if v_game.player_one_id is null or v_game.player_two_id is null then raise exception 'Both player seats must be filled.'; end if;
  if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception 'Game access is unavailable because conversation permissions have changed.'; end if;
  if not v_game.player_one_ready or not v_game.player_two_ready then raise exception 'Both players must be ready before the host starts the match.'; end if;
  update public.gather_games set started_at=now(),turn_user_id=player_one_id,revision=revision+1,updated_at=now()
  where id=p_game_id returning * into v_game;
  return v_game;
end; $$;

revoke all on function public.gather_game_set_ready(uuid,boolean) from public,anon;
grant execute on function public.gather_game_set_ready(uuid,boolean) to authenticated;
revoke all on function public.gather_game_start(uuid) from public,anon;
grant execute on function public.gather_game_start(uuid) to authenticated;

create or replace function private.prevent_legacy_gameplay_before_start()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.started_at is null and new.started_at is null and old.status='active'
     and new.state is distinct from old.state then
    raise exception 'Both players must ready up and the host must start the match before playing.';
  end if;
  return new;
end; $$;

drop trigger if exists gather_games_require_started_lobby on public.gather_games;
create trigger gather_games_require_started_lobby
before update of state on public.gather_games
for each row execute function private.prevent_legacy_gameplay_before_start();

create or replace function private.enforce_two_player_multiplayer_lobbies()
returns trigger language plpgsql set search_path = '' as $$
declare v_game_type text; v_count integer;
begin
  select g.game_type into v_game_type from public.gather_multiplayer_games g where g.id=new.game_id;
  if v_game_type in ('uno','ludo','dominoes') and new.status in ('joined','invited') then
    select count(*) into v_count from public.gather_multiplayer_players p
    where p.game_id=new.game_id and p.user_id<>new.user_id and p.status in ('joined','invited');
    if v_count>=2 then raise exception 'Gather matches are limited to two players.'; end if;
  end if;
  return new;
end; $$;

drop trigger if exists gather_multiplayer_players_two_player_limit on public.gather_multiplayer_players;
create trigger gather_multiplayer_players_two_player_limit
before insert or update of status on public.gather_multiplayer_players
for each row execute function private.enforce_two_player_multiplayer_lobbies();

create or replace function private.normalize_two_player_lobby_settings()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.game_type in ('uno','ludo','dominoes') then
    new.settings:=jsonb_set(coalesce(new.settings,'{}'::jsonb),'{max_players}','2'::jsonb,true);
    if new.game_type='dominoes' then
      if coalesce(new.settings->>'mode','free_for_all')<>'free_for_all' then
        raise exception 'Gather Dominoes matches use two-player free-for-all mode.';
      end if;
      new.settings:=jsonb_set(new.settings,'{mode}','"free_for_all"'::jsonb,true);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists gather_multiplayer_games_two_player_settings on public.gather_multiplayer_games;
create trigger gather_multiplayer_games_two_player_settings
before insert on public.gather_multiplayer_games
for each row execute function private.normalize_two_player_lobby_settings();

create or replace function public.gather_uno_create(p_conversation_id uuid,p_join_mode text,p_invited_user_ids uuid[] default '{}'::uuid[],p_max_players integer default 2)
returns public.gather_multiplayer_games language plpgsql security definer set search_path = '' as $$
declare v_game public.gather_multiplayer_games;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_max_players<>2 then raise exception 'Gather UNO matches are limited to two players.'; end if;
  if p_join_mode not in ('open','invite') then raise exception 'Choose open or invite-only joining.'; end if;
  if p_join_mode='invite' and cardinality(coalesce(p_invited_user_ids,'{}'::uuid[]))<>1 then raise exception 'Choose exactly one opponent for this UNO match.'; end if;
  if p_join_mode='open' and cardinality(coalesce(p_invited_user_ids,'{}'::uuid[]))<>0 then raise exception 'Open lobbies cannot include private invitations.'; end if;
  v_game:=public.gather_multiplayer_create(p_conversation_id,'uno',p_join_mode,coalesce(p_invited_user_ids,'{}'::uuid[]),
    jsonb_build_object('max_players',2,'house_rules',jsonb_build_object('starting_hand_size',7,'draw_until_playable',false,'wild4_anytime',false)),
    jsonb_build_object('version',1,'started',false),'#40826D');
  update public.gather_multiplayer_players set ready=false where game_id=v_game.id and user_id=auth.uid();
  if p_join_mode='invite' then
    insert into public.notifications(recipient_id,actor_id,kind,title,body,conversation_id)
    select p.user_id,auth.uid(),'uno_invite','UNO lobby invitation',v_game.id::text,p_conversation_id
    from public.gather_multiplayer_players p where p.game_id=v_game.id and p.status='invited' and p.user_id<>auth.uid()
    on conflict do nothing;
  end if;
  return v_game;
end; $$;

create or replace function public.gather_ludo_create(p_conversation_id uuid,p_join_mode text,p_invited_user_ids uuid[] default '{}'::uuid[],p_max_players integer default 2,p_creator_color text default '#D85A60')
returns public.gather_multiplayer_games language plpgsql security definer set search_path = '' as $$
declare v_game public.gather_multiplayer_games; v_invites uuid[]:=coalesce(p_invited_user_ids,'{}'::uuid[]);
begin
  if auth.uid() is null then raise exception 'Sign in to create a Ludo lobby.'; end if;
  if p_max_players<>2 then raise exception 'Gather Ludo matches are limited to two players.'; end if;
  if p_join_mode not in ('open','invite') then raise exception 'Choose open or invite-only joining.'; end if;
  if lower(coalesce(p_creator_color,'')) not in ('#d85a60','#39a96b','#d9ad45','#4f83d1') then raise exception 'Choose an available Ludo color.'; end if;
  if p_join_mode='invite' and cardinality(v_invites)<>1 then raise exception 'Choose exactly one opponent for this Ludo match.'; end if;
  if p_join_mode='open' and cardinality(v_invites)<>0 then raise exception 'Open lobbies cannot include private invitations.'; end if;
  v_game:=public.gather_multiplayer_create(p_conversation_id,'ludo',p_join_mode,v_invites,jsonb_build_object('max_players',2),
    jsonb_build_object('version',1,'started',false,'message','Waiting for both players.'),upper(p_creator_color));
  update public.gather_multiplayer_players set ready=false where game_id=v_game.id and user_id=auth.uid();
  return v_game;
end; $$;

create or replace function public.gather_dominoes_create(p_join_mode text,p_invited_user_ids uuid[],p_mode text,p_preset text default 'classic')
returns public.gather_multiplayer_games language plpgsql security definer set search_path = '' as $$
declare v_target integer; v_game public.gather_multiplayer_games; v_invite uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to create a Dominoes lobby.'; end if;
  if p_mode<>'free_for_all' then raise exception 'Gather Dominoes matches are two-player free-for-all only.'; end if;
  if p_preset not in ('quick','classic','marathon') then raise exception 'Choose a Dominoes rule preset.'; end if;
  v_target:=case p_preset when 'quick' then 50 when 'marathon' then 150 else 100 end;
  if p_join_mode not in ('invite','open') then raise exception 'Choose invite-only or open joining.'; end if;
  if p_join_mode='invite' and coalesce(cardinality(p_invited_user_ids),0)<>1 then raise exception 'Choose exactly one opponent for this Dominoes match.'; end if;
  if p_join_mode='open' and coalesce(cardinality(p_invited_user_ids),0)<>0 then raise exception 'Open lobbies cannot include private invitations.'; end if;
  if exists(select 1 from public.gather_multiplayer_games where created_by=auth.uid() and game_type='dominoes' and status='active') then raise exception 'You already have an active Dominoes lobby or match.'; end if;
  v_game:=public.gather_multiplayer_create(null,'dominoes',p_join_mode,coalesce(p_invited_user_ids,'{}'::uuid[]),
    jsonb_build_object('mode','free_for_all','preset',p_preset,'target_score',v_target,'max_players',2,'starting_hand',7,'turn_timer',null,'tile_theme','cyan','pip_style','classic','border_style','glow'),
    jsonb_build_object('version',1,'started',false,'phase','lobby','mode','free_for_all','message','Waiting for both players.'),'#22D3EE');
  update public.gather_multiplayer_players set ready=false where game_id=v_game.id and user_id=auth.uid();
  if p_join_mode='invite' then
    foreach v_invite in array coalesce(p_invited_user_ids,'{}'::uuid[]) loop
      insert into public.notifications(recipient_id,actor_id,kind,title,body)
      values(v_invite,auth.uid(),'dominoes_invite','Dominoes invitation',v_game.id::text);
    end loop;
  end if;
  return v_game;
end; $$;
