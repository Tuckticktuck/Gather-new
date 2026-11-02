create or replace function public.get_oldest_unread_message(
  p_conversation_id uuid
)
returns table(message_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select m.id, m.created_at
  from public.messages as m
  where p_conversation_id is not null
    and (select auth.uid()) is not null
    and m.conversation_id = p_conversation_id
    and m.sender_id <> (select auth.uid())
    and exists (
      select 1 from public.conversation_members as cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.message_reads as mr
      where mr.message_id = m.id
        and mr.user_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.user_deleted_messages as udm
      where udm.message_id = m.id
        and udm.user_id = (select auth.uid())
    )
  order by m.created_at asc, m.id asc
  limit 1;
$function$;

revoke all on function public.get_oldest_unread_message(uuid) from public, anon;
grant execute on function public.get_oldest_unread_message(uuid) to authenticated;
