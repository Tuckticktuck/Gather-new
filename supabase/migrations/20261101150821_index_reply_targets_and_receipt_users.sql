create index if not exists messages_reply_to_id_idx
  on public.messages(reply_to_id)
  where reply_to_id is not null;

create index if not exists message_reads_user_id_idx
  on public.message_reads(user_id);
