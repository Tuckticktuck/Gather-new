create table if not exists public.user_chat_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{"pinned":[],"muted":{},"drafts":{},"appearance":{}}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_chat_preferences_settings_object check (jsonb_typeof(settings) = 'object')
);

alter table public.user_chat_preferences enable row level security;

revoke all on public.user_chat_preferences from public, anon;
grant select, insert, update, delete on public.user_chat_preferences to authenticated;

drop policy if exists "Users can read their own chat preferences" on public.user_chat_preferences;
create policy "Users can read their own chat preferences"
  on public.user_chat_preferences for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own chat preferences" on public.user_chat_preferences;
create policy "Users can create their own chat preferences"
  on public.user_chat_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own chat preferences" on public.user_chat_preferences;
create policy "Users can update their own chat preferences"
  on public.user_chat_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own chat preferences" on public.user_chat_preferences;
create policy "Users can delete their own chat preferences"
  on public.user_chat_preferences for delete to authenticated
  using (user_id = (select auth.uid()));

insert into public.user_chat_preferences(user_id,settings)
select p.id, p.preferences->'chatSettings'
from public.profiles as p
where p.preferences ? 'chatSettings'
  and jsonb_typeof(p.preferences->'chatSettings') = 'object'
on conflict (user_id) do nothing;

update public.profiles
set preferences = preferences - 'chatSettings'
where preferences ? 'chatSettings';
