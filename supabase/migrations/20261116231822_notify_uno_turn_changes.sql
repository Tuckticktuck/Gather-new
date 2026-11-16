create or replace function private.notify_uno_turn_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_actor_id uuid;
begin
  if new.game_key <> 'uno'
     or new.status <> 'active'
     or new.current_turn_user_id is null
     or new.current_turn_user_id is not distinct from old.current_turn_user_id then
    return new;
  end if;

  v_actor_id := coalesce(old.current_turn_user_id, new.created_by);

  insert into public.notifications (
    recipient_id, actor_id, kind, title, body, conversation_id, message_id
  ) values (
    new.current_turn_user_id,
    v_actor_id,
    'game_turn',
    'Your turn in UNO',
    'It is your turn. Open the UNO invitation in this conversation to play.',
    new.conversation_id,
    new.message_id
  );

  return new;
end;
$function$;

drop trigger if exists notify_uno_turn_change on public.game_matches;
create trigger notify_uno_turn_change
after update of status, current_turn_user_id on public.game_matches
for each row
execute function private.notify_uno_turn_change();

revoke all on function private.notify_uno_turn_change() from public, anon, authenticated;
