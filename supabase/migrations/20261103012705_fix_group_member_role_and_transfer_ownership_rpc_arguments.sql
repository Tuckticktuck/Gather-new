drop function if exists public.set_group_member_role(uuid, uuid, text);
create function public.set_group_member_role(
  p_conversation_id uuid,
  p_user_id uuid,
  p_role text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.set_group_member_role(
    p_conversation_id,
    p_user_id,
    p_role
  );
$function$;

drop function if exists public.transfer_group_ownership(uuid, uuid);
create function public.transfer_group_ownership(
  p_conversation_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.transfer_group_ownership(
    p_conversation_id,
    p_user_id
  );
$function$;

revoke all on function public.set_group_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;

revoke all on function public.transfer_group_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';