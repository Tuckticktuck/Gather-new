-- Permit the joined players of standalone UNO lobbies to draw and play.
-- Conversation-backed matches keep the existing conversation membership/send checks.
do $migration$
declare
  v_definition text;
  v_old text := 'if not private.is_conversation_member(g.conversation_id) or not private.can_send_message(g.conversation_id) then raise exception ''Game access is unavailable.''; end if;';
  v_new text := 'if g.conversation_id is not null then
  if not private.is_conversation_member(g.conversation_id) or not private.can_send_message(g.conversation_id) then raise exception ''Game access is unavailable.''; end if;
 elsif not exists (
  select 1
  from public.gather_multiplayer_players as mp
  where mp.game_id = p_game_id
    and mp.user_id = uid
    and mp.status = ''joined''
 ) then
  raise exception ''Game access is unavailable.'';
 end if;';
begin
  select pg_get_functiondef('public.gather_uno_action(uuid,text,text,text)'::regprocedure)
    into v_definition;

  if position(v_new in v_definition) > 0 then
    raise notice 'Standalone UNO action access is already enabled.';
    return;
  end if;

  if position(v_old in v_definition) = 0 then
    raise exception 'Expected UNO action access check was not found; no change applied.';
  end if;

  execute replace(v_definition, v_old, v_new);
end
$migration$;
