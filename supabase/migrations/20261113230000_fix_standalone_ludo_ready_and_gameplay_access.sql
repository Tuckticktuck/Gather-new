do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.gather_ludo_ready(uuid,boolean)'::regprocedure) into v_def;
  v_old := 'if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception ''Ludo access is unavailable.''; end if;';
  v_new := 'if v_game.conversation_id is not null then
    if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception ''Ludo access is unavailable.''; end if;
  elsif not exists (select 1 from public.gather_multiplayer_players p where p.game_id=p_game_id and p.user_id=auth.uid() and p.status=''joined'') then
    raise exception ''Join this Ludo lobby before changing your ready status.'';
  end if;';
  if position(v_old in v_def)=0 then raise exception 'Could not locate expected ready-function access check; migration stopped.'; end if;
  execute replace(v_def,v_old,v_new);

  select pg_get_functiondef('public.gather_ludo_multiplayer_action(uuid,text,integer)'::regprocedure) into v_def;
  v_old := 'if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception ''Game access is unavailable.''; end if;';
  v_new := 'if v_game.conversation_id is not null then
    if not private.is_conversation_member(v_game.conversation_id) or not private.can_send_message(v_game.conversation_id) then raise exception ''Game access is unavailable.''; end if;
  elsif not exists (select 1 from public.gather_multiplayer_players p where p.game_id=p_game_id and p.user_id=v_actor and p.status=''joined'') then
    raise exception ''Only joined players can access this Ludo match.'';
  end if;';
  if position(v_old in v_def)=0 then raise exception 'Could not locate expected multiplayer-action access check; migration stopped.'; end if;
  execute replace(v_def,v_old,v_new);

  select pg_get_functiondef('public.gather_ludo_decline(uuid)'::regprocedure) into v_def;
  v_old := 'and private.is_conversation_member(g.conversation_id);';
  v_new := 'and ((g.conversation_id is not null and private.is_conversation_member(g.conversation_id)) or (g.conversation_id is null and exists (select 1 from public.gather_multiplayer_players invited where invited.game_id=g.id and invited.user_id=auth.uid() and invited.status=''invited'')));';
  if position(v_old in v_def)=0 then raise exception 'Could not locate expected decline-function access check; migration stopped.'; end if;
  execute replace(v_def,v_old,v_new);
end;
$migration$;