create or replace function private.reply_target_is_in_conversation(
  p_reply_to_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and private.is_conversation_member(p_conversation_id)
    and exists (
      select 1
      from public.messages parent
      where parent.id = p_reply_to_id
        and parent.conversation_id = p_conversation_id
    );
$function$;

revoke all on function private.reply_target_is_in_conversation(uuid,uuid) from public, anon;
grant execute on function private.reply_target_is_in_conversation(uuid,uuid) to authenticated;

drop policy if exists "Members can send messages as themselves" on public.messages;

create policy "Members can send messages as themselves"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_conversation_member(conversation_id))
    and (select private.can_send_message(conversation_id))
    and (
      reply_to_id is null
      or (select private.reply_target_is_in_conversation(reply_to_id,conversation_id))
    )
  );
