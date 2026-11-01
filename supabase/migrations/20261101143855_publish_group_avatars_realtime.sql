do $group_avatar_realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'group_avatars'
     ) then
    execute 'alter publication supabase_realtime add table public.group_avatars';
  end if;
end;
$group_avatar_realtime$;
