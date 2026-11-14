-- Allow joined players in standalone UNO lobbies to confirm they are done.
-- Conversation-backed games retain their existing membership check.
do $migration$
declare
 v_definition text;
 v_old text := 'if not private.is_conversation_member(g.conversation_id) then raise exception ''Game access is unavailable.''; end if;';
 v_new text := 'if g.conversation_id is not null then
   if not private.is_conversation_member(g.conversation_id) then raise exception ''Game access is unavailable.''; end if;
 elsif not exists (
   select 1 from public.gather_multiplayer_players as mp
   where mp.game_id=p_game_id and mp.user_id=auth.uid() and mp.status=''joined''
 ) then
   raise exception ''Game access is unavailable.'';
 end if;';
begin
 select pg_get_functiondef('public.gather_uno_done(uuid)'::regprocedure) into v_definition;
 if position(v_new in v_definition)>0 then
   raise notice 'Standalone UNO done access is already enabled.';
   return;
 end if;
 if position(v_old in v_definition)=0 then
   raise exception 'Expected UNO done access check not found; no change applied.';
 end if;
 execute replace(v_definition,v_old,v_new);
end
$migration$;
