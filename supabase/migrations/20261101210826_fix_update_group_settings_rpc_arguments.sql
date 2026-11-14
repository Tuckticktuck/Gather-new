drop function if exists public.update_group_settings(uuid, text, text);

create function public.update_group_settings(
  p_conversation_id uuid,
  p_title text,
  p_description text
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.update_group_settings(
    p_conversation_id,
    p_title,
    p_description
  );
$function$;

revoke all on function public.update_group_settings(uuid, text, text) from public, anon;
grant execute on function public.update_group_settings(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
