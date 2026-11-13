-- Use supported JSONB key counting for distinct Ludo player colors.
CREATE OR REPLACE FUNCTION public.gather_ludo_start(p_game_id uuid)
 RETURNS gather_multiplayer_games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.gather_multiplayer_games; v_order uuid[]; v_colors jsonb; v_count integer; v_max integer; v_state jsonb; v_color_count integer;
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
  select count(*) into v_color_count from jsonb_each(coalesce(v_colors,'{}'::jsonb));
  if v_color_count<>v_count
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
revoke all on function public.gather_ludo_start(uuid) from public,anon;
grant execute on function public.gather_ludo_start(uuid) to authenticated;
