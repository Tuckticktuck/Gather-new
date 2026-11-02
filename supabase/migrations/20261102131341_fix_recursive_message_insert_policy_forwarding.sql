create or replace function private.forwarded_message_is_accessible(
  p_message_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_message_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.messages as original_message
      join public.conversation_members as original_member
        on original_member.conversation_id = original_message.conversation_id
      where original_message.id = p_message_id
        and original_member.user_id = (select auth.uid())
    );
$function$;

revoke all on function private.forwarded_message_is_accessible(uuid) from public, anon;
grant execute on function private.forwarded_message_is_accessible(uuid) to authenticated;

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
      or (select private.reply_target_is_in_conversation(reply_to_id, conversation_id))
    )
    and (
      attachment_path is null
      or split_part(attachment_path, '/', 1) = conversation_id::text
    )
    and (
      forwarded_from_id is null
      or (select private.forwarded_message_is_accessible(forwarded_from_id))
    )
  );
