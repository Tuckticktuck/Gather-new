-- Allow the creator to choose a unique Tag color at match creation.
drop function if exists public.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb);
drop function if exists private.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb);

create function private.gather_multiplayer_create(
  p_conversation_id uuid,p_game_type text,p_join_mode text,p_invited_user_ids uuid[] default '{}',
  p_settings jsonb default '{}'::jsonb,p_initial_state jsonb default '{}'::jsonb,p_creator_color text default '#38BDF8'
) returns public.gather_multiplayer_games
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_game public.gather_multiplayer_games; v_invitee uuid;
begin
  if v_uid is null then raise exception 'Sign in to create a multiplayer game.'; end if;
  if p_game_type is null or p_game_type !~ '^[a-z][a-z0-9_]{1,39}$' then raise exception 'Invalid multiplayer game type.'; end if;
  if p_join_mode not in ('invite','open') then raise exception 'Choose invite-only or open joining.'; end if;
  if p_creator_color is null or p_creator_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid player color.'; end if;
  if jsonb_typeof(coalesce(p_settings,'{}'::jsonb))<>'object' or octet_length(coalesce(p_settings,'{}'::jsonb)::text)>8192 or jsonb_typeof(coalesce(p_initial_state,'{}'::jsonb))<>'object' or octet_length(coalesce(p_initial_state,'{}'::jsonb)::text)>16384 then raise exception 'The multiplayer game settings are invalid.'; end if;
  if not private.is_conversation_member(p_conversation_id) or not private.can_send_message(p_conversation_id) then raise exception 'This conversation is unavailable for multiplayer games.'; end if;
  if p_join_mode='invite' and coalesce(cardinality(p_invited_user_ids),0)=0 then raise exception 'Select at least one person to invite, or allow everyone to join.'; end if;
  if exists(select 1 from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) u where u is null or u=v_uid or not exists(select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=u)) then raise exception 'Every invite must be a different member of this conversation.'; end if;
  if exists(select 1 from unnest(coalesce(p_invited_user_ids,'{}'::uuid[])) u join public.user_blocks b on (b.blocker_id=v_uid and b.blocked_id=u) or (b.blocker_id=u and b.blocked_id=v_uid)) then raise exception 'Games are unavailable with a blocked member.'; end if;
  insert into public.gather_multiplayer_games(conversation_id,game_type,created_by,join_mode,settings,state) values(p_conversation_id,p_game_type,v_uid,p_join_mode,coalesce(p_settings,'{}'::jsonb),coalesce(p_initial_state,'{}'::jsonb)) returning * into v_game;
  insert into public.gather_multiplayer_players(game_id,user_id,status,color,x,y,is_it,joined_at) values(v_game.id,v_uid,'joined',upper(p_creator_color),50,50,true,now());
  if p_join_mode='invite' then foreach v_invitee in array coalesce(p_invited_user_ids,'{}'::uuid[]) loop insert into public.gather_multiplayer_players(game_id,user_id,status) values(v_game.id,v_invitee,'invited') on conflict(game_id,user_id) do nothing; end loop; end if;
  return v_game;
end; $$;

create function public.gather_multiplayer_create(
  p_conversation_id uuid,p_game_type text,p_join_mode text,p_invited_user_ids uuid[] default '{}',
  p_settings jsonb default '{}'::jsonb,p_initial_state jsonb default '{}'::jsonb,p_creator_color text default '#38BDF8'
) returns public.gather_multiplayer_games language sql security invoker set search_path=''
as $$ select private.gather_multiplayer_create($1,$2,$3,$4,$5,$6,$7) $$;
revoke all on function private.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb,text) from public,anon;
grant execute on function private.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb,text) to authenticated;
revoke all on function public.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb,text) from public,anon;
grant execute on function public.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb,text) to authenticated;
