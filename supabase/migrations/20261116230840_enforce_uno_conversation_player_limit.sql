create or replace function private.enforce_uno_conversation_player_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $function$
declare
  v_member_count integer;
begin
  if new.game_key = 'uno' then
    select count(*) into v_member_count
    from public.conversation_members
    where conversation_id = new.conversation_id;
    if v_member_count > 20 then
      raise exception 'UNO supports a maximum of 20 conversation members' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_uno_conversation_player_limit on public.game_matches;
create trigger enforce_uno_conversation_player_limit
before insert or update of game_key, conversation_id on public.game_matches
for each row execute function private.enforce_uno_conversation_player_limit();

revoke all on function private.enforce_uno_conversation_player_limit() from public, anon, authenticated;
