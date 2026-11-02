revoke all on table public.message_reactions from anon, authenticated;
grant select, insert, delete on table public.message_reactions to authenticated;
grant all on table public.message_reactions to service_role;

create index if not exists message_reactions_user_id_idx
  on public.message_reactions (user_id);
