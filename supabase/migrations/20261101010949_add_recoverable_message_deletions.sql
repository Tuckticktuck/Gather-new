create table public.user_deleted_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  constraint user_deleted_messages_pkey primary key (user_id, message_id)
);

create index user_deleted_messages_user_deleted_at_idx
  on public.user_deleted_messages(user_id, deleted_at desc);

alter table public.user_deleted_messages enable row level security;

revoke all on public.user_deleted_messages from public, anon, authenticated;
grant select, insert, delete on public.user_deleted_messages to authenticated;

create policy "Users can view their own hidden messages"
  on public.user_deleted_messages for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = user_deleted_messages.message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

create policy "Users can hide messages they can manage"
  on public.user_deleted_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = user_deleted_messages.message_id
        and private.is_conversation_member(m.conversation_id)
        and (
          m.sender_id = (select auth.uid())
          or private.is_conversation_admin(m.conversation_id)
        )
    )
  );

create policy "Users can restore their own hidden messages"
  on public.user_deleted_messages for delete to authenticated
  using (user_id = (select auth.uid()));

do $block$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'user_deleted_messages'
     ) then
    execute 'alter publication supabase_realtime add table public.user_deleted_messages';
  end if;
end;
$block$;
