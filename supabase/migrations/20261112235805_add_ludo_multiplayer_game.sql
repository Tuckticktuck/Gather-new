-- Dedicated 2–4 player Ludo mode using the shared multiplayer lobby tables.
-- The earlier two-player gather_games Ludo RPC is intentionally preserved.

CREATE OR REPLACE FUNCTION public.gather_ludo_create(p_conversation_id uuid, p_join_mode text, p_invited_user_ids uuid[] DEFAULT '{}'::uuid[], p_max_players integer DEFAULT 4, p_creator_color text DEFAULT '#D85A60'::text)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games; v_invites uuid[]:=coalesce(p_invited_user_ids,'{}'::uuid[]);
begin
  if auth.uid() is null then raise exception 'Sign in to create a Ludo lobby.'; end if;
  if p_max_players not between 2 and 4 then raise exception 'Ludo supports 2 to 4 players.'; end if;
  if p_join_mode not in ('open','invite') then raise exception 'Choose open or invite-only joining.'; end if;
  if lower(coalesce(p_creator_color,'')) not in ('#d85a60','#39a96b','#d9ad45','#4f83d1') then raise exception 'Choose an available Ludo color.'; end if;
  if p_join_mode='invite' and cardinality(v_invites)=0 then raise exception 'Select at least one player to invite.'; end if;
  if cardinality(v_invites)>p_max_players-1 then raise exception 'The invite list exceeds this lobby’s player limit.'; end if;
  if p_join_mode='open' and cardinality(v_invites)>0 then raise exception 'Open lobbies do not use an invite list.'; end if;
  v_game:=public.gather_multiplayer_create(p_conversation_id,'ludo',p_join_mode,v_invites,
    jsonb_build_object('max_players',p_max_players),
    jsonb_build_object('version',1,'started',false,'message','Waiting for players.'),upper(p_creator_color));
  update public.gather_multiplayer_players set ready=true where game_id=v_game.id and user_id=auth.uid();
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
  if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception 'You cannot join this conversation game.'; end if;
  select * into v_player from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid;
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
  values(p_game_id,v_uid,'joined',upper(p_color),true,now(),now())
  on conflict(game_id,user_id) do update set status='joined',color=upper(excluded.color),ready=true,joined_at=now(),updated_at=now()
  returning * into v_player;
  update public.gather_multiplayer_games set updated_at=now(),revision=revision+1 where id=p_game_id;
  return v_player;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_ludo_decline(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Sign in to decline this Ludo invitation.'; end if;
  update public.gather_multiplayer_players p set status='left',ready=false,updated_at=now()
  from public.gather_multiplayer_games g
  where p.game_id=p_game_id and p.user_id=auth.uid() and p.status='invited'
    and g.id=p.game_id and g.game_type='ludo' and g.status='active'
    and not coalesce((g.state->>'started')::boolean,false)
    and private.is_conversation_member(g.conversation_id);
  if not found then raise exception 'This Ludo invitation is no longer available.'; end if;
  update public.gather_multiplayer_games set revision=revision+1,updated_at=now() where id=p_game_id and game_type='ludo';
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_ludo_ready(p_game_id uuid, p_ready boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='ludo' for update;
  if v_game.id is null or v_game.status<>'active' or coalesce((v_game.state->>'started')::boolean,false) then raise exception 'This Ludo lobby is no longer accepting ready changes.'; end if;
  if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception 'Ludo access is unavailable.'; end if;
  update public.gather_multiplayer_players set ready=coalesce(p_ready,false),updated_at=now()
  where game_id=p_game_id and user_id=auth.uid() and status='joined';
  if not found then raise exception 'Join this Ludo lobby before changing your ready status.'; end if;
  update public.gather_multiplayer_games set revision=revision+1,updated_at=now() where id=p_game_id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_ludo_start(p_game_id uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games; v_order uuid[]; v_colors jsonb; v_count integer; v_max integer; v_state jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to start Ludo.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='ludo' for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Ludo lobby is not available.'; end if;
  if v_game.created_by<>auth.uid() then raise exception 'Only the lobby host can start Ludo.'; end if;
  if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception 'Ludo access is unavailable.'; end if;
  if coalesce((v_game.state->>'started')::boolean,false) then raise exception 'Ludo has already started.'; end if;
  select count(*) into v_count from public.gather_multiplayer_players where game_id=p_game_id and status='joined';
  v_max:=coalesce((v_game.settings->>'max_players')::integer,4);
  if v_count<2 then raise exception 'At least two players must join before starting Ludo.'; end if;
  if v_count>v_max or v_count>4 then raise exception 'This Ludo lobby has too many players.'; end if;
  if exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and status='joined' and not ready) then raise exception 'Everyone must be ready before starting.'; end if;
  select array_agg(p.user_id order by p.joined_at,p.user_id) into v_order
  from public.gather_multiplayer_players p where p.game_id=p_game_id and p.status='joined';
  select jsonb_object_agg(p.user_id::text,case lower(p.color)
    when '#d85a60' then 'red' when '#39a96b' then 'green' when '#d9ad45' then 'yellow' when '#4f83d1' then 'blue' else null end)
  into v_colors from public.gather_multiplayer_players p where p.game_id=p_game_id and p.status='joined';
  if jsonb_object_length(coalesce(v_colors,'{}'::jsonb))<>v_count
     or exists(select 1 from jsonb_each_text(v_colors) c group by c.value having count(*)>1) then
    raise exception 'Each Ludo player must have a different valid color.';
  end if;
  v_state:=jsonb_build_object(
    'version',1,'started',true,'turn_order',to_jsonb(v_order),'turn_index',0,'turn_user_id',v_order[1]::text,
    'dice',null,'last_roll',null,'colors',v_colors,
    'pieces',jsonb_build_object('red',jsonb_build_array(-1,-1,-1,-1),'green',jsonb_build_array(-1,-1,-1,-1),
      'yellow',jsonb_build_array(-1,-1,-1,-1),'blue',jsonb_build_array(-1,-1,-1,-1)),
    'winner_id',null,'message','Ludo has started. Roll a six to bring a token out of base.'
  );
  update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now()
  where id=p_game_id returning * into v_game;
  return v_game;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_ludo_cancel(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='ludo' for update;
  if v_game.id is null or v_game.status<>'active' or coalesce((v_game.state->>'started')::boolean,false) then raise exception 'This Ludo lobby can no longer be cancelled.'; end if;
  if v_game.created_by<>auth.uid() then raise exception 'Only the host can cancel this Ludo lobby.'; end if;
  update public.gather_multiplayer_games set status='cancelled',revision=revision+1,updated_at=now() where id=p_game_id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gather_ludo_multiplayer_action(p_game_id uuid, p_action text, p_token_index integer DEFAULT NULL::integer)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.gather_multiplayer_games; v_actor uuid:=auth.uid(); v_state jsonb; v_pieces jsonb;
  v_color text; v_other_color text; v_dice integer; v_roll integer; v_progress integer; v_new_progress integer;
  v_track_position integer; v_other_track integer; v_start_offset integer; v_other_offset integer;
  v_step integer; v_idx integer; v_next_idx integer; v_player_count integer; v_can_move boolean:=false;
  v_safe boolean:=false; v_captured integer:=0; v_finished integer:=0; v_next_user uuid;
  v_result_message text; v_other record;
begin
  if v_actor is null then raise exception 'Sign in to play Ludo.'; end if;
  if p_action not in ('roll','move','end') then raise exception 'That Ludo action is not supported.'; end if;
  select * into v_game from public.gather_multiplayer_games where id=p_game_id and game_type='ludo' for update;
  if v_game.id is null or v_game.status<>'active' then raise exception 'This Ludo match is not active.'; end if;
  if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception 'Game access is unavailable.'; end if;
  if not exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_actor and status='joined') then
    raise exception 'Only players who joined this Ludo match can play.';
  end if;
  v_state:=coalesce(v_game.state,'{}'::jsonb);
  if p_action='end' then
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('The match was ended by a player.'::text),true);
    update public.gather_multiplayer_games set status='completed',state=v_state,revision=revision+1,updated_at=now()
    where id=p_game_id returning * into v_game;
    return v_game;
  end if;
  if not coalesce((v_state->>'started')::boolean,false) then raise exception 'Ludo has not started yet.'; end if;
  if v_state->>'turn_user_id' is distinct from v_actor::text then raise exception 'It is not your turn.'; end if;
  v_color:=v_state->'colors'->>v_actor::text;
  v_start_offset:=case v_color when 'red' then 0 when 'yellow' then 13 when 'blue' then 26 when 'green' then 39 else null end;
  if v_start_offset is null then raise exception 'Your Ludo color could not be found.'; end if;
  v_pieces:=coalesce(v_state->'pieces','{}'::jsonb);
  v_idx:=coalesce((v_state->>'turn_index')::integer,0);
  v_player_count:=jsonb_array_length(coalesce(v_state->'turn_order','[]'::jsonb));
  if v_player_count<2 then raise exception 'This Ludo match has an invalid turn order.'; end if;

  if p_action='roll' then
    if v_state->>'dice' is not null then raise exception 'Move one of your tokens before rolling again.'; end if;
    v_roll:=floor(random()*6)::integer+1;
    for v_step in 0..3 loop
      v_progress:=(v_pieces->v_color->>v_step)::integer;
      if (v_progress=-1 and v_roll=6) or (v_progress>=0 and v_progress<57 and v_progress+v_roll<=57) then v_can_move:=true; exit; end if;
    end loop;
    v_state:=jsonb_set(v_state,'{last_roll}',to_jsonb(v_roll),true);
    if not v_can_move then
      v_next_idx:=mod(v_idx+1,v_player_count);
      v_next_user:=(v_state->'turn_order'->>v_next_idx)::uuid;
      v_state:=jsonb_set(v_state,'{dice}','null'::jsonb,true);
      v_state:=jsonb_set(v_state,'{turn_index}',to_jsonb(v_next_idx),true);
      v_state:=jsonb_set(v_state,'{turn_user_id}',to_jsonb(v_next_user),true);
      v_result_message:=initcap(v_color)||' rolled '||v_roll::text||' and had no legal move. '||
        initcap(v_state->'colors'->>v_next_user::text)||' goes next.';
      v_state:=jsonb_set(v_state,'{message}',to_jsonb(v_result_message),true);
    else
      v_state:=jsonb_set(v_state,'{dice}',to_jsonb(v_roll),true);
      v_state:=jsonb_set(v_state,'{message}',to_jsonb(initcap(v_color)||' rolled a '||v_roll::text||'. Choose a token.'),true);
    end if;
    update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now()
    where id=p_game_id returning * into v_game;
    return v_game;
  end if;

  if p_token_index is null or p_token_index not between 0 and 3 then raise exception 'Choose one of your four tokens.'; end if;
  if v_state->>'dice' is null then raise exception 'Roll the dice before moving a token.'; end if;
  v_dice:=(v_state->>'dice')::integer;
  v_progress:=(v_pieces->v_color->>p_token_index)::integer;
  if v_progress=-1 then
    if v_dice<>6 then raise exception 'A token needs a six to leave its base.'; end if;
    v_new_progress:=0;
  elsif v_progress>=0 and v_progress<57 and v_progress+v_dice<=57 then
    v_new_progress:=v_progress+v_dice;
  else
    raise exception 'That token cannot move with this roll.';
  end if;
  v_pieces:=jsonb_set(v_pieces,array[v_color,p_token_index::text],to_jsonb(v_new_progress),true);

  if v_new_progress<=51 then
    v_track_position:=mod(v_start_offset+v_new_progress,52);
    v_safe:=v_track_position=any(array[0,8,13,21,26,34,39,47]);
    if not v_safe then
      for v_other in select p.user_id from public.gather_multiplayer_players p
        where p.game_id=p_game_id and p.status='joined' and p.user_id<>v_actor
      loop
        v_other_color:=v_state->'colors'->>v_other.user_id::text;
        v_other_offset:=case v_other_color when 'red' then 0 when 'yellow' then 13 when 'blue' then 26 when 'green' then 39 else null end;
        if v_other_offset is not null then
          for v_step in 0..3 loop
            v_progress:=(v_pieces->v_other_color->>v_step)::integer;
            if v_progress>=0 and v_progress<=51 then
              v_other_track:=mod(v_other_offset+v_progress,52);
              if v_other_track=v_track_position then
                v_pieces:=jsonb_set(v_pieces,array[v_other_color,v_step::text],to_jsonb(-1),true);
                v_captured:=v_captured+1;
              end if;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end if;

  select count(*) into v_finished from jsonb_array_elements_text(v_pieces->v_color) as token(value) where token.value::integer=57;
  v_state:=jsonb_set(v_state,'{pieces}',v_pieces,true);
  v_state:=jsonb_set(v_state,'{dice}','null'::jsonb,true);

  if v_finished=4 then
    v_result_message:=initcap(v_color)||' brought all four tokens home and wins!';
    v_state:=jsonb_set(v_state,'{winner_id}',to_jsonb(v_actor),true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb(v_result_message),true);
    update public.gather_multiplayer_games set state=v_state,status='completed',revision=revision+1,updated_at=now()
    where id=p_game_id returning * into v_game;
    return v_game;
  end if;

  if v_dice=6 then
    v_next_idx:=v_idx; v_next_user:=v_actor;
  else
    v_next_idx:=mod(v_idx+1,v_player_count);
    v_next_user:=(v_state->'turn_order'->>v_next_idx)::uuid;
  end if;
  v_result_message:=initcap(v_color)||' moved token '||(p_token_index+1)::text||'.';
  if v_captured>0 then v_result_message:=v_result_message||' Captured '||v_captured::text||' opposing token'||case when v_captured=1 then '.' else 's.' end; end if;
  if v_dice=6 then v_result_message:=v_result_message||' Roll again!'; end if;
  v_state:=jsonb_set(v_state,'{turn_index}',to_jsonb(v_next_idx),true);
  v_state:=jsonb_set(v_state,'{turn_user_id}',to_jsonb(v_next_user),true);
  v_state:=jsonb_set(v_state,'{message}',to_jsonb(v_result_message),true);
  update public.gather_multiplayer_games set state=v_state,revision=revision+1,updated_at=now()
  where id=p_game_id returning * into v_game;
  return v_game;
end;
$function$
;

revoke all on function public.gather_ludo_create(uuid,text,uuid[],integer,text) from public,anon;
revoke all on function public.gather_ludo_join(uuid,text) from public,anon;
revoke all on function public.gather_ludo_decline(uuid) from public,anon;
revoke all on function public.gather_ludo_ready(uuid,boolean) from public,anon;
revoke all on function public.gather_ludo_start(uuid) from public,anon;
revoke all on function public.gather_ludo_cancel(uuid) from public,anon;
revoke all on function public.gather_ludo_multiplayer_action(uuid,text,integer) from public,anon;
grant execute on function public.gather_ludo_create(uuid,text,uuid[],integer,text) to authenticated;
grant execute on function public.gather_ludo_join(uuid,text) to authenticated;
grant execute on function public.gather_ludo_decline(uuid) to authenticated;
grant execute on function public.gather_ludo_ready(uuid,boolean) to authenticated;
grant execute on function public.gather_ludo_start(uuid) to authenticated;
grant execute on function public.gather_ludo_cancel(uuid) to authenticated;
grant execute on function public.gather_ludo_multiplayer_action(uuid,text,integer) to authenticated;
