-- Qualify game_id in the RETURNS TABLE function to avoid collision
-- with its output parameter named game_id.
create or replace function private.gather_game_chat_list(p_game_type text, p_game_id uuid)
returns table(id uuid, game_type text, game_id uuid, sender_id uuid, body text, created_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
 v_uid uuid := auth.uid();
 v_member boolean := false;
begin
 if v_uid is null then raise exception 'Sign in to view game chat.'; end if;

 if p_game_type = 'tag' then
  select exists(
   select 1
   from public.gather_tag_players as tp
   where tp.lobby_id = p_game_id
     and tp.user_id = v_uid
     and tp.status in ('joined','eliminated')
  ) into v_member;
 elsif p_game_type in ('uno','ludo') then
  select exists(
   select 1
   from public.gather_multiplayer_players as mp
   where mp.game_id = p_game_id
     and mp.user_id = v_uid
     and mp.status = 'joined'
  ) into v_member;
 end if;

 if not v_member then
  raise exception 'Join this game to view its temporary chat.';
 end if;

 return query
  select recent.id, recent.game_type, recent.game_id, recent.sender_id, recent.body, recent.created_at
  from (
   select m.id, m.game_type, m.game_id, m.sender_id, m.body, m.created_at
   from public.gather_game_chat_messages as m
   where m.game_type = p_game_type
     and m.game_id = p_game_id
   order by m.created_at desc
   limit 150
  ) as recent
  order by recent.created_at asc;
end
$function$;
