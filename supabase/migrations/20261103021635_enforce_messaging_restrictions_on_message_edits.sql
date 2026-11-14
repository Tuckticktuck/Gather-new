drop policy if exists "Senders can edit their own message text" on public.messages;
create policy "Senders can edit their own message text"
  on public.messages for update to authenticated
  using (
    sender_id = (select auth.uid())
    and is_admin_message = false
    and (select private.is_conversation_member(conversation_id))
    and not (select private.is_message_restricted((select auth.uid())))
  )
  with check (
    sender_id = (select auth.uid())
    and is_admin_message = false
    and (select private.is_conversation_member(conversation_id))
    and not (select private.is_message_restricted((select auth.uid())))
    and (
      attachment_path is null
      or split_part(attachment_path, '/', 1) = conversation_id::text
    )
  );