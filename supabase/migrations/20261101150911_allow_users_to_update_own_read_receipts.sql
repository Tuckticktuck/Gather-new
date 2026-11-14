grant update on public.message_reads to authenticated;

create policy "Members can update their own read receipts"
  on public.message_reads for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_conversation_member(conversation_id))
  )
  with check (
    user_id = (select auth.uid())
    and (select private.is_conversation_member(conversation_id))
    and exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
        and m.conversation_id = message_reads.conversation_id
        and m.sender_id <> (select auth.uid())
    )
  );
