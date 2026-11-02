-- Add an audited report-contact action for the Gather Admin interface.
alter table public.admin_action_logs
  drop constraint if exists admin_action_logs_action_check;

alter table public.admin_action_logs
  add constraint admin_action_logs_action_check
  check (action in (
    'profile_updated',
    'user_banned',
    'user_unbanned',
    'user_deleted',
    'message_reported_user',
    'report_status_updated'
  ));

create or replace function public.admin_message_reported_user(
  p_report_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid := (select auth.uid());
  v_target_id uuid;
  v_conversation_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_admin_id is null or not private.is_feedback_admin() then
    raise exception using errcode = '42501', message = 'Only Gather Admin can contact a reported member.';
  end if;
  if p_report_id is null then
    raise exception using errcode = '22023', message = 'A report is required.';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception using errcode = '22023', message = 'The message must be between 1 and 4,000 characters.';
  end if;

  select r.target_user_id into v_target_id
  from public.reports r where r.id = p_report_id;

  if v_target_id is null or v_target_id = v_admin_id then
    raise exception using errcode = '22023', message = 'The reported member could not be found.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_target_id) then
    raise exception using errcode = 'P0002', message = 'That member account is no longer available.';
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  where c.kind = 'direct'
    and exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = v_admin_id)
    and exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = v_target_id)
    and not exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id not in (v_admin_id, v_target_id))
  order by c.updated_at desc
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations(kind, created_by)
    values ('direct', v_admin_id)
    returning id into v_conversation_id;

    insert into public.conversation_members(conversation_id, user_id, role)
    values (v_conversation_id, v_admin_id, 'member'), (v_conversation_id, v_target_id, 'member');
  end if;

  insert into public.messages(conversation_id, sender_id, body)
  values (v_conversation_id, v_admin_id, v_body);

  insert into public.admin_action_logs(actor_id, target_user_id, action, details)
  values (v_admin_id, v_target_id, 'message_reported_user', jsonb_build_object('report_id', p_report_id));

  return v_conversation_id;
end;
$function$;

revoke all on function public.admin_message_reported_user(uuid, text) from public, anon;
grant execute on function public.admin_message_reported_user(uuid, text) to authenticated;
