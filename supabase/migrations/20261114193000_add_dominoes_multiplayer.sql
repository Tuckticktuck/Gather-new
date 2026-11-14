-- Gather Dominoes: Draw Dominoes server-side game engine and privacy controls.
-- This migration records the schema and function changes already applied to the Gather Supabase project.

create table if not exists public.gather_dominoes_hands (
  game_id uuid not null references public.gather_multiplayer_games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tiles jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (game_id,user_id),
  constraint gather_dominoes_hands_tiles_array check (jsonb_typeof(tiles)='array' and octet_length(tiles::text)<=12000)
);
create table if not exists public.gather_dominoes_boneyard (
  game_id uuid primary key references public.gather_multiplayer_games(id) on delete cascade,
  tiles jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint gather_dominoes_boneyard_tiles_array check (jsonb_typeof(tiles)='array' and octet_length(tiles::text)<=12000)
);
create table if not exists public.gather_dominoes_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  matches_played integer not null default 0 check (matches_played>=0),
  wins integer not null default 0 check (wins>=0),
  losses integer not null default 0 check (losses>=0),
  points_earned integer not null default 0 check (points_earned>=0),
  team_wins integer not null default 0 check (team_wins>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.gather_dominoes_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null check (achievement_key in ('first_match','first_win','ten_matches','ten_wins','century_points','team_victory')),
  unlocked_at timestamptz not null default now(),
  primary key (user_id,achievement_key)
);

alter table public.gather_dominoes_hands enable row level security;
alter table public.gather_dominoes_boneyard enable row level security;
alter table public.gather_dominoes_stats enable row level security;
alter table public.gather_dominoes_achievements enable row level security;

drop policy if exists "Dominoes stats are visible to signed-in players" on public.gather_dominoes_stats;
create policy "Dominoes stats are visible to signed-in players"
  on public.gather_dominoes_stats for select to authenticated using (true);
drop policy if exists "Players can view their own Dominoes achievements" on public.gather_dominoes_achievements;
create policy "Players can view their own Dominoes achievements"
  on public.gather_dominoes_achievements for select to authenticated using (auth.uid()=user_id);

revoke all on public.gather_dominoes_hands,public.gather_dominoes_boneyard from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.gather_dominoes_stats from public,anon,authenticated;
grant select on public.gather_dominoes_stats to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.gather_dominoes_achievements from public,anon,authenticated;
grant select on public.gather_dominoes_achievements to authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind=any(array[
    'message','friend_request','chat_request','feedback_reply','report','announcement',
    'uno_invite','uno_rematch','uno_rematch_result','dominoes_invite','dominoes_spectate'
  ]::text[])
);

CREATE OR REPLACE FUNCTION private.dominoes_finish_round(p_game_id uuid, p_winner_id uuid, p_blocked boolean DEFAULT false)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_state jsonb;
  v_order jsonb;
  v_teams jsonb;
  v_scores jsonb;
  v_mode text;
  v_winner uuid := p_winner_id;
  v_winner_team text;
  v_score_key text;
  v_points integer := 0;
  v_target integer;
  v_score integer;
  v_total integer;
  v_round integer;
  v_pips integer;
  v_low integer;
  v_tied boolean;
  v_user uuid;
  v_round_record jsonb;
  v_history jsonb;
  v_match_finished boolean := false;
begin
  select * into v_game from public.gather_multiplayer_games
  where id=p_game_id and game_type='dominoes' for update;
  if v_game.id is null then raise exception 'This Dominoes match could not be found.'; end if;
  v_state := coalesce(v_game.state,'{}'::jsonb);
  if v_state->>'phase' <> 'playing' then raise exception 'This Dominoes round is not active.'; end if;
  v_mode := coalesce(v_state->>'mode','free_for_all');
  v_order := coalesce(v_state->'turn_order','[]'::jsonb);
  v_teams := coalesce(v_state->'teams','{}'::jsonb);
  v_scores := coalesce(v_state->'scores','{}'::jsonb);
  v_round := coalesce((v_state->>'round')::integer,1);
  v_target := coalesce((v_state->>'target_score')::integer,100);

  if p_blocked and v_winner is null then
    if v_mode='teams' then
      select coalesce(sum((tile.value->>'a')::integer+(tile.value->>'b')::integer),0)
        into v_low
      from public.gather_dominoes_hands h
      join public.gather_multiplayer_players p on p.game_id=h.game_id and p.user_id=h.user_id and p.status='joined'
      cross join lateral jsonb_array_elements(h.tiles) tile(value)
      where h.game_id=p_game_id and v_teams->>h.user_id::text='team_a';
      select coalesce(sum((tile.value->>'a')::integer+(tile.value->>'b')::integer),0)
        into v_total
      from public.gather_dominoes_hands h
      join public.gather_multiplayer_players p on p.game_id=h.game_id and p.user_id=h.user_id and p.status='joined'
      cross join lateral jsonb_array_elements(h.tiles) tile(value)
      where h.game_id=p_game_id and v_teams->>h.user_id::text='team_b';
      if v_low<v_total then
        select x.value::uuid into v_winner
        from jsonb_array_elements_text(v_order) x(value)
        where v_teams->>x.value='team_a' limit 1;
        v_winner_team:='team_a'; v_points:=v_total;
      elsif v_total<v_low then
        select x.value::uuid into v_winner
        from jsonb_array_elements_text(v_order) x(value)
        where v_teams->>x.value='team_b' limit 1;
        v_winner_team:='team_b'; v_points:=v_low;
      else
        v_winner:=null; v_points:=0;
      end if;
    else
      v_low:=null; v_tied:=false;
      for v_user in select x.value::uuid from jsonb_array_elements_text(v_order) x(value) loop
        select coalesce(sum((tile.value->>'a')::integer+(tile.value->>'b')::integer),0)
          into v_pips from public.gather_dominoes_hands h
          cross join lateral jsonb_array_elements(h.tiles) tile(value)
          where h.game_id=p_game_id and h.user_id=v_user;
        if v_low is null or v_pips<v_low then v_low:=v_pips; v_winner:=v_user; v_tied:=false;
        elsif v_pips=v_low then v_tied:=true; end if;
      end loop;
      if v_tied then v_winner:=null; v_points:=0;
      else
        select coalesce(sum((tile.value->>'a')::integer+(tile.value->>'b')::integer),0)
          into v_total from public.gather_dominoes_hands h
          cross join lateral jsonb_array_elements(h.tiles) tile(value)
          where h.game_id=p_game_id and h.user_id<>v_winner;
        v_points:=greatest(0,v_total);
      end if;
    end if;
  elsif v_mode='teams' and v_winner is not null then
    v_winner_team:=v_teams->>v_winner::text;
    select coalesce(sum((tile.value->>'a')::integer+(tile.value->>'b')::integer),0)
      into v_points from public.gather_dominoes_hands h
      join public.gather_multiplayer_players p on p.game_id=h.game_id and p.user_id=h.user_id and p.status='joined'
      cross join lateral jsonb_array_elements(h.tiles) tile(value)
      where h.game_id=p_game_id and v_teams->>h.user_id::text<>v_winner_team;
  elsif v_winner is not null then
    select coalesce(sum((tile.value->>'a')::integer+(tile.value->>'b')::integer),0)
      into v_points from public.gather_dominoes_hands h
      cross join lateral jsonb_array_elements(h.tiles) tile(value)
      where h.game_id=p_game_id and h.user_id<>v_winner;
  end if;

  if v_winner is not null then
    v_score_key:=case when v_mode='teams' then v_winner_team else v_winner::text end;
    v_score:=coalesce((v_scores->>v_score_key)::integer,0)+v_points;
    v_scores:=jsonb_set(v_scores,array[v_score_key],to_jsonb(v_score),true);
    v_match_finished:=v_score>=v_target;
  end if;

  v_round_record:=jsonb_build_object('round',v_round,'winner_id',v_winner,'winner_team',v_winner_team,
    'points',v_points,'scores',v_scores,'blocked',p_blocked,'finished_at',now());
  v_history:=coalesce(v_state->'round_history','[]'::jsonb)||jsonb_build_array(v_round_record);
  v_state:=jsonb_set(v_state,'{phase}',to_jsonb(case when v_match_finished then 'finished' else 'recap' end),true);
  v_state:=jsonb_set(v_state,'{scores}',v_scores,true);
  v_state:=jsonb_set(v_state,'{round_history}',v_history,true);
  v_state:=jsonb_set(v_state,'{last_round}',v_round_record,true);
  v_state:=jsonb_set(v_state,'{winner_id}',coalesce(to_jsonb(v_winner::text),'null'::jsonb),true);
  v_state:=jsonb_set(v_state,'{winner_team}',coalesce(to_jsonb(v_winner_team),'null'::jsonb),true);
  v_state:=jsonb_set(v_state,'{message}',to_jsonb(
    case when v_winner is null then 'The round was blocked and tied. No points were awarded.'
    else (case when v_mode='teams' then initcap(v_winner_team) else 'A player' end)||' won round '||v_round::text||' and earned '||v_points::text||' points.' end),true);

  if v_match_finished and not coalesce((v_game.state->>'stats_recorded')::boolean,false) then
    for v_user in select x.value::uuid from jsonb_array_elements_text(v_order) x(value) loop
      v_score_key:=case when v_mode='teams' then v_teams->>v_user::text else v_user::text end;
      v_score:=coalesce((v_scores->>v_score_key)::integer,0);
      insert into public.gather_dominoes_stats(user_id,matches_played,wins,losses,points_earned,team_wins,updated_at)
      values(v_user,1,
        case when (v_mode='teams' and v_winner_team is not null and v_teams->>v_user::text=v_winner_team)
               or (v_mode='free_for_all' and v_user=v_winner) then 1 else 0 end,
        case when v_winner is null then 0
             when (v_mode='teams' and v_winner_team is not null and v_teams->>v_user::text<>v_winner_team)
               or (v_mode='free_for_all' and v_user<>v_winner) then 1 else 0 end,
        v_score,
        case when v_mode='teams' and v_winner_team is not null and v_teams->>v_user::text=v_winner_team then 1 else 0 end,now())
      on conflict(user_id) do update set
        matches_played=public.gather_dominoes_stats.matches_played+1,
        wins=public.gather_dominoes_stats.wins+excluded.wins,
        losses=public.gather_dominoes_stats.losses+excluded.losses,
        points_earned=public.gather_dominoes_stats.points_earned+excluded.points_earned,
        team_wins=public.gather_dominoes_stats.team_wins+excluded.team_wins,
        updated_at=now();

      insert into public.gather_dominoes_achievements(user_id,achievement_key)
      select v_user,unlocked.achievement_key
      from (
        select 'first_match'::text achievement_key where (select matches_played from public.gather_dominoes_stats where user_id=v_user)>=1
        union all select 'first_win' where (select wins from public.gather_dominoes_stats where user_id=v_user)>=1
        union all select 'ten_matches' where (select matches_played from public.gather_dominoes_stats where user_id=v_user)>=10
        union all select 'ten_wins' where (select wins from public.gather_dominoes_stats where user_id=v_user)>=10
        union all select 'century_points' where (select points_earned from public.gather_dominoes_stats where user_id=v_user)>=100
        union all select 'team_victory' where (select team_wins from public.gather_dominoes_stats where user_id=v_user)>=1
      ) unlocked on conflict(user_id,achievement_key) do nothing;
    end loop;
    v_state:=jsonb_set(v_state,'{stats_recorded}','true'::jsonb,true);
  end if;

  update public.gather_multiplayer_games set state=v_state,status=case when v_match_finished then 'completed' else 'active' end,
    revision=revision+1,updated_at=now() where id=p_game_id returning * into v_game;
  return v_game;
end;
$function$;

CREATE OR REPLACE FUNCTION private.dominoes_start_round(p_game_id uuid, p_preferred_starter uuid DEFAULT NULL::uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_old jsonb;
  v_order uuid[];
  v_deck jsonb;
  v_hand jsonb;
  v_boneyard jsonb;
  v_user uuid;
  v_starter uuid;
  v_turn_order jsonb;
  v_tile_counts jsonb := '{}'::jsonb;
  v_teams jsonb := '{}'::jsonb;
  v_scores jsonb;
  v_mode text;
  v_count integer;
  v_round integer;
  v_index integer := 0;
begin
  select * into v_game
  from public.gather_multiplayer_games
  where id = p_game_id and game_type = 'dominoes'
  for update;
  if v_game.id is null or v_game.status <> 'active' then
    raise exception 'This Dominoes lobby is no longer active.';
  end if;
  v_old := coalesce(v_game.state, '{}'::jsonb);
  v_mode := coalesce(v_game.settings->>'mode', 'free_for_all');

  select array_agg(p.user_id order by
           case when p.user_id = p_preferred_starter then 0 else 1 end,
           p.joined_at nulls last, p.user_id)
    into v_order
  from public.gather_multiplayer_players p
  where p.game_id = p_game_id and p.status = 'joined';

  v_count := coalesce(cardinality(v_order), 0);
  if v_count < 2 or v_count > 4 then raise exception 'Dominoes needs 2 to 4 joined players.'; end if;
  if v_mode = 'teams' and v_count <> 4 then raise exception 'Team mode needs exactly four players seated opposite their partners.'; end if;

  select jsonb_agg(jsonb_build_object('id', a::text || '-' || b::text, 'a', a, 'b', b) order by random())
    into v_deck
  from generate_series(0, 6) as a
  cross join lateral generate_series(a, 6) as b;

  delete from public.gather_dominoes_hands where game_id = p_game_id;
  for v_index in 1..v_count loop
    v_user := v_order[v_index];
    select coalesce(jsonb_agg(d.value order by d.ordinality), '[]'::jsonb)
      into v_hand
    from jsonb_array_elements(v_deck) with ordinality as d(value, ordinality)
    where d.ordinality > (v_index - 1) * 7 and d.ordinality <= v_index * 7;

    insert into public.gather_dominoes_hands(game_id, user_id, tiles)
    values (p_game_id, v_user, v_hand);

    v_tile_counts := jsonb_set(v_tile_counts, array[v_user::text], to_jsonb(jsonb_array_length(v_hand)), true);
    if v_mode = 'teams' then
      v_teams := jsonb_set(v_teams, array[v_user::text],
        to_jsonb(case when mod(v_index - 1, 2) = 0 then 'team_a' else 'team_b' end), true);
    end if;
  end loop;

  select coalesce(jsonb_agg(d.value order by d.ordinality), '[]'::jsonb)
    into v_boneyard
  from jsonb_array_elements(v_deck) with ordinality as d(value, ordinality)
  where d.ordinality > v_count * 7;

  insert into public.gather_dominoes_boneyard(game_id, tiles)
  values (p_game_id, v_boneyard)
  on conflict (game_id) do update set tiles = excluded.tiles, updated_at = now();

  if p_preferred_starter = any(v_order) then
    v_starter := p_preferred_starter;
  else
    select h.user_id
      into v_starter
    from public.gather_dominoes_hands h
    cross join lateral jsonb_array_elements(h.tiles) as tile(value)
    where h.game_id = p_game_id
      and (tile.value->>'a')::integer = (tile.value->>'b')::integer
    order by (tile.value->>'a')::integer desc, h.user_id
    limit 1;
  end if;
  v_starter := coalesce(v_starter, v_order[1]);

  select coalesce(jsonb_agg(to_jsonb(u.user_id::text) order by
           case when u.user_id = v_starter then 0 else 1 end, u.ordinality), '[]'::jsonb)
    into v_turn_order
  from unnest(v_order) with ordinality as u(user_id, ordinality);

  v_scores := coalesce(v_old->'scores', '{}'::jsonb);
  if v_scores = '{}'::jsonb then
    if v_mode = 'teams' then
      v_scores := jsonb_build_object('team_a', 0, 'team_b', 0);
    else
      for v_index in 1..v_count loop
        v_scores := jsonb_set(v_scores, array[v_order[v_index]::text], to_jsonb(0), true);
      end loop;
    end if;
  end if;

  v_round := coalesce((v_old->>'round')::integer, 0) + 1;

  update public.gather_multiplayer_games
     set state = jsonb_build_object(
       'version', 1,
       'started', true,
       'phase', 'playing',
       'mode', v_mode,
       'round', v_round,
       'target_score', coalesce((v_game.settings->>'target_score')::integer, 100),
       'seat_order', to_jsonb(v_order),
       'turn_order', v_turn_order,
       'turn_index', 0,
       'turn_user_id', v_starter::text,
       'chain', '[]'::jsonb,
       'left_end', null,
       'right_end', null,
       'scores', v_scores,
       'teams', v_teams,
       'tile_counts', v_tile_counts,
       'boneyard_count', jsonb_array_length(v_boneyard),
       'passed_users', '[]'::jsonb,
       'round_history', coalesce(v_old->'round_history', '[]'::jsonb),
       'move_history', coalesce(v_old->'move_history', '[]'::jsonb),
       'last_round', null,
       'winner_id', null,
       'winner_team', null,
       'message', 'Dominoes is ready. ' || case when v_mode = 'teams' then 'Partners sit opposite each other.' else 'Highest double begins.' end
     ),
     revision = revision + 1,
     updated_at = now()
   where id = p_game_id
   returning * into v_game;

  return v_game;
end;
$function$;

CREATE OR REPLACE FUNCTION private.gather_game_chat_list(p_game_type text, p_game_id uuid)
 RETURNS TABLE(id uuid, game_type text, game_id uuid, sender_id uuid, body text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_member boolean:=false;
begin
  if v_uid is null then raise exception 'Sign in to view game chat.'; end if;
  if p_game_type='tag' then
    select exists(select 1 from public.gather_tag_players p where p.lobby_id=p_game_id and p.user_id=v_uid and p.status in ('joined','eliminated')) into v_member;
  elsif p_game_type in ('uno','ludo','snake_arena','dominoes') then
    select exists(select 1 from public.gather_multiplayer_players p join public.gather_multiplayer_games g on g.id=p.game_id
      where p.game_id=p_game_id and p.user_id=v_uid and p.status in ('joined','spectating') and g.game_type=p_game_type and g.status='active') into v_member;
  end if;
  if not v_member then raise exception 'Join or spectate this game to view its temporary chat.'; end if;
  return query
    select recent.id,recent.game_type,recent.game_id,recent.sender_id,recent.body,recent.created_at
    from (
      select m.id,m.game_type,m.game_id,m.sender_id,m.body,m.created_at
      from public.gather_game_chat_messages m
      where m.game_type=p_game_type and m.game_id=p_game_id
      order by m.created_at desc limit 150
    ) recent
    order by recent.created_at asc;
end
$function$;

CREATE OR REPLACE FUNCTION private.gather_game_chat_send(p_game_type text, p_game_id uuid, p_body text)
 RETURNS gather_game_chat_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_member boolean:=false; v_row public.gather_game_chat_messages;
begin
  if v_uid is null then raise exception 'Sign in to send a game message.'; end if;
  if p_game_type not in ('tag','uno','ludo','snake_arena','dominoes') then raise exception 'This game chat is unavailable.'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 1 and 1200 then raise exception 'Messages must be between 1 and 1200 characters.'; end if;
  if p_game_type='tag' then
    select exists(select 1 from public.gather_tag_players p join public.gather_tag_lobbies l on l.id=p.lobby_id
      where p.lobby_id=p_game_id and p.user_id=v_uid and p.status in ('joined','eliminated') and l.status in ('lobby','active')) into v_member;
  else
    select exists(select 1 from public.gather_multiplayer_players p join public.gather_multiplayer_games g on g.id=p.game_id
      where p.game_id=p_game_id and p.user_id=v_uid and p.status in ('joined','spectating') and g.game_type=p_game_type and g.status='active') into v_member;
  end if;
  if not v_member then raise exception 'You must be a player or spectator in an active game to send messages.'; end if;
  insert into public.gather_game_chat_messages(game_type,game_id,sender_id,body)
  values(p_game_type,p_game_id,v_uid,btrim(p_body)) returning * into v_row;
  return v_row;
end
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_action(p_game_id uuid, p_action text, p_tile_id text DEFAULT NULL::text, p_end text DEFAULT NULL::text)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_game public.gather_multiplayer_games;
  v_state jsonb;
  v_hand jsonb;
  v_deck jsonb;
  v_tile jsonb;
  v_remaining jsonb;
  v_chain jsonb;
  v_passes jsonb;
  v_order jsonb;
  v_index integer;
  v_next integer;
  v_a integer;
  v_b integer;
  v_left integer;
  v_right integer;
  v_new_left integer;
  v_new_right integer;
  v_count integer;
  v_pips integer;
  v_history jsonb;
  v_entry jsonb;
  v_can_play boolean := false;
begin
  if v_uid is null then raise exception 'Sign in to play Dominoes.'; end if;
  if p_action not in ('play','draw','pass') then raise exception 'That Dominoes action is not supported.'; end if;
  select * into v_game from public.gather_multiplayer_games
  where id=p_game_id and game_type='dominoes' for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Dominoes match is not active.'; end if;
  v_state := coalesce(v_game.state,'{}'::jsonb);
  if v_state->>'phase' <> 'playing' then raise exception 'This Dominoes round is not accepting moves.'; end if;
  if v_state->>'turn_user_id' <> v_uid::text then raise exception 'It is not your turn.'; end if;
  if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid and status='joined') then
    raise exception 'Only joined players can move tiles.';
  end if;

  select tiles into v_hand from public.gather_dominoes_hands where game_id=p_game_id and user_id=v_uid for update;
  v_hand := coalesce(v_hand,'[]'::jsonb);
  v_chain := coalesce(v_state->'chain','[]'::jsonb);
  v_order := coalesce(v_state->'turn_order','[]'::jsonb);
  v_index := coalesce((v_state->>'turn_index')::integer,0);

  if p_action='play' then
    if p_tile_id is null or p_tile_id !~ '^[0-6]-[0-6]$' then raise exception 'Choose a valid tile from your hand.'; end if;
    select d.value into v_tile from jsonb_array_elements(v_hand) d(value) where d.value->>'id'=p_tile_id;
    if v_tile is null then raise exception 'That tile is no longer in your hand.'; end if;
    v_a := (v_tile->>'a')::integer; v_b := (v_tile->>'b')::integer;
    if jsonb_array_length(v_chain)=0 then
      if p_end not in ('start','right','left') then raise exception 'Choose a valid placement.'; end if;
      v_new_left := v_a; v_new_right := v_b;
      v_entry := jsonb_build_object('id',p_tile_id,'left',v_new_left,'right',v_new_right,'a',v_a,'b',v_b);
      v_chain := jsonb_build_array(v_entry);
    else
      v_left := (v_state->>'left_end')::integer;
      v_right := (v_state->>'right_end')::integer;
      if p_end='left' then
        if v_a=v_left then v_new_left:=v_b; v_new_right:=v_a;
        elsif v_b=v_left then v_new_left:=v_a; v_new_right:=v_b;
        else raise exception 'That tile does not match the left end.'; end if;
        v_entry := jsonb_build_object('id',p_tile_id,'left',v_new_left,'right',v_new_right,'a',v_a,'b',v_b);
        v_chain := jsonb_build_array(v_entry) || v_chain;
      elsif p_end='right' then
        if v_a=v_right then v_new_left:=v_a; v_new_right:=v_b;
        elsif v_b=v_right then v_new_left:=v_b; v_new_right:=v_a;
        else raise exception 'That tile does not match the right end.'; end if;
        v_entry := jsonb_build_object('id',p_tile_id,'left',v_new_left,'right',v_new_right,'a',v_a,'b',v_b);
        v_chain := v_chain || jsonb_build_array(v_entry);
      else
        raise exception 'Choose the left or right board end.';
      end if;
    end if;

    select coalesce(jsonb_agg(d.value order by d.ordinality),'[]'::jsonb) into v_remaining
    from jsonb_array_elements(v_hand) with ordinality d(value,ordinality)
    where d.value->>'id'<>p_tile_id;
    update public.gather_dominoes_hands set tiles=v_remaining,updated_at=now() where game_id=p_game_id and user_id=v_uid;

    v_state := jsonb_set(v_state,'{chain}',v_chain,true);
    v_state := jsonb_set(v_state,'{left_end}',to_jsonb(v_new_left),true);
    v_state := jsonb_set(v_state,'{right_end}',to_jsonb(v_new_right),true);
    v_state := jsonb_set(v_state,array['tile_counts',v_uid::text],to_jsonb(jsonb_array_length(v_remaining)),true);
    v_history := coalesce(v_state->'move_history','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'player_id',v_uid,'action','play','tile',p_tile_id,'end',p_end,'round',coalesce((v_state->>'round')::integer,1),'at',now()
    ));
    if jsonb_array_length(v_history)>100 then
      select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) into v_history
      from jsonb_array_elements(v_history) with ordinality x(value,ordinality)
      where x.ordinality>jsonb_array_length(v_history)-100;
    end if;
    v_state := jsonb_set(v_state,'{move_history}',v_history,true);
    v_state := jsonb_set(v_state,'{passed_users}','[]'::jsonb,true);
    v_state := jsonb_set(v_state,'{message}',to_jsonb('Tile placed. '|| (case when p_end='left' then 'Left' else 'Right' end) || ' end is now highlighted.'),true);

    if jsonb_array_length(v_remaining)=0 then
      return private.dominoes_finish_round(p_game_id,v_uid,false);
    end if;
    v_next := mod(v_index+1,jsonb_array_length(v_order));
    v_state := jsonb_set(v_state,'{turn_index}',to_jsonb(v_next),true);
    v_state := jsonb_set(v_state,'{turn_user_id}',to_jsonb(v_order->>v_next),true);
    v_state := jsonb_set(v_state,'{boneyard_count}',coalesce(v_state->'boneyard_count','0'::jsonb),true);
    update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now()
    where id=p_game_id returning * into v_game;
    return v_game;
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_hand) t(value)
    where jsonb_array_length(v_chain)=0
       or (coalesce((t.value->>'a')::integer,-1) in ((v_state->>'left_end')::integer,(v_state->>'right_end')::integer)
        or coalesce((t.value->>'b')::integer,-1) in ((v_state->>'left_end')::integer,(v_state->>'right_end')::integer))
  ) into v_can_play;

  if v_can_play then raise exception 'You already have a playable tile. Place it before drawing or passing.'; end if;

  if p_action='draw' then
    select tiles into v_deck from public.gather_dominoes_boneyard where game_id=p_game_id for update;
    v_deck := coalesce(v_deck,'[]'::jsonb);
    if jsonb_array_length(v_deck)>0 then
      v_tile := v_deck->0;
      select coalesce(jsonb_agg(d.value order by d.ordinality),'[]'::jsonb) into v_remaining
      from jsonb_array_elements(v_deck) with ordinality d(value,ordinality)
      where d.ordinality>1;
      update public.gather_dominoes_boneyard set tiles=v_remaining,updated_at=now() where game_id=p_game_id;
      v_hand := v_hand || jsonb_build_array(v_tile);
      update public.gather_dominoes_hands set tiles=v_hand,updated_at=now() where game_id=p_game_id and user_id=v_uid;
      v_state := jsonb_set(v_state,array['tile_counts',v_uid::text],to_jsonb(jsonb_array_length(v_hand)),true);
      v_state := jsonb_set(v_state,'{boneyard_count}',to_jsonb(jsonb_array_length(v_remaining)),true);
      v_state := jsonb_set(v_state,'{message}',to_jsonb('You drew a tile. Keep drawing until you have a playable tile.'),true);
      update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now()
      where id=p_game_id returning * into v_game;
      return v_game;
    end if;
    -- An empty boneyard with no legal tile is an automatic pass.
  end if;

  if p_action='pass' or (p_action='draw' and coalesce((v_state->>'boneyard_count')::integer,0)=0) then
    if exists(select 1 from public.gather_dominoes_boneyard where game_id=p_game_id and jsonb_array_length(tiles)>0) then
      raise exception 'Draw until the boneyard is empty before passing.';
    end if;
    v_passes := coalesce(v_state->'passed_users','[]'::jsonb);
    if exists(select 1 from jsonb_array_elements_text(v_passes) x(value) where x.value=v_uid::text) then
      raise exception 'You have already passed this round.';
    end if;
    v_passes := v_passes || jsonb_build_array(v_uid::text);
    v_history := coalesce(v_state->'move_history','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'player_id',v_uid,'action','pass','round',coalesce((v_state->>'round')::integer,1),'at',now()
    ));
    v_state := jsonb_set(v_state,'{passed_users}',v_passes,true);
    v_state := jsonb_set(v_state,'{move_history}',v_history,true);
    if jsonb_array_length(v_passes)>=jsonb_array_length(v_order) then
      update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now() where id=p_game_id;
      return private.dominoes_finish_round(p_game_id,null,true);
    end if;
    v_next := mod(v_index+1,jsonb_array_length(v_order));
    v_state := jsonb_set(v_state,'{turn_index}',to_jsonb(v_next),true);
    v_state := jsonb_set(v_state,'{turn_user_id}',to_jsonb(v_order->>v_next),true);
    v_state := jsonb_set(v_state,'{message}',to_jsonb('No playable tile remained. Turn passed.'),true);
    update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now()
    where id=p_game_id returning * into v_game;
    return v_game;
  end if;

  raise exception 'That action cannot be completed.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_continue_round(p_game_id uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games; v_starter uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='dominoes' for update;
  if v_game.id is null or v_game.status<>'active' or v_game.state->>'phase'<>'recap' then
    raise exception 'This Dominoes round is not ready to continue.';
  end if;
  if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=auth.uid() and status='joined') then
    raise exception 'Only a player in the match can continue the next round.';
  end if;
  v_starter := nullif(v_game.state->>'winner_id','')::uuid;
  return private.dominoes_start_round(p_game_id,v_starter);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_create(p_join_mode text, p_invited_user_ids uuid[], p_mode text, p_preset text DEFAULT 'classic'::text)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_target integer;
  v_game public.gather_multiplayer_games;
  v_invite uuid;
begin
  if v_uid is null then raise exception 'Sign in to create a Dominoes lobby.'; end if;
  if p_mode not in ('free_for_all','teams') then raise exception 'Choose free-for-all or team mode.'; end if;
  if p_preset not in ('quick','classic','marathon') then raise exception 'Choose a Dominoes rule preset.'; end if;
  v_target := case p_preset when 'quick' then 50 when 'marathon' then 150 else 100 end;
  if p_join_mode not in ('invite','open') then raise exception 'Choose invite-only or open joining.'; end if;
  if p_join_mode = 'invite' and coalesce(cardinality(p_invited_user_ids),0)=0 then raise exception 'Choose at least one person to invite.'; end if;
  if coalesce(cardinality(p_invited_user_ids),0)>3 then raise exception 'Dominoes supports up to four players including the host.'; end if;
  if p_mode='teams' and (coalesce(cardinality(p_invited_user_ids),0)<>3 or p_join_mode<>'invite') then
    raise exception 'Team mode needs four players. Invite three people to fill both opposing teams.';
  end if;
  if exists(select 1 from public.gather_multiplayer_games where created_by=v_uid and game_type='dominoes' and status='active') then
    raise exception 'You already have an active Dominoes lobby or match.';
  end if;
  v_game := public.gather_multiplayer_create(
    null, 'dominoes', p_join_mode, coalesce(p_invited_user_ids,'{}'::uuid[]),
    jsonb_build_object('mode',p_mode,'preset',p_preset,'target_score',v_target,'max_players',4,'starting_hand',7,'turn_timer',null,'tile_theme','cyan','pip_style','classic','border_style','glow'),
    jsonb_build_object('version',1,'started',false,'phase','lobby','mode',p_mode,'message','Waiting for players.'),
    '#22D3EE'
  );
  update public.gather_multiplayer_players set ready=true where game_id=v_game.id and user_id=v_uid;
  if p_join_mode='invite' then
    foreach v_invite in array coalesce(p_invited_user_ids,'{}'::uuid[]) loop
      insert into public.notifications(recipient_id,actor_id,kind,title,body)
      values (v_invite,v_uid,'dominoes_invite','Dominoes invitation',v_game.id::text);
    end loop;
  end if;
  return v_game;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_end(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='dominoes' for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Dominoes lobby is not active.'; end if;
  if v_game.created_by<>auth.uid() then raise exception 'Only the host can end this Dominoes match.'; end if;
  update public.gather_multiplayer_games
     set status='completed',
         state=jsonb_set(jsonb_set(state,'{phase}',to_jsonb('finished'),true),'{message}',to_jsonb('The host ended the Dominoes match.'),true),
         revision=revision+1,updated_at=now()
   where id=p_game_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_get_state(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_game public.gather_multiplayer_games;
  v_player public.gather_multiplayer_players;
  v_hand jsonb := '[]'::jsonb;
  v_players jsonb;
begin
  if v_uid is null then raise exception 'Sign in to view Dominoes.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='dominoes';
  if v_game.id is null then raise exception 'This Dominoes game could not be found.'; end if;
  select * into v_player from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid;
  if v_player.user_id is null or v_player.status not in ('joined','invited','spectating','left') then
    raise exception 'You do not have access to this Dominoes game.';
  end if;
  if v_player.status='joined' then
    select tiles into v_hand from public.gather_dominoes_hands where game_id=p_game_id and user_id=v_uid;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.user_id,'status',p.status,'color',p.color,'ready',p.ready,'joined_at',p.joined_at,
    'tile_count',coalesce((v_game.state->'tile_counts'->>p.user_id::text)::integer,0)
  ) order by p.joined_at nulls last,p.user_id),'[]'::jsonb)
  into v_players
  from public.gather_multiplayer_players p
  where p.game_id=p_game_id and p.status in ('joined','invited','spectating','left');
  return jsonb_build_object('game',to_jsonb(v_game),'players',v_players,'your_hand',coalesce(v_hand,'[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_invite_spectators(p_game_id uuid, p_user_ids uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games; v_invitee uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='dominoes' and status='active' for update;
  if v_game.id is null or v_game.created_by<>auth.uid() then raise exception 'Only the host can invite spectators.'; end if;
  if coalesce(cardinality(p_user_ids),0)=0 or cardinality(p_user_ids)>20 then raise exception 'Choose one or more people to invite as spectators.'; end if;
  foreach v_invitee in array p_user_ids loop
    if not private.gather_can_invite_game_person(v_invitee) then raise exception 'You can only invite people from your chats or accepted friends.'; end if;
    insert into public.gather_multiplayer_players(game_id,user_id,status)
    values(p_game_id,v_invitee,'invited')
    on conflict(game_id,user_id) do update set status=case when public.gather_multiplayer_players.status='joined' then 'joined' else 'invited' end;
    insert into public.notifications(recipient_id,actor_id,kind,title,body)
    values(v_invitee,auth.uid(),'dominoes_spectate','Dominoes spectator invitation',p_game_id::text);
  end loop;
  update public.gather_multiplayer_games set revision=revision+1,updated_at=now() where id=p_game_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_join(p_game_id uuid, p_color text DEFAULT '#22D3EE'::text)
 RETURNS gather_multiplayer_players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_player public.gather_multiplayer_players;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to join Dominoes.'; end if;
  select * into v_game from public.gather_multiplayer_games
  where id=p_game_id and game_type='dominoes' for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Dominoes lobby is no longer active.'; end if;
  select * into v_player from public.gather_multiplayer_players where game_id=p_game_id and user_id=auth.uid();
  if v_player.status='joined' then return v_player; end if;
  if coalesce((v_game.state->>'started')::boolean,false) then
    if v_player.status='left' and v_game.state->>'phase'='paused' and v_game.state->>'departed_user_id'=auth.uid()::text then
      update public.gather_multiplayer_players set status='joined',ready=true,updated_at=now()
      where game_id=p_game_id and user_id=auth.uid() returning * into v_player;
      update public.gather_multiplayer_games
      set state=jsonb_set(jsonb_set(state,'{phase}',to_jsonb(coalesce(state->>'resume_phase','playing')),true),'{departed_user_id}','null'::jsonb,true),
          revision=revision+1,updated_at=now()
      where id=p_game_id;
      return v_player;
    end if;
    raise exception 'This Dominoes match has already started.';
  end if;
  select count(*) into v_count from public.gather_multiplayer_players
  where game_id=p_game_id and status='joined';
  if v_count >= coalesce((v_game.settings->>'max_players')::integer,4) then raise exception 'This Dominoes lobby is full.'; end if;
  if v_player.status not in ('invited','left') and v_game.join_mode='invite' then raise exception 'This Dominoes lobby is invite-only.'; end if;
  if exists (
    select 1 from public.gather_multiplayer_players p
    join public.user_blocks b on (b.blocker_id=auth.uid() and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=auth.uid())
    where p.game_id=p_game_id and p.status='joined' and p.user_id<>auth.uid()
  ) then raise exception 'You cannot join a Dominoes lobby with someone you have blocked or who has blocked you.'; end if;
  v_player := public.gather_multiplayer_join(p_game_id,coalesce(p_color,'#22D3EE'));
  return v_player;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_leaderboard(p_scope text DEFAULT 'global'::text)
 RETURNS TABLE(user_id uuid, username text, display_name text, matches_played integer, wins integer, losses integer, points_earned integer, team_wins integer, win_rate numeric, rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Sign in to view Dominoes leaderboards.'; end if;
  if p_scope not in ('global','friends') then raise exception 'Choose global or friends leaderboard.'; end if;
  return query
    select s.user_id,p.username,p.display_name,s.matches_played,s.wins,s.losses,s.points_earned,s.team_wins,
      case when s.matches_played=0 then 0::numeric else round((s.wins::numeric/s.matches_played::numeric)*100,1) end,
      row_number() over(order by s.wins desc,s.points_earned desc,s.matches_played desc)
    from public.gather_dominoes_stats s join public.profiles p on p.id=s.user_id
    where s.matches_played>0
      and (p_scope='global' or s.user_id=auth.uid() or exists(
        select 1 from public.friendships f
        where (f.user_id=auth.uid() and f.friend_id=s.user_id) or (f.user_id=s.user_id and f.friend_id=auth.uid())
      ))
    order by s.wins desc,s.points_earned desc,s.matches_played desc
    limit 50;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_leave(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games; v_state jsonb; v_status text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='dominoes' and status='active' for update;
  if v_game.id is null then raise exception 'This Dominoes game is no longer active.'; end if;
  select status into v_status from public.gather_multiplayer_players where game_id=p_game_id and user_id=auth.uid();
  if v_status not in ('joined','invited','spectating') then raise exception 'You are not a member of this Dominoes game.'; end if;
  update public.gather_multiplayer_players set status='left',ready=false,updated_at=now() where game_id=p_game_id and user_id=auth.uid();
  v_state := v_game.state;
  if coalesce((v_state->>'started')::boolean,false) and v_state->>'phase' in ('playing','recap') then
    v_state := jsonb_set(v_state,'{resume_phase}',to_jsonb(v_state->>'phase'),true);
    v_state := jsonb_set(v_state,'{phase}',to_jsonb('paused'),true);
    v_state := jsonb_set(v_state,'{departed_user_id}',to_jsonb(auth.uid()::text),true);
    v_state := jsonb_set(v_state,'{message}',to_jsonb('Match paused while the host decides whether to wait, end, or replace the player.'),true);
  end if;
  update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now() where id=p_game_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_ready(p_game_id uuid, p_ready boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='dominoes' for update;
  if v_game.id is null or v_game.status<>'active' or coalesce((v_game.state->>'started')::boolean,false) then
    raise exception 'This Dominoes lobby is no longer accepting ready changes.';
  end if;
  update public.gather_multiplayer_players set ready=coalesce(p_ready,false),updated_at=now()
  where game_id=p_game_id and user_id=auth.uid() and status='joined';
  if not found then raise exception 'Join this Dominoes lobby before changing your ready status.'; end if;
  update public.gather_multiplayer_games set revision=revision+1,updated_at=now() where id=p_game_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_resolve_departure(p_game_id uuid, p_action text, p_replacement_user_id uuid DEFAULT NULL::uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_state jsonb;
  v_scores jsonb;
  v_departed uuid;
  v_replacement_status text;
  v_order jsonb;
  v_teams jsonb;
  v_counts jsonb;
  v_hand jsonb;
  v_key text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='dominoes' and status='active' for update;
  if v_game.id is null or v_game.created_by<>auth.uid() then raise exception 'Only the host can decide how to handle a departed player.'; end if;
  v_state:=v_game.state;
  if v_state->>'phase'<>'paused' then raise exception 'There is no departed player to resolve.'; end if;
  v_departed:=nullif(v_state->>'departed_user_id','')::uuid;
  if p_action='wait' then
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('Waiting for the player to reconnect. The match and all hands remain preserved.'),true);
  elsif p_action='end' then
    v_state:=jsonb_set(v_state,'{phase}',to_jsonb('finished'),true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('The host ended the match after a player left.'),true);
    update public.gather_multiplayer_games set state=v_state,status='completed',revision=revision+1,updated_at=now() where id=p_game_id returning * into v_game;
    return v_game;
  elsif p_action='replace' then
    if p_replacement_user_id is null or p_replacement_user_id=v_departed then raise exception 'Choose a replacement player.'; end if;
    select status into v_replacement_status from public.gather_multiplayer_players where game_id=p_game_id and user_id=p_replacement_user_id;
    if coalesce(v_replacement_status,'') not in ('invited','left') and not private.gather_can_invite_game_person(p_replacement_user_id) then
      raise exception 'Choose someone from your chats or accepted friends.';
    end if;
    insert into public.gather_multiplayer_players(game_id,user_id,status,color,ready,joined_at,updated_at)
    values(p_game_id,p_replacement_user_id,'joined','#22D3EE',true,now(),now())
    on conflict(game_id,user_id) do update set status='joined',ready=true,joined_at=now(),updated_at=now();
    select tiles into v_hand from public.gather_dominoes_hands where game_id=p_game_id and user_id=v_departed;
    if v_hand is not null then
      insert into public.gather_dominoes_hands(game_id,user_id,tiles) values(p_game_id,p_replacement_user_id,v_hand)
      on conflict(game_id,user_id) do update set tiles=excluded.tiles,updated_at=now();
      delete from public.gather_dominoes_hands where game_id=p_game_id and user_id=v_departed;
    end if;
    v_order:=coalesce(v_state->'turn_order','[]'::jsonb);
    select coalesce(jsonb_agg(to_jsonb(case when x.value=v_departed::text then p_replacement_user_id::text else x.value end) order by x.ordinality),'[]'::jsonb)
      into v_order from jsonb_array_elements_text(v_order) with ordinality x(value,ordinality);
    v_state:=jsonb_set(v_state,'{turn_order}',v_order,true);
    if v_state->>'turn_user_id'=v_departed::text then v_state:=jsonb_set(v_state,'{turn_user_id}',to_jsonb(p_replacement_user_id::text),true); end if;
    v_scores:=coalesce(v_state->'scores','{}'::jsonb);
    if v_state->>'mode'='free_for_all' and v_scores ? v_departed::text then
      v_scores:=(v_scores-v_departed::text)||jsonb_build_object(p_replacement_user_id::text,v_scores->v_departed::text);
      v_state:=jsonb_set(v_state,'{scores}',v_scores,true);
    end if;
    v_teams:=coalesce(v_state->'teams','{}'::jsonb);
    if v_teams ? v_departed::text then
      v_key:=v_teams->>v_departed::text;
      v_teams:=(v_teams-v_departed::text)||jsonb_build_object(p_replacement_user_id::text,v_key);
      v_state:=jsonb_set(v_state,'{teams}',v_teams,true);
    end if;
    v_counts:=coalesce(v_state->'tile_counts','{}'::jsonb);
    if v_counts ? v_departed::text then
      v_counts:=(v_counts-v_departed::text)||jsonb_build_object(p_replacement_user_id::text,v_counts->v_departed::text);
      v_state:=jsonb_set(v_state,'{tile_counts}',v_counts,true);
    end if;
    v_state:=jsonb_set(v_state,'{phase}',to_jsonb(coalesce(v_state->>'resume_phase','playing')),true);
    v_state:=jsonb_set(v_state,'{departed_user_id}','null'::jsonb,true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('A replacement player joined. The match has resumed with the previous hand preserved.'),true);
  else raise exception 'Choose wait, end, or replace.';
  end if;
  update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now() where id=p_game_id returning * into v_game;
  return v_game;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_spectate(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games; v_player public.gather_multiplayer_players;
begin
  if auth.uid() is null then raise exception 'Sign in to watch Dominoes.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='dominoes' and status='active';
  if v_game.id is null then raise exception 'This Dominoes game is not available.'; end if;
  select * into v_player from public.gather_multiplayer_players where game_id=p_game_id and user_id=auth.uid();
  if v_player.user_id is null or v_player.status not in ('invited','spectating') then
    raise exception 'You need a spectator invitation to watch this game.';
  end if;
  update public.gather_multiplayer_players set status='spectating',ready=false,updated_at=now()
  where game_id=p_game_id and user_id=auth.uid();
  update public.gather_multiplayer_games set revision=revision+1,updated_at=now() where id=p_game_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_dominoes_start(p_game_id uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to start Dominoes.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='dominoes' for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Dominoes lobby is not available.'; end if;
  if v_game.created_by<>auth.uid() then raise exception 'Only the host can start Dominoes.'; end if;
  if coalesce((v_game.state->>'started')::boolean,false) then raise exception 'Dominoes has already started.'; end if;
  select count(*) into v_count from public.gather_multiplayer_players where game_id=p_game_id and status='joined';
  if v_count<2 or v_count>4 then raise exception 'At least two and no more than four players must join.'; end if;
  if coalesce(v_game.settings->>'mode','free_for_all')='teams' and v_count<>4 then
    raise exception 'Team mode needs exactly four players seated in opposing pairs.';
  end if;
  if exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and status='joined' and not ready) then
    raise exception 'Everyone must be ready before starting.';
  end if;
  return private.dominoes_start_round(p_game_id,null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gather_game_chat_list(p_game_type text, p_game_id uuid)
 RETURNS TABLE(id uuid, game_type text, game_id uuid, sender_id uuid, body text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select * from private.gather_game_chat_list($1,$2) $function$;

CREATE OR REPLACE FUNCTION public.gather_game_chat_send(p_game_type text, p_game_id uuid, p_body text)
 RETURNS gather_game_chat_messages
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.gather_game_chat_send($1,$2,$3) $function$;

revoke all on function private.dominoes_finish_round(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function private.dominoes_start_round(uuid,uuid) from public,anon,authenticated;
revoke all on function private.gather_game_chat_list(text,uuid) from public,anon,authenticated;
revoke all on function private.gather_game_chat_send(text,uuid,text) from public,anon,authenticated;
revoke all on function gather_dominoes_action(uuid,text,text,text) from public,anon;
grant execute on function gather_dominoes_action(uuid,text,text,text) to authenticated;
revoke all on function gather_dominoes_continue_round(uuid) from public,anon;
grant execute on function gather_dominoes_continue_round(uuid) to authenticated;
revoke all on function gather_dominoes_create(text,uuid[],text,text) from public,anon;
grant execute on function gather_dominoes_create(text,uuid[],text,text) to authenticated;
revoke all on function gather_dominoes_end(uuid) from public,anon;
grant execute on function gather_dominoes_end(uuid) to authenticated;
revoke all on function gather_dominoes_get_state(uuid) from public,anon;
grant execute on function gather_dominoes_get_state(uuid) to authenticated;
revoke all on function gather_dominoes_invite_spectators(uuid,uuid[]) from public,anon;
grant execute on function gather_dominoes_invite_spectators(uuid,uuid[]) to authenticated;
revoke all on function gather_dominoes_join(uuid,text) from public,anon;
grant execute on function gather_dominoes_join(uuid,text) to authenticated;
revoke all on function gather_dominoes_leaderboard(text) from public,anon;
grant execute on function gather_dominoes_leaderboard(text) to authenticated;
revoke all on function gather_dominoes_leave(uuid) from public,anon;
grant execute on function gather_dominoes_leave(uuid) to authenticated;
revoke all on function gather_dominoes_ready(uuid,boolean) from public,anon;
grant execute on function gather_dominoes_ready(uuid,boolean) to authenticated;
revoke all on function gather_dominoes_resolve_departure(uuid,text,uuid) from public,anon;
grant execute on function gather_dominoes_resolve_departure(uuid,text,uuid) to authenticated;
revoke all on function gather_dominoes_spectate(uuid) from public,anon;
grant execute on function gather_dominoes_spectate(uuid) to authenticated;
revoke all on function gather_dominoes_start(uuid) from public,anon;
grant execute on function gather_dominoes_start(uuid) to authenticated;
revoke all on function gather_game_chat_list(text,uuid) from public,anon;
grant execute on function gather_game_chat_list(text,uuid) to authenticated;
revoke all on function gather_game_chat_send(text,uuid,text) from public,anon;
grant execute on function gather_game_chat_send(text,uuid,text) to authenticated;
