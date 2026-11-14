create or replace function public.get_latest_conversation_messages(p_conversation_ids uuid[])
returns table (
  conversation_id uuid,
  id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  attachment_path text,
  forwarded_from_id uuid,
  is_admin_message boolean,
  has_messages boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    requested.conversation_id,
    latest.id,
    latest.sender_id,
    latest.body,
    latest.created_at,
    latest.edited_at,
    latest.attachment_path,
    latest.forwarded_from_id,
    latest.is_admin_message,
    exists (
      select 1
      from public.messages as any_message
      where any_message.conversation_id = requested.conversation_id
    ) as has_messages
  from unnest(coalesce(p_conversation_ids, array[]::uuid[])) as requested(conversation_id)
  left join lateral (
    select
      message.id,
      message.sender_id,
      message.body,
      message.created_at,
      message.edited_at,
      message.attachment_path,
      message.forwarded_from_id,
      message.is_admin_message
    from public.messages as message
    where message.conversation_id = requested.conversation_id
      and not exists (
        select 1
        from public.user_deleted_messages as hidden
        where hidden.message_id = message.id
          and hidden.user_id = (select auth.uid())
      )
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true;
$function$;

revoke all on function public.get_latest_conversation_messages(uuid[]) from public, anon;
grant execute on function public.get_latest_conversation_messages(uuid[]) to authenticated;
