create or replace function public.edit_own_feedback_request(
  p_thread_id uuid,
  p_subject text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_initial_message_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'You must be signed in to edit feedback.';
  end if;

  if p_thread_id is null then
    raise exception using errcode = '22023', message = 'A feedback request is required.';
  end if;

  if char_length(v_subject) < 3 or char_length(v_subject) > 100 then
    raise exception using errcode = '22023', message = 'The subject must be between 3 and 100 characters.';
  end if;

  if char_length(v_message) < 1 or char_length(v_message) > 4000 then
    raise exception using errcode = '22023', message = 'The original message must be between 1 and 4,000 characters.';
  end if;

  select fm.id
    into v_initial_message_id
  from public.feedback_messages as fm
  where fm.thread_id = p_thread_id
    and fm.sender_id = v_user_id
  order by fm.created_at asc, fm.id asc
  limit 1;

  if v_initial_message_id is null then
    raise exception using errcode = '42501', message = 'This feedback request is unavailable or cannot be edited.';
  end if;

  update public.feedback_threads as ft
  set subject = v_subject
  where ft.id = p_thread_id
    and ft.user_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'This feedback request is unavailable or cannot be edited.';
  end if;

  update public.feedback_messages as fm
  set body = v_message
  where fm.id = v_initial_message_id
    and fm.thread_id = p_thread_id
    and fm.sender_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'The original feedback message could not be edited.';
  end if;
end;
$function$;

revoke all on function public.edit_own_feedback_request(uuid, text, text) from public, anon;
grant execute on function public.edit_own_feedback_request(uuid, text, text) to authenticated;

create or replace function public.delete_own_feedback_request(
  p_thread_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'You must be signed in to delete feedback.';
  end if;

  if p_thread_id is null then
    raise exception using errcode = '22023', message = 'A feedback request is required.';
  end if;

  delete from public.feedback_threads as ft
  where ft.id = p_thread_id
    and ft.user_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'This feedback request is unavailable or you do not have permission to delete it.';
  end if;
end;
$function$;

revoke all on function public.delete_own_feedback_request(uuid) from public, anon;
grant execute on function public.delete_own_feedback_request(uuid) to authenticated;
