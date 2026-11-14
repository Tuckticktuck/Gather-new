drop function if exists public.mark_conversation_read(uuid);

create function public.mark_conversation_read(
  p_conversation_id uuid
)
returns integer
language sql
set search_path = ''
as $function$
  select private.mark_conversation_read(p_conversation_id);
$function$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

notify pgrst, 'reload schema';
