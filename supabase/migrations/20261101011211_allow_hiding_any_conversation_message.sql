create index user_deleted_messages_message_id_idx
  on public.user_deleted_messages(message_id);

drop policy if exists "Users can hide messages they can manage"
  on public.user_deleted_messages;

create policy "Users can hide messages in their conversations"
  on public.user_deleted_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = user_deleted_messages.message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );
