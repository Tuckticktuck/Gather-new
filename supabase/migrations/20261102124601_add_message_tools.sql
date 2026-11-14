
-- Message tools: polls, pins, saved messages and forwarding.
alter table public.messages
  add column if not exists audio_path text,
  add column if not exists forwarded_from_id uuid;

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and conname='messages_forwarded_from_id_fkey') then
    alter table public.messages add constraint messages_forwarded_from_id_fkey
      foreign key (forwarded_from_id) references public.messages(id) on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and conname='messages_audio_path_owner_check') then
    alter table public.messages add constraint messages_audio_path_owner_check check (
      audio_path is null or (
        split_part(audio_path,'/',1)=conversation_id::text
        and split_part(split_part(audio_path,'/',2),'_',1)=sender_id::text
      )
    );
  end if;
end $$;

create table if not exists public.message_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  question text not null check(char_length(btrim(question)) between 1 and 200),
  created_at timestamptz not null default now()
);
create table if not exists public.message_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.message_polls(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  label text not null check(char_length(btrim(label)) between 1 and 80),
  position integer not null check(position between 0 and 5),
  created_at timestamptz not null default now(),
  unique(poll_id,id)
);
create table if not exists public.message_poll_votes (
  poll_id uuid not null references public.message_polls(id) on delete cascade,
  option_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(poll_id,user_id),
  constraint message_poll_votes_option_fkey foreign key(poll_id,option_id)
    references public.message_poll_options(poll_id,id) on delete cascade
);
create table if not exists public.message_pins (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(conversation_id,message_id)
);
create table if not exists public.saved_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,message_id)
);

create index if not exists message_polls_conversation_idx on public.message_polls(conversation_id,created_at desc);
create index if not exists message_polls_created_by_idx on public.message_polls(created_by);
create index if not exists message_poll_options_poll_idx on public.message_poll_options(poll_id,position);
create index if not exists message_poll_options_conversation_idx on public.message_poll_options(conversation_id);
create index if not exists message_poll_votes_conversation_idx on public.message_poll_votes(conversation_id,poll_id);
create index if not exists message_poll_votes_option_fk_idx on public.message_poll_votes(poll_id,option_id);
create index if not exists message_poll_votes_user_idx on public.message_poll_votes(user_id);
create index if not exists message_pins_conversation_idx on public.message_pins(conversation_id,created_at desc);
create index if not exists message_pins_message_idx on public.message_pins(message_id);
create index if not exists message_pins_pinned_by_idx on public.message_pins(pinned_by);
create index if not exists saved_messages_user_idx on public.saved_messages(user_id,created_at desc);
create index if not exists saved_messages_conversation_idx on public.saved_messages(conversation_id);
create index if not exists saved_messages_message_idx on public.saved_messages(message_id);
create index if not exists messages_forwarded_from_id_idx on public.messages(forwarded_from_id);

alter table public.message_polls enable row level security;
alter table public.message_poll_options enable row level security;
alter table public.message_poll_votes enable row level security;
alter table public.message_pins enable row level security;
alter table public.saved_messages enable row level security;

create policy "Members can read polls in their conversations" on public.message_polls for select to authenticated
using(private.is_conversation_member(conversation_id));
create policy "Members can create polls with their own messages" on public.message_polls for insert to authenticated
with check(
  created_by=(select auth.uid()) and private.is_conversation_member(conversation_id)
  and exists(select 1 from public.messages m where m.id=message_id and m.conversation_id=message_polls.conversation_id and m.sender_id=(select auth.uid()))
);
create policy "Members can read poll options" on public.message_poll_options for select to authenticated
using(private.is_conversation_member(conversation_id));
create policy "Poll creators can add their poll options" on public.message_poll_options for insert to authenticated
with check(
  private.is_conversation_member(conversation_id)
  and exists(select 1 from public.message_polls p where p.id=poll_id and p.conversation_id=message_poll_options.conversation_id and p.created_by=(select auth.uid()))
);
create policy "Members can read poll votes" on public.message_poll_votes for select to authenticated
using(private.is_conversation_member(conversation_id));
create policy "Members can vote once in their own name" on public.message_poll_votes for insert to authenticated
with check(
  user_id=(select auth.uid()) and private.is_conversation_member(conversation_id)
  and exists(
    select 1 from public.message_poll_options o join public.message_polls p on p.id=o.poll_id
    where o.id=option_id and o.poll_id=message_poll_votes.poll_id
      and o.conversation_id=message_poll_votes.conversation_id
      and p.conversation_id=message_poll_votes.conversation_id
  )
);
create policy "Members can remove their own poll vote" on public.message_poll_votes for delete to authenticated
using(user_id=(select auth.uid()) and private.is_conversation_member(conversation_id));
create policy "Members can read pinned messages" on public.message_pins for select to authenticated
using(private.is_conversation_member(conversation_id));
create policy "Members can pin messages in their conversations" on public.message_pins for insert to authenticated
with check(
  pinned_by=(select auth.uid()) and private.is_conversation_member(conversation_id)
  and exists(select 1 from public.messages m where m.id=message_id and m.conversation_id=message_pins.conversation_id)
);
create policy "Members can unpin messages in their conversations" on public.message_pins for delete to authenticated
using(private.is_conversation_member(conversation_id));
create policy "Users can read their saved messages" on public.saved_messages for select to authenticated
using(user_id=(select auth.uid()) and private.is_conversation_member(conversation_id));
create policy "Users can save messages from their conversations" on public.saved_messages for insert to authenticated
with check(
  user_id=(select auth.uid()) and private.is_conversation_member(conversation_id)
  and exists(select 1 from public.messages m where m.id=message_id and m.conversation_id=saved_messages.conversation_id)
);
create policy "Users can remove their saved messages" on public.saved_messages for delete to authenticated
using(user_id=(select auth.uid()));

grant select,insert on public.message_polls to authenticated;
grant select,insert on public.message_poll_options to authenticated;
grant select,insert,delete on public.message_poll_votes to authenticated;
grant select,insert,delete on public.message_pins to authenticated;
grant select,insert,delete on public.saved_messages to authenticated;

create policy "Members can send messages as themselves" on public.messages for insert to authenticated
with check(
  sender_id=(select auth.uid())
  and private.is_conversation_member(conversation_id)
  and private.can_send_message(conversation_id)
  and (reply_to_id is null or private.reply_target_is_in_conversation(reply_to_id,conversation_id))
  and (attachment_path is null or split_part(attachment_path,'/',1)=conversation_id::text)
  and (
    audio_path is null or (
      split_part(audio_path,'/',1)=conversation_id::text
      and split_part(split_part(audio_path,'/',2),'_',1)=sender_id::text
    )
  )
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
  and (
    audio_path is null or (
      split_part(audio_path,'/',1)=conversation_id::text
      and split_part(split_part(audio_path,'/',2),'_',1)=sender_id::text
    )
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gather-voice-messages','gather-voice-messages',false,26214400,
  array['audio/mp4','audio/webm','audio/ogg','audio/wav','audio/aac','audio/mpeg','audio/x-wav'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "Conversation members can read voice messages" on storage.objects for select to authenticated
using(bucket_id='gather-voice-messages' and exists(
  select 1 from public.conversation_members cm where cm.conversation_id::text=(storage.foldername(objects.name))[1] and cm.user_id=(select auth.uid())
));
create policy "Conversation members can upload their own voice messages" on storage.objects for insert to authenticated
with check(bucket_id='gather-voice-messages'
  and split_part(storage.filename(name),'_',1)=(select auth.uid())::text
  and exists(select 1 from public.conversation_members cm where cm.conversation_id::text=(storage.foldername(objects.name))[1] and cm.user_id=(select auth.uid()))
);
create policy "Uploaders can delete their own voice messages" on storage.objects for delete to authenticated
using(bucket_id='gather-voice-messages'
  and split_part(storage.filename(name),'_',1)=(select auth.uid())::text
  and exists(select 1 from public.conversation_members cm where cm.conversation_id::text=(storage.foldername(objects.name))[1] and cm.user_id=(select auth.uid()))
);

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='message_poll_votes')
  then alter publication supabase_realtime add table public.message_poll_votes; end if;
end $$;
