create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','🎉')),
  created_at timestamptz not null default now(),
  constraint message_reactions_one_per_user unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_conversation_id_idx
  on public.message_reactions (conversation_id);

alter table public.message_reactions enable row level security;
alter table public.message_reactions replica identity full;

grant select, insert, delete on table public.message_reactions to authenticated;
grant all on table public.message_reactions to service_role;

create policy "conversation members can read message reactions"
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_members cm
    join public.messages m
      on m.id = message_reactions.message_id
     and m.conversation_id = message_reactions.conversation_id
    where cm.conversation_id = message_reactions.conversation_id
      and cm.user_id = (select auth.uid())
  )
);

create policy "conversation members can add their own message reactions"
on public.message_reactions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.conversation_members cm
    join public.messages m
      on m.id = message_reactions.message_id
     and m.conversation_id = message_reactions.conversation_id
    where cm.conversation_id = message_reactions.conversation_id
      and cm.user_id = (select auth.uid())
  )
);

create policy "members can remove their own message reactions"
on public.message_reactions
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.conversation_members cm
    join public.messages m
      on m.id = message_reactions.message_id
     and m.conversation_id = message_reactions.conversation_id
    where cm.conversation_id = message_reactions.conversation_id
      and cm.user_id = (select auth.uid())
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'message_reactions'
     ) then
    execute 'alter publication supabase_realtime add table public.message_reactions';
  end if;
end
$$;
