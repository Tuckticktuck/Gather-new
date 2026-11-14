
-- Disable the optional voice-message storage path, remove its message field,
-- and retain only the non-voice chat features.
drop policy if exists "Conversation members can read voice messages" on storage.objects;
drop policy if exists "Conversation members can upload their own voice messages" on storage.objects;
drop policy if exists "Uploaders can delete their own voice messages" on storage.objects;

drop policy if exists "Members can send messages as themselves" on public.messages;
drop policy if exists "Senders can edit their own message text" on public.messages;
alter table public.messages drop constraint if exists messages_audio_path_owner_check;
alter table public.messages drop column if exists audio_path;

create policy "Members can send messages as themselves" on public.messages for insert to authenticated
with check(
  sender_id=(select auth.uid())
  and private.is_conversation_member(conversation_id)
  and private.can_send_message(conversation_id)
  and (reply_to_id is null or private.reply_target_is_in_conversation(reply_to_id,conversation_id))
  and (attachment_path is null or split_part(attachment_path,'/',1)=conversation_id::text)
  and (
    forwarded_from_id is null or exists(
      select 1 from public.messages fm where fm.id=messages.forwarded_from_id
        and private.is_conversation_member(fm.conversation_id)
    )
  )
);
create policy "Senders can edit their own message text" on public.messages for update to authenticated
using(sender_id=(select auth.uid()) and private.is_conversation_member(conversation_id))
with check(
  sender_id=(select auth.uid()) and private.is_conversation_member(conversation_id)
  and (attachment_path is null or split_part(attachment_path,'/',1)=conversation_id::text)
);
