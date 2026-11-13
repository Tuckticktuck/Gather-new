-- Game-only lobby access and duplicate creation safeguards.
-- Applied to the Private Chat Supabase project.

CREATE OR REPLACE FUNCTION private.gather_multiplayer_create(p_conversation_id uuid, p_game_type text, p_join_mode text, p_invited_user_ids uuid[] DEFAULT '{}'::uuid[], p_settings jsonb DEFAULT '{}'::jsonb, p_initial_state jsonb DEFAULT '{}'::jsonb, p_creator_color text DEFAULT '#38BDF8'::text)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_game public.gather_multiplayer_games;v_invitee uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||p_game_type,0));
 select * into v_game from public.gather_multiplayer_games where created_by=v_uid and game_type=p_game_type and status='active' order by created_at desc limit 1;
 if v_game.id is not null then return v_game; end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION private.gather_tag_create(p_conversation_id uuid, p_mode text, p_join_mode text, p_invited_user_ids uuid[], p_color text, p_max_players integer)
 RETURNS gather_tag_lobbies
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_lobby public.gather_tag_lobbies;v_invitee uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':tag',0));
 select * into v_lobby from public.gather_tag_lobbies where created_by=v_uid and status in ('lobby','active') order by created_at desc limit 1;
 if v_lobby.id is not null then return v_lobby; end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.gather_game_create(p_conversation_id uuid, p_game_type text, p_player_two_id uuid)
 RETURNS gather_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_games;
  v_state jsonb;
  v_board text;
  v_kind text;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Sign in to start a game.'; end if;
  if p_game_type is null or p_game_type not in ('chess','checkers','tic_tac_toe','connect_four','battleship','ludo') then
    raise exception 'That game is not available.';
  end if;
  if p_player_two_id is null or p_player_two_id = v_uid then
    raise exception 'Choose another member to play against.';
  end if;

  select c.kind into v_kind
  from public.conversations c
  where c.id = p_conversation_id
    and private.is_conversation_member(c.id)
    and private.can_send_message(c.id);

  if v_kind is null then
    raise exception 'This conversation is not available for games. Check its membership and messaging permissions.';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = p_player_two_id
  ) then
    raise exception 'The invited player must belong to this conversation.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||p_conversation_id::text||':'||p_game_type||':'||least(v_uid::text,p_player_two_id::text)||':'||greatest(v_uid::text,p_player_two_id::text),0));
  select * into v_game from public.gather_games
    where conversation_id=p_conversation_id and game_type=p_game_type
      and status in ('pending','active')
      and player_one_id=v_uid and player_two_id=p_player_two_id
    order by created_at desc limit 1;
  if v_game.id is not null then return v_game; end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = p_player_two_id)
       or (b.blocker_id = p_player_two_id and b.blocked_id = v_uid)
  ) then
    raise exception 'Games are unavailable between blocked members.';
  end if;

  if p_game_type = 'chess' then
    v_state := jsonb_build_object('fen','rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','moves',jsonb_build_array());
  elsif p_game_type = 'checkers' then
    select string_agg(
      case
        when (floor(i/8)::int + mod(i,8)) % 2 = 1 and floor(i/8)::int between 0 and 2 then 'b'
        when (floor(i/8)::int + mod(i,8)) % 2 = 1 and floor(i/8)::int between 5 and 7 then 'w'
        else '.'
      end, '' order by i
    ) into v_board from generate_series(0,63) as g(i);
    v_state := jsonb_build_object('board',v_board,'turn','white','forcedIndex',null,'moves',0);
  elsif p_game_type = 'tic_tac_toe' then
    v_state := jsonb_build_object('board',jsonb_build_array('','','','','','','','',''),'turn','x','moves',0);
  elsif p_game_type = 'battleship' then
    v_state := jsonb_build_object(
      'phase','placement',
      'placed',jsonb_build_object('p1',false,'p2',false),
      'shots',jsonb_build_object('p1','[]'::jsonb,'p2','[]'::jsonb)
    );
  elsif p_game_type = 'ludo' then
    v_state := jsonb_build_object(
      'turn','red',
      'dice',null,
      'last_roll',null,
      'message','Roll a six to bring a token onto the board.',
      'pieces',jsonb_build_object(
        'red',jsonb_build_array(-1,-1,-1,-1),
        'yellow',jsonb_build_array(-1,-1,-1,-1)
      )
    );
  else
    select jsonb_agg(''::text order by i) into v_state from generate_series(0,41) as g(i);
    v_state := jsonb_build_object('board',v_state,'turn','red','moves',0);
  end if;

  insert into public.gather_games (
    conversation_id, game_type, status, created_by, player_one_id, player_two_id, state
  ) values (
    p_conversation_id, p_game_type, 'pending', v_uid, v_uid, p_player_two_id, v_state
  ) returning * into v_game;
  return v_game;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_ludo_join(p_game_id uuid, p_color text)
 RETURNS gather_multiplayer_players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_game public.gather_multiplayer_games; v_player public.gather_multiplayer_players; v_count integer; v_max integer;
begin
  if v_uid is null then raise exception 'Sign in to join Ludo.'; end if;
  if lower(coalesce(p_color,'')) not in ('#d85a60','#39a96b','#d9ad45','#4f83d1') then raise exception 'Choose a valid Ludo color.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='ludo' for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Ludo lobby is no longer available.'; end if;
  select * into v_player from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid;
  if v_game.conversation_id is not null then
    if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception 'You cannot join this conversation game.'; end if;
  elsif v_player.status not in ('invited','joined','left') then
    raise exception 'You must have a game invitation to join this lobby.';
  end if;
  if v_player.status='joined' then return v_player; end if;
  if coalesce((v_game.state->>'started')::boolean,false) then raise exception 'This Ludo match has already started.'; end if;
  if v_game.join_mode='invite' and coalesce(v_player.status,'') not in ('invited','left') then raise exception 'This Ludo lobby is invite-only.'; end if;
  select count(*) into v_count from public.gather_multiplayer_players where game_id=p_game_id and status='joined';
  v_max:=coalesce((v_game.settings->>'max_players')::integer,4);
  if v_count>=v_max then raise exception 'This Ludo lobby is full.'; end if;
  if exists(
    select 1 from public.gather_multiplayer_players p
    join public.user_blocks b on (b.blocker_id=v_uid and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=v_uid)
    where p.game_id=p_game_id and p.status='joined' and p.user_id<>v_uid
  ) then raise exception 'You cannot join a Ludo lobby with a member you have blocked or who has blocked you.'; end if;
  if exists(select 1 from public.gather_multiplayer_players p where p.game_id=p_game_id and p.status='joined' and p.user_id<>v_uid and lower(p.color)=lower(p_color)) then
    raise exception 'That color is already taken. Choose another.';
  end if;
  insert into public.gather_multiplayer_players(game_id,user_id,status,color,ready,joined_at,updated_at)
  values(p_game_id,v_uid,'joined',upper(p_color),false,now(),now())
  on conflict(game_id,user_id) do update set status='joined',color=upper(excluded.color),ready=false,joined_at=now(),updated_at=now()
  returning * into v_player;
  update public.gather_multiplayer_games set updated_at=now(),revision=revision+1 where id=p_game_id;
  return v_player;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_tag_return_lobby(p_lobby_id uuid)
 RETURNS gather_tag_lobbies
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_lobby public.gather_tag_lobbies;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null then raise exception 'Tag lobby not found.'; end if;
  if v_lobby.created_by<>auth.uid() then raise exception 'Only the host can return everyone to the lobby.'; end if;
  if v_lobby.status not in ('active','completed') then raise exception 'This round cannot be returned to the lobby.'; end if;
  if not exists(select 1 from public.gather_tag_players p where p.lobby_id=p_lobby_id and p.user_id=auth.uid() and p.status in ('joined','eliminated')) then raise exception 'Lobby access is unavailable.'; end if;
  update public.gather_tag_players set
    status=case when status='eliminated' then 'joined' else status end,
    ready=false,is_it=false,team=null,tags_received=0,updated_at=now()
    where lobby_id=p_lobby_id and status in ('joined','eliminated');
  update public.gather_tag_lobbies set
    status='lobby',started_at=null,ends_at=null,winner_user_id=null,winning_team=null,updated_at=now()
    where id=p_lobby_id returning * into v_lobby;
  return v_lobby;
end
$function$
;

CREATE OR REPLACE FUNCTION public.gather_tag_start_round(p_lobby_id uuid, p_duration_seconds integer)
 RETURNS gather_tag_lobbies
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_lobby public.gather_tag_lobbies;
  v_count integer;
  v_not_ready integer;
  v_it uuid;
  v_idx integer:=0;
  v_player record;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p_duration_seconds is null or p_duration_seconds<60 or p_duration_seconds>7200 then
    raise exception 'Choose a round length between 1 and 120 minutes.';
  end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null or v_lobby.status<>'lobby' then raise exception 'This Tag lobby is not waiting for a round.'; end if;
  if v_lobby.created_by<>v_uid then raise exception 'Only the lobby host can start the round.'; end if;
  if not exists(select 1 from public.gather_tag_players p where p.lobby_id=p_lobby_id and p.user_id=v_uid and p.status='joined') then
    raise exception 'The host is no longer in this lobby.';
  end if;
  select count(*),count(*) filter(where not ready)
    into v_count,v_not_ready
    from public.gather_tag_players where lobby_id=p_lobby_id and status='joined';
  if v_count<2 then raise exception 'At least two players are required.'; end if;
  if v_not_ready>0 then raise exception 'Everyone must be ready before the round starts.'; end if;

  select user_id into v_it
    from public.gather_tag_players
    where lobby_id=p_lobby_id and status='joined'
    order by random() limit 1;

  for v_player in
    select user_id from public.gather_tag_players
    where lobby_id=p_lobby_id and status='joined'
    order by joined_at,user_id
  loop
    update public.gather_tag_players set
      x=12+mod(v_idx*19,76),
      y=15+mod(v_idx*31,70),
      is_it=case when v_lobby.mode='team_tag' then (v_idx%2=0) else user_id=v_it end,
      team=case when v_lobby.mode='team_tag' then case when v_idx%2=0 then 'taggers' else 'runners' end else null end,
      tags_received=0,
      ready=false,
      updated_at=now()
    where lobby_id=p_lobby_id and user_id=v_player.user_id;
    v_idx:=v_idx+1;
  end loop;

  update public.gather_tag_lobbies set
    status='active',
    round_seconds=p_duration_seconds,
    started_at=now(),
    ends_at=now()+make_interval(secs=>p_duration_seconds),
    winner_user_id=null,
    winning_team=null,
    updated_at=now()
  where id=p_lobby_id returning * into v_lobby;
  return v_lobby;
end
$function$
;

CREATE OR REPLACE FUNCTION public.gather_uno_get_state(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.gather_multiplayer_games; s jsonb; me uuid:=auth.uid(); result jsonb; pending boolean;
begin
 select * into g from public.gather_multiplayer_games where id=p_game_id;
 if g.id is null or g.game_type<>'uno' or (not exists(select 1 from public.gather_multiplayer_players p where p.game_id=p_game_id and p.user_id=me and p.status in ('invited','joined','left','declined')) and (g.conversation_id is null or not private.is_conversation_member(g.conversation_id))) then raise exception 'UNO game not found.'; end if;
 select exists(select 1 from private.gather_uno_rematch_offers where game_id=p_game_id and status='pending') into pending;
 select payload into s from private.gather_uno_private_states where game_id=p_game_id;
 if s is null then
  return jsonb_build_object('game',to_jsonb(g),'players',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.gather_multiplayer_players p where p.game_id=p_game_id),'hand','[]'::jsonb,'started',false,'rematch_pending',pending);
 end if;
 if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=me and status='joined') then raise exception 'Join this UNO game to view your cards.'; end if;
 result:=jsonb_build_object(
   'game',to_jsonb(g),'public_state',g.state,
   'hand',coalesce(s->'hands'->me::text,'[]'::jsonb),
   'drawn_card_id',case when s->>'turn_user_id'=me::text then s->>'drawn_card_id' else null end,
   'started',true,'rematch_pending',pending,
   'players',(select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'status',p.status,'ready',p.ready,'card_count',jsonb_array_length(coalesce(s->'hands'->p.user_id::text,'[]'::jsonb))) order by p.joined_at),'[]'::jsonb) from public.gather_multiplayer_players p where p.game_id=p_game_id and p.status in ('joined','invited'))
 );
 return result;
end
$function$
;

CREATE OR REPLACE FUNCTION public.gather_uno_join(p_game_id uuid, p_color text DEFAULT '#40826D'::text)
 RETURNS gather_multiplayer_players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 g public.gather_multiplayer_games;
 p public.gather_multiplayer_players;
 n integer;
 s jsonb;
 hands jsonb;
 hand jsonb:='[]'::jsonb;
 deck jsonb;
 disc jsonb;
 topcard jsonb;
 i integer;
 players_state jsonb;
 already_in_order boolean:=false;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select * into g from public.gather_multiplayer_games where id=p_game_id for update;
 if g.id is null or g.game_type<>'uno' or g.status<>'active' then raise exception 'This UNO lobby is no longer open.'; end if;
 if coalesce((g.settings->>'max_players')::int,10)<2 then raise exception 'This lobby has invalid settings.'; end if;
 if g.join_mode='invite' and not exists(
   select 1 from public.gather_multiplayer_players
   where game_id=p_game_id and user_id=auth.uid() and status in ('invited','joined','left')
 ) then raise exception 'This UNO lobby is invite-only.'; end if;
 select * into p from public.gather_multiplayer_players where game_id=p_game_id and user_id=auth.uid();
 if g.conversation_id is not null then
   if not private.is_conversation_member(g.conversation_id) or not private.can_send_message(g.conversation_id) then raise exception 'You cannot join this conversation game.'; end if;
 elsif p.status not in ('invited','joined','left','declined') then
   raise exception 'You must have a game invitation to join this lobby.';
 end if;
 if exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=auth.uid() and status='joined') then
   select * into p from public.gather_multiplayer_players where game_id=p_game_id and user_id=auth.uid();
   return p;
 end if;
 select count(*) into n from public.gather_multiplayer_players where game_id=p_game_id and status='joined';
 if n>=coalesce((g.settings->>'max_players')::int,10) then raise exception 'This UNO lobby is full.'; end if;
 select payload into s from private.gather_uno_private_states where game_id=p_game_id for update;
 if coalesce((s->>'finished')::boolean,false) or s->>'winner_id' is not null then
   raise exception 'This UNO match has finished and is no longer accepting players.';
 end if;
 update public.gather_multiplayer_players
   set status='joined',ready=true,joined_at=now(),color=upper(coalesce(p_color,'#40826D'))
   where game_id=p_game_id and user_id=auth.uid() and status in ('invited','left','declined')
   returning * into p;
 if not found then
   insert into public.gather_multiplayer_players(game_id,user_id,status,color,ready,joined_at)
     values(p_game_id,auth.uid(),'joined',upper(coalesce(p_color,'#40826D')),true,now()) returning * into p;
 end if;
 if coalesce((s->>'started')::boolean,false) then
   hands:=coalesce(s->'hands','{}'::jsonb);
   already_in_order:=exists(select 1 from jsonb_array_elements_text(coalesce(s->'order','[]'::jsonb)) x where x=auth.uid()::text);
   if not already_in_order then
     deck:=coalesce(s->'deck','[]'::jsonb);
     disc:=coalesce(s->'discard','[]'::jsonb);
     for i in 1..7 loop
       if jsonb_array_length(deck)=0 then
         if jsonb_array_length(disc)>1 then
           topcard:=disc->(jsonb_array_length(disc)-1);
           select coalesce(jsonb_agg(x order by random()),'[]'::jsonb) into deck
             from jsonb_array_elements(disc) x where x->>'id'<>topcard->>'id';
           disc:=jsonb_build_array(topcard);
         else
           raise exception 'There are not enough cards left to deal a new player.';
         end if;
       end if;
       hand:=hand||jsonb_build_array(deck->0);
       deck:=deck-0;
     end loop;
     hands:=hands||jsonb_build_object(auth.uid()::text,hand);
     s:=jsonb_set(s,'{order}',coalesce(s->'order','[]'::jsonb)||jsonb_build_array(auth.uid()::text),true);
     s:=jsonb_set(s,'{deck}',deck,true);
     s:=jsonb_set(s,'{discard}',disc,true);
   end if;
   s:=jsonb_set(s,'{hands}',hands,true);
   s:=jsonb_set(s,array['done',auth.uid()::text],'false'::jsonb,true);
   s:=jsonb_set(s,array['uno_called',auth.uid()::text],'false'::jsonb,true);
   update private.gather_uno_private_states set payload=s,updated_at=now() where game_id=p_game_id;
   select coalesce(jsonb_agg(jsonb_build_object(
     'user_id',pl.user_id,
     'card_count',jsonb_array_length(coalesce(s->'hands'->pl.user_id::text,'[]'::jsonb)),
     'ready',pl.ready,'status',pl.status
   ) order by pl.joined_at),'[]'::jsonb)
   into players_state
   from public.gather_multiplayer_players pl
   where pl.game_id=p_game_id and pl.status in ('joined','invited');
   update public.gather_multiplayer_games
     set state=state||jsonb_build_object('deck_count',jsonb_array_length(coalesce(s->'deck','[]'::jsonb)),'players',players_state),
         revision=revision+1,updated_at=now()
     where id=p_game_id;
 else
   update public.gather_multiplayer_games set revision=revision+1,updated_at=now() where id=p_game_id;
 end if;
 return p;
end
$function$
;
